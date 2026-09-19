import "./prepare-blog.mjs";
import { rm, readFile } from "node:fs/promises";
const content = JSON.parse(
  await readFile("src/data/site-content.json", "utf8"),
);
if (!content.pages?.length || !content.products?.length)
  throw new Error("The source inventory is required before building.");
// CMS is authoritative. Old public copies would leak removed publications.
await rm("public/data/site-content.json", { force: true });
await rm("public/sitemap.xml", { force: true });
