import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

// All API submissions and analytics are intercepted. This never creates a lead.
const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:5180";
const origin = new URL(baseURL).origin;
const content = JSON.parse(
  await readFile(
    new URL("../src/data/site-content.json", import.meta.url),
    "utf8",
  ),
);
const blog = JSON.parse(
  await readFile(new URL("../src/data/blog.json", import.meta.url), "utf8"),
);
const browser = await chromium.launch({
  channel: process.env.QA_BROWSER_CHANNEL || "chrome",
  headless: true,
});
const report = {
  baseURL,
  browser: browser.version(),
  mockedSubmissions: 0,
  checks: [],
  goals: new Set(),
};
const definitions = [
  {
    type: "project",
    path: "/contacts",
    goal: "lead_project",
    form: ".inquiry-dialog .inquiry-form",
    success: ".inquiry-dialog .inquiry-result",
  },
  {
    type: "selection",
    path: "/selection",
    goal: "lead_selection",
    form: ".selection-page .inquiry-form",
    success: ".selection-page .inquiry-result",
  },
  {
    type: "calculator",
    path: "/calculator",
    goal: "lead_calculator",
    form: ".calc-contact",
    success: ".calc-status",
  },
  {
    type: "cart",
    path: "/cart",
    goal: "lead_cart",
    form: ".checkout-panel form",
    success: ".checkout-panel .form-notice",
  },
];

async function fixture({ mode = "record", mobile = false } = {}) {
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const state = {
    requests: [],
    respond: async (route) =>
      route.fulfill({
        status: 201,
        json: { id: "accepted-lead", status: "saved_locally" },
      }),
  };
  await context.addInitScript(
    ({ mode, productId }) => {
      window.__metrikaCalls = [];
      if (mode === "record")
        window.ym = (...args) => window.__metrikaCalls.push(args);
      if (mode === "throw")
        window.ym = () => {
          throw new Error("Analytics blocked");
        };
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
    },
    { mode, productId: String(content.products[0].id) },
  );
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/api/content")
      return route.fulfill({ json: content });
    if (url.pathname === "/api/blog") return route.fulfill({ json: blog });
    if (url.pathname === "/api/inquiries") {
      assert.equal(request.method(), "POST");
      state.requests.push(request.postDataJSON());
      report.mockedSubmissions++;
      return state.respond(route);
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()))
      return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, state, errors };
}
const calls = (page) => page.evaluate(() => window.__metrikaCalls);
async function openForm(page, definition) {
  await page.goto(baseURL + definition.path);
  if (definition.type === "project")
    await page
      .locator(".contact-card")
      .getByRole("button", { name: "Обсудить проект" })
      .click();
  if (definition.type === "selection") {
    await page.getByRole("button", { name: "Далее" }).click();
    await page.getByLabel("Помогите выбрать", { exact: false }).check();
    await page.getByRole("button", { name: "Далее" }).click();
    await page.getByRole("button", { name: "Далее" }).click();
  }
  if (definition.type === "cart")
    await page.getByRole("button", { name: "Перейти к оформлению" }).click();
  const form = page.locator(definition.form);
  await expect(form).toBeVisible();
  return form;
}
async function fillForm(form, type) {
  if (type === "cart") {
    await form.locator('input[autocomplete="name"]').fill("Тест Метрики");
    await form.locator('input[autocomplete="tel"]').fill("+79990000000");
    await form.locator('input[type="checkbox"]').check();
  } else {
    await form.locator('[name="name"]').fill("Тест Метрики");
    await form.locator('[name="phone"]').fill("+79990000000");
    if (type === "calculator")
      await form.locator('[name="email"]').fill("metrika-test@example.test");
    await form.locator('[name="consent"]').check();
  }
}
async function submit(form) {
  await form.locator('button[type="submit"]').click();
}
async function success(page, definition) {
  if (definition.type === "calculator")
    await expect(page.locator(definition.form)).toContainText(
      "Заявка сохранена",
    );
  else await expect(page.locator(definition.success)).toBeVisible();
}

