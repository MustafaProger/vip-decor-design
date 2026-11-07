import assert from "node:assert/strict";
import {
  mkdir,
  writeFile,
  readFile,
  mkdtemp,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

// Default: production pages/data, stubbed analytics and intercepted inquiry POSTs.
// QA_METRIKA_MODE=real uses the existing counter and records network acceptance.
// Real POST requires QA_REAL_INQUIRIES=1 plus real-counter mode and a fresh journal.
const baseURL = process.env.QA_BASE_URL || "https://vip2d.ru";
const origin = new URL(baseURL).origin;
const contactProbe = process.env.QA_CONTACT_PROBE === "1";
const contactProbeGoal = process.env.QA_CONTACT_GOAL || "click_phone";
const nativeMetrika = process.env.QA_NATIVE_METRIKA === "1";
const preflightOnly = process.env.QA_PREFLIGHT_ONLY === "1" || contactProbe;
const realMetrics = process.env.QA_METRIKA_MODE === "real";
const realInquiries = process.env.QA_REAL_INQUIRIES === "1";
const resumeUnattempted = process.env.QA_RESUME_UNATTEMPTED === "1";
const replayGoals = new Set(
  (process.env.QA_REPLAY_GOALS || "").split(",").filter(Boolean),
);
assert(
  !replayGoals.size || (realMetrics && !realInquiries),
  "Replay requires real metrics with ALL inquiry POSTs intercepted",
);
const skipContacts = new Set(
  (process.env.QA_SKIP_CONTACTS || "").split(",").filter(Boolean),
);
assert(
  !realInquiries || realMetrics,
  "Real inquiries require real-counter mode",
);
const curlInterface = process.env.QA_CURL_INTERFACE;
const curlResolve =
  process.env.QA_CURL_RESOLVE || "vip2d.ru:443:161.104.18.109";
const directory = resolve(
  process.env.QA_OUTPUT_DIR || "outputs/metrika-production",
);
await mkdir(directory, { recursive: true });
const journalPath = resolve(directory, "real-inquiries-journal.json");
let journal = { createdAt: new Date().toISOString(), attempts: [] };
if (realInquiries) {
  let exists = false;
  try {
    await access(journalPath);
    exists = true;
  } catch {}
  assert(
    !exists || resumeUnattempted,
    "Real inquiry journal exists; reconcile all prior outcomes before any rerun",
  );
  if (exists) {
    journal = JSON.parse(await readFile(journalPath, "utf8"));
    assert(
      journal.attempts.length <= 4 &&
        journal.attempts.every(
          (a) => a.status === "accepted" && a.response?.id && a.goal,
        ),
      "Resume only after all earlier attempts were confirmed accepted",
    );
  }
}
if (replayGoals.size) {
  journal = JSON.parse(await readFile(journalPath, "utf8"));
  assert(
    journal.attempts.every((a) => a.status === "accepted" && a.response?.id),
    "Replay requires confirmed server responses",
  );
}
const previousInquiryGoals = new Set(
  realInquiries ? journal.attempts.map((a) => a.goal) : [],
);
async function persistJournal() {
  await writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n", {
    mode: 0o600,
  });
}
async function liveRequest(url, method = "GET", headers = {}, body = null) {
  if (method === "POST" && body === null) body = Buffer.alloc(0);
  const transportEntry = {
    endpoint: new URL(url).origin + new URL(url).pathname,
    method,
    startedAt: new Date().toISOString(),
  };
  if (new URL(url).origin !== origin)
    report.transportCalls.push(transportEntry);
  const temp = await mkdtemp(resolve(tmpdir(), "vip-metrika-http-"));
  try {
    const headerPath = resolve(temp, "headers");
    const args = [
      "--silent",
      "--show-error",
      "--compressed",
      "--max-time",
      "40",
      "--dump-header",
      headerPath,
    ];
    if (new URL(url).origin !== origin)
      args.push("--location", "--max-redirs", "5");
    else args.push("--request", method);
    if (method === "HEAD") args.push("--head");
    args.push(
      "--write-out",
      "\n__VIP_QA_HTTP_META__%{http_code} %{num_redirects} %{url_effective}",
    );
    if (curlInterface) args.push("--interface", curlInterface);
    if (new URL(url).origin === origin && curlInterface)
      args.push("--resolve", curlResolve);
    for (const name of [
      "accept",
      "accept-language",
      "content-type",
      "origin",
      "referer",
      "cookie",
      "user-agent",
      "sec-fetch-site",
    ]) {
      if (headers[name]) args.push("--header", name + ": " + headers[name]);
    }
    if (body !== null) args.push("--data-binary", "@-");
    args.push(url);
    let bytes = await new Promise((resolve, reject) => {
      const process = spawn("curl", args, { stdio: ["pipe", "pipe", "pipe"] });
      const chunks = [];
      const errors = [];
      process.stdout.on("data", (chunk) => chunks.push(chunk));
      process.stderr.on("data", (chunk) => errors.push(chunk));
      process.on("error", reject);
      process.on("close", (code) =>
        code === 0
          ? resolve(Buffer.concat(chunks))
          : reject(
              new Error(
                "curl transport failed: " + Buffer.concat(errors).toString(),
              ),
            ),
      );
      process.stdin.end(body);
    });
    const markerIndex = bytes.lastIndexOf("\n__VIP_QA_HTTP_META__");
    if (markerIndex >= 0) {
      const [httpStatus, redirects, finalUrl] = bytes
        .subarray(markerIndex + "\n__VIP_QA_HTTP_META__".length)
        .toString()
        .split(" ");
      transportEntry.status = Number(httpStatus);
      transportEntry.redirects = Number(redirects);
      transportEntry.finalEndpoint =
        new URL(finalUrl).origin + new URL(finalUrl).pathname;
      bytes = bytes.subarray(0, markerIndex);
    }
    const raw = await readFile(headerPath, "utf8");
    const block = raw
      .trim()
      .split(/\r?\n\r?\n/)
      .filter((v) => /^HTTP\//.test(v))
      .at(-1);
    const lines = block.split(/\r?\n/);
    const status = Number(lines.shift().split(" ")[1]);
    const responseHeaders = {};
    for (const line of lines) {
      const i = line.indexOf(":");
      if (i > 0)
        responseHeaders[line.slice(0, i).toLowerCase()] = line
          .slice(i + 1)
          .trim();
    }
    for (const name of [
      "content-length",
      "content-encoding",
      "transfer-encoding",
      "connection",
    ])
      delete responseHeaders[name];
    return { status, headers: responseHeaders, body: bytes };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
const browser = await chromium.launch({
  channel: process.env.QA_BROWSER_CHANNEL || "chrome",
  headless: true,
});
const report = {
  checkedAt: new Date().toISOString(),
  baseURL,
  mode: realMetrics
    ? resumeUnattempted
      ? "real-counter-resume"
      : "real-counter"
    : "regression",
  browser: browser.version(),
  mockedSubmissions: 0,
  realSubmissions: [],
  diagnosticReplays: [],
  analyticsTransport: nativeMetrika ? "Native browser HTTPS" : "curl bridge",
  transport: curlInterface
    ? "Live HTTPS via curl on " +
      curlInterface +
      "; origin resolve " +
      curlResolve
    : "Direct browser HTTPS",
  checks: [],
  goals: [],
  telemetry: [],
  telemetryRequests: [],
  telemetryResponses: [],
  transportCalls: [],
  consoleWarnings: [],
  runtime: [],
  status: "running",
};
const definitions = [
  {
    type: "project",
    path: "/contacts",
    goal: "lead_project",
    form: ".inquiry-dialog .inquiry-form",
    result: ".inquiry-dialog .inquiry-result",
  },
  {
    type: "selection",
    path: "/selection",
    goal: "lead_selection",
    form: ".selection-page .inquiry-form",
    result: ".selection-page .inquiry-result",
  },
  {
    type: "calculator",
    path: "/calculator",
    goal: "lead_calculator",
    form: ".calc-contact",
    result: ".calc-status",
  },
  {
    type: "cart",
    path: "/cart",
    goal: "lead_cart",
    form: ".checkout-panel form",
    result: ".checkout-panel .form-notice",
  },
];
const contacts = [
  ['a[href^="tel:"]', "click_phone"],
  ['a[href^="mailto:"]', "click_email"],
  ['a[href^="https://wa.me/"]', "click_whatsapp"],
  ['a[href^="https://t.me/"]', "click_telegram"],
  ['a[href^="https://max.ru/"]', "click_max"],
];
let productId;
const telemetryHost = (hostname) =>
  /(^|\.)(?:yandex\.(?:ru|com)|yandex\.net|yastatic\.net|yandexmetrica\.com)$/.test(
    hostname,
  );
function networkGoal(request) {
  let text = request.url() + " " + (request.postData() || "");
  try {
    text = decodeURIComponent(text);
  } catch {}
  return text.match(
    /(?:lead_(?:project|selection|calculator|cart)|click_(?:phone|email|whatsapp|telegram|max))/,
  )?.[0];
}
async function fixture({
  mode = realMetrics ? "real" : "record",
  mobile = false,
} = {}) {
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const state = {
    requests: [],
    respond: (route) =>
      route.fulfill({
        status: 201,
        json: { id: "qa-" + crypto.randomUUID(), status: "saved_locally" },
      }),
  };
  await context.addInitScript(
    ({ productId, mode }) => {
      localStorage.setItem(
        "vip:cart",
        JSON.stringify([
          {
            productId,
            quantity: 1,
            variantKey: "{}",
            variantLabel: "",
            unitPrice: 1000,
          },
        ]),
      );
      window.__metrikaCalls = [];
      window.__metrikaInitCalls = [];
      if (mode === "real") {
        let value;
        const wrappers = new WeakMap();
        Object.defineProperty(window, "ym", {
          configurable: true,
          get() {
            return value;
          },
          set(next) {
            if (typeof next !== "function") {
              value = next;
              return;
            }
            if (!wrappers.has(next)) {
              const proxy = new Proxy(next, {
                apply(target, thisArg, args) {
                  if (args[0] === 67314823 && args[1] === "reachGoal")
                    window.__metrikaCalls.push(args.slice(0, 3));
                  if (args[0] === 67314823 && args[1] === "init")
                    window.__metrikaInitCalls.push(args.slice(0, 3));
                  return Reflect.apply(target, thisArg, args);
                },
              });
              wrappers.set(next, proxy);
              wrappers.set(proxy, proxy);
            }
            value = wrappers.get(next);
            queueMicrotask(() => {
              // initializeMetrika calls its local queue directly; observe that
              // synchronous startup queue before the remote script can drain it.
              if (!window.__metrikaInitCalls.length && Array.isArray(next.a)) {
                window.__metrikaInitCalls.push(
                  ...next.a
                    .filter(
                      (args) => args[0] === 67314823 && args[1] === "init",
                    )
                    .map((args) => args.slice(0, 3)),
                );
              }
            });
          },
        });
      }
      if (mode === "record")
        window.ym = (...args) => window.__metrikaCalls.push(args);
    },
    { productId, mode },
  );
  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin === origin && url.pathname === "/api/inquiries") {
      assert.equal(req.method(), "POST");
      state.requests.push(req.postDataJSON());
      if (realInquiries) {
        assert(journal.attempts.length < 4, "Four real inquiries maximum");
        const payload = req.postDataJSON();
        assert(
          !journal.attempts.some((a) => a.requestId === payload.requestId),
          "Do not retry a real inquiry automatically",
        );
        const entry = {
          requestId: payload.requestId,
          goal: state.goal,
          payload,
          startedAt: new Date().toISOString(),
          status: "pending",
        };
        journal.attempts.push(entry);
        await persistJournal();
        try {
          const result = await liveRequest(
            req.url(),
            "POST",
            req.headers(),
            req.postDataBuffer(),
          );
          entry.httpStatus = result.status;
          entry.response = JSON.parse(result.body.toString());
          entry.status =
            result.status >= 200 && result.status < 300 && entry.response.id
              ? "accepted"
              : "rejected";
          report.realSubmissions.push(entry);
          await persistJournal();
          return route.fulfill(result);
        } catch (error) {
          entry.status = "uncertain";
          entry.error = error.message;
          await persistJournal();
          report.realSubmissions.push(entry);
          await route.abort("failed");
          return;
        }
      }
      report.mockedSubmissions++;
      if (replayGoals.has(state.goal)) {
        const accepted = journal.attempts.find((a) => a.goal === state.goal);
        assert(
          accepted?.status === "accepted",
          "Replay must correspond to a previously accepted real inquiry",
        );
        report.diagnosticReplays.push({
          goal: state.goal,
          id: accepted.response.id,
          originalRequestId: accepted.requestId,
          note: "Intercepted new browser POST and replayed prior confirmed response; no server POST or new record",
        });
        return route.fulfill({ status: 201, json: accepted.response });
      }
      return state.respond(route);
    }
    if (mode === "real" && telemetryHost(url.hostname)) {
      if (
        curlInterface &&
        (!nativeMetrika || ["GET", "HEAD"].includes(req.method()))
      ) {
        try {
          return route.fulfill(
            await liveRequest(
              req.url(),
              req.method(),
              req.headers(),
              req.postDataBuffer(),
            ),
          );
        } catch (error) {
          report.telemetry.push({
            endpoint: url.origin + url.pathname,
            transportError: error.message,
          });
          return route.abort("failed");
        }
      }
      return route.continue();
    }
    if (
      url.origin !== origin ||
      !["GET", "HEAD", "OPTIONS"].includes(req.method())
    )
      return route.abort();
    if (curlInterface) {
      try {
        return route.fulfill(
          await liveRequest(req.url(), req.method(), req.headers()),
        );
      } catch {
        return route.abort("failed");
      }
    }
    return route.continue();
  });
  if (mode === "real") {
    context.on("request", (request) => {
      const url = new URL(request.url());
      if (telemetryHost(url.hostname))
        report.telemetryRequests.push({
          endpoint: url.origin + url.pathname,
          method: request.method(),
          queryKeys: [...url.searchParams.keys()],
          pageUrl: url.searchParams.get("page-url"),
          goal: networkGoal(request),
          body: request.postData()?.slice(0, 1200),
        });
    });
    context.on("response", (response) => {
      if (telemetryHost(new URL(response.url()).hostname))
        report.telemetryResponses.push({
          endpoint:
            new URL(response.url()).origin + new URL(response.url()).pathname,
          method: response.request().method(),
          status: response.status(),
          goal: networkGoal(response.request()),
        });
      const goal = networkGoal(response.request());
      if (goal && telemetryHost(new URL(response.url()).hostname))
        report.telemetry.push({
          goal,
          status: response.status(),
          endpoint:
            new URL(response.url()).origin + new URL(response.url()).pathname,
        });
    });
    context.on("requestfailed", (request) => {
      const goal = networkGoal(request);
      if (goal && telemetryHost(new URL(request.url()).hostname))
        report.telemetry.push({ goal, error: request.failure()?.errorText });
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type()))
      report.consoleWarnings.push(message.text());
  });
  return { context, page, state, errors, mode };
}
async function navigate(f, path) {
  const response = await f.page.goto(baseURL + path, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  assert.equal(response.status(), 200, path);
  await expect(f.page.locator(".site-footer")).toBeVisible({ timeout: 30000 });
  if (f.mode === "real") {
    const runtime = await f.page.evaluate(() => ({
      ymType: typeof window.ym,
      scripts: [...document.scripts]
        .map((s) => s.src)
        .filter((s) => /metrika|yandex/i.test(s)),
      counters:
        typeof window.Ya?.Metrika2?.counters === "function"
          ? window.Ya.Metrika2.counters()
          : [],
    }));

    await f.page.waitForFunction(() => typeof window.ym === "function", null, {
      timeout: 15000,
    });
    const initCalls = await f.page.evaluate(() => window.__metrikaInitCalls);
    assert.equal(
      initCalls.length,
      1,
      "Existing counter initialized exactly once on this page",
    );
    runtime.initCalls = initCalls;
    await f.page.waitForFunction(
      () =>
        typeof window.Ya?.Metrika2?.counters === "function" &&
        window.Ya.Metrika2.counters().some(
          (counter) => Number(counter.id) === 67314823,
        ),
      null,
      { timeout: 55000 },
    );
    runtime.counters = await f.page.evaluate(() =>
      window.Ya.Metrika2.counters(),
    );
    assert.equal(
      runtime.counters.filter((counter) => Number(counter.id) === 67314823)
        .length,
      1,
    );
    await expect
      .poll(
        () =>
          report.telemetryResponses.some(
            (item) =>
              /\/watch\/67314823(?:\/\d+)?$/.test(item.endpoint) &&
              item.status === 200,
          ),
        { timeout: 55000 },
      )
      .toBe(true);
    report.runtime.push({ path, ...runtime });
  } else if (f.mode === "absent" || f.mode === "throw") {
    await f.page.evaluate((mode) => {
      window.ym =
        mode === "absent"
          ? undefined
          : () => {
              throw new Error("QA blocked analytics");
            };
    }, f.mode);
  }
}
const calls = (page) => page.evaluate(() => window.__metrikaCalls);
async function openForm(f, d) {
  f.state.goal = d.goal;
  await navigate(f, d.path);
  if (d.type === "project")
    await f.page
      .locator(".contact-card")
      .getByRole("button", { name: "Обсудить проект" })
      .click();
  if (d.type === "selection") {
    await f.page.getByRole("button", { name: "Далее" }).click();
    await f.page.getByLabel("Помогите выбрать", { exact: false }).check();
    await f.page.getByRole("button", { name: "Далее" }).click();
    await f.page.getByRole("button", { name: "Далее" }).click();
  }
  if (d.type === "cart")
    await f.page.getByRole("button", { name: "Перейти к оформлению" }).click();
  const form = f.page.locator(d.form);
  await expect(form).toBeVisible();
  return form;
}
async function fill(form, type) {
  await form
    .locator(type === "cart" ? '[autocomplete="name"]' : '[name="name"]')
    .fill(
      realInquiries || replayGoals.size
        ? "ТЕСТ МЕТРИКИ — НЕ ЗВОНИТЬ"
        : "Проверка Метрики — тест",
    );
  await form
    .locator(type === "cart" ? '[autocomplete="tel"]' : '[name="phone"]')
    .fill(realInquiries || replayGoals.size ? "+70000000000" : "+79990000000");
  if (type === "calculator")
    await form
      .locator('[name="email"]')
      .fill("metrika-test@example.test");
  await form.locator('input[type="checkbox"]').check();
}
const submit = (form) => form.locator('button[type="submit"]').click();
async function assertSuccess(f, d) {
  await expect(f.page.locator(d.result)).toBeVisible();
  await expect(f.page.locator(d.result)).toContainText("Заявка сохранена");
}
async function assertGoal(page, goal, before = []) {
  await expect
    .poll(() => calls(page))
    .toEqual([...before, [67314823, "reachGoal", goal]]);
  if (!report.goals.includes(goal)) report.goals.push(goal);
}
async function contact(page, link, goal, keyboard = false) {
  const before = await calls(page);
  await link.evaluate((el) =>
    el.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      { once: true },
    ),
  );
  if (keyboard) {
    await link.focus();
    await page.keyboard.press("Enter");
  } else if (await link.locator("svg").count())
    await link.locator("svg").first().click();
  else await link.click();
  await assertGoal(page, goal, before);
}

