import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const base = process.env.QA_BASE_URL || "http://127.0.0.1:5180";
const d = JSON.parse(await readFile("src/data/site-content.json", "utf8"));
const routes = [
  ...d.categories.filter((c) => !c.sourceHasCatalog).map((c) => c.path),
  "/furnitura",
];
const b = await chromium.launch({ channel: "chrome" });
const context = await b.newContext({ reducedMotion: "reduce" });
const p = await context.newPage();
const r = {
  checkedAt: new Date().toISOString(),
  layouts: [],
  accessibility: [],
  links: [],
  errors: [],
};
p.on("pageerror", (e) => r.errors.push(e.message));
p.on("console", (m) => {
  if (m.type() === "error") r.errors.push(m.text());
});
try {
  for (const width of [320, 390, 768, 1024, 1440, 1920]) {
    await p.setViewportSize({ width, height: 1000 });
    for (const path of routes) {
      await p.goto(base + path);
      await expect(p.locator(".direction-editorial")).toBeVisible();
      const source = d.pages.find(
        (s) => s.path === (path === "/furnitura" ? "/fyrnityra" : path),
      );
      await expect(p.locator("h1")).toHaveText(source.title);
      await p.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          [...document.images].map((i) => {
            i.loading = "eager";
            return i.decode().catch(() => {});
          }),
        );
      });
      const state = await p.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        main: document.querySelector("main").innerText.length,
        title: document.querySelector("h1").textContent,
        overflow: [],
        broken: [...document.images]
          .filter((i) => !i.naturalWidth)
          .map((i) => i.src),
      }));
      assert.ok(state.documentWidth <= width + 1, `${path}@${width}`);
      assert.deepEqual(state.broken, []);
      r.layouts.push({ path, width, ...state });
      if (width === 1440) {
        const text = (await p.locator("main").innerText())
          .replace(/\s+/g, "")
          .toLowerCase();
        for (const block of source.blocks)
          for (const para of block.paragraphs.filter(
            (t) => t !== block.heading,
          ))
            assert.ok(
              text.includes(para.replace(/\s+/g, "").toLowerCase()),
              "Missing original text: " + path + " " + para.slice(0, 80),
            );
        const links = await p
          .locator("main a[href]")
          .evaluateAll((els) =>
            els.map((el) => ({
              href: el.getAttribute("href"),
              text: el.textContent.trim(),
            })),
          );
        r.links.push({ path, links });
      }
      if (
        [390, 1440].includes(width) &&
        ["/podyshki", "/fyrnityra", "/avstriskieshtori"].includes(path)
      )
        await p.screenshot({
          path: `docs/qa-liquid-glass/${path.slice(1)}-${width}.png`,
        });
      if (
        [320, 1440].includes(width) &&
        ["/podyshki", "/fyrnityra", "/avstriskieshtori"].includes(path)
      ) {
        const { violations } = await new AxeBuilder({ page: p })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        r.accessibility.push({ path, width, violations });
      }
    }
    console.log(`Directions ${width}: ${routes.length}`);
  }
  await p.goto(base + "/fyrnityra");
  await p.locator(".direction-editorial button").click();
  await expect(p.getByRole("dialog")).toBeVisible();
  await expect(p.locator(".inquiry-context")).toContainText("Фурнитура");
  await p.keyboard.press("Escape");
  r.passed =
    r.errors.length === 0 &&
    r.accessibility.every((x) => x.violations.length === 0);
  if (r.passed) {
    const f = "docs/qa-liquid-glass/results.json";
    const previous = JSON.parse(await readFile(f, "utf8"));
    previous.layouts = previous.layouts.map(
      (old) =>
        r.layouts.find((x) => x.path === old.path && x.width === old.width) ||
        old,
    );
    previous.links = previous.links.map(
      (old) => r.links.find((x) => x.path === old.path) || old,
    );
    previous.directionLayoutsUpdatedAt = r.checkedAt;
    await writeFile(f, JSON.stringify(previous, null, 2));
  }
} catch (e) {
  r.errors.push(e.stack);
  r.passed = false;
} finally {
  await b.close();
  await writeFile(
    "docs/qa-liquid-glass/directions.json",
    JSON.stringify(r, null, 2),
  );
  console.log(
    JSON.stringify({
      passed: r.passed,
      layouts: r.layouts.length,
      axe: r.accessibility.length,
      errors: r.errors,
    }),
  );
  if (!r.passed) process.exitCode = 1;
}
