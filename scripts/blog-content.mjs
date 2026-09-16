import { readFile, readdir, access } from "node:fs/promises";
export async function readBlog() {
  const categories = JSON.parse(
    await readFile("content/blog/categories.json", "utf8"),
  );
  const posts = [];
  const seen = {
    slug: new Set(),
    title: new Set(),
    seoTitle: new Set(),
    description: new Set(),
  };
  for (const name of (await readdir("content/blog")).sort()) {
    if (!name.endsWith(".json") || name === "categories.json") continue;
    const post = JSON.parse(await readFile(`content/blog/${name}`, "utf8"));
    if (!["draft", "published"].includes(post.status))
      throw Error(`${name}: status must be draft or published`);
    if (post.status !== "published") continue;
    for (const field of Object.keys(seen)) {
      if (!post[field]?.trim() || seen[field].has(post[field]))
        throw Error(`${name}: missing or duplicate ${field}`);
      seen[field].add(post[field]);
    }
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) ||
      post.slug === "category"
    )
      throw Error(`${name}: invalid slug`);
    if (!categories.some((c) => c.slug === post.category))
      throw Error(`${name}: unknown category`);
    if (
      !post.intro ||
      !post.excerpt ||
      !post.image?.alt ||
      !post.image?.caption ||
      !post.sections?.length ||
      !post.sources?.length
    )
      throw Error(`${name}: incomplete article`);
    if (!post.image.src.startsWith("/") || post.image.src.includes(".."))
      throw Error(`${name}: use a local image`);
    await access(`public${post.image.src}`);
    const ids = new Set();
    for (const section of post.sections) {
      if (
        !/^[a-z0-9-]+$/.test(section.id) ||
        ids.has(section.id) ||
        !section.title
      )
        throw Error(`${name}: invalid section id/title`);
      ids.add(section.id);
      for (const id of section.citations || [])
        if (!post.sources.some((s) => s.id === id))
          throw Error(`${name}: missing source ${id}`);
      for (const link of section.links || [])
        if (!/^\/(?!\/)/.test(link.href))
          throw Error(`${name}: expected internal link`);
    }
    for (const source of post.sources)
      if (!source.url.startsWith("https://"))
        throw Error(`${name}: expected HTTPS source`);
    for (const field of ["datePublished", "dateModified"])
      if (post[field] && !/^\d{4}-\d{2}-\d{2}$/.test(post[field]))
        throw Error(`${name}: invalid ${field}`);
    posts.push(post);
  }
  for (const p of posts)
    for (const slug of p.related || [])
      if (slug === p.slug || !posts.some((a) => a.slug === slug))
        throw Error(`${p.slug}: invalid related article ${slug}`);
  return {
    categories: categories.filter((c) =>
      posts.some((p) => p.category === c.slug),
    ),
    posts,
  };
}
export const blogPaths = (blog) => [
  "/blog",
  ...blog.categories.map((c) => `/blog/category/${c.slug}`),
  ...blog.posts.map((p) => `/blog/${p.slug}`),
];
