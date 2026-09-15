import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const base = process.env.QA_BASE_URL || "http://127.0.0.1:5180";
const data = JSON.parse(await readFile("src/data/site-content.json", "utf8"));
const guide = JSON.parse(await readFile("src/data/fabric-guide.json", "utf8"));
const output = process.env.QA_OUTPUT_DIR || "docs/qa-liquid-glass";
await mkdir(output, { recursive: true });
const widths = [320, 390, 768, 1024, 1440, 1920];
const routes = [
  ...new Set([
    ...data.pages.map((p) => p.path),
    "/contacts",
    "/price",
    "/company",
    "/curtains",
    "/projects",
    "/projects/quiet-living-room",
    "/catalog",
    "/shop",
    "/selection",
    "/calculator",
    "/cart",
    "/favorites",
    "/sitemap",
    "/studio",
    "/fabrics",
    "/furnitura",
    "/privacy",
    "/product/325186268288",
    "/page-does-not-exist",
  ]),
];
const report = {
  checkedAt: new Date().toISOString(),
  base,
  layouts: [],
  accessibility: [],
  scenarios: [],
  products: [],
  links: [],
  errors: [],
  imageFailures: [],
};
// Reuse only route/image/URL checks after a bounded visual or keyboard fix.
// Interaction and accessibility checks below always execute afresh.
const reuseNavigation = process.env.QA_REUSE_NAVIGATION === "1";
if (reuseNavigation) {
  const previous = JSON.parse(await readFile(`${output}/results.json`, "utf8"));
  assert.equal(previous.base, base);
  assert.equal(previous.layouts.length, routes.length * widths.length);
  assert.equal(previous.products.length, data.products.length);
  assert.deepEqual(previous.errors, []);
  assert.deepEqual(previous.imageFailures, []);
  report.layouts = previous.layouts;
  report.links = previous.links;
  report.products = previous.products;
  report.reusedNavigationFrom =
    previous.reusedNavigationFrom || previous.checkedAt;
}
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ reducedMotion: "reduce" });
await context.route("**/*", (r) =>
  ["GET", "HEAD", "OPTIONS"].includes(r.request().method())
    ? r.continue()
    : r.abort(),
);
const page = await context.newPage();
page.on("pageerror", (e) => report.errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") report.errors.push(m.text());
});
async function open(path) {
  await page.goto(base + path);
  await page.waitForFunction(
    () =>
      document.querySelector("main")?.innerText.trim().length > 20 &&
      !document.querySelector(".page-loading"),
  );
  await page.evaluate(() => document.fonts.ready);
}
async function images() {
  return page.evaluate(async () => {
    await Promise.all(
      [...document.images].map((i) => {
        i.loading = "eager";
        return i.decode().catch(() => {});
      }),
    );
    return [...document.images]
      .filter((i) => !i.naturalWidth)
      .map((i) => i.src);
  });
}
try {
  for (const width of reuseNavigation ? [] : widths) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of routes) {
      await open(path);
      const state = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        main: document.querySelector("main").innerText.length,
        title:
          document.querySelector("main h1")?.textContent ||
          document.querySelector("main h2")?.textContent,
        overflow: [...document.querySelectorAll("main *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.width > 0 &&
              (r.right > innerWidth + 1 || r.left < -1) &&
              !el.closest(
                "[hidden],.category-tabs,.pd-thumbnails,.color-filters",
              )
            );
          })
          .slice(0, 8)
          .map((el) => el.tagName + "." + el.className),
      }));
      report.layouts.push({ path, width, ...state });
      if (state.documentWidth > width + 1)
        report.errors.push(
          `${path} overflows ${width}: ${state.documentWidth} ${state.overflow}`,
        );
      if (
        path != "/page-does-not-exist" &&
        /страница не найдена|Не удалось открыть/.test(state.title || "")
      )
        report.errors.push(`${path} unexpectedly missing`);
      if (width === 1440) {
        const failed = await images();
        report.imageFailures.push(...failed.map((image) => ({ path, image })));
        const links = await page.locator("main a[href]").evaluateAll((els) =>
          els.map((el) => ({
            href: el.getAttribute("href"),
            text: el.textContent.trim(),
          })),
        );
        report.links.push({ path, links });
      }
      if (
        [390, 1440].includes(width) &&
        [
          "/",
          "/contacts",
          "/price",
          "/kakpodobrat",
          "/tkani",
          "/product/325186268288",
          "/selection",
          "/calculator",
          "/dostavka",
          "/popd",
          "/company",
          "/curtains",
          "/projects",
          "/page-does-not-exist",
          "/favorites",
          "/cart",
        ].includes(path)
      ) {
        await images();
        await page.screenshot({
          path: `${output}/${path.slice(1).replaceAll("/", "-") || "home"}-${width}.png`,
        });
      }
    }
    console.log(`Layouts ${width}: ${routes.length}`);
  }
  // New content and real link destinations, including direct opening of room choices.
  await page.setViewportSize({ width: 390, height: 844 });
  await open("/contacts");
  await expect(page.locator(".contact-phones a")).toHaveCount(3);
  for (const phone of data.contacts.phones)
    await expect(
      page.locator(".contact-phones").getByText(phone, { exact: true }),
    ).toHaveAttribute("href", "tel:" + phone.replace(/[^+\d]/g, ""));
  await expect(page.locator(".contact-email a")).toHaveAttribute(
    "href",
    "mailto:" + data.contacts.email,
  );
  assert.match(
    await page.locator(".location-card").getAttribute("href"),
    /rtext=/,
  );
  const trigger = page.locator(".contact-card button");
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  report.scenarios.push(
    "Contacts: three tel links, email, route, contextual dialog and Escape focus return.",
  );
  await open("/price");
  await expect(page.locator(".price-category tbody tr")).toHaveCount(10);
  assert.deepEqual(await page.locator(".price-value").allTextContents(), [
    "120 ₽",
    "150 ₽",
    "180 ₽",
    "от 1 600 ₽",
    "3 500 ₽",
    "2 350 ₽",
    "от 7 350 ₽",
    "от 650 ₽",
    "от 500 ₽",
    "3 500 ₽",
  ]);
  await page.locator(".price-nav a").last().click();
  await expect(page).toHaveURL(/#accessories$/);
  await expect(page.locator("#accessories")).toBeInViewport();
  report.scenarios.push(
    "Price: all ten exact amounts, original units/from, category navigation.",
  );
  await open("/kakpodobrat");
  await page.locator(".room-picker button").click();
  const roomLinks = await page
    .locator(".room-picker a,.all-rooms a")
    .evaluateAll((els) =>
      els.map((el) => ({
        hash: el.getAttribute("href"),
        title: el.textContent.trim(),
      })),
    );
  assert.equal(roomLinks.length, 14);
  for (const item of roomLinks) {
    await open("/kakpodobrat" + item.hash);
    await expect(page.locator("#room-heading")).toHaveText(item.title);
    if ((await page.locator(".room-full").getAttribute("open")) === null)
      await page.locator(".room-full summary").click();
    await expect(page.locator(".room-full .reading-copy")).toBeVisible();
    const sourceTitle = await page
      .locator(".room-photo img")
      .getAttribute("alt");
    const entry = guide.find((g) => sourceTitle.startsWith(g.title + " —"));
    assert.ok(entry);
    const rendered = await page.locator(".room-full .reading-copy").innerText();
    for (const text of entry.paragraphs)
      assert.ok(
        rendered.includes(text.replace(/^\s*-\s*/, "")),
        `Missing guide paragraph in ${item.title}`,
      );
  }
  await open("/kakpodobrat");
  await expect(page.locator(".hardware-card")).toHaveCount(5);
  await expect(page.locator(".comparison-grid article")).toHaveCount(2);
  for (const d of await page
    .locator(".hardware-card,.comparison-grid details")
    .all()) {
    await d.locator("summary").click();
    await expect(d.locator(".reading-copy")).toBeVisible();
  }
  report.scenarios.push(
    "Guide: 14 deep-linked rooms, complete original room paragraphs, five cornice articles and two comparison articles.",
  );
  for (const path of ["/dostavka", "/page13486315.html"]) {
    await open(path);
    await expect(page.locator(".transport-card")).toHaveCount(8);
    const main = await page.locator("main").innerText();
    for (const term of [
      "400 р.",
      "1 000 р.",
      "30 р./км.",
      "50%",
      "без предоплаты",
    ])
      assert.ok(main.includes(term));
    await page.locator('.reading-nav a[href="#payment"]').click();
    await expect(page.locator("#payment")).toBeInViewport();
  }
  await open("/popd");
  await expect(page.locator(".policy-section")).toHaveCount(8);
  const policy = await page.locator(".policy-content").innerText();
  const normalize = (s) => s.replace(/\s+/g, "");
  for (const text of data.pages.find((p) => p.path === "/popd").blocks[1]
    .paragraphs)
    assert.ok(
      normalize(policy.toLowerCase()).includes(normalize(text.toLowerCase())),
      `Missing policy text: ${text.slice(0, 80)}`,
    );
  report.scenarios.push(
    "Both delivery routes: tariffs, pickup, payment and anchor navigation. Policy: eight sections, every source paragraph.",
  );
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of [
      "/contacts",
      "/price",
      "/kakpodobrat",
      "/dostavka",
      "/popd",
      "/product/325186268288",
      "/cart",
      "/page-does-not-exist",
    ]) {
      await open(path);
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      report.accessibility.push({
        path,
        width,
        violations: violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      });
    }
  }
  console.log("Axe completed");
  // Every public product URL must resolve to its exact product, beyond SPA HTTP 200.
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [i, product] of (reuseNavigation ? [] : data.products).entries()) {
    const url = new URL(product.url);
    await open(url.pathname);
    await expect(page.locator("main h1")).toHaveText(product.title);
    report.products.push({
      id: product.id,
      path: url.pathname,
      title: product.title,
    });
    if (i % 100 === 0) console.log(`Product URLs ${i + 1}/477`);
  }
  const knownPaths = new Set([
    ...routes,
    ...data.products.flatMap((product) => [
      new URL(product.url).pathname,
      "/product/" + product.id,
    ]),
  ]);
  for (const group of report.links)
    for (const link of group.links) {
      const url = new URL(link.href, base + group.path);
      if (
        ["vip2d.ru", "www.vip2d.ru", new URL(base).hostname].includes(
          url.hostname,
        )
      ) {
        assert.ok(
          knownPaths.has(url.pathname),
          `Broken internal link from ${group.path}: ${link.href}`,
        );
      }
    }
  report.scenarios.push(
    "All rendered internal main-content links resolve to an implemented route.",
  );
  report.passed =
    report.errors.length === 0 &&
    report.imageFailures.length === 0 &&
    report.accessibility.every((x) => x.violations.length === 0);
} catch (e) {
  report.errors.push(e.stack);
  report.passed = false;
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        layouts: report.layouts.length,
        axe: report.accessibility.length,
        products: report.products.length,
        scenarios: report.scenarios,
        errors: report.errors,
        imageFailures: report.imageFailures,
      },
      null,
      2,
    ),
  );
  if (!report.passed) process.exitCode = 1;
}
