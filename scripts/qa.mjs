import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:5180";
const outputDirectory = resolve("docs");
const data = JSON.parse(await readFile("src/data/site-content.json", "utf8"));
const sourcePages = JSON.parse(
  await readFile("data/source/page-inventory.json", "utf8"),
);
const mainRoutes = [
  "/",
  "/tkani",
  "/selection",
  "/projects",
  "/studio",
  "/company",
  "/popd",
  "/kakpodobrat",
];
const customRoutes = [
  "/selection",
  "/projects",
  "/projects/quiet-living-room",
  "/studio",
  "/company",
  "/curtains",
  "/price",
  "/contacts",
  "/sitemap",
  "/catalog",
  "/shop",
  "/favorites",
  "/calculator",
  "/cart",
  "/fabrics",
  "/privacy",
];
const allRoutes = [
  ...new Set([
    ...sourcePages.map((page) => page.path),
    ...data.categories.map((category) => category.path),
    ...customRoutes,
  ]),
];
const axeRoutes = [
  "/",
  "/tkani",
  "/selection",
  "/projects",
  "/company",
  "/curtains",
  "/popd",
];
const report = {
  checkedAt: new Date().toISOString(),
  baseURL,
  browser: "",
  scope: {
    sourcePageCount: sourcePages.length,
    categoryCount: data.categories.length,
    customRouteCount: customRoutes.length,
    uniqueRoutes: allRoutes.length,
    sourcePages: sourcePages.map((page) => page.path),
    categoryPaths: data.categories.map((category) => category.path),
    customRoutes,
    note: "All 36 category URLs also occur among the 41 source pages. Shared URLs are visited once per width. Product, checkout and calculator business scenarios are verified separately.",
  },
  routeChecks: [],
  accessibility: [],
  scenarios: [],
  blockedWrites: [],
  limitations: [
    "Local browser verification is not production or complete content parity verification.",
    "Only GET/HEAD/OPTIONS requests are allowed. No real inquiries, messages, orders or payments are sent.",
    "Favorites and filters use an isolated, temporary browser profile; user browser data is untouched.",
    "Automated accessibility checks do not replace manual screen reader and visual review.",
  ],
};
if (process.env.QA_SCENARIOS_ONLY === "1") {
  const previous = JSON.parse(await readFile(resolve(outputDirectory, "BROWSER_QA.json"), "utf8"));
  assert.equal(previous.baseURL, baseURL, "Cannot reuse checks from a different application address");
  report.routeChecks = previous.routeChecks;
  report.accessibility = [...new Map(previous.accessibility.map((check) => [`${check.path}:${check.width}`, check])).values()];
  report.reusedPageChecksFrom = previous.reusedPageChecksFrom || previous.checkedAt;
}
await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.QA_BROWSER_CHANNEL || "chrome",
  headless: true,
});
report.browser = browser.version();

async function makeContext(viewport) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method()))
      await route.continue();
    else {
      report.blockedWrites.push({
        method: request.method(),
        url: request.url(),
      });
      await route.abort("blockedbyclient");
    }
  });
  return context;
}

