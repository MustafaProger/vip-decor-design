import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const base = process.env.QA_BASE_URL || "http://127.0.0.1:5180";
const browser = await chromium.launch({ channel: "chrome" });
const results = {
  checkedAt: new Date().toISOString(),
  base,
  layouts: [],
  motion: [],
  scenarios: [],
};
const errors = [];
await mkdir("docs/qa-redesign", { recursive: true });
async function context(reducedMotion) {
  const c = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion,
  });
  await c.route("**/*", (route) =>
    ["GET", "HEAD", "OPTIONS"].includes(route.request().method())
      ? route.continue()
      : route.abort(),
  );
  const p = await c.newPage();
  p.on("pageerror", (error) => errors.push(error.message));
  return { c, p };
}
async function open(p, path) {
  await p.goto(base + path);
  await p.locator("h1").waitFor();
  await p.evaluate(() => document.fonts.ready);
}
async function settleImages(p) {
  await p.evaluate(async () => {
    await Promise.all(
      [...document.images].map(async (img) => {
        img.loading = "eager";
        try {
          await img.decode();
        } catch {
          /* Known source failure is reported separately. */
        }
      }),
    );
  });
}
try {
  const { c, p } = await context("reduce");
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await p.setViewportSize({ width, height: 1000 });
    for (const route of ["/", "/company", "/curtains", "/projects"]) {
      await open(p, route);
      const layout = await p.evaluate(() => ({
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        studio: /студи[яиюей]/i.test(document.body.innerText),
        hidden: [...document.querySelectorAll("main [style]")].filter(
          (el) =>
            !el.closest("dialog:not([open])") &&
            getComputedStyle(el).opacity === "0",
        ).length,
      }));
      assert.ok(
        layout.documentWidth <= width + 1,
        `${route} overflows at ${width}: ${layout.documentWidth}`,
      );
      assert.equal(layout.studio, false, `${route}: outdated company wording`);
      assert.equal(
        layout.hidden,
        0,
        `${route}: hidden content with reduced motion`,
      );
      results.layouts.push({ route, ...layout });
      if ([390, 1440].includes(width)) {
        await settleImages(p);
        await p.screenshot({
          path: `docs/qa-redesign/${route.slice(1) || "home"}-${width}.png`,
        });
      }
    }
  }
  await p.setViewportSize({ width: 1440, height: 1000 });
  await open(p, "/studio");
  await expect(p).toHaveURL(/\/company$/);
  await expect(p).toHaveTitle("О компании — VIP DECOR DESIGN");
  await expect(p.locator(".company-facts > div")).toHaveCount(4);
  await expect(p.locator(".benefit-card")).toHaveCount(4);
  await expect(p.locator(".original-content")).toHaveCount(0);
  results.scenarios.push(
    "Company redirect, title, four facts and four benefits; legacy HTML absent.",
  );
  await open(p, "/curtains");
  await expect(p.locator(".original-content")).toHaveCount(0);
  await p.locator(".offer-details summary").click();
  await expect(p.locator(".offer-details p")).toBeVisible();
  const measure = p.getByRole("button", {
    name: "Заказать замер",
    exact: true,
  });
  await measure.click();
  await expect(p.getByRole("dialog")).toBeVisible();
  await p.keyboard.press("Escape");
  await expect(p.getByRole("dialog")).not.toBeVisible();
  await expect(measure).toBeFocused();
  results.scenarios.push(
    "Offer disclosure and measurement dialog open; Escape closes and restores focus. No submission.",
  );
  await open(p, "/projects");
  const photo = p.locator(".gallery-grid button").first();
  await photo.click();
  const dialog = p.getByRole("dialog", { name: "Фотография из галереи" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".gallery-controls [aria-live]")).toHaveText(
    "1 / 28",
  );
  await dialog.getByRole("button", { name: "Следующая фотография" }).click();
  await expect(dialog.locator(".gallery-controls [aria-live]")).toHaveText(
    "2 / 28",
  );
  await dialog.getByRole("button", { name: "Предыдущая фотография" }).click();
  await expect(dialog.locator(".gallery-controls [aria-live]")).toHaveText(
    "1 / 28",
  );
  await expect(dialog.locator(".picture-crop")).toHaveAttribute(
    "preserveAspectRatio",
    "xMidYMid meet",
  );
  await p.keyboard.press("Escape");
  await expect(photo).toBeFocused();
  await p.getByRole("button", { name: "Показать ещё" }).click();
  await expect(p.locator(".gallery-grid button")).toHaveCount(28);
  assert.equal(
    new Set(await p.locator(".gallery-grid button > span").allTextContents())
      .size,
    28,
  );
  await p.locator("#our-work").scrollIntoViewIfNeeded();
  await settleImages(p);
  await p.screenshot({ path: "docs/qa-redesign/gallery-1440.png" });
  results.scenarios.push(
    "All 28 photographs and distinct captions; cropped viewports, dialog navigation, focus restoration.",
  );
  await c.close();
  for (const preference of ["no-preference", "reduce"]) {
    const { c, p } = await context(preference);
    await open(p, "/");
    const cta = p.locator(".hero-cta");
    await expect(cta).toBeVisible();
    await p.waitForTimeout(1200);
    const resting = await cta.evaluate((el) => ({
      transform: getComputedStyle(el).transform,
      shadow: getComputedStyle(el).boxShadow,
    }));
    await cta.hover();
    await p.waitForTimeout(420);
    const hovered = await cta.evaluate((el) => ({
      transform: getComputedStyle(el).transform,
      shadow: getComputedStyle(el).boxShadow,
    }));
    if (preference === "no-preference")
      assert.notDeepEqual(
        resting,
        hovered,
        "CTA needs a visible hover response",
      );
    else
      assert.equal(
        hovered.transform,
        resting.transform,
        "Reduced motion must disable hover movement",
      );
    await p.locator(".how-section").scrollIntoViewIfNeeded();
    await expect(p.locator(".how-section")).toHaveCSS("opacity", "1");
    await p.locator(".header-discuss").click();
    await expect(p.getByRole("dialog")).toBeVisible();
    await expect(p.getByRole("dialog")).toHaveCSS("opacity", "1");
    await p.keyboard.press("Escape");
    await expect(p.getByRole("dialog")).not.toBeVisible();
    results.motion.push({
      preference,
      resting,
      hovered,
      scrollReveal: "visible",
      dialog: "visible then closed",
    });
    await c.close();
  }
  assert.deepEqual(errors, []);
  results.passed = true;
} finally {
  await browser.close();
  results.errors = errors;
  await writeFile(
    "docs/qa-redesign/results.json",
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        passed: results.passed || false,
        layouts: results.layouts.length,
        scenarios: results.scenarios,
        motion: results.motion.length,
        errors,
      },
      null,
      2,
    ),
  );
}
