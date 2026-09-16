import { mkdir, writeFile, readFile } from "node:fs/promises";
import sharp from "sharp";
import { readBlog } from "./blog-content.mjs";
const blog = await readBlog();
await mkdir("public/images/blog", { recursive: true });
for (const post of blog.posts) {
  const original = `public${post.image.src}`;
  const metadata = await sharp(original).metadata();
  const sizes = [480, 800, Math.min(1200, metadata.width)];
  post.image.originalSrc = post.image.src;
  post.image.variants = [];
  for (const width of sizes) {
    const src = `/images/blog/${post.slug}-${width}.webp`;
    await sharp(original)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(`public${src}`);
    post.image.variants.push({ src, width });
  }
  post.image.src = post.image.variants.at(-1).src;
  post.image.width = sizes.at(-1);
  post.image.height = Math.round(
    (metadata.height * sizes.at(-1)) / metadata.width,
  );
}
await writeFile("src/data/blog.json", JSON.stringify(blog, null, 2) + "\n");
const site = JSON.parse(await readFile("src/data/site-content.json", "utf8"));
await writeFile(
  "src/data/blog-chrome.json",
  JSON.stringify(
    {
      ...site,
      pages: [],
      products: [],
      gallery: [],
      categories: site.categories.map((c) => ({ ...c, description: "" })),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Blog: ${blog.posts.length} articles, ${blog.categories.length} categories`,
);
