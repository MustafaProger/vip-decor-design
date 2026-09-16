import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import blog from "../src/data/blog.json";
const paths = new Set([
  "/blog",
  ...blog.categories.map((c) => `/blog/category/${c.slug}`),
  ...blog.posts.map((p) => `/blog/${p.slug}`),
]);
export function blogPages(): Plugin {
  return {
    name: "blog-html",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        if (!(url.pathname === "/blog" || url.pathname.startsWith("/blog/")))
          return next();
        if (!["GET", "HEAD"].includes(req.method || "GET")) return next();
        const path = url.pathname.replace(/\/$/, "");
        if (paths.has(path) && path !== url.pathname) {
          res.writeHead(301, { Location: path + url.search });
          res.end();
          return;
        }
        try {
          const template = await server.transformIndexHtml(
            req.url!,
            await readFile(resolve("index.html"), "utf8"),
          );
          const { renderBlogDocument } = await server.ssrLoadModule(
            "/src/blog/render.tsx",
          );
          res.writeHead(paths.has(path) ? 200 : 404, {
            "Content-Type": "text/html; charset=utf-8",
          });
          res.end(
            req.method === "HEAD"
              ? undefined
              : renderBlogDocument(req.url!, template),
          );
        } catch (error) {
          next(error);
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        if (!(url.pathname === "/blog" || url.pathname.startsWith("/blog/")))
          return next();
        const path = url.pathname.replace(/\/$/, "");
        if (paths.has(path) && path !== url.pathname) {
          res.writeHead(301, { Location: path + url.search });
          res.end();
          return;
        }
        try {
          const html = await readFile(
            resolve(
              "dist",
              paths.has(path) ? `${path.slice(1)}/index.html` : "blog/404.html",
            ),
            "utf8",
          );
          res.writeHead(paths.has(path) ? 200 : 404, {
            "Content-Type": "text/html; charset=utf-8",
          });
          res.end(req.method === "HEAD" ? undefined : html);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
