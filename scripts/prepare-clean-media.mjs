import fs from "node:fs/promises";
import sharp from "sharp";
const root = "outputs/media-audit-20261104";
const jobs = await Promise.all(
  (await fs.readdir(root + "/jobs"))
    .filter((n) => n.endsWith(".json"))
    .map(async (n) =>
      JSON.parse(await fs.readFile(root + "/jobs/" + n, "utf8")),
    ),
);
jobs.sort((a, b) => a.index - b.index);
await fs.mkdir("public/images/catalog-clean-20261104", { recursive: true });
for (const job of jobs) {
  const destination = "public" + job.target;
  try {
    await fs.access(destination);
  } catch {
    await sharp(job.path)
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 88 })
      .toFile(destination);
  }
}
await fs.writeFile(
  root + "/generated-current.json",
  JSON.stringify(jobs, null, 2),
);
for (let start = 0; start < jobs.length; start += 64) {
  const layers = [];
  for (const [j, a] of jobs.slice(start, start + 64).entries()) {
    layers.push({
      input: await sharp("public" + a.target)
        .resize(175, 153, { fit: "contain", background: "#eee" })
        .jpeg()
        .toBuffer(),
      left: (j % 8) * 175,
      top: Math.floor(j / 8) * 175,
    });
    layers.push({
      input: Buffer.from(
        `<svg width="175" height="22"><rect width="175" height="22" fill="white"/><text x="5" y="16" font-size="14">${a.index}</text></svg>`,
      ),
      left: (j % 8) * 175,
      top: Math.floor(j / 8) * 175 + 153,
    });
  }
  await sharp({
    create: { width: 1400, height: 1400, channels: 3, background: "#fff" },
  })
    .composite(layers)
    .jpeg({ quality: 88 })
    .toFile(`${root}/clean-sheet-${Math.floor(start / 64)}.jpg`);
}
console.log({ prepared: jobs.length });
