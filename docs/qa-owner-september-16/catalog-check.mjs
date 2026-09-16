import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { getCategoryCounts } from "../../src/lib/catalog.ts";

const dir = "docs/qa-owner-september-16";
const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const widths = [320, 390, 768, 1024, 1440, 1920];
const paths = [
  "/catalog",
  "/blekayt",
  "/catalog?category=%2Fkarnizi",
  "/catalog?category=%2Fdecor",
];
const data = JSON.parse(await readFile("src/data/site-content.json", "utf8"));
const counts = getCategoryCounts(data.products);
const report = {
  checkedAt: new Date().toISOString(),
  baseURL,
  browser: "",
  widths,
  paths,
  routeChecks: [],
  accessibility: [],
  scenarios: [],
  blockedWrites: [],
  errors: [],
  limitations: [
    "Local production-build preview; no deployment or production integration is claimed.",
    "Screenshots and image checks cover the initially rendered catalogue cards, not all 477 product pages.",
    "Axe checks WCAG 2 A/AA and WCAG 2.1 A/AA rules on /catalog and /blekayt at 390 and 1440 pixels; this is not a screen-reader audit.",
    "Isolated browser contexts allow only GET, HEAD and OPTIONS. No forms are submitted.",
  ],
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
report.browser = browser.version();
async function context(width) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    reducedMotion: "reduce",
  });
  await context.route("**/*", (route) => {
    if (["GET", "HEAD", "OPTIONS"].includes(route.request().method()))
      return route.continue();
    report.blockedWrites.push({
      method: route.request().method(),
      url: route.request().url(),
    });
    return route.abort();
  });
  return context;
}
async function open(page, path) {
  const response = await page.goto(baseURL + path, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("main h1").waitFor();
  await page.locator(".results-meta [role=status]").waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  return response;
}
async function decodeImages(page) {
  return page.evaluate(async () => {
    const images = [...document.querySelectorAll("main img")];
    images.forEach((image) => {
      image.loading = "eager";
    });
    const failures = [];
    const withTimeout = (promise) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("decode timed out")), 8000),
        ),
      ]);
    await Promise.all(
      images.map(async (image) => {
        try {
          await withTimeout(image.decode());
        } catch {
          failures.push(image.currentSrc || image.src);
        }
      }),
    );
    const svgSources = [
      ...new Set(
        [...document.querySelectorAll("main svg image")]
          .map((image) => image.getAttribute("href"))
          .filter(Boolean),
      ),
    ];
    await Promise.all(
      svgSources.map(async (src) => {
        const image = new Image();
        image.src = src;
        try {
          await withTimeout(image.decode());
        } catch {
          failures.push(src);
        }
      }),
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const visible = images.filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.top < innerHeight && rect.bottom > 0;
    });
    return {
      htmlImageCount: images.length,
      svgImageCount: svgSources.length,
      failures,
      fallbackCount: document.querySelectorAll("main .missing-image").length,
      visibleImages: visible.map((image) => ({
        src: image.currentSrc || image.src,
        complete: image.complete,
        width: image.naturalWidth,
        height: image.naturalHeight,
      })),
    };
  });
}
try {
  for (const width of widths) {
    const c = await context(width);
    const page = await c.newPage();
    for (const path of paths) {
      const entry = { width, path, passed: false, errors: [] };
      const onError = (error) => entry.errors.push(error.message);
      page.on("pageerror", onError);
      try {
        const response = await open(page, path);
        entry.httpStatus = response.status();
        entry.h1Count = await page.locator("h1").count();
        entry.images = await decodeImages(page);
        entry.layout = await page.evaluate(() => ({
          viewport: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          overflow: document.documentElement.scrollWidth > innerWidth,
          activeFamily: document.querySelector(
            ".category-rail [aria-current=page]",
          )?.textContent,
          railLabels: [...document.querySelectorAll(".category-rail > a")].map(
            (a) => a.textContent,
          ),
        }));
        assert.equal(entry.httpStatus, 200);
        assert.equal(entry.h1Count, 1);
        assert.equal(entry.layout.overflow, false);
        assert.deepEqual(entry.images.failures, []);
        assert.equal(entry.images.fallbackCount, 0);
        assert.ok(
          entry.images.visibleImages.every(
            (image) => image.complete && image.width > 0 && image.height > 0,
          ),
        );
        assert.deepEqual(entry.errors, []);
        if ([390, 1440].includes(width)) {
          const screenshot =
            path === "/catalog"
              ? `catalog-${width}.png`
              : path === "/blekayt"
                ? `catalog-blackout-${width}.png`
                : path.includes("decor")
                  ? `catalog-decor-${width}.png`
                  : `catalog-rods-${width}.png`;
          await page.screenshot({ path: `${dir}/${screenshot}` });
          entry.screenshot = screenshot;
        }
        if (
          [390, 1440].includes(width) &&
          ["/catalog", "/blekayt"].includes(path)
        ) {
          const axe = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            .analyze();
          report.accessibility.push({
            width,
            path,
            passed: !axe.violations.length,
            violations: axe.violations.map(
              ({ id, impact, description, helpUrl, nodes }) => ({
                id,
                impact,
                description,
                helpUrl,
                nodes: nodes.map(({ target, failureSummary }) => ({
                  target,
                  failureSummary,
                })),
              }),
            ),
          });
        }
        entry.passed = true;
      } catch (error) {
        entry.errors.push(error.stack);
      }
      page.off("pageerror", onError);
      report.routeChecks.push(entry);
    }
    await c.close();
  }
  for (const width of [390, 1440]) {
    const c = await context(width);
    const page = await c.newPage();
    const entry = { width, passed: false, checks: [], errors: [] };
    page.on("pageerror", (error) => entry.errors.push(error.message));
    const result = async (count) =>
      expect(page.locator(".results-meta [role=status]")).toHaveText(
        "Найдено: " + count,
      );
    const controls = async () => {
      if (width < 900) {
        await page
          .getByRole("button", { name: "Фильтры", exact: true })
          .click();
        return page.getByRole("dialog", { name: "Фильтры" });
      }
      return page.locator(".filters-sidebar");
    };
    const close = async (filters) => {
      if (width < 900)
        await filters
          .getByRole("button", { name: /Показать результаты/ })
          .click();
    };
    try {
      await open(page, "/catalog");
      await result(data.products.length);
      await expect(page.locator(".category-rail > a")).toHaveCount(9);
      await expect(page.locator(".category-unavailable")).toHaveCount(0);
      assert.deepEqual(
        await page.locator(".category-rail > a").allTextContents(),
        [
          "Все товары",
          "Ткани для штор",
          "Тюль",
          "Рулонные шторы",
          "Жалюзи",
          "Карнизы",
          "Держатели для штор",
          "Кисти для штор",
          "Картины",
        ],
      );
      entry.checks.push(
        "All 477 products and eight nonempty families in textile-first order",
      );
      await page
        .locator(".category-rail")
        .getByRole("link", { name: "Ткани для штор", exact: true })
        .click();
      await result(counts.get("/tkani"));
      let filters = await controls();
      await filters
        .getByRole("checkbox", { name: "Бархат", exact: true })
        .check();
      await close(filters);
      await result(counts.get("/barxat"));
      await page.getByRole("searchbox").fill("Нежность");
      await result(1);
      await page.reload();
      await expect(page.getByRole("searchbox")).toHaveValue("Нежность");
      await result(1);
      filters = await controls();
      await expect(
        filters.getByRole("checkbox", { name: "Бархат", exact: true }),
      ).toBeChecked();
      await filters.getByRole("button", { name: "Сбросить всё" }).click();
      await close(filters);
      await result(counts.get("/tkani"));
      await page.goBack();
      await result(data.products.length);
      entry.checks.push(
        "Velvet selection, search, reload persistence, reset and browser Back",
      );
      for (const path of ["/blekayt", "/catalog?category=%2Fblekayt"]) {
        await open(page, path);
        await result(counts.get("/blekayt"));
        await expect(
          page.locator(".category-rail [aria-current=page]"),
        ).toHaveText("Ткани для штор");
        await expect(page.locator(".catalog-collection-context")).toContainText(
          "Блэкаут",
        );
        await page
          .locator(".catalog-collection-context")
          .getByRole("link")
          .click();
        await result(counts.get("/tkani"));
      }
      entry.checks.push(
        "Both legacy and query Blackout URLs retain eight products and link to parent family",
      );
      await open(page, "/catalog?category=%2Fkarnizi");
      filters = await controls();
      await expect(
        filters.getByRole("group", { name: "Вид ткани", exact: true }),
      ).toHaveCount(0);
      await filters
        .getByRole("checkbox", { name: "Настенные карнизы", exact: true })
        .check();
      await filters
        .getByRole("checkbox", { name: "Деревянные карнизы", exact: true })
        .check();
      await close(filters);
      await result(4);
      await page
        .getByRole("button", {
          name: "Убрать фильтр: Деревянные карнизы",
          exact: true,
        })
        .click();
      await result(16);
      entry.checks.push(
        "Contextual rod facets intersect mounting/material; removable chip restores 16 wall rods",
      );
      await open(page, "/catalog?category=%2Fdecor");
      await result(counts.get("/decor"));
      entry.checks.push(
        "Decor includes 131 products including painting with missing imported parent membership",
      );
      assert.deepEqual(entry.errors, []);
      entry.passed = true;
    } catch (error) {
      entry.errors.push(error.stack);
    }
    report.scenarios.push(entry);
    await c.close();
  }
} catch (error) {
  report.errors.push(error.stack);
} finally {
  report.summary = {
    routeChecks: report.routeChecks.length,
    routeFailures: report.routeChecks.filter((check) => !check.passed).length,
    accessibilityChecks: report.accessibility.length,
    accessibilityFailures: report.accessibility.filter((check) => !check.passed)
      .length,
    scenarios: report.scenarios.length,
    scenarioFailures: report.scenarios.filter((check) => !check.passed).length,
  };
  report.passed =
    report.summary.routeChecks === 24 &&
    report.summary.accessibilityChecks === 4 &&
    report.summary.scenarios === 2 &&
    !report.summary.routeFailures &&
    !report.summary.accessibilityFailures &&
    !report.summary.scenarioFailures &&
    !report.errors.length;
  await writeFile(
    `${dir}/catalog-report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
console.log(
  JSON.stringify(
    { passed: report.passed, summary: report.summary, errors: report.errors },
    null,
    2,
  ),
);
if (!report.passed) process.exitCode = 1;
