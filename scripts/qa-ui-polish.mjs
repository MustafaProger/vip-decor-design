import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const base = process.env.QA_BASE_URL || "http://127.0.0.1:5180";
const output = "docs/qa-ui-polish";
const data = JSON.parse(await readFile("src/data/site-content.json", "utf8"));
const paths = [
  ...new Set([
    ...data.pages.map((p) => p.path),
    "/",
    "/company",
    "/curtains",
    "/projects",
    "/projects/quiet-living-room",
    "/catalog",
    "/shop",
    "/contacts",
    "/price",
    "/selection",
    "/calculator",
    "/cart",
    "/favorites",
    "/sitemap",
    "/product/325186268288",
    "/page-does-not-exist",
  ]),
];
await mkdir(output, { recursive: true });
const report = {
  checkedAt: new Date().toISOString(),
  routes: [],
  checks: [],
  accessibility: [],
  errors: [],
  screenshots: [],
};
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
await context.route("**/*", (r) =>
  ["GET", "HEAD", "OPTIONS"].includes(r.request().method())
    ? r.continue()
    : r.abort(),
);
const page = await context.newPage();
page.on("pageerror", (e) => report.errors.push(e.message));
async function open(path) {
  await page.goto(base + path);
  await page.locator("main h1").waitFor({ state: "attached" });
  await expect(page.locator(".page-loading")).toHaveCount(0);
}
async function shot(name) {
  await page.evaluate(async () => {
    await Promise.all(
      [...document.images].map((i) => {
        i.loading = "eager";
        return i.decode().catch(() => {});
      }),
    );
  });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({ path: `${output}/${name}.png` });
  report.screenshots.push(name + ".png");
}
try {
  for (const path of paths) {
    await open(path);
    const result = await page.evaluate(() => ({
      h1Count: document.querySelectorAll("main h1").length,
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content,
      canonical: document.querySelector('link[rel="canonical"]')?.href,
      fonts: [
        ...new Set(
          [...document.querySelectorAll("body *")]
            .filter(
              (e) =>
                e.getClientRects().length &&
                [...e.childNodes].some(
                  (n) => n.nodeType === 3 && n.textContent.trim(),
                ),
            )
            .map((e) => getComputedStyle(e).fontFamily),
        ),
      ],
      badLinks: [...document.querySelectorAll("header a,footer a")]
        .map((a) => a.getAttribute("href"))
        .filter((h) => h?.startsWith("/")),
    }));
    assert.equal(result.h1Count, 1, `${path}: single H1`);
    assert.ok(
      result.title.length > 12 &&
        !/Базовый шаблон|— VIP DECOR DESIGN —/.test(result.title),
      `${path}: title`,
    );
    assert.ok(result.description?.length > 40, `${path}: description`);
    assert.ok(
      result.canonical.startsWith("https://vip2d.ru/"),
      `${path}: canonical`,
    );
    assert.ok(
      result.fonts.every((font) => /apple-system/.test(font)),
      `${path}: mixed fonts ${result.fonts}`,
    );
    const known = new Set([
      ...paths,
      ...data.categories.map((c) => c.path),
      "/privacy",
    ]);
    assert.ok(
      result.badLinks.every((h) => known.has(h)),
      `${path}: chrome link`,
    );
    report.routes.push({ path, ...result });
  }
  report.checks.push(
    `${paths.length} routes: one H1, meaningful metadata, system typography on all visible text, valid header/footer links.`,
  );
  console.log("Typography and metadata:", paths.length);
} catch (e) {
  report.errors.push(e.stack);
}
// Real motion, focus and press behavior are checked in a separate page setting.
try {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await open("/curtains");
  await page.evaluate(() => {
    document.querySelector(".site-header").dataset.qaStable = "mounted";
  });
  const original = await page.locator(".site-header").boundingBox();
  await page
    .locator(".desktop-nav")
    .getByRole("link", { name: "Ткани", exact: true })
    .click();
  await expect(page).toHaveURL(base + "/tkani");
  await expect(page.locator(".nav-indicator")).toHaveCount(0);
  await expect(page.locator('.desktop-nav a[aria-current="page"]')).toHaveText(
    "Ткани",
  );
  const underline = await page
    .locator(".desktop-nav a.active")
    .evaluate((el) => getComputedStyle(el, "::after").content);
  assert.equal(underline, "none", "No duplicate active or hover underline");
  const after = await page.locator(".site-header").boundingBox();
  assert.deepEqual(
    after,
    original,
    "Header geometry stays stable across routes",
  );
  await expect(page.locator(".site-header")).toHaveAttribute(
    "data-qa-stable",
    "mounted",
  );
  await expect(page.locator(".desktop-nav a.active")).toHaveCSS(
    "outline-style",
    "none",
  );
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
  await page
    .locator(".desktop-nav")
    .getByRole("link", { name: "О компании", exact: true })
    .click();
  await expect(page).toHaveURL(base + "/company");
  await expect(page.locator("main h1")).toHaveText("О компании");
  assert.ok(
    await page.evaluate(() => scrollY < 2),
    "Route scroll resets before new content is displayed",
  );
  assert.deepEqual(
    await page.locator(".site-header").boundingBox(),
    original,
    "Sticky header does not jump after navigation from a scrolled page",
  );
  report.checks.push({
    header:
      "Persistent node, identical geometry, quiet active background, immediate route scroll, no duplicate underline.",
    activeUnderline: underline,
  });
  await open("/tkani");
  const search = page.getByRole("searchbox");
  await search.click();
  await expect(search).toHaveCSS("outline-style", "none");
  await expect(search).toHaveCSS("box-shadow", "none");
  assert.notEqual(
    await page
      .locator(".search-field")
      .evaluate((e) => getComputedStyle(e).boxShadow),
    "none",
  );
  await shot("search-focus-1440");
  await search.fill("SMOOTH");
  await expect(page.locator('.results-meta [role="status"]')).toContainText(
    "1",
  );
  await expect(page.locator(".product-card")).toHaveCount(1);
  await search.fill("");
  const min = page
    .locator(".filters-sidebar")
    .getByRole("spinbutton", { name: "Минимальная цена" });
  await expect(min).toHaveCSS("appearance", "textfield");
  const check = page.locator('.filters-sidebar input[type="checkbox"]').first();
  await check.check();
  assert.equal(
    await check.evaluate((e) => getComputedStyle(e, "::before").opacity),
    "1",
  );
  await check.uncheck();
  // Back-to-back input events must use the newest filters even while the router commits.
  for (let i = 0; i < 5; i++) {
    await check.check();
    await page
      .locator(".filters-sidebar")
      .getByRole("button", { name: "Сбросить всё" })
      .click();
    await search.fill("SMOOTH");
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get("q") === "SMOOTH" && !url.searchParams.has("type"),
    );
    await expect(check).not.toBeChecked();
    await expect(page.locator(".product-card")).toHaveCount(1);
    await search.fill("");
    await expect(page).toHaveURL(base + "/tkani");
  }
  report.checks.push(
    "Five rapid category → reset → search cycles keep UI and URL consistent.",
  );
  const nav = page.locator(".desktop-nav a").first();
  await nav.focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.activeElement).outlineStyle,
    ),
    "solid",
  );
  const button = page.locator(".header-discuss");
  await button.hover();
  await expect(button).toHaveCSS("transform", "none");
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(120);
  const transform = await button.evaluate((e) => getComputedStyle(e).transform);
  assert.match(transform, /matrix\(0\.98/, "Press feedback scales gently");
  await page.mouse.move(1, 1);
  await page.mouse.up();
  report.checks.push(
    "Search has one outer focus ring; filtering works; rounded checkboxes show a tick; number spinners hidden; keyboard focus visible; hover stays still and press scales to 0.98.",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await button.hover();
  await page.mouse.down();
  await page.waitForTimeout(30);
  await expect(button).toHaveCSS("transform", "none");
  await page.mouse.move(1, 1);
  await page.mouse.up();
  report.checks.push("Reduced motion disables press scaling.");
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await open("/tkani");
    await expect(page.locator(".header-cart")).toBeVisible();
    if (width <= 800) {
      await expect(page.locator(".header-discuss")).toBeHidden();
      await expect(page.locator(".filter-toggle")).toBeVisible();
    } else {
      await expect(page.locator(".filter-toggle")).toBeHidden();
    }
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Chrome fits ${width}`,
    );
  }
  report.checks.push(
    "Header, cart and responsive filter controls fit all six widths, 320–1920px.",
  );
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of [
      "/",
      "/curtains",
      "/tkani",
      "/contacts",
      "/price",
      "/kakpodobrat",
      "/selection",
      "/calculator",
      "/company",
      "/projects",
    ]) {
      await open(path);
      await shot(`${path.slice(1) || "home"}-final-${width}`);
    }
    await open("/curtains");
    await page.locator(".home-help").scrollIntoViewIfNeeded();
    const radius = await page
      .locator(".home-help")
      .evaluate((e) => parseFloat(getComputedStyle(e).borderRadius));
    assert.ok(radius >= 16);
    await shot("home-help-final-" + width);
    await page.locator(".site-footer").scrollIntoViewIfNeeded();
    await shot("footer-final-" + width);
    if (width === 1440) {
      assert.ok(
        (await page.locator(".site-footer").boundingBox()).height < 700,
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open("/selection");
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.equal(
    await page.evaluate(() => scrollY),
    0,
    "Selection opens at its title, including React StrictMode",
  );
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(page.locator(".selection-questions h2")).toBeFocused();
  report.checks.push(
    "Selection initially stays at the page title; changing a step moves keyboard focus to the next question.",
  );
  // Keyboard focus, a mobile filter dialog and its checked state also need an a11y scan.
  await page.setViewportSize({ width: 390, height: 844 });
  await open("/tkani");
  await page.locator(".filter-toggle").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("checkbox").first().check();
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  report.accessibility.push({
    state: "Mobile filters, checkbox selected",
    violations: axe.violations,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator(".filter-toggle")).toBeFocused();
  report.checks.push(
    "Compact showroom section and footer, mobile filter dialog and Escape focus restoration.",
  );
} catch (e) {
  report.errors.push(e.stack);
} finally {
  report.passed =
    !report.errors.length &&
    report.accessibility.every((a) => !a.violations.length);
  await browser.close();
  await writeFile(`${output}/polish.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        routes: report.routes.length,
        checks: report.checks,
        errors: report.errors,
      },
      null,
      2,
    ),
  );
  if (!report.passed) process.exitCode = 1;
}
