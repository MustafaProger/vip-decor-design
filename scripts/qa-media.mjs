import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
const d = JSON.parse(await fs.readFile("src/data/site-content.json", "utf8"));
const all = [
  ...new Set([
    ...d.products.flatMap((p) => [p.image, ...p.images]),
    ...d.categories.map((c) => c.image),
    ...d.gallery.map((i) => i.src),
    ...d.pages.flatMap((p) => p.images.map((i) => i.src)),
  ]),
].filter(Boolean);
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage();
await p.goto("http://127.0.0.1:5180");
const failures = [];
for (let i = 0; i < all.length; i += 30) {
  const chunk = all.slice(i, i + 30);
  failures.push(
    ...(await p.evaluate(async (sources) => {
      const imgs = sources.map((src) => {
        const img = new Image();
        img.src = src;
        return img;
      });
      await Promise.all(imgs.map((img) => img.decode().catch(() => {})));
      return imgs.filter((img) => !img.naturalWidth).map((img) => img.src);
    }, chunk)),
  );
}
await b.close();
await fs.writeFile(
  "docs/qa-liquid-glass/media.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      count: all.length,
      failures,
      knownSourceLimitation:
        "Source photograph for product 306608456632 is truncated in source, although its local optimized file decodes.",
    },
    null,
    2,
  ),
);
console.log(all.length, failures);
