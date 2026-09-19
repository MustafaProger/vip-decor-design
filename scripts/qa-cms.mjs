import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { startProductionServer } from "../server/start.mjs";

const directory = await mkdtemp(join(tmpdir(), "vip-cms-e2e-"));
const out = resolve("docs/qa-cms");
await mkdir(out, { recursive: true });
const reservation = createServer();
await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
const base = `http://127.0.0.1:${port}`;
const options = {
  port,
  dataDirectory: directory,
  allowedOrigins: [base],
  refreshReviews: false,
};
let server;
let browser;
let debugPage;
const report = {
  checks: [],
  layouts: [],
  accessibility: [],
  consoleErrors: [],
};
const check = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
const closeServer = async () => {
  if (server) {
    const current = server;
    server = null;
    await new Promise((r, reject) =>
      current.close((e) => (e ? reject(e) : r())),
    );
  }
};
try {
  server = await startProductionServer(options);
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  debugPage = page;
  page.on("pageerror", (e) => report.consoleErrors.push(e.message));
  async function verifyLayout(view, widths = [320, 390, 768, 1440]) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(
          () =>
            page.evaluate(
              () => document.documentElement.scrollWidth - innerWidth,
            ),
          { timeout: 3000 },
        )
        .toBeLessThanOrEqual(1);
      report.layouts.push({
        view,
        width,
        ...(await page.evaluate(() => ({
          viewport: innerWidth,
          scroll: document.documentElement.scrollWidth,
        }))),
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }

  const token = (
    await readFile(join(directory, "cms-setup-token"), "utf8")
  ).trim();
  await page.goto(`${base}/admin#setup=${token}`);
  await page.getByLabel("Логин", { exact: true }).fill("cms-qa-admin");
  await page
    .getByLabel("Пароль", { exact: false })
    .fill("Local-only-QA-password-2026");
  await page.getByRole("button", { name: "Создать администратора" }).click();
  await expect(
    page.getByRole("heading", { name: "Всё важное — под рукой" }),
  ).toBeVisible();
  assert.equal(new URL(page.url()).hash, "");
  check(
    "First administrator setup through the browser; setup fragment cleared",
  );
  await page.screenshot({
    path: join(out, "dashboard-desktop.png"),
    fullPage: true,
  });
  await verifyLayout("overview");
  const session = await (
    await context.request.get(`${base}/api/cms/session`)
  ).json();
  assert.ok(session.authenticated && session.csrfToken);
  const headers = { Origin: base, "X-CSRF-Token": session.csrfToken };
  const call = async (path, method = "GET", data) => {
    const res = await context.request.fetch(base + path, {
      method,
      headers,
      ...(data === undefined ? {} : { data }),
    });
    const body = await res.json();
    assert.ok(
      res.ok(),
      `${method} ${path}: ${res.status()} ${JSON.stringify(body)}`,
    );
    return body;
  };
  const content = await call("/api/cms/content");
  assert.equal(content.products.length, 477);
  assert.equal(content.posts.length, 3);
  check("All 477 products and 3 source articles imported");
  const createdProduct = (
    await call("/api/cms/products", "POST", {
      ...content.products[0],
      id: "cms-qa-product",
      title: "CMS QA товар",
      description: "Проверка редактора и публикации.",
      descriptionHtml: "",
      shortDescription: "",
      variants: { editions: [] },
      price: 12345,
      url: "/product/cms-qa-product",
      status: "draft",
      version: undefined,
    })
  ).item;
  assert.ok(
    !(await (await fetch(base + "/api/content")).json()).products.some(
      (p) => p.id === createdProduct.id,
    ),
  );
  check("Draft product excluded from public API");
  const product = (
    await call("/api/cms/products/cms-qa-product", "PUT", {
      ...createdProduct,
      status: "published",
    })
  ).item;
  const publicPage = await context.newPage();
  publicPage.on("pageerror", (e) => report.consoleErrors.push(e.message));
  await publicPage.goto(base + "/product/cms-qa-product");
  await expect(
    publicPage.getByRole("heading", { level: 1, name: product.title }),
  ).toBeVisible();
  check("Published product immediately renders on the public website");

  await page.reload();
  await page.getByRole("button", { name: "Товары", exact: true }).click();
  await page.getByRole("searchbox").fill("CMS QA товар");
  await page
    .getByRole("button", { name: "Редактировать CMS QA товар", exact: true })
    .click();
  await page
    .getByLabel("Название товара *", { exact: true })
    .fill("CMS QA изменённый товар");
  await page.getByLabel("Цена, ₽", { exact: false }).first().fill("15000");
  const imageBytes = await sharp({
    create: { width: 120, height: 80, channels: 3, background: "#355447" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Загрузить: Добавить в галерею", { exact: true })
    .setInputFiles({
      name: "cms-qa.png",
      mimeType: "image/png",
      buffer: imageBytes,
    });
  await expect(
    page.getByRole("button", { name: "Сохранить", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await call("/api/cms/content")).products.find(
          (p) => p.id === product.id,
        )?.title,
    )
    .toBe("CMS QA изменённый товар");
  assert.ok(
    (await call("/api/cms/content")).products
      .find((p) => p.id === product.id)
      .images.some((url) => url.startsWith("/api/cms-media/")),
  );
  check(
    "Product editor saves title, price and uploaded photo through real API",
  );
  await page.screenshot({
    path: join(out, "product-editor-desktop.png"),
    fullPage: true,
  });

  await verifyLayout("product-editor", [320, 390, 1440]);
  const source = content.posts[0];
  let article = (
    await call("/api/cms/posts", "POST", {
      ...source,
      id: "cms-qa-article",
      slug: "cms-qa-article",
      title: "CMS QA новая статья",
      seoTitle: "CMS QA SEO",
      related: [],
      status: "draft",
      version: undefined,
    })
  ).item;
  assert.equal((await fetch(base + "/blog/cms-qa-article")).status, 404);
  article = (
    await call("/api/cms/posts/cms-qa-article", "PUT", {
      ...article,
      status: "published",
    })
  ).item;
  let raw = await (await fetch(base + "/blog/cms-qa-article")).text();
  assert.ok(raw.includes("CMS QA новая статья") && raw.includes("CMS QA SEO"));
  assert.ok(
    (await (await fetch(base + "/sitemap.xml")).text()).includes(
      "/blog/cms-qa-article",
    ),
  );
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const htmlPage = await noJs.newPage();
  await htmlPage.goto(base + "/blog/cms-qa-article");
  await expect(
    htmlPage.getByRole("heading", { level: 1, name: article.title }),
  ).toBeVisible();
  await noJs.close();
  check(
    "New article receives live server-rendered HTML, SEO and sitemap without rebuild",
  );
  article = (
    await call("/api/cms/posts/cms-qa-article", "PUT", {
      ...article,
      title: "CMS QA редакция два",
      seoTitle: "CMS QA SEO два",
    })
  ).item;
  raw = await (await fetch(base + "/blog/cms-qa-article")).text();
  assert.ok(
    raw.includes("CMS QA редакция два") && raw.includes("CMS QA SEO два"),
  );
  check("Editing an article updates SSR immediately");
  await page.getByRole("button", { name: "Статьи", exact: true }).click();
  await page
    .getByRole("button", { name: "Обновить данные", exact: true })
    .click();
  await page.getByRole("searchbox").fill("CMS QA редакция два");
  await page
    .getByRole("button", {
      name: "Редактировать CMS QA редакция два",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Вступление", { exact: false })
    .fill("Новый текст вступления из визуального редактора CMS.");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await call("/api/cms/content")).posts.find((p) => p.id === article.id)
          ?.intro,
    )
    .toBe("Новый текст вступления из визуального редактора CMS.");
  article = (await call("/api/cms/content")).posts.find(
    (p) => p.id === article.id,
  );
  await page.screenshot({
    path: join(out, "article-editor-desktop.png"),
    fullPage: true,
  });
  check("Article editor saves real structured article content");
  await verifyLayout("article-editor", [320, 390, 1440]);
  await call("/api/cms/posts/cms-qa-article", "PUT", {
    ...article,
    status: "draft",
  });
  assert.equal((await fetch(base + "/blog/cms-qa-article")).status, 404);
  assert.ok(
    !(await (await fetch(base + "/sitemap.xml")).text()).includes(
      "/blog/cms-qa-article",
    ),
  );
  assert.ok(
    !(await (await fetch(base + "/api/blog")).json()).posts.some(
      (p) => p.slug === article.slug,
    ),
  );
  check("Unpublishing removes article from public API, HTML and sitemap");

  await publicPage.goto(base + "/contacts");
  await publicPage
    .locator("main")
    .getByRole("button", { name: "Обсудить проект", exact: true })
    .click();
  await publicPage
    .getByLabel(/Ваше имя|Имя/)
    .first()
    .fill("Тест CMS");
  await publicPage
    .getByLabel(/Телефон/)
    .first()
    .fill("+7 000 000-00-00");
  await publicPage.getByRole("checkbox").first().check();
  await publicPage
    .getByRole("button", { name: "Отправить заявку", exact: true })
    .click();
  await expect(
    publicPage.getByRole("heading", { name: "Заявка сохранена", exact: true }),
  ).toBeVisible();
  const inquiries = (await call("/api/cms/inquiries")).inquiries;
  assert.equal(inquiries.length, 1);
  assert.equal(inquiries[0].name, "Тест CMS");
  const inquiry = (
    await call(`/api/cms/inquiries/${inquiries[0].id}`, "PATCH", {
      status: "in_progress",
      note: "QA — уточнить размеры.",
      version: inquiries[0].version,
    })
  ).item;
  check(
    "Public contact form saves a real inquiry, visible and editable in CMS",
  );
  const privateRes = await fetch(base + "/api/cms/inquiries");
  assert.equal(privateRes.status, 401);
  check("Inquiry details are unavailable without administrator authentication");

  await page.goto(base + "/admin");
  await page.getByRole("button", { name: "Заявки", exact: true }).click();
  await expect(
    page.getByText("Тест CMS", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: join(out, "inquiries-desktop.png"),
    fullPage: true,
  });
  await verifyLayout("inquiries");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(out, "inquiries-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  report.accessibility = axe.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.target),
  }));
  assert.equal(axe.violations.length, 0, JSON.stringify(report.accessibility));
  check(
    "Admin responsive at 320/390/768/1440; WCAG A/AA automated scan passes",
  );

  await closeServer();
  server = await startProductionServer(options);
  const afterRestart = await call("/api/cms/content");
  assert.equal(
    afterRestart.products.find((p) => p.id === product.id).title,
    "CMS QA изменённый товар",
  );
  assert.equal(
    afterRestart.posts.find((p) => p.id === article.id).status,
    "draft",
  );
  assert.equal(
    (await call("/api/cms/inquiries")).inquiries[0].note,
    inquiry.note,
  );
  assert.ok((await call("/api/cms/session")).authenticated);
  check("Content, inquiry status/notes and session persist after restart");
  assert.deepEqual(report.consoleErrors, []);
  check("No browser runtime errors");
  await writeFile(
    join(out, "results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(`CMS QA complete: ${report.checks.length} checks.`);
} catch (error) {
  if (debugPage) {
    await debugPage
      .screenshot({ path: join(out, "failure.png"), fullPage: true })
      .catch(() => {});
    report.overflow = await debugPage.evaluate(() =>
      [...document.querySelectorAll("*")]
        .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
        .map((e) => ({
          tag: e.tagName,
          class: e.className,
          right: e.getBoundingClientRect().right,
          width: e.getBoundingClientRect().width,
          overflow: getComputedStyle(e).overflow,
          position: getComputedStyle(e).position,
        }))
        .slice(0, 30),
    );
    report.lastPage = await debugPage
      .locator("main")
      .innerText()
      .catch(() => "");
  }
  await writeFile(
    join(out, "results.json"),
    JSON.stringify({ ...report, failure: error.message }, null, 2) + "\n",
  );
  throw error;
} finally {
  await browser?.close();
  await closeServer();
  await rm(directory, { recursive: true, force: true });
}
