import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:5180";
const output = "docs/qa-september-refresh";
const reportPath = `${output}/report.json`;
const phase = process.env.QA_PHASE || "all";
const widths = [320, 390, 768, 1024, 1440, 1920];
const data = JSON.parse(await readFile("src/data/site-content.json", "utf8"));
const inventory = JSON.parse(
  await readFile("data/source/page-inventory.json", "utf8"),
);
const reviews = JSON.parse(
  await readFile("src/data/yandex-reviews.json", "utf8"),
);
const customRoutes = [
  "/catalog",
  "/catalog?category=%2Ftkani",
  "/catalog?category=%2Fdecor",
  "/company",
  "/projects",
  "/projects/quiet-living-room",
  "/selection",
  "/calculator",
  "/cart",
  "/favorites",
  "/price",
  "/contacts",
  "/sitemap",
  "/shop",
  "/fabrics",
  "/privacy",
  "/studio",
  "/curtains",
  "/furnitura",
  `/product/${data.products[0].id}`,
];
const routes = [...new Set([...inventory.map((p) => p.path), ...customRoutes])];
let report = {
  checkedAt: new Date().toISOString(),
  baseURL,
  browser: "",
  scope: {
    sourcePages: inventory.map((p) => p.path),
    sourcePageCount: inventory.length,
    customRoutes,
    routes: routes.length,
    widths,
    expectedRouteChecks: routes.length * widths.length,
  },
  routeChecks: [],
  accessibility: [],
  scenarios: [],
  blockedWrites: [],
  limitations: [
    "Local Chrome verification; no production deployment or delivery integration is claimed.",
    "Only GET, HEAD and OPTIONS are allowed in isolated temporary browser contexts. No forms are submitted.",
    "All rendered HTML and SVG image sources are decoded after a full-page scroll. The 477 individual product routes are not rechecked; one product smoke flow is included.",
    "Axe covers WCAG A/AA rules on four affected routes at 390 and 1440 pixels; this does not replace a screen-reader audit.",
    "Review UI is checked against the imported snapshot and source links, not independently against all live Yandex reviews.",
  ],
};
if (phase !== "all") {
  try {
    report = JSON.parse(await readFile(reportPath, "utf8"));
  } catch {
    /* First selected phase creates report. */
  }
}
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
report.browser = browser.version();
async function save() {
  report.updatedAt = new Date().toISOString();
  report.summary = {
    routeChecks: report.routeChecks.length,
    routeFailures: report.routeChecks.filter((r) => !r.passed).length,
    accessibilityChecks: report.accessibility.length,
    accessibilityFailures: report.accessibility.filter((r) => !r.passed).length,
    scenarios: report.scenarios.length,
    scenarioFailures: report.scenarios.filter((r) => !r.passed).length,
    blockedWriteCount: report.blockedWrites.length,
  };
  report.passed =
    report.summary.routeChecks === routes.length * widths.length &&
    report.summary.accessibilityChecks === 8 &&
    report.summary.scenarios >= 10 &&
    !report.summary.routeFailures &&
    !report.summary.accessibilityFailures &&
    !report.summary.scenarioFailures;
  await writeFile(reportPath, JSON.stringify(report, null, 2));
}
async function context(width = 1440) {
  const c = await browser.newContext({
    viewport: { width, height: 1000 },
    reducedMotion: "reduce",
  });
  await c.route("**/*", (route) => {
    const request = route.request();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method()))
      return route.continue();
    report.blockedWrites.push({ method: request.method(), url: request.url() });
    return route.abort("blockedbyclient");
  });
  return c;
}
async function open(page, path) {
  const response = await page.goto(baseURL + path, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await page
    .locator("#main-content h1")
    .first()
    .waitFor({ state: "visible", timeout: 15000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
  });
  return response;
}
async function revealAndDecode(page) {
  return page.evaluate(async () => {
    for (
      let y = 0, steps = 0;
      y < document.documentElement.scrollHeight && steps < 90;
      y += innerHeight * 0.8, steps++
    ) {
      window.scrollTo({ top: y, behavior: "instant" });
      await new Promise((r) => requestAnimationFrame(r));
    }
    const htmlImages = [...document.querySelectorAll("main img")];
    htmlImages.forEach((img) => {
      img.loading = "eager";
    });
    const sources = [
      ...new Set(
        [
          ...htmlImages.map((img) => img.currentSrc || img.src),
          ...[...document.querySelectorAll("main svg image")].map((img) =>
            img.getAttribute("href"),
          ),
        ].filter(Boolean),
      ),
    ];
    const broken = [];
    await Promise.all(
      sources.map(async (src) => {
        const image = new Image();
        image.src = src;
        try {
          await Promise.race([
            image.decode(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("image decode timed out")),
                5000,
              ),
            ),
          ]);
        } catch {
          broken.push(src);
        }
      }),
    );
    window.scrollTo({ top: 0, behavior: "instant" });
    await new Promise((r) => requestAnimationFrame(r));
    return {
      imageCount: sources.length,
      brokenImages: broken,
      imageFallbacks: document.querySelectorAll("main .missing-image").length,
    };
  });
}
async function inspectRoute(page, path, width) {
  const result = {
    path,
    width,
    checkedAt: new Date().toISOString(),
    errors: [],
    runtimeErrors: [],
    consoleErrors: [],
    failedResources: [],
    externalResourceWarnings: [],
  };
  const runtime = (error) => result.runtimeErrors.push(error.message);
  const consoleListener = (message) => {
    if (message.type() !== "error") return;
    const entry = { text: message.text(), url: message.location().url };
    if (!entry.url || entry.url.startsWith(baseURL))
      result.consoleErrors.push(entry);
    else result.externalResourceWarnings.push(entry);
  };
  const responseListener = (response) => {
    if (response.status() < 400) return;
    const entry = { url: response.url(), status: response.status() };
    if (entry.url.startsWith(baseURL)) result.failedResources.push(entry);
    else result.externalResourceWarnings.push(entry);
  };
  page.on("pageerror", runtime);
  page.on("console", consoleListener);
  page.on("response", responseListener);
  try {
    result.httpStatus = (await open(page, path))?.status();
    result.resolvedUrl = page.url().replace(baseURL, "");
    Object.assign(result, await revealAndDecode(page));
    Object.assign(
      result,
      await page.evaluate(() => {
        const main = document.querySelector("main");
        const h1 = [...main.querySelectorAll("h1")].filter(
          (el) => el.getClientRects().length,
        );
        const overflow = document.documentElement.scrollWidth > innerWidth + 1;
        return {
          h1Count: h1.length,
          headings: h1.map((el) => el.textContent.trim()),
          documentWidth: document.documentElement.scrollWidth,
          overflow,
          notFound: /Эта страница не найдена|Не удалось открыть страницу/.test(
            main.innerText,
          ),
          overflowElements: overflow
            ? [...main.querySelectorAll("*")]
                .map((el) => ({ el, rect: el.getBoundingClientRect() }))
                .filter(
                  ({ rect }) =>
                    rect.width &&
                    (rect.right > innerWidth + 1 || rect.left < -1),
                )
                .slice(0, 8)
                .map(({ el, rect }) => ({
                  class: String(el.className),
                  left: rect.left,
                  right: rect.right,
                }))
            : [],
        };
      }),
    );
    await page.evaluate(() =>
      window.scrollTo({ top: 1100, behavior: "instant" }),
    );
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
    result.header = await page.locator(".site-header").evaluate((el) => ({
      position: getComputedStyle(el).position,
      top: el.getBoundingClientRect().top,
      expected: parseFloat(getComputedStyle(el).top),
      bottom: el.getBoundingClientRect().bottom,
    }));
    if (result.httpStatus !== 200)
      result.errors.push(`HTTP ${result.httpStatus}`);
    if (result.h1Count !== 1)
      result.errors.push(`Expected one visible H1, got ${result.h1Count}`);
    if (result.notFound) result.errors.push("Unexpected not-found page");
    if (result.overflow)
      result.errors.push(
        `Horizontal overflow ${result.documentWidth} > ${width}`,
      );
    if (result.brokenImages.length || result.imageFallbacks)
      result.errors.push("Image decoding or fallback failures");
    if (Math.abs(result.header.top - result.header.expected) > 1)
      result.errors.push("Header moves away from its fixed top");
  } catch (error) {
    result.errors.push(error.message);
  }
  page.off("pageerror", runtime);
  page.off("console", consoleListener);
  page.off("response", responseListener);
  if (
    result.runtimeErrors.length ||
    result.consoleErrors.length ||
    result.failedResources.length
  )
    result.errors.push("Runtime, console, or first-party HTTP errors");
  result.passed = !result.errors.length;
  report.routeChecks.push(result);
  if (!result.passed)
    console.log("FAIL", path, width, result.errors.join("; "));
  return result;
}
async function scenario(name, run, width = 1440) {
  const result = {
    name,
    width,
    checkedAt: new Date().toISOString(),
    passed: false,
    runtimeErrors: [],
  };
  const c = await context(width);
  const page = await c.newPage();
  page.on("pageerror", (error) => result.runtimeErrors.push(error.message));
  try {
    result.details = await run(page);
    assert.equal(result.runtimeErrors.length, 0);
    result.passed = true;
  } catch (error) {
    result.error = error.stack || error.message;
    console.log("FAIL scenario", name, error.message);
  } finally {
    await c.close();
  }
  report.scenarios.push(result);
  await save();
}
async function runScenarios() {
  report.scenarios = [];
  for (const width of [390, 1440]) {
    await scenario(
      "Catalog categories, disabled directions, search, reset, Back and reload",
      async (page) => {
        await open(page, "/catalog");
        const counts = new Map();
        for (const product of data.products)
          for (const path of new Set(
            product.categoryPaths || [product.categoryPath],
          ))
            if (path) counts.set(path, (counts.get(path) || 0) + 1);
        const empty = data.categories.filter((c) => !counts.get(c.path)).length;
        await expect(page.locator(".results-meta [role=status]")).toHaveText(
          `Найдено: ${data.products.length}`,
        );
        await expect(
          page.locator(".category-rail .category-unavailable:disabled"),
        ).toHaveCount(empty);
        await expect(page.locator(".category-rail > *")).toHaveCount(
          data.categories.length + 1,
        );
        await page.evaluate(() => window.scrollTo(0, 1100));
        const sticky = await page
          .locator(".catalog-categories")
          .evaluate((el) => ({
            top: el.getBoundingClientRect().top,
            expected: parseFloat(getComputedStyle(el).top),
          }));
        assert(Math.abs(sticky.top - sticky.expected) < 1);
        await page
          .locator(".category-rail")
          .getByRole("link", { name: "Бархат", exact: true })
          .click();
        await expect(page.locator(".results-meta [role=status]")).toHaveText(
          `Найдено: ${counts.get("/barxat")}`,
        );
        await page.getByRole("searchbox").fill("Нежность");
        await expect(page.locator(".results-meta [role=status]")).toHaveText(
          "Найдено: 1",
        );
        await page.reload();
        await expect(page.getByRole("searchbox")).toHaveValue("Нежность");
        const filters =
          width < 900
            ? page.getByRole("dialog", { name: "Фильтры" })
            : page.locator(".filters-sidebar");
        if (width < 900)
          await page
            .getByRole("button", { name: "Фильтры", exact: true })
            .click();
        await filters.getByRole("button", { name: "Сбросить всё" }).click();
        if (width < 900)
          await filters
            .getByRole("button", { name: /Показать результаты/ })
            .click();
        await expect(page.locator(".results-meta [role=status]")).toHaveText(
          `Найдено: ${counts.get("/barxat")}`,
        );
        await expect(
          page.locator(".category-rail [aria-current=page]"),
        ).toHaveText("Бархат");
        await page.goBack();
        await expect(page.locator(".results-meta [role=status]")).toHaveText(
          `Найдено: ${data.products.length}`,
        );
        await open(page, "/catalog?category=%2Fdecor");
        await expect(page.locator(".results-meta [role=status]")).toHaveText(
          `Найдено: ${counts.get("/decor")}`,
        );
        const activeVisible = await page
          .locator(".category-rail")
          .evaluate((el) => {
            const r = el.getBoundingClientRect(),
              a = el.querySelector("[aria-current]").getBoundingClientRect();
            return a.left >= r.left - 1 && a.right <= r.right + 1;
          });
        assert(activeVisible);
        return {
          totalProducts: data.products.length,
          categories: data.categories.length,
          disabledCategories: empty,
          sticky,
          activeVisible,
        };
      },
      width,
    );
    await scenario(
      "Favorites and cart retain exact product and quantity on reload",
      async (page) => {
        await open(page, "/catalog");
        const card = page.locator(".product-card").first();
        const title = await card.locator("h3").innerText();
        const href = await card.locator("h3 a").getAttribute("href");
        await card.locator(".favorite-button").click();
        await page
          .locator(".header-actions")
          .getByRole("link", { name: "Избранное, 1", exact: true })
          .click();
        await expect(page.locator(".product-card")).toHaveCount(1);
        await expect(page.locator(".product-card h3")).toHaveText(title);
        await page.reload();
        await expect(page.locator(".product-card")).toHaveCount(1);
        await page.locator(".favorite-button").click();
        await expect(
          page.getByRole("heading", { name: "В избранном пока нет товаров" }),
        ).toBeVisible();
        await open(page, href);
        await page
          .getByRole("button", { name: "В корзину", exact: true })
          .click();
        await page
          .locator(".header-actions")
          .getByRole("link", { name: "Корзина, 1", exact: true })
          .click();
        await expect(page.locator(".cart-item")).toHaveCount(1);
        await expect(page.locator(".cart-item h2")).toHaveText(title);
        const amount = (text) =>
          Number(text.replace(/[^\d,]/g, "").replace(",", "."));
        const initialTotal = amount(
          await page.locator(".cart-total").innerText(),
        );
        await page
          .getByRole("button", {
            name: `Увеличить количество ${title}`,
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("spinbutton", {
            name: `Количество ${title}`,
            exact: true,
          }),
        ).toHaveValue("2");
        assert.equal(
          amount(await page.locator(".cart-total").innerText()),
          initialTotal * 2,
        );
        await page.reload();
        await expect(
          page.getByRole("spinbutton", {
            name: `Количество ${title}`,
            exact: true,
          }),
        ).toHaveValue("2");
        await page
          .getByRole("button", { name: `Удалить ${title}`, exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "Ваша корзина пока пуста." }),
        ).toBeVisible();
        return { title, initialTotal, checkedQuantity: 2, submittedForms: 0 };
      },
      width,
    );
    await scenario(
      "Review carousel, source links, gallery and removed concept",
      async (page) => {
        await open(page, "/projects");
        await expect(page.locator(".review-card")).toHaveCount(
          reviews.reviews.length,
        );
        await expect(page.locator(".review-source")).toHaveCount(
          reviews.reviews.length,
        );
        assert.deepEqual(
          await page.locator(".review-author h3").allTextContents(),
          reviews.reviews.map((review) => review.author),
        );
        const positions = await page.evaluate(() => ({
          reviews: document
            .querySelector(".client-reviews")
            .getBoundingClientRect().top,
          photos: document
            .querySelector(".gallery-grid")
            .getBoundingClientRect().top,
        }));
        assert(positions.reviews < positions.photos);
        const reviewLinks = await page
          .locator(".review-source")
          .evaluateAll((els) => els.map((el) => el.href));
        assert(
          reviewLinks.every(
            (href) =>
              href.startsWith("https://yandex.") &&
              href.includes("223039913433"),
          ),
        );
        const reviewRail = page.locator(".reviews-rail");
        await page
          .getByRole("button", { name: "Следующие отзывы", exact: true })
          .click();
        await expect
          .poll(() => reviewRail.evaluate((el) => el.scrollLeft))
          .toBeGreaterThan(0);
        await page
          .getByRole("button", { name: "Предыдущие отзывы", exact: true })
          .click();
        await expect
          .poll(() => reviewRail.evaluate((el) => el.scrollLeft))
          .toBeLessThan(2);
        await reviewRail.focus();
        await page.keyboard.press("ArrowRight");
        await expect
          .poll(() => reviewRail.evaluate((el) => el.scrollLeft))
          .toBeGreaterThan(0);
        const photo = page.locator(".gallery-grid button").first();
        await photo.click();
        const dialog = page.getByRole("dialog", {
          name: "Фотография из галереи",
          exact: true,
        });
        await expect(dialog).toBeVisible();
        await expect(
          dialog.locator(".gallery-controls [aria-live]"),
        ).toHaveText(`1 / ${data.gallery.length}`);
        await dialog
          .getByRole("button", { name: "Следующая фотография" })
          .click();
        await expect(
          dialog.locator(".gallery-controls [aria-live]"),
        ).toHaveText(`2 / ${data.gallery.length}`);
        await page.keyboard.press("Escape");
        await expect(photo).toBeFocused();
        await page
          .getByRole("button", { name: "Показать ещё", exact: true })
          .click();
        await expect(page.locator(".gallery-grid button")).toHaveCount(
          data.gallery.length,
        );
        await expect(
          page.locator('a[href="/projects/quiet-living-room"]'),
        ).toHaveCount(0);
        await open(page, "/projects/quiet-living-room");
        await expect(page).toHaveURL(baseURL + "/projects");
        return {
          displayedReviews: reviews.reviews.length,
          sourceReviewCount: reviews.reviewCount,
          positions,
          photographs: data.gallery.length,
          sourceLinks: reviewLinks.length,
        };
      },
      width,
    );
  }
  await scenario(
    "Mobile menu keyboard focus, Escape and Catalog navigation",
    async (page) => {
      await open(page, "/");
      const opener = page.getByRole("button", { name: "Открыть меню" });
      await opener.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Меню", exact: true });
      await expect(dialog).toBeVisible();
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press("Tab");
        assert(
          await dialog.evaluate(
            (el) => !document.hasFocus() || el.contains(document.activeElement),
          ),
        );
      }
      await page.keyboard.press("Escape");
      await expect(opener).toBeFocused();
      await opener.click();
      await dialog.getByRole("link", { name: "Каталог", exact: true }).click();
      await expect(page).toHaveURL(baseURL + "/catalog");
      await expect(dialog).not.toBeVisible();
      return {
        trappedTabPresses: 20,
        focusRestored: true,
        navigatedTo: "/catalog",
      };
    },
    320,
  );
  await scenario("Company facts and visible order actions", async (page) => {
    await open(page, "/company");
    await revealAndDecode(page);
    await expect(page.locator(".company-number")).toHaveCount(4);
    for (const fact of ["20 120", "10 000", "120", "21"])
      await expect(page.locator(".company-numbers")).toContainText(fact);
    await open(page, "/");
    await revealAndDecode(page);
    await expect(page.locator(".home-order-actions a")).toHaveCount(2);
    await expect(page.locator(".home-order-actions a").first()).toHaveText(
      /Обсудить мой заказ/,
    );
    return {
      facts: ["20 120", "10 000", "120", "21"],
      primaryAction: "Обсудить мой заказ",
      secondaryAction: "Цены на пошив",
    };
  });
  await scenario(
    "Combined price, material and sort filters, pagination and preserved category",
    async (page) => {
      await open(page, "/catalog?category=%2Ftkani");
      const filters = page.locator(".filters-sidebar");
      await filters
        .getByLabel("Максимальная цена", { exact: true })
        .fill("3000");
      await page.locator(".sort-field select").selectOption("price-asc");
      await expect(page.locator(".results-meta [role=status]")).not.toHaveText(
        "Найдено: 263",
      );
      const prices = (
        await page.locator(".product-price").allTextContents()
      ).map((text) =>
        Number(
          text
            .split("₽")
            .at(-2)
            .replace(/[^\d,]/g, "")
            .replace(",", "."),
        ),
      );
      assert(prices.every((n, i) => n <= 3000 && (!i || n >= prices[i - 1])));
      await filters.getByLabel("Бархат", { exact: true }).check();
      await page.reload();
      await expect(
        filters.getByLabel("Максимальная цена", { exact: true }),
      ).toHaveValue("3000");
      await expect(filters.getByLabel("Бархат", { exact: true })).toBeChecked();
      await expect(page.locator(".sort-field select")).toHaveValue("price-asc");
      await filters.getByRole("button", { name: "Сбросить всё" }).click();
      await expect(page.locator(".results-meta [role=status]")).toHaveText(
        "Найдено: 263",
      );
      await page
        .getByRole("button", { name: "Показать ещё 24", exact: true })
        .click();
      await expect(page.locator(".product-grid > *")).toHaveCount(48);
      await page
        .locator(".category-rail")
        .getByRole("link", { name: "Бархат", exact: true })
        .click();
      await expect(page.locator(".product-grid > *")).toHaveCount(24);
      return {
        maximumPrice: 3000,
        prices,
        material: "Бархат",
        loaded: [24, 48],
        afterCategoryChange: 24,
      };
    },
  );
  await scenario(
    "Legacy catalog URL query and empty description removal",
    async (page) => {
      await open(page, "/shop?q=сатин");
      await expect(page).toHaveURL(/\/catalog\?q=/);
      await expect(page.getByRole("searchbox")).toHaveValue("сатин");
      await open(page, "/tkani");
      await expect(page.locator(".collection-details")).toHaveCount(0);
      await expect(page.locator(".collection-note")).toContainText(
        "В этом разделе вы найдете ткани",
      );
      await open(page, "/catalog");
      await expect(page.locator(".collection-note")).toHaveCount(0);
      return {
        shopQueryPreserved: true,
        oldFabricUrlPreserved: true,
        emptyDisclosureRemoved: true,
      };
    },
  );
}
async function runAxe() {
  const targets = process.env.QA_ROUTES
    ? process.env.QA_ROUTES.split(",")
    : ["/", "/catalog", "/company", "/projects"];
  report.accessibility = report.accessibility.filter(
    (check) => !targets.includes(check.path),
  );
  for (const width of [390, 1440]) {
    const c = await context(width),
      page = await c.newPage();
    for (const path of targets) {
      await open(page, path);
      await revealAndDecode(page);
      const scan = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const result = {
        path,
        width,
        checkedAt: new Date().toISOString(),
        passed: !scan.violations.length,
        violations: scan.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      };
      report.accessibility.push(result);
      if (!result.passed)
        console.log(
          "FAIL Axe",
          path,
          width,
          result.violations.map((v) => v.id),
        );
      await save();
    }
    await c.close();
  }
}
try {
  if (phase === "all" || phase === "routes") {
    report.routeChecks = [];
    // Three independent contexts run in parallel; each route check waits for its own images.
    for (let i = 0; i < widths.length; i += 3) {
      await Promise.all(
        widths.slice(i, i + 3).map(async (width) => {
          const c = await context(width),
            page = await c.newPage();
          for (const path of routes) await inspectRoute(page, path, width);
          await c.close();
          console.log("Finished route width", width);
          await save();
        }),
      );
    }
    report.routeChecks.sort(
      (a, b) => a.width - b.width || a.path.localeCompare(b.path),
    );
    await save();
  }
  if (phase === "all" || phase === "scenarios") await runScenarios();
  if (phase === "all" || phase === "axe") await runAxe();
  await save();
  console.log(JSON.stringify(report.summary, null, 2));
} finally {
  await browser.close();
  await save();
}
if (
  report.summary.routeFailures ||
  report.summary.accessibilityFailures ||
  report.summary.scenarioFailures
)
  process.exitCode = 1;
