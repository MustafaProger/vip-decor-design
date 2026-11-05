import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const root = "outputs/media-audit-20261104";
await fs.mkdir(root, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const results = [];
for (const width of [1440, 390]) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    reducedMotion: "reduce",
  });
  const base = process.env.QA_BASE_URL || "http://127.0.0.1:5180";
  await page.goto(base + "/catalog");
  await page.locator(".product-card").first().waitFor();
  assert.equal(await page.locator(".product-card").count(), 24);
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: /Показать ещё/ }).click();
  assert.equal(await page.locator(".product-card").count(), 72);
  const link = page.locator(".product-card .product-more").nth(57);
  await link.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  const href = await link.getAttribute("href");
  await link.click();
  await page.locator(".pd-layout").waitFor();
  assert.equal(new URL(page.url()).pathname, href);
  assert((await page.evaluate(() => scrollY)) < 10);
  await page.goBack();
  await page.locator(".product-card").nth(57).waitFor();
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => scrollY);
  assert.equal(await page.locator(".product-card").count(), 72);
  assert(Math.abs(after - before) < 5, `back ${width}: ${before} -> ${after}`);
  await page.locator(".product-card .product-more").nth(57).click();
  await page.locator(".pd-layout").waitFor();
  await page
    .getByRole("link", { name: "← Вернуться к каталогу", exact: true })
    .click();
  await page.locator(".product-card").nth(57).waitFor();
  await page.waitForTimeout(600);
  const explicit = await page.evaluate(() => scrollY);
  assert(
    Math.abs(explicit - before) < 5,
    `return ${width}: ${before} -> ${explicit}`,
  );
  await page.screenshot({ path: `${root}/return-${width}.png` });
  results.push({
    width,
    before,
    after,
    explicit,
    cards: await page.locator(".product-card").count(),
  });
  await page.evaluate(() => scrollTo({ top: 1600, behavior: "instant" }));
  await page.waitForTimeout(100);
  await page.reload();
  await page.locator(".product-card").nth(57).waitFor();
  await page.waitForTimeout(600);
  assert(
    Math.abs((await page.evaluate(() => scrollY)) - 1600) < 5,
    "reload after explicit return must use latest scroll",
  );
  await page.goto(base + "/catalog?category=%2Ftkani&sort=price-asc");
  await page.locator(".product-card").first().waitFor();
  assert.equal(await page.locator(".product-card").count(), 24);
  await page.getByRole("button", { name: /Показать ещё/ }).click();
  const filteredLink = page.locator(".product-card .product-more").nth(35);
  await filteredLink.scrollIntoViewIfNeeded();
  const filteredY = await page.evaluate(() => scrollY);
  const filteredUrl = page.url();
  await filteredLink.click();
  await page.locator(".pd-layout").waitFor();
  await page.reload();
  await page.locator(".pd-layout").waitFor();
  await page.goBack();
  await page.locator(".product-card").nth(35).waitFor();
  await page.waitForTimeout(600);
  assert.equal(page.url(), filteredUrl);
  const filteredReturn = await page.evaluate(() => scrollY);
  assert.equal(await page.locator(".product-card").count(), 48);
  assert(
    Math.abs(filteredReturn - filteredY) < 5,
    `filtered/reloaded ${width}: ${filteredY} -> ${filteredReturn}`,
  );
  results.push({
    width,
    scenario: "filtered catalog after product reload",
    before: filteredY,
    after: filteredReturn,
    cards: await page.locator(".product-card").count(),
  });
  await page.close();
}
await browser.close();
await fs.writeFile(root + "/scroll-qa.json", JSON.stringify(results, null, 2));
console.log(results);
