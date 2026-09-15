import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
const base = "http://127.0.0.1:5180";
const output = "docs/qa-ui-polish";
const report = {
  checkedAt: new Date().toISOString(),
  checks: [],
  errors: [],
  mockedRequests: 0,
};
const browser = await chromium.launch({ channel: "chrome" });
const amount = (s) => Number(s.replace(/[^\d]/g, ""));
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    });
    const requests = [];
    await context.route("**/*", async (route) => {
      if (["GET", "HEAD", "OPTIONS"].includes(route.request().method()))
        return route.continue();
      if (new URL(route.request().url()).pathname === "/api/inquiries") {
        requests.push(route.request().postDataJSON());
        report.mockedRequests++;
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "qa-local-mock",
            status: "saved_locally",
          }),
        });
      }
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => report.errors.push(e.message));
    const open = async (path) => {
      await page.goto(base + path);
      await page.locator("main h1").waitFor({ state: "attached" });
    };
    await open("/product/325186268288");
    const title = await page.locator("main h1").innerText();
    const unit = amount(await page.locator(".pd-price strong").innerText());
    assert.ok(unit > 0);
    await page
      .getByRole("button", { name: "Увеличить количество", exact: true })
      .click();
    await expect(page.getByRole("spinbutton")).toHaveValue("2");
    await page.getByRole("button", { name: "В корзину", exact: true }).click();
    await page.locator(".pd-cart-message a").click();
    await expect(page.locator(".cart-item")).toHaveCount(1);
    assert.equal(
      amount(await page.locator(".cart-line-total").innerText()),
      unit * 2,
    );
    await page.reload();
    await expect(page.locator(".cart-item")).toHaveCount(1);
    await expect(page.locator(".cart-item input")).toHaveValue("2");
    await page
      .getByRole("button", {
        name: "Увеличить количество " + title,
        exact: true,
      })
      .click();
    await expect(page.locator(".cart-item input")).toHaveValue("3");
    assert.equal(
      amount(await page.locator(".cart-line-total").innerText()),
      unit * 3,
    );
    await page.getByRole("button", { name: "Перейти к оформлению" }).click();
    const checkout = page.locator(".checkout-panel");
    await checkout
      .getByRole("button", { name: "Сохранить запрос по корзине" })
      .click();
    await expect(
      checkout.locator('[aria-invalid="true"]').first(),
    ).toBeVisible();
    assert.equal(requests.length, 0, "Invalid checkout must not request API");
    await page.screenshot({
      path: `${output}/checkout-validation-${width}.png`,
    });
    await page
      .getByRole("button", { name: "Удалить " + title, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Ваша корзина пока пуста." }),
    ).toBeVisible();
    report.checks.push({
      width,
      scenario:
        "Product → cart, exact quantity totals, reload persistence, increment, checkout validation and removal",
      unit,
    });
    await open("/calculator");
    const total = page.getByLabel("Предварительная стоимость штор");
    await expect(total).toHaveText(/3\s?960/);
    await page.locator('input[name="tkani"][value="1950"]').check();
    await page.locator('input[name="podshif"][value="120"]').check();
    await page.locator('input[name="kreplenie"][value="1080"]').check();
    const range = page.locator("#calc-width");
    await range.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(range).toHaveValue("3");
    assert.equal(amount(await total.innerText()), 9450);
    await page
      .getByRole("button", { name: "Сохранить расчёт", exact: true })
      .click();
    await expect(
      page.locator('.calc-contact [aria-invalid="true"]').first(),
    ).toBeVisible();
    assert.equal(
      requests.length,
      0,
      "Invalid calculator contact must not request API",
    );
    report.checks.push({
      width,
      scenario:
        "Calculator choices and keyboard range: default 3960, selected 9450; contact validation without API writes",
    });
    await open("/contacts");
    await page.locator(".contact-card button").click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: "Отправить заявку", exact: true })
      .click();
    await expect(dialog.locator('[aria-invalid="true"]').first()).toBeVisible();
    assert.equal(requests.length, 0);
    await dialog.locator('input[name="name"]').fill("Тест интерфейса");
    await dialog.locator('input[name="phone"]').fill("+7 000 000 00 00");
    await dialog.locator('input[name="consent"]').check();
    await dialog
      .getByRole("button", { name: "Отправить заявку", exact: true })
      .click();
    await expect(
      dialog.getByRole("heading", { name: "Заявка сохранена", exact: true }),
    ).toBeVisible();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].consent, true);
    assert.ok(requests[0].context);
    await expect(dialog).toContainText("Доставка в компанию ещё не подключена");
    await page.keyboard.press("Escape");
    report.checks.push({
      width,
      scenario:
        "Inquiry required fields, consent, payload and local-save feedback; API response mocked, no real submission",
    });
    await open("/projects");
    const photo = page.locator(".gallery-grid button").first();
    await photo.click();
    const gallery = page.getByRole("dialog");
    await expect(gallery).toBeVisible();
    await expect(gallery.locator(".gallery-controls span")).toHaveText(
      "1 / 28",
    );
    await gallery.getByRole("button", { name: "Следующая фотография" }).click();
    await expect(gallery.locator(".gallery-controls span")).toHaveText(
      "2 / 28",
    );
    await page.keyboard.press("Escape");
    await expect(photo).toBeFocused();
    report.checks.push({
      width,
      scenario: "Gallery open, next image, Escape and focus restoration",
    });
    await context.close();
  }
} catch (e) {
  report.errors.push(e.stack);
} finally {
  await browser.close();
  report.passed = !report.errors.length;
  await writeFile(
    `${output}/commerce-ui.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
