import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
const root = process.cwd();
const jsonPath = path.join(root, "src/data/site-content.json");
const mediaDir = path.join(root, "public/source-media");
const rawDir = path.join(root, "data/source/media");
await fs.mkdir(rawDir, { recursive: true });
const content = JSON.parse(await fs.readFile(jsonPath, "utf8"));
const manifestPath = path.join(root, "data/source/media-manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const paths = new Map();
const errors = [];
let originalBytes = 0,
  optimizedBytes = 0;
const entries = Object.values(manifest).filter((m) =>
  m.src.startsWith("/source-media/"),
);
let cursor = 0;
async function worker() {
  while (cursor < entries.length) {
    const i = cursor++;
    const entry = entries[i];
    const name = path.basename(entry.src);
    const original = path.join(mediaDir, name);
    try {
      if (!/\.(?:png|jpe?g|webp|avif)$/i.test(name)) continue;
      const targetName = name.replace(/\.[^.]+$/, ".webp");
      const target = path.join(mediaDir, targetName);
      const originalMeta = await sharp(original).metadata();
      const raw = path.join(rawDir, name);
      const previousSize = (await fs.stat(original)).size;
      originalBytes += previousSize;
      const image = await sharp(original)
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();
      await fs.writeFile(target + ".pending", image);
      await fs.rename(original, raw);
      await fs.rename(target + ".pending", target);
      optimizedBytes += image.length;
      paths.set(entry.src, "/source-media/" + targetName);
      entry.originalLocalPath = "data/source/media/" + name;
      entry.originalBytes = previousSize;
      entry.originalDimensions = {
        width: originalMeta.width,
        height: originalMeta.height,
      };
      entry.src = "/source-media/" + targetName;
      entry.bytes = image.length;
      const resized = await sharp(image).metadata();
      entry.width = resized.width;
      entry.height = resized.height;
    } catch (e) {
      errors.push({ src: entry.src, error: String(e) });
    }
    if (i % 100 === 0) console.log(`OPTIMIZE ${i + 1}/${entries.length}`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
function replace(value) {
  if (typeof value === "string") return paths.get(value) || value;
  if (Array.isArray(value)) return value.map(replace);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, replace(v)]),
    );
  return value;
}
await fs.writeFile(jsonPath, JSON.stringify(replace(content), null, 2));
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
const registryPath = path.join(root, "data/source/migration-registry.json");
await fs.writeFile(
  registryPath,
  JSON.stringify(
    replace(JSON.parse(await fs.readFile(registryPath, "utf8"))),
    null,
    2,
  ),
);
let doc = await fs.readFile(
  path.join(root, "docs/CONTENT_INVENTORY.md"),
  "utf8",
);
for (const [a, b] of paths) doc = doc.split(a).join(b);
doc += `\n## Изображения для веб-интерфейса\n\n${paths.size} растровых изображений преобразованы в WebP (quality 85, максимум 1600×1600, без увеличения). Оригиналы сохранены в \`data/source/media/\`. Публичный вес этих файлов: ${(optimizedBytes / 1024 / 1024).toFixed(1)} MB; оригинальный: ${(originalBytes / 1024 / 1024).toFixed(1)} MB. Исходные URLs, размеры и байты зафиксированы в \`data/source/media-manifest.json\`. Ошибок оптимизации: ${errors.length}.\n`;
await fs.writeFile(path.join(root, "docs/CONTENT_INVENTORY.md"), doc);
const statusPath = path.join(root, "data/source/crawl-status.json");
const status = JSON.parse(await fs.readFile(statusPath, "utf8"));
status.optimization = {
  images: paths.size,
  originalBytes,
  optimizedBytes,
  errors,
};
await fs.writeFile(statusPath, JSON.stringify(status, null, 2));
console.log(JSON.stringify(status.optimization, null, 2));
