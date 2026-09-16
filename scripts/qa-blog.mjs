import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readBlog, blogPaths } from "./blog-content.mjs";
const base = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const out = process.env.QA_OUTPUT_DIR || "docs/qa-blog";
await mkdir(out, { recursive: true });
const blog = await readBlog();
const paths = blogPaths(blog);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = {
  base,
  rawHTML: [],
  layouts: [],
  accessibility: [],
  scenarios: [],
};
try {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  const titles = new Set(),
    descriptions = new Set();
  for (const path of paths) {
    const res = await page.goto(base + path);
    assert.equal(res.status(), 200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://vip2d.ru${path}`,
    );
    assert.ok(sitemap.includes(`https://vip2d.ru${path}</loc>`));
    const title = await page.title();
    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    assert.ok(!titles.has(title));
    titles.add(title);
    assert.ok(!descriptions.has(description));
    descriptions.add(description);
    const schema = JSON.parse(
      await page.locator('script[type="application/ld+json"]').textContent(),
    );
    assert.equal(schema[0]["@type"], "BreadcrumbList");
    const post = blog.posts.find((p) => `/blog/${p.slug}` === path);
    if (post) {
      await expect(page.locator(".blog-prose")).toContainText(
        post.sections.at(-1).title,
      );
      assert.equal(schema[1]["@type"], "BlogPosting");
      assert.equal(schema[1].headline, post.title);
      assert.ok(
        !schema[1].author &&
          !schema[1].dateModified &&
          !schema[1].datePublished,
      );
      for (const s of post.sections)
        await expect(page.locator(`#${s.id}`)).toBeVisible();
    }
    report.rawHTML.push({ path, title, passed: true });
  }
  assert.equal((await fetch(`${base}/blog/not-a-post`)).status, 404);
  const redirect = await fetch(`${base}/blog/`, { redirect: "manual" });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get("location"), "/blog");
  report.scenarios.push(
    "All 7 pages readable without JavaScript; unique metadata, canonical, JSON-LD, sitemap; unknown blog URL 404 and trailing slash 301",
  );
  await context.close();
  const live = await browser.newContext();
  const p = await live.newPage();
  const errors = [];
  p.on("pageerror", (error) => errors.push(error.message));
  for (const width of [320, 390, 768, 1024, 1440]) {
    await p.setViewportSize({ width, height: 950 });
    for (const path of ["/", ...paths]) {
      await p.goto(base + path);
      await expect(p.locator("h1")).toHaveCount(1);
      await expect(p.locator("h1")).toBeVisible();
      const overflow = await p.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      assert.equal(overflow, false, `${path} at ${width}: horizontal overflow`);
      const badImages = await p
        .locator("main img")
        .evaluateAll(async (imgs) => {
          imgs.forEach((img) => {
            img.loading = "eager";
          });
          await Promise.all(imgs.map((img) => img.decode().catch(() => {})));
          return imgs.filter((img) => !img.naturalWidth).map((img) => img.src);
        });
      assert.deepEqual(badImages, [], `${path}: missing image`);
      report.layouts.push({ path, width, passed: true });
      if (
        [390, 1440].includes(width) &&
        ["/", "/blog", `/blog/${blog.posts[0].slug}`].includes(path)
      )
        await p.screenshot({
          path: `${out}/${path === "/" ? "home" : path === "/blog" ? "blog" : "article"}-${width}.png`,
          fullPage: true,
        });
      if (
        [390, 1440].includes(width) &&
        path.startsWith("/blog") &&
        !path.includes("/category/")
      ) {
        const axe = await new AxeBuilder({ page: p })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        assert.deepEqual(
          axe.violations.map((v) => ({
            id: v.id,
            targets: v.nodes.map((n) => n.target),
          })),
          [],
          `${path} axe at ${width}`,
        );
        report.accessibility.push({ path, width, violations: 0 });
      }
    }
  }
  await p.goto(`${base}/blog`);
  await p
    .getByRole("navigation", { name: "Рубрики блога" })
    .getByRole("link", { name: "Картины и декор" })
    .click();
  await expect(p).toHaveURL(`${base}/blog/category/art-and-decor`);
  await p
    .getByRole("link", { name: "Читать: Как выбрать картину для гостиной" })
    .click();
  await expect(p.locator("h1")).toHaveText("Как выбрать картину для гостиной");
  await expect(p.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /index, follow/,
  );
  await p.locator(".blog-toc summary").click();
  await p
    .getByRole("navigation", { name: "Оглавление статьи" })
    .getByRole("link", { name: "Как подобрать размер картины над диваном" })
    .click();
  await expect(p).toHaveURL(/#size$/);
  let previousHeadingTop;
  await expect
    .poll(
      async () => {
        const position = await p.locator("#size-title").evaluate((el) => {
          const heading = el.getBoundingClientRect();
          const header = document
            .querySelector(".site-header")
            ?.getBoundingClientRect();
          return {
            top: heading.top,
            bottom: heading.bottom,
            headerBottom: header?.bottom || 0,
            viewportHeight: innerHeight,
          };
        });
        const settled =
          previousHeadingTop !== undefined &&
          Math.abs(position.top - previousHeadingTop) < 1;
        previousHeadingTop = position.top;
        return (
          settled &&
          position.top >= position.headerBottom &&
          position.bottom <= position.viewportHeight
        );
      },
      {
        message:
          "TOC scroll settles with the target heading below the sticky header and fully in view",
        timeout: 5000,
      },
    )
    .toBe(true);
  await p
    .getByRole("link", { name: "Посмотреть картины в каталоге", exact: true })
    .click();
  await expect(p).toHaveURL(`${base}/kartini`);
  await expect(p.locator("[data-blog-meta]")).toHaveCount(0);
  await p.goto(`${base}/`);
  await expect(p.locator(".blog-recommendations .blog-card")).toHaveCount(3);
  await p
    .locator(".blog-recommendations")
    .getByRole("link", { name: "Все статьи" })
    .click();
  await expect(p.locator("h1")).toHaveText("Дом, в которомхочется жить");
  assert.deepEqual(errors, []);
  report.scenarios.push(
    "Category → article → TOC → catalogue; metadata cleanup; home recommendations → blog; no browser errors",
  );
  // Every editorial link resolves to existing HTML, including company service pages.
  const links = new Set(
    blog.posts.flatMap((post) =>
      post.sections.flatMap((s) => s.links?.map((l) => l.href) || []),
    ),
  );
  for (const href of links) {
    await p.goto(base + href);
    await expect(p.locator("h1")).toHaveCount(1);
    assert.ok(
      !(await p.locator("h1").textContent()).includes("не найдена"),
      href,
    );
  }
  report.scenarios.push(`${links.size} editorial internal links resolve`);
  await live.close();
} finally {
  await browser.close();
  await writeFile(
    `${out}/results.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify(
    {
      rawHTML: report.rawHTML.length,
      layouts: report.layouts.length,
      accessibility: report.accessibility.length,
      scenarios: report.scenarios,
    },
    null,
    2,
  ),
);
