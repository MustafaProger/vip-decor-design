import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
const manifest = JSON.parse(
  await fs.readFile("docs/media-audit-20261104/replacements.json", "utf8"),
);
const retired = JSON.parse(
  await fs.readFile("docs/media-audit-20261104/retired.json", "utf8"),
);
const old = new Set(retired);
const targets = new Map(manifest.map((r) => [r.target, r]));
for (const [target, row] of targets) {
  const bytes = await fs.readFile("public" + target);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), row.sha256);
  await sharp(bytes).stats();
}
for (const src of retired) {
  assert(
    !(await fs.stat("public" + src).catch(() => null)),
    "Retired image still published: " + src,
  );
}
const refs = new Set();
function collect(v) {
  if (
    typeof v === "string" &&
    v.startsWith("/") &&
    /\.(webp|png|jpg|jpeg|svg)$/i.test(v)
  )
    refs.add(v);
  else if (Array.isArray(v)) v.forEach(collect);
  else if (v && typeof v === "object") Object.values(v).forEach(collect);
}
for (const name of await fs.readdir("src/data"))
  if (name.endsWith(".json"))
    collect(JSON.parse(await fs.readFile("src/data/" + name, "utf8")));
if (process.env.QA_CONTENT_FILE)
  collect(JSON.parse(await fs.readFile(process.env.QA_CONTENT_FILE, "utf8")));
const errors = [];
for (const src of refs) {
  if (old.has(src)) errors.push({ src, error: "retired reference" });
  try {
    await fs.access("public" + src);
  } catch {
    if (!src.startsWith("/api/")) errors.push({ src, error: "missing file" });
  }
}
assert.deepEqual(errors, []);
const result = {
  generated: targets.size,
  mappings: manifest.length,
  retired: retired.length,
  checkedReferences: refs.size,
  errors,
};
const rasterFiles = (await fs.readdir("public", { recursive: true })).filter(name => /\.(webp|jpe?g|png)$/i.test(name));
for (const file of rasterFiles) await sharp("public/" + file).stats();
result.decodedFiles = rasterFiles.length;
await fs.mkdir("outputs/media-audit-20261104", { recursive: true });
await fs.writeFile(
  "outputs/media-audit-20261104/final-media-qa.json",
  JSON.stringify(result, null, 2),
);
console.log(result);
