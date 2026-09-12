import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
const content = JSON.parse(
  await readFile("src/data/site-content.json", "utf8"),
);
if (!content.pages?.length || !content.products?.length)
  throw new Error("The source inventory is required before building.");
await mkdir("public/data", { recursive: true });
await copyFile("src/data/site-content.json", "public/data/site-content.json");
const origin = "https://vip2d.ru";
const paths = new Set([
  ...content.pages.map((p) => p.url),
  ...content.products.map((p) => p.url),
  ...[
    "/curtains",
    "/selection",
    "/projects",
    "/projects/quiet-living-room",
    "/company",
    "/contacts",
    "/calculator",
    "/price",
    "/catalog",
    "/shop",
  ].map((p) => origin + p),
]);
const escape = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
await writeFile(
  "public/sitemap.xml",
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    [...paths]
      .map((url) => "<url><loc>" + escape(url) + "</loc></url>")
      .join("\n") +
    "\n</urlset>\n",
);