try {
  const contentResponse = await liveRequest(baseURL + "/api/content");
  assert.equal(contentResponse.status, 200);
  const content = JSON.parse(contentResponse.body.toString());
  productId = String(content.products[0].id);
  report.content = {
    products: content.products.length,
    pages: content.pages.length,
  };

  if (preflightOnly) {
    const f = await fixture();
    try {
      await navigate(f, "/contacts");
      await f.page.evaluate(() => {
        window.__qaClientIdCallback = false;
        window.ym(67314823, "getClientID", () => {
          window.__qaClientIdCallback = true;
        });
      });
      await f.page.waitForTimeout(5000);
      if (contactProbe) {
        const [selector, goal] =
          contacts.find(([, goal]) => goal === contactProbeGoal) || [];
        assert(goal, "Unknown contact probe goal");
        await contact(
          f.page,
          f.page.locator(".site-footer").locator(selector).first(),
          goal,
        );
        await expect
          .poll(
            () =>
              report.telemetry.some(
                (item) =>
                  item.goal === contactProbeGoal &&
                  item.status >= 200 &&
                  item.status < 300,
              ),
            { timeout: 55000 },
          )
          .toBe(true);
      }
      report.preflight = await f.page.evaluate(() => ({
        counters: window.Ya?.Metrika2?.counters?.(),
        queue: window.ym?.a?.map((args) => ({
          method: args[1],
          goal: args[1] === "reachGoal" ? args[2] : undefined,
          processed: args.ym_xqd,
        })),
        clientIdCallbackProcessed: window.__qaClientIdCallback,
        queuePushSource: window.ym?.a?.push?.toString(),
        ymOwnKeys: Object.keys(window.ym || {}),
        initCalls: window.__metrikaInitCalls,
        goalCalls: window.__metrikaCalls,
      }));
    } finally {
      await f.context.close();
    }
    throw new Error("QA_PREFLIGHT_COMPLETE");
  }
  for (const d of definitions) {
    if (realInquiries && previousInquiryGoals.has(d.goal)) continue;
    if (replayGoals.size && !replayGoals.has(d.goal)) continue;
    const f = await fixture();
    try {
      const form = await openForm(f, d);
      assert.deepEqual(await calls(f.page), []);
      if (!realMetrics) {
        await submit(form);
        assert.equal(f.state.requests.length, 0);
      }
      await fill(form, d.type);
      if (!realMetrics) {
        for (const reply of [
          { status: 500, json: { error: { message: "QA server failure" } } },
          { status: 200, json: { id: "qa-invalid", status: "unknown" } },
          { status: 200, json: { id: "", status: "sent" } },
          { status: 200, body: "not JSON", contentType: "text/plain" },
          null,
        ]) {
          const before = f.state.requests.length;
          f.state.respond = (route) =>
            reply ? route.fulfill(reply) : route.abort("failed");
          await submit(form);
          await expect.poll(() => f.state.requests.length).toBe(before + 1);
          await expect(form.locator('button[type="submit"]')).toBeEnabled();
          assert.deepEqual(await calls(f.page), []);
        }
      }
      const before = f.state.requests.length;
      if (realInquiries || replayGoals.size) {
        await submit(form);
      } else {
        let accept;
        const gate = new Promise((resolve) => {
          accept = resolve;
        });
        f.state.respond = async (route) => {
          await gate;
          await route.fulfill({
            status: 201,
            json: { id: "qa-" + d.type, status: "saved_locally" },
          });
        };
        await form.evaluate((el) => {
          el.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
          el.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
        });
        await expect.poll(() => f.state.requests.length).toBe(before + 1);
        assert.deepEqual(await calls(f.page), []);
        accept();
      }
      await assertSuccess(f, d);
      await assertGoal(f.page, d.goal);
      if (d.type === "calculator" && !realMetrics) {
        await submit(form);
        await expect.poll(() => f.state.requests.length).toBe(before + 2);
        await expect(form.locator('button[type="submit"]')).toBeEnabled();
        assert.deepEqual(await calls(f.page), [
          [67314823, "reachGoal", d.goal],
        ]);
      }
      if (realMetrics)
        await expect
          .poll(
            () =>
              report.telemetry.some(
                (item) =>
                  item.goal === d.goal &&
                  item.status >= 200 &&
                  item.status < 300,
              ),
            { timeout: 55000 },
          )
          .toBe(true);
      assert.deepEqual(f.errors, []);
      report.checks.push(
        d.goal +
          (realMetrics
            ? realInquiries
              ? ": real server acceptance and counter telemetry HTTP success"
              : ": existing real counter invoked after simulated server acceptance; telemetry HTTP success"
            : ": invalid input, HTTP error, invalid/empty response, malformed JSON, network abort, pending/double submission, accepted response; calculator deduplicated"),
      );
    } finally {
      await f.context.close();
    }
  }
  if (!realMetrics)
    for (const mode of ["absent", "throw"]) {
      for (const d of definitions) {
        const f = await fixture({ mode });
        try {
          const form = await openForm(f, d);
          await fill(form, d.type);
          await submit(form);
          await assertSuccess(f, d);
          assert.deepEqual(f.errors, []);
        } finally {
          await f.context.close();
        }
      }
      report.checks.push("All four forms succeed with ym " + mode);
    }
  for (const mobile of realMetrics ? [false] : [false, true]) {
    const f = await fixture({ mobile });
    try {
      await navigate(f, "/contacts");
      for (const [selector, goal] of contacts.filter(
        ([, goal]) => !realMetrics || !skipContacts.has(goal),
      ))
        await contact(
          f.page,
          f.page.locator(".site-footer").locator(selector).first(),
          goal,
        );
      if (!realMetrics) {
        for (const [selector, goal] of contacts)
          await contact(
            f.page,
            f.page.locator("main").locator(selector).first(),
            goal,
          );
        await contact(
          f.page,
          f.page.locator('.site-footer a[href^="tel:"]').first(),
          "click_phone",
          true,
        );
        if (mobile) {
          await f.page.getByRole("button", { name: "Открыть меню" }).click();
          for (const [selector, goal] of contacts)
            await contact(
              f.page,
              f.page.locator(".menu-dialog").locator(selector).first(),
              goal,
            );
          await f.page
            .locator(".menu-dialog")
            .getByRole("button", { name: "Закрыть", exact: true })
            .click();
          await f.page.locator(".mobile-action button").click();
        } else await f.page.locator(".header-discuss").click();
        assert.equal(
          (await calls(f.page)).filter((entry) => entry[2].startsWith("lead_"))
            .length,
          0,
        );
        const d = definitions[0];
        const form = f.page.locator(d.form);
        await fill(form, d.type);
        await submit(form);
        await assertSuccess(f, d);
        await contact(
          f.page,
          f.page.locator('.inquiry-dialog a[href^="tel:"]'),
          "click_phone",
        );
        await f.page
          .locator(".inquiry-dialog")
          .getByRole("button", { name: "Закрыть", exact: true })
          .click();
        await f.page.locator('.site-footer a[href="/calculator"]').click();
        await expect(f.page.locator(".calc-contact")).toBeVisible();
        await contact(
          f.page,
          f.page.locator('.site-footer a[href^="tel:"]').first(),
          "click_phone",
        );
        await f.page.screenshot({
          path: resolve(
            directory,
            `contacts-${mobile ? "mobile" : "desktop"}.png`,
          ),
          fullPage: false,
        });
      } else
        await expect
          .poll(
            () =>
              contacts
                .filter(([, goal]) => !skipContacts.has(goal))
                .every(([, goal]) =>
                  report.telemetry.some(
                    (item) =>
                      item.goal === goal &&
                      item.status >= 200 &&
                      item.status < 300,
                  ),
                ),
            { timeout: 55000 },
          )
          .toBe(true);
      assert.deepEqual(f.errors, []);
      report.checks.push(
        `${mobile ? "Mobile" : "Desktop"} contacts: ${realMetrics ? `${contacts.filter(([, goal]) => !skipContacts.has(goal)).length} real counter goals with HTTP success` : "footer, content, nested icons, keyboard, header/floating opener, modal phone, SPA navigation"}`,
      );
    } finally {
      await f.context.close();
    }
  }
  if (!realMetrics) {
    const f = await fixture();
    try {
      await navigate(f, "/blog");
      await contact(
        f.page,
        f.page.locator('.site-footer a[href^="mailto:"]').first(),
        "click_email",
      );
      await f.page.goto(baseURL + "/admin", { waitUntil: "domcontentloaded" });
      await expect(f.page.locator("form")).toBeVisible();
      await f.page.evaluate(() => {
        const a = document.createElement("a");
        a.id = "qa-admin-contact";
        a.href = "tel:+79990000000";
        a.textContent = "QA";
        a.addEventListener("click", (event) => event.preventDefault());
        document.body.append(a);
      });
      await f.page.locator("#qa-admin-contact").click();
      assert.deepEqual(await calls(f.page), []);
      assert.deepEqual(f.errors, []);
      report.checks.push(
        "Blog contact works; administrative page does not track customer contact links",
      );
    } finally {
      await f.context.close();
    }
  }
  assert.equal(
    report.goals.length,
    replayGoals.size ||
      (realMetrics ? 9 - previousInquiryGoals.size - skipContacts.size : 9),
  );
  if (realInquiries)
    assert.equal(
      journal.attempts.filter((a) => a.status === "accepted").length,
      4,
    );
  report.status = "passed";
} catch (error) {
  if (error.message === "QA_PREFLIGHT_COMPLETE")
    report.status = "preflight-complete";
  else {
    report.status = "failed";
    report.error = error.stack || String(error);
    process.exitCode = 1;
  }
} finally {
  report.scope =
    (realInquiries
      ? `Published pages and actual public API data. ${journal.attempts.length} real inquiry attempts, ${journal.attempts.filter((a) => a.status === "accepted").length} accepted. See persistent journal for request and accepted IDs. `
      : "Published pages and actual public API data. All inquiry POSTs intercepted; no real lead records or email messages created. ") +
    (realMetrics
      ? "Existing real Metrika invoked; network acceptance is not evidence of appearance in dashboard reports."
      : "Metrika stubbed and external traffic blocked; this verifies event invocation, not real analytics delivery.");
  await writeFile(
    resolve(
      directory,
      `${contactProbe ? "contact-probe-" + contactProbeGoal : preflightOnly ? "preflight" : realMetrics ? (replayGoals.size ? "diagnostic-replays" : resumeUnattempted ? "real-counter-resume" : "real-counter") : "regression"}.json`,
    ),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
