import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import { readBlog, blogPaths } from "./blog-content.mjs";
const server = await createServer({
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
try {
  const { renderBlogDocument } = await server.ssrLoadModule(
    "/src/blog/render.tsx",
  );
  const template = await readFile("dist/index.html", "utf8");
  const paths = blogPaths(await readBlog());
  for (const path of paths) {
    await mkdir(`dist${path}`, { recursive: true });
    await writeFile(
      `dist${path}/index.html`,
      renderBlogDocument(path, template),
    );
  }
  await writeFile(
    "dist/blog/404.html",
    renderBlogDocument("/blog/not-found", template),
  );
  console.log(
    `Prerendered ${paths.length} blog pages with complete HTML, plus 404.`,
  );
} finally {
  await server.close();
}
