import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
const root = "outputs/media-audit-20261104";
const apply = process.argv.includes("--apply");
const decisions = JSON.parse(
  await fs.readFile(root + "/decisions.json", "utf8"),
);
const jobs = JSON.parse(
  await fs.readFile(root + "/generated-current.json", "utf8"),
);
const expected = decisions.filter((a) => a.decision === "replace");
for (const a of expected)
  if (!jobs.some((j) => j.index === a.index))
    throw Error("Missing replacement " + a.index);
const digest = (b) => createHash("sha256").update(b).digest("hex");
const manifest = [];
const hashes = new Map();
for (const a of expected) {
  const j = jobs.find((j) => j.index === a.index);
  await sharp("public" + j.target).stats();
  const before = digest(await fs.readFile("public" + a.src));
  const after = digest(await fs.readFile("public" + j.target));
  const entry = {
    index: a.index,
    src: a.src,
    target: j.target,
    reason: a.reason,
    prompt: j.prompt,
    owners: a.owners,
    originalSha256: before,
    sha256: after,
  };
  manifest.push(entry);
  if (!hashes.has(before)) hashes.set(before, entry);
}
async function files(dir) {
  const out = [];
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    out.push(...(d.isDirectory() ? await files(p) : [p]));
  }
  return out;
}
for (const file of [
  ...(await files("public/source-media")),
  ...(await files("public/images")),
]) {
  const src = "/" + file.slice("public/".length);
  if (
    manifest.some((r) => r.src === src) ||
    src.startsWith("/images/catalog-clean-20261104/")
  )
    continue;
  const match = hashes.get(digest(await fs.readFile(file)));
  if (match) manifest.push({ ...match, src, aliasOf: match.src });
}
const mapping = new Map(manifest.map((r) => [r.src, r.target]));
function replace(value) {
  if (typeof value === "string") return mapping.get(value) || value;
  if (Array.isArray(value)) return value.map(replace);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, replace(v)]),
    );
  return value;
}
await fs.mkdir("docs/media-audit-20261104", { recursive: true });
await fs.writeFile(
  "docs/media-audit-20261104/replacements.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
const unused = JSON.parse(
  await fs.readFile(root + "/unused-tiny.json", "utf8"),
);
// This retired project image already has a clean canonical replacement in bedding-content.json.
unused.push("/source-media/3d1a92b44b13beaf3d.webp");
const retired = [...new Set([...mapping.keys(), ...unused])];
await fs.writeFile(
  "docs/media-audit-20261104/retired.json",
  JSON.stringify(retired, null, 2) + "\n",
);
const changes = [];
for (const file of (await files("src/data")).filter((f) =>
  f.endsWith(".json"),
)) {
  const original = await fs.readFile(file, "utf8");
  const old = JSON.parse(original);
  const updated = replace(old);
  if (JSON.stringify(old) === JSON.stringify(updated)) continue;
  changes.push(file);
  if (apply) {
    const backup = path.join(root, "original-data", file);
    await fs.mkdir(path.dirname(backup), { recursive: true });
    await fs.writeFile(backup, original);
    await fs.writeFile(file, JSON.stringify(updated, null, 2) + "\n");
  }
}
if (apply)
  for (const src of retired) {
    const source = "public" + src;
    const backup = root + "/retired-originals" + src;
    await fs.mkdir(path.dirname(backup), { recursive: true });
    await fs.copyFile(source, backup);
    await fs.unlink(source);
  }
console.log({
  apply,
  replaced: expected.length,
  aliases: manifest.length - expected.length,
  unused: unused.length,
  retired: retired.length,
  changes,
});