try {
  for (const definition of definitions) {
    const { context, page, state, errors } = await fixture();
    try {
      const form = await openForm(page, definition);
      assert.deepEqual(
        await calls(page),
        [],
        "Opening a form must not report a lead",
      );
      await submit(form);
      assert.equal(
        state.requests.length,
        0,
        "Invalid form must not reach the API",
      );
      assert.deepEqual(await calls(page), []);
      await fillForm(form, definition.type);
      for (const response of [
        { status: 500, json: { error: { message: "QA server error" } } },
        { status: 200, json: { id: "invalid-response", status: "unknown" } },
        { status: 200, json: { id: "", status: "saved_locally" } },
        { status: 200, json: { id: "   ", status: "sent" } },
      ]) {
        const before = state.requests.length;
        state.respond = (route) => route.fulfill(response);
        await submit(form);
        await expect.poll(() => state.requests.length).toBe(before + 1);
        await expect(form.locator('button[type="submit"]')).toBeEnabled();
        assert.deepEqual(
          await calls(page),
          [],
          "Rejected or invalid response must not report a lead",
        );
      }
      let accept;
      const responseGate = new Promise((resolve) => {
        accept = resolve;
      });
      state.respond = async (route) => {
        await responseGate;
        await route.fulfill({
          status: 201,
          json: { id: definition.type + "-accepted", status: "saved_locally" },
        });
      };
      const before = state.requests.length;
      await form.evaluate((element) => {
        element.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
        element.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      });
      await expect.poll(() => state.requests.length).toBe(before + 1);
      assert.deepEqual(
        await calls(page),
        [],
        "Pending server response must not report a lead",
      );
      accept();
      await success(page, definition);
      await expect
        .poll(() => calls(page))
        .toEqual([[67314823, "reachGoal", definition.goal]]);
      assert.equal(
        state.requests.length,
        before + 1,
        "Concurrent submission must be locked",
      );
      report.goals.add(definition.goal);
      if (definition.type === "calculator") {
        await submit(form);
        await expect.poll(() => state.requests.length).toBe(before + 2);
        await expect(form.locator('button[type="submit"]')).toBeEnabled();
        assert.deepEqual(
          await calls(page),
          [[67314823, "reachGoal", definition.goal]],
          "Accepted id must be reported only once",
        );
        await form.locator('[name="name"]').fill("Другой тест");
        state.respond = (route) =>
          route.fulfill({
            status: 201,
            json: { id: "another-calculation", status: "sent" },
          });
        await submit(form);
        await expect
          .poll(() => calls(page))
          .toEqual(Array(2).fill([67314823, "reachGoal", definition.goal]));
      }
      assert.deepEqual(errors, []);
      report.checks.push(
        `${definition.goal}: validation, server error, invalid confirmation/empty id, delayed double submission, exactly one matching goal${definition.type === "calculator" ? ", duplicate acceptance suppressed; new accepted id counted" : ""}`,
      );
    } finally {
      await context.close();
    }
  }

  for (const mode of ["absent", "throw"]) {
    for (const definition of definitions) {
      const { context, page, errors } = await fixture({ mode });
      try {
        const form = await openForm(page, definition);
        await fillForm(form, definition.type);
        await submit(form);
        await success(page, definition);
        assert.deepEqual(
          errors,
          [],
          "Analytics failure must not escape into the application",
        );
      } finally {
        await context.close();
      }
    }
    report.checks.push(`All four forms still show success when ym is ${mode}`);
  }

  const contacts = [
    ['a[href^="tel:"]', "click_phone"],
    ['a[href^="mailto:"]', "click_email"],
    ['a[href^="https://wa.me/"]', "click_whatsapp"],
    ['a[href^="https://t.me/"]', "click_telegram"],
    ['a[href^="https://max.ru/"]', "click_max"],
  ];
  async function clickContact(
    page,
    link,
    goal,
    { keyboard = false, nested = false } = {},
  ) {
    const before = await calls(page);
    // Cancel at the link so no OS handler, external tab or message is opened.
    await link.evaluate((element) =>
      element.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
        },
        { once: true },
      ),
    );
    if (keyboard) {
      await link.focus();
      await page.keyboard.press("Enter");
    } else if (nested && (await link.locator("svg").count()))
      await link.locator("svg").first().click();
    else await link.click();
    await expect
      .poll(() => calls(page))
      .toEqual([...before, [67314823, "reachGoal", goal]]);
    report.goals.add(goal);
  }
  for (const mobile of [false, true]) {
    const { context, page, errors } = await fixture({ mobile });
    try {
      await page.goto(baseURL + "/contacts");
      await expect(page.locator(".contact-card")).toBeVisible();
      for (const [selector, goal] of contacts)
        await clickContact(
          page,
          page.locator(".site-footer").locator(selector).first(),
          goal,
          { nested: true },
        );
      for (const [selector, goal] of contacts)
        await clickContact(
          page,
          page.locator("main").locator(selector).first(),
          goal,
        );
      await clickContact(
        page,
        page.locator('.site-footer a[href^="tel:"]').first(),
        "click_phone",
        { keyboard: true },
      );
      if (mobile) {
        await page.getByRole("button", { name: "Открыть меню" }).click();
        for (const [selector, goal] of contacts)
          await clickContact(
            page,
            page.locator(".menu-dialog").locator(selector).first(),
            goal,
            { nested: true },
          );
        await page
          .locator(".menu-dialog")
          .getByRole("button", { name: "Закрыть", exact: true })
          .click();
        await page.locator(".mobile-action").getByRole("button").click();
      } else await page.locator(".header-discuss").click();
      assert.equal(
        (await calls(page)).filter((entry) => entry[2].startsWith("lead_"))
          .length,
        0,
        "Header/floating project opener is not a successful lead",
      );
      const definition = definitions[0];
      await fillForm(page.locator(definition.form), "project");
      await submit(page.locator(definition.form));
      await success(page, definition);
      await clickContact(
        page,
        page.locator('.inquiry-dialog a[href^="tel:"]'),
        "click_phone",
      );
      assert.deepEqual(errors, []);
      report.checks.push(
        `${mobile ? "Mobile" : "Desktop"}: five contact types in footer/content${mobile ? "/menu" : ""}, nested icons, keyboard activation, project opener, success-dialog phone`,
      );
    } finally {
      await context.close();
    }
  }

  const { context, page, errors } = await fixture();
  try {
    await page.goto(baseURL + "/contacts");
    await expect(page.locator(".contact-card")).toBeVisible();
    for (const [href, goal] of [
      ["whatsapp://send?phone=79990000000", "click_whatsapp"],
      ["tg://resolve?domain=example", "click_telegram"],
      ["max://example", "click_max"],
      ["https://api.whatsapp.com/send?phone=79990000000", "click_whatsapp"],
      ["https://telegram.me/example", "click_telegram"],
    ]) {
      await page.evaluate((href) => {
        document.getElementById("qa-dynamic-contact")?.remove();
        const a = document.createElement("a");
        a.id = "qa-dynamic-contact";
        a.href = href;
        a.textContent = "QA contact";
        document.querySelector("main").prepend(a);
      }, href);
      await clickContact(page, page.locator("#qa-dynamic-contact"), goal);
    }
    const before = await calls(page);
    await page.evaluate(() => {
      const a = document.getElementById("qa-dynamic-contact");
      a.href = "https://wa.me.example.test/";
      a.addEventListener("click", (event) => event.preventDefault(), {
        once: true,
      });
    });
    await page.locator("#qa-dynamic-contact").click();
    assert.deepEqual(
      await calls(page),
      before,
      "Unrelated lookalike hostname must not be tracked",
    );
    await page.locator('.site-footer a[href="/calculator"]').click();
    await expect(page.locator(".calc-contact")).toBeVisible();
    const phone = page.locator('.site-footer a[href^="tel:"]').first();
    await clickContact(page, phone, "click_phone");
    const beforeAux = await calls(page);
    await phone.evaluate((element) => {
      element.addEventListener("auxclick", (event) => event.preventDefault(), {
        once: true,
      });
      element.dispatchEvent(
        new MouseEvent("auxclick", {
          bubbles: true,
          cancelable: true,
          button: 1,
        }),
      );
    });
    await expect
      .poll(() => calls(page))
      .toEqual([...beforeAux, [67314823, "reachGoal", "click_phone"]]);
    const afterAux = await calls(page);
    await phone.evaluate((element) => {
      element.dispatchEvent(
        new MouseEvent("auxclick", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      );
      element.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      );
    });
    assert.deepEqual(
      await calls(page),
      afterAux,
      "Right clicks must not report a contact activation",
    );
    assert.deepEqual(errors, []);
    report.checks.push(
      "Dynamically inserted links, messenger deep links/alternate domains, lookalike hostname excluded; SPA navigation keeps one listener; middle click reports once, right click reports none",
    );
  } finally {
    await context.close();
  }
  assert.equal(report.goals.size, 9);
  const output = JSON.stringify(
    {
      ...report,
      goals: [...report.goals].sort(),
      status: "passed",
      scope:
        "Local browser with mocked API responses and ym; no production submissions or telemetry",
    },
    null,
    2,
  );
  const outputDirectory = resolve(
    process.env.QA_OUTPUT_DIR || "docs/qa-metrika",
  );
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(resolve(outputDirectory, "BROWSER_QA.json"), output + "\n");
  console.log(output);
} finally {
  await browser.close();
}