async function openPage(page, path) {
  const response = await page.goto(`${baseURL}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 25000,
  });
  await page
    .locator("#main-content")
    .waitFor({ state: "visible", timeout: 15000 });
  await page.waitForFunction(
    () =>
      document.querySelector("#main-content")?.innerText?.trim().length > 20 &&
      !document.querySelector(".page-loading"),
    null,
    { timeout: 15000 },
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  return response;
}

function normalizeError(message) {
  return message.replace(/https?:\/\/127\.0\.0\.1:\d+/g, "<local>");
}

async function inspectRoute(page, path, width) {
  const runtimeErrors = [];
  const consoleErrors = [];
  const failedResources = [];
  const runtime = (error) => runtimeErrors.push(normalizeError(error.message));
  const consoleListener = (message) => {
    if (message.type() === "error")
      consoleErrors.push(normalizeError(message.text()));
  };
  const responseListener = (response) => {
    if (response.status() >= 400)
      failedResources.push({ url: response.url(), status: response.status() });
  };
  page.on("pageerror", runtime);
  page.on("console", consoleListener);
  page.on("response", responseListener);
  const result = {
    path,
    width,
    checkedAt: new Date().toISOString(),
    errors: [],
  };
  try {
    const response = await openPage(page, path);
    result.httpStatus = response?.status();
    result.resolvedPath = new URL(page.url()).pathname;
    Object.assign(
      result,
      await page.evaluate(() => {
        const main = document.querySelector("#main-content");
        const h1 = [...main.querySelectorAll("h1")].filter(
          (element) => element.getClientRects().length,
        );
        const documentWidth = document.documentElement.scrollWidth;
        const overflow = documentWidth > innerWidth + 1;
        return {
          viewportWidth: innerWidth,
          documentWidth,
          overflow,
          h1Count: h1.length,
          headings: h1.map((element) => element.innerText.trim()),
          mainTextLength: main.innerText.trim().length,
          notFound: /Эта страница не найдена|Не удалось открыть страницу/.test(
            main.innerText,
          ),
          imageFallbackCount: main.querySelectorAll(".missing-image").length,
          overflowElements: overflow
            ? [...document.querySelectorAll("body *")]
                .map((element) => ({
                  element,
                  rect: element.getBoundingClientRect(),
                }))
                .filter(
                  ({ rect }) =>
                    rect.width &&
                    (rect.right > innerWidth + 1 || rect.left < -1),
                )
                .slice(0, 12)
                .map(({ element, rect }) => ({
                  tag: element.tagName,
                  className:
                    typeof element.className === "string"
                      ? element.className
                      : "",
                  text: element.textContent?.trim().slice(0, 100),
                  left: rect.left,
                  right: rect.right,
                }))
            : [],
        };
      }),
    );
    if (result.httpStatus !== 200)
      result.errors.push(`HTTP ${result.httpStatus}`);
    if (result.overflow)
      result.errors.push(
        `Horizontal overflow: ${result.documentWidth}px > ${width}px`,
      );
    if (result.h1Count !== 1)
      result.errors.push(`Expected one visible H1, found ${result.h1Count}`);
    if (result.notFound) result.errors.push("Not found or runtime error page");
    if (result.mainTextLength < 40)
      result.errors.push("Main content is unexpectedly short");
  } catch (error) {
    result.errors.push(error.message);
  } finally {
    page.off("pageerror", runtime);
    page.off("console", consoleListener);
    page.off("response", responseListener);
  }
  result.runtimeErrors = [...new Set(runtimeErrors)];
  result.consoleErrors = [...new Set(consoleErrors)];
  result.failedResources = failedResources;
  if (runtimeErrors.length) result.errors.push("JavaScript runtime errors");
  result.passed = result.errors.length === 0;
  report.routeChecks.push(result);
  if (!result.passed)
    console.log(`FAIL ${path} @ ${width}: ${result.errors.join("; ")}`);
  return result;
}

async function scenario(name, run) {
  const result = { name, passed: false };
  try {
    result.details = await run();
    result.passed = true;
  } catch (error) {
    result.error = error.message;
    console.log(`FAIL scenario ${name}: ${error.message}`);
  }
  report.scenarios.push(result);
}

async function checkMenu() {
  const context = await makeContext({ width: 390, height: 844 });
  const page = await context.newPage();
  try {
    await openPage(page, "/");
    const opener = page.getByRole("button", {
      name: "Открыть меню",
      exact: true,
    });
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Меню", exact: true });
    await dialog.waitFor({ state: "visible" });
    assert.equal(await opener.getAttribute("aria-expanded"), "true");
    assert.ok(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
      "Opening the menu should move focus inside",
    );
    for (let index = 0; index < 14; index++) {
      await page.keyboard.press("Tab");
      assert.ok(
        await dialog.evaluate((element) =>
          !document.hasFocus() || element.contains(document.activeElement),
        ),
        `Tab ${index + 1} focused the page behind the dialog`,
      );
    }
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.ok(
      await opener.evaluate((element) => element === document.activeElement),
      "Escape should restore focus to the menu button",
    );
    assert.equal(await opener.getAttribute("aria-expanded"), "false");
    await opener.click();
    await dialog.getByRole("link", { name: "Ткани", exact: true }).click();
    await page.waitForURL("**/tkani");
    await dialog.waitFor({ state: "hidden" });
    return "Keyboard opening; 14 Tabs never focus background page content (native Chrome may move focus to browser controls); Escape closes and restores focus; a menu link navigates and closes the menu.";
  } finally {
    await context.close();
  }
}

async function checkFilters() {
  const context = await makeContext({ width: 1440, height: 1000 });
  const page = await context.newPage();
  try {
    await openPage(page, "/tkani");
    const source = data.products.filter((product) =>
      (product.categoryPaths || [product.categoryPath]).includes("/tkani"),
    );
    const sidebar = page.locator(".filters-sidebar");
    const results = page.locator('.results-meta [role="status"]');
    const count = async () =>
      Number((await results.innerText()).match(/\d+/)?.[0]);
    const waitCount = async (expected) => expect(results).toHaveText(`Найдено: ${expected}`);
    assert.equal(await count(), source.length);
    await sidebar
      .getByRole("spinbutton", { name: "Минимальная цена" })
      .fill("500");
    await sidebar
      .getByRole("spinbutton", { name: "Максимальная цена" })
      .fill("1500");
    await page.waitForURL(
      (url) =>
        url.searchParams.get("minPrice") === "500" &&
        url.searchParams.get("maxPrice") === "1500",
    );
    const expectedPrice = source.filter(
      (product) =>
        product.price !== null && product.price >= 500 && product.price <= 1500,
    ).length;
    await waitCount(expectedPrice);
    assert.equal(
      await count(),
      expectedPrice,
      "Price range should filter products",
    );
    await page.reload();
    await sidebar
      .getByRole("spinbutton", { name: "Минимальная цена" })
      .waitFor();
    assert.equal(
      await sidebar
        .getByRole("spinbutton", { name: "Минимальная цена" })
        .inputValue(),
      "500",
    );
    await waitCount(expectedPrice);
    assert.equal(
      await count(),
      expectedPrice,
      "Price range should survive reloading",
    );
    await page
      .locator(".filter-chips")
      .getByRole("button", { name: "От 500 ₽" })
      .click();
    assert.equal(new URL(page.url()).searchParams.has("minPrice"), false);
    await sidebar.getByRole("button", { name: "Сбросить всё" }).click();
    assert.equal(new URL(page.url()).search, "");
    await waitCount(source.length);
    assert.equal(await count(), source.length);

    const type = data.categories.find(
      (category) =>
        category.path !== "/tkani" &&
        source.some((product) => product.categoryPath === category.path),
    );
    assert.ok(type, "Expected at least one category filter");
    await sidebar
      .getByRole("checkbox", { name: type.title, exact: true })
      .click();
    await expect(sidebar.getByRole("checkbox", { name: type.title, exact: true })).toBeChecked();
    await page.waitForURL((url) =>
      url.searchParams.getAll("type").includes(type.path),
    );
    const expectedCategory = source.filter((product) =>
      (product.categoryPaths || [product.categoryPath]).includes(type.path),
    ).length;
    await waitCount(expectedCategory);
    assert.equal(
      await count(),
      expectedCategory,
      "Category filter should match the selected category",
    );
    await page.reload();
    await sidebar
      .getByRole("checkbox", { name: type.title, exact: true })
      .waitFor();
    assert.ok(
      await sidebar
        .getByRole("checkbox", { name: type.title, exact: true })
        .isChecked(),
    );
    await sidebar.getByRole("button", { name: "Сбросить всё" }).click();

    const search = page.getByRole("searchbox", {
      name: "Поиск по названию или артикулу",
    });
    const known = source.find((product) => product.sku) || source[0];
    const query = known.sku || known.title;
    await search.fill(query);
    await page.waitForURL((url) => url.searchParams.get("q") === query);
    await expect(page.locator('.product-card h3').filter({ hasText: known.title }).first()).toBeVisible();
    assert.ok(
      (await count()) > 0,
      "Known product search should find at least one match",
    );
    await page.reload();
    await search.waitFor();
    assert.equal(await search.inputValue(), query);
    await search.fill("qa-no-match-9823d2e8");
    await page
      .getByRole("heading", { name: "Пока ничего не найдено." })
      .waitFor();
    assert.equal(await count(), 0);
    assert.equal(await page.locator(".product-card").count(), 0);
    await sidebar.getByRole("button", { name: "Сбросить всё" }).click();
    assert.equal(new URL(page.url()).search, "");
    await waitCount(source.length);
    assert.equal(await search.inputValue(), "");
    assert.equal(await count(), source.length);
    return {
      baseline: source.length,
      priceRange: [500, 1500],
      priceResult: expectedPrice,
      category: type.path,
      categoryResult: expectedCategory,
      searchQuery: query,
      verified:
        "URL persistence and reload; filter chip removal; reset; known query; empty query results.",
    };
  } finally {
    await context.close();
  }
}

async function checkMobileFilters() {
  const context = await makeContext({ width: 320, height: 800 });
  const page = await context.newPage();
  try {
    await openPage(page, "/tkani");
    const opener = page.getByRole("button", { name: "Фильтры", exact: true });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Фильтры", exact: true });
    await dialog.waitFor({ state: "visible" });
    assert.ok(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    );
    const box = await dialog.boundingBox();
    assert.ok(
      box && box.x >= -1 && box.x + box.width <= 321,
      "Filter dialog should fit a 320px viewport",
    );
    await dialog
      .getByRole("spinbutton", { name: "Минимальная цена" })
      .fill("500");
    await dialog
      .getByRole("button", { name: "Показать результаты", exact: false })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(new URL(page.url()).searchParams.get("minPrice"), "500");
    await opener.click();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.ok(
      await opener.evaluate((element) => element === document.activeElement),
    );
    return "320px filter modal fits the viewport; price changes persist in URL; apply closes the modal; Escape restores focus.";
  } finally {
    await context.close();
  }
}

async function checkFavorites() {
  const context = await makeContext({ width: 1440, height: 1000 });
  const page = await context.newPage();
  try {
    await openPage(page, "/favorites");
    await page
      .getByRole("heading", { name: "Сохраните то, что откликнулось." })
      .waitFor();
    await openPage(page, "/tkani");
    const first = page.locator(".product-card").first();
    const title = await first.locator("h3").innerText();
    const favorite = first.getByRole("button", {
      name: "В избранное:",
      exact: false,
    });
    await favorite.click();
    assert.equal(
      await first.locator(".favorite-button").getAttribute("aria-pressed"),
      "true",
    );
    await page
      .locator(".header-actions")
      .getByRole("link", { name: "Избранное, 1", exact: true })
      .click();
    await page.waitForURL("**/favorites");
    await expect(page.locator(".product-card")).toHaveCount(1);
    assert.equal(await page.locator(".product-card h3").innerText(), title);
    await page.reload();
    await page.locator(".product-card").waitFor();
    assert.equal(await page.locator(".product-card").count(), 1);
    await page
      .getByRole("button", { name: "Убрать из избранного:", exact: false })
      .click();
    await page
      .getByRole("heading", { name: "Сохраните то, что откликнулось." })
      .waitFor();
    assert.equal(await page.locator(".product-card").count(), 0);
    assert.equal(
      await page
        .locator(".header-actions")
        .getByRole("link", { name: "Избранное", exact: true })
        .count(),
      1,
    );
    return `Added "${title}"; checked button state and header counter; favorites page and reload preserve it; removal restores empty state. User profile was untouched.`;
  } finally {
    await context.close();
  }
}

async function checkSelectionLayout() {
  const context = await makeContext({ width: 1440, height: 1000 });
  const page = await context.newPage();
  const measurements = [];
  try {
    await openPage(page, "/selection");
    async function checkStage(stage) {
      for (const width of [320, 390, 768, 1024, 1440, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const measurement = await page.evaluate(() => {
          const layout = document.querySelector('.selection-layout');
          const image = document.querySelector('.selection-visual').getBoundingClientRect();
          const questions = document.querySelector('.selection-questions').getBoundingClientRect();
          return { columns: getComputedStyle(layout).display === 'grid', image: { left: image.left, right: image.right, top: image.top, bottom: image.bottom }, questions: { left: questions.left, right: questions.right, top: questions.top, bottom: questions.bottom }, documentWidth: document.documentElement.scrollWidth };
        });
        if (measurement.columns) assert.ok(measurement.image.right <= measurement.questions.left + 1, `Selection step ${stage}, width ${width}: illustration overlaps the questions`);
        else assert.ok(measurement.image.bottom <= measurement.questions.top + 1, `Selection step ${stage}, width ${width}: stacked illustration overlaps the questions`);
        assert.ok(measurement.documentWidth <= width + 1, `Selection step ${stage}, width ${width}: horizontal overflow`);
        measurements.push({ stage, width, ...measurement });
      }
    }
    await checkStage(1);
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await page.getByRole('radio', { name: 'Помогите выбрать', exact: false }).check();
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Пока не знаю', exact: true }).check();
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await page.getByRole('heading', { name: 'Как с вами связаться?' }).waitFor();
    await checkStage(4);
    return { verified: 'Illustration never overlaps questions on steps 1 and 4 at all six widths; no form submission was attempted.', measurements };
  } finally { await context.close(); }
}

try {
  if (process.env.QA_SCENARIOS_ONLY !== "1") {
  await Promise.all(
    [320, 1440].map(async (width) => {
      const context = await makeContext({
        width,
        height: width === 320 ? 800 : 1000,
      });
      const page = await context.newPage();
      for (let index = 0; index < allRoutes.length; index++) {
        await inspectRoute(page, allRoutes[index], width);
        if ((index + 1) % 14 === 0)
          console.log(`Routes @ ${width}: ${index + 1}/${allRoutes.length}`);
      }
      await context.close();
    }),
  );
  for (const width of [390, 768, 1024, 1920]) {
    const context = await makeContext({ width, height: 1000 });
    const page = await context.newPage();
    for (const path of mainRoutes) await inspectRoute(page, path, width);
    await context.close();
  }
  console.log(`Route scans complete: ${report.routeChecks.length}`);
  for (const width of [320, 1440]) {
    const context = await makeContext({ width, height: 1000 });
    const page = await context.newPage();
    for (const path of axeRoutes) {
      try {
        await openPage(page, path);
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        const violations = result.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          description: violation.description,
          help: violation.help,
          helpUrl: violation.helpUrl,
          nodes: violation.nodes.map((node) => ({
            target: node.target,
            html: node.html,
            failureSummary: node.failureSummary,
          })),
        }));
        report.accessibility.push({
          path,
          width,
          passed: violations.length === 0,
          violations,
          incompleteCount: result.incomplete.length,
        });
        console.log(`Axe ${path} @ ${width}: ${violations.length} violations`);
      } catch (error) {
        report.accessibility.push({
          path,
          width,
          passed: false,
          error: error.message,
        });
      }
    }
    await context.close();
  }
  }
  await scenario(
    "Mobile menu keyboard, focus, Escape and navigation",
    checkMenu,
  );
  await scenario(
    "Catalog price/category/search filters and URL persistence",
    checkFilters,
  );
  await scenario("Mobile filter modal", checkMobileFilters);
  await scenario("Favorites persistence and empty state", checkFavorites);
  await scenario("Selection illustration and form bounds across six widths", checkSelectionLayout);
} finally {
  await browser.close();
  report.routeChecks.sort(
    (a, b) => a.path.localeCompare(b.path) || a.width - b.width,
  );
  report.summary = {
    routeChecks: report.routeChecks.length,
    failedRouteChecks: report.routeChecks.filter((check) => !check.passed)
      .length,
    accessibilityScans: report.accessibility.length,
    failedAccessibilityScans: report.accessibility.filter(
      (check) => !check.passed,
    ).length,
    accessibilityViolationTypes: [
      ...new Set(
        report.accessibility.flatMap((check) =>
          (check.violations || []).map((violation) => violation.id),
        ),
      ),
    ],
    scenarios: report.scenarios.length,
    failedScenarios: report.scenarios.filter((check) => !check.passed).length,
    blockedWrites: report.blockedWrites.length,
  };
  const failedRoutes = report.routeChecks.filter((check) => !check.passed);
  const failedAxe = report.accessibility.filter((check) => !check.passed);
  const resourceFailures = report.routeChecks.filter(
    (check) => check.failedResources?.length,
  );
  const markdown = [
    "# Проверка приложения в браузере",
    "",
    `Дата: ${report.checkedAt}. Адрес: ${baseURL}. Chrome ${report.browser}.`,
    ...(report.reusedPageChecksFrom ? [`Проверки маршрутов и Axe выполнены ${report.reusedPageChecksFrom}; затем отдельно повторены сценарии взаимодействия.`] : []),
    "",
    `Проверено ${sourcePages.length} исходных страниц и ${data.categories.length} категорий (адреса категорий входят в исходные страницы), а также ${customRoutes.length} дополнительных маршрутов. Всего ${allRoutes.length} уникальных маршрутов на 320 и 1440 px. Основные страницы также проверены на 390, 768, 1024 и 1920 px.`,
    "",
    `Проверки страниц: ${report.summary.routeChecks - report.summary.failedRouteChecks}/${report.summary.routeChecks} пройдено. Axe WCAG A/AA: ${report.summary.accessibilityScans - report.summary.failedAccessibilityScans}/${report.summary.accessibilityScans} без нарушений. Сценарии: ${report.summary.scenarios - report.summary.failedScenarios}/${report.summary.scenarios} пройдено.`,
    "",
    "## Обнаруженные проблемы",
    "",
    ...(failedRoutes.length
      ? failedRoutes.map(
          (check) =>
            `- ${check.path}, ${check.width}px: ${check.errors.join("; ")}`,
        )
      : [
          "- Переполнение, ошибки исполнения, отсутствие H1 или страницы 404 не обнаружены.",
        ]),
    ...failedAxe.map(
      (check) =>
        `- Axe ${check.path}, ${check.width}px: ${check.error || check.violations.map((violation) => `${violation.id} (${violation.impact}, ${violation.nodes.length} элементов)`).join("; ")}`,
    ),
    ...report.scenarios
      .filter((check) => !check.passed)
      .map((check) => `- ${check.name}: ${check.error}`),
    ...(resourceFailures.length
      ? [
          `- На ${resourceFailures.length} проверках были ошибки загрузки ресурсов; точные URL и HTTP-коды приведены в JSON.`,
        ]
      : []),
    "",
    "## Сценарии",
    "",
    ...report.scenarios.map(
      (check) =>
        `- ${check.passed ? "PASS" : "FAIL"} — ${check.name}: ${check.passed ? (typeof check.details === "string" ? check.details : check.details.verified || JSON.stringify(check.details)) : check.error}`,
    ),
    "",
    "## Повторный запуск и границы проверки",
    "",
    "`QA_BASE_URL=http://127.0.0.1:5180 npm run qa` — приложение должно уже работать. По умолчанию используется этот же адрес и установленный Chrome. `QA_BROWSER_CHANNEL` позволяет выбрать другой установленный канал Chromium.",
    "`QA_SCENARIOS_ONLY=1 npm run qa` повторяет только сценарии, сохраняя предыдущие результаты маршрутов и Axe в отчёте с исходной датой; используйте после исправления тестов или для проверки взаимодействий без изменений общих страниц.",
    "",
    "Скрипт создаёт отдельный временный профиль, блокирует все запросы, кроме GET/HEAD/OPTIONS, и не отправляет заявки, сообщения, заказы или платежи. Избранное изменяется только внутри этого профиля. Товар, оформление и бизнес-логика калькулятора проверяются отдельно.",
    "",
    "Автоматическая проверка Axe не заменяет ручную оценку экранным диктором. Прохождение маршрутов не доказывает полный перенос каждого фрагмента исходного сайта и не подтверждает рабочие интеграции или публикацию.",
    "",
    "Полные результаты каждого маршрута, ширины, нарушения Axe и сценария: [BROWSER_QA.json](BROWSER_QA.json).",
    "",
  ].join("\n");
  await writeFile(
    resolve(outputDirectory, "BROWSER_QA.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(resolve(outputDirectory, "BROWSER_QA.md"), markdown);
  console.log(JSON.stringify(report.summary, null, 2));
  if (
    report.summary.failedRouteChecks ||
    report.summary.failedAccessibilityScans ||
    report.summary.failedScenarios
  )
    process.exitCode = 1;
}
