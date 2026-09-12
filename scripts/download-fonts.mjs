import { readFile, writeFile } from "node:fs/promises";
let css = await readFile("/tmp/vip-decor-fonts.css", "utf8");
const urls = [...new Set(css.match(/https:\/\/[^)]+/g))];
for (let i = 0; i < urls.length; i++) {
  const name = "font-" + i + ".ttf";
  const response = await fetch(urls[i]);
  if (!response.ok) throw new Error("Font download failed");
  await writeFile(
    "public/fonts/" + name,
    Buffer.from(await response.arrayBuffer()),
  );
  css = css.replaceAll(urls[i], "/fonts/" + name);
}
await writeFile("src/fonts.css", css);
for (const font of ["cormorantgaramond", "manrope"]) {
  const response = await fetch(
    "https://raw.githubusercontent.com/google/fonts/main/ofl/" +
      font +
      "/OFL.txt",
  );
  if (!response.ok) throw new Error("License download failed");
  await writeFile("public/fonts/" + font + "-OFL.txt", await response.text());
}
console.log("Fonts and OFL licenses saved locally");
