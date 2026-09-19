import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin } from "vite";
import type { BlogData } from "../src/blog/content";

const apiOrigin = () =>
  process.env.CMS_API_TARGET ||
  `http://127.0.0.1:${process.env.INQUIRY_PORT || 3001}`;
async function currentBlog(): Promise<BlogData> {
  const response = await fetch(`${apiOrigin()}/api/blog`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("CMS unavailable");
  const data = await response.json();
  if (!Array.isArray(data.posts) || !Array.isArray(data.categories))
    throw new Error("Invalid CMS data");
  return data;
}
function pathsFor(blog: BlogData) {
  return new Set([
    "/blog",
    ...blog.categories.map((c) => `/blog/category/${c.slug}`),
    ...blog.posts.map((p) => `/blog/${p.slug}`),
  ]);
}

// Dev and preview use the same live published snapshot as the CMS API.
export function blogPages(): Plugin {
  return {
    name: "blog-html",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        if (url.pathname === "/sitemap.xml") {
          try {
            const [blog, response] = await Promise.all([
              currentBlog(),
              fetch(`${apiOrigin()}/api/content`, {
                signal: AbortSignal.timeout(5000),
              }),
            ]);
            if (!response.ok) throw new Error("CMS unavailable");
            const { renderSitemap } = await import(
              /* @vite-ignore */ pathToFileURL(resolve("server/site.mjs")).href
            );
            const xml = renderSitemap(await response.json(), blog);
            res.writeHead(200, {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "no-store",
            });
            res.end(req.method === "HEAD" ? undefined : xml);
          } catch {
            res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Карта сайта временно недоступна.");
          }
          return;
        }
        if (!(url.pathname === "/blog" || url.pathname.startsWith("/blog/")))
          return next();
        if (!["GET", "HEAD"].includes(req.method || "GET")) return next();
        try {
          const blog = await currentBlog();
          const paths = pathsFor(blog);
          const path = url.pathname.replace(/\/$/, "");
          if (paths.has(path) && path !== url.pathname) {
            res.writeHead(301, { Location: path + url.search });
            res.end();
            return;
          }
          const template = await server.transformIndexHtml(
            req.url!,
            await readFile(resolve("index.html"), "utf8"),
          );
          const { renderBlogDocument } = await server.ssrLoadModule(
            "/src/blog/render.tsx",
          );
          const html = renderBlogDocument(req.url!, template, blog);
          res.writeHead(paths.has(path) ? 200 : 404, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(req.method === "HEAD" ? undefined : html);
        } catch (error) {
          server.config.logger.error(
            error instanceof Error ? error.message : "Blog rendering failed",
          );
          res.writeHead(503, {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end("Блог временно недоступен. Попробуйте обновить страницу.");
        }
      });
    },
    configurePreviewServer(server) {
      // Serve runtime routes ahead of the generated static seed pages.
      server.middlewares.use(async (req, res, next) => {
        const path = new URL(req.url || "/", "http://localhost").pathname;
        if (path === "/api" || path.startsWith("/api/")) return next();
        try {
          const { createSiteHandler } = await import(
            /* @vite-ignore */ pathToFileURL(resolve("server/site.mjs")).href
          );
          const handler = await createSiteHandler({
            distDirectory: resolve("dist"),
          });
          const cmsService = {
            getPublicBlog: currentBlog,
            getPublicContent: async () => {
              const response = await fetch(`${apiOrigin()}/api/content`, {
                signal: AbortSignal.timeout(5000),
              });
              if (!response.ok) throw new Error("CMS unavailable");
              return response.json();
            },
          };
          if (!(await handler(req, res, { cmsService }))) next();
        } catch {
          res.writeHead(503, {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end("Сайт временно недоступен. Проверьте сервер CMS.");
        }
      });
    },
  };
}
