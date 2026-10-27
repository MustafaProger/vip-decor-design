import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isRetiredPath, cleanPublicBlog } from "./content-retirement.mjs";
import { publicPageHead } from "./page-head.mjs";

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_ORIGIN = "https://vip2d.ru";
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
};

function reply(request, response, status, body, headers = {}) {
  if (response.destroyed) return;
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": bytes.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(request.method === "HEAD" ? undefined : bytes);
}

function requestPath(url) {
  const raw = (url || "/").split("?")[0];
  const path = decodeURIComponent(raw);
  if (
    !path.startsWith("/") ||
    path.includes("//") ||
    /[\\\u0000-\u001f\u007f]/.test(path) ||
    path.split("/").some((segment) => segment.startsWith("."))
  ) {
    return null;
  }
  return path;
}

function publishedBlog(snapshot) {
  snapshot = cleanPublicBlog(snapshot);
  const posts = (snapshot.posts || []).filter(
    (post) => !post.status || post.status === "published",
  );
  return {
    ...snapshot,
    posts,
    categories: (snapshot.categories || []).filter((category) =>
      posts.some((post) => post.category === category.slug),
    ),
  };
}

function blogPaths(blog) {
  return new Set([
    "/blog",
    ...blog.posts.map((post) => `/blog/${post.slug}`),
    ...blog.categories.map((category) => `/blog/category/${category.slug}`),
  ]);
}

const escapeXml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export function renderSitemap(content, blog, origin = DEFAULT_ORIGIN) {
  const urls = new Set();
  const siteOrigin = new URL(origin).origin;
  const add = (value) => {
    if (typeof value !== "string" || !value) return;
    if (isRetiredPath(value)) return;
    try {
      const url = new URL(value, siteOrigin);
      if (url.origin !== siteOrigin || url.username || url.password) return;
      if (/^\/(?:admin|api|server)(?:\/|$)/i.test(url.pathname)) return;
      url.hash = "";
      url.search = "";
      urls.add(url.href);
    } catch {
      // Invalid source URLs must not break the public sitemap.
    }
  };
  for (const page of content.pages || []) {
    const value = page.path || page.url;
    if (typeof value !== "string") continue;
    let pathname;
    try {
      pathname = new URL(value, siteOrigin).pathname;
    } catch {
      continue;
    }
    // Blog and product addresses come only from the current published records.
    if (/^\/blog(?:\/|$)|^\/product(?:\/|$)|\/tproduct\//.test(pathname))
      continue;
    if (page.status && page.status !== 200) continue;
    add(value);
  }
  for (const product of content.products || []) {
    if (product.status && product.status !== "published") continue;
    add(product.url || `/product/${encodeURIComponent(product.id)}`);
  }
  for (const category of content.categories || []) {
    if (category.sourceHasCatalog) add(category.path);
  }
  for (const path of [
    "/",
    "/selection",
    "/projects",
    "/company",
    "/contacts",
    "/calculator",
    "/price",
    "/catalog",
    "/derzhateli-dlya-shtor",
    ...blogPaths(publishedBlog(blog)),
  ])
    add(path);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    [...urls]
      .sort()
      .map((url) => `<url><loc>${escapeXml(url)}</loc></url>`)
      .join("\n") +
    "\n</urlset>\n"
  );
}

export async function createSiteHandler(options = {}) {
  const directory = await realpath(
    resolve(options.distDirectory || resolve(projectDirectory, "dist")),
  );
  const template = await readFile(resolve(directory, "index.html"), "utf8");
  const renderer =
    options.renderBlogDocument ||
    (await import(pathToFileURL(resolve(directory, "server/render.js")).href))
      .renderBlogDocument;
  if (typeof renderer !== "function")
    throw new Error("Blog renderer is missing. Run npm run build first.");
  const origin = options.origin || DEFAULT_ORIGIN;

  return async function siteHandler(request, response, { cmsService } = {}) {
    let path;
    try {
      path = requestPath(request.url);
    } catch {
      reply(request, response, 400, "Некорректный адрес.");
      return true;
    }
    if (!path || /^\/(?:server|api)(?:\/|$)/i.test(path)) {
      reply(request, response, 404, "Страница не найдена.");
      return true;
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      reply(request, response, 405, "Используйте GET или HEAD.", {
        Allow: "GET, HEAD",
      });
      return true;
    }

    try {
      if (isRetiredPath(path)) {
        reply(request, response, 410,
          '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, follow"><title>Страница удалена — VIP DECOR DESIGN</title></head><body style="margin:0;background:#f6f4ef;color:#203c32;font:18px/1.6 system-ui"><main style="max-width:640px;margin:15vh auto;padding:24px"><p>VIP DECOR DESIGN</p><h1>Эта страница больше не доступна</h1><p>Посмотрите актуальные ткани, шторы и карнизы в нашем каталоге.</p><p><a href="/catalog">Перейти в каталог</a> · <a href="/">На главную</a></p></main></body></html>',
          { "Content-Type": MIME_TYPES[".html"], "X-Robots-Tag": "noindex, follow" });
        return true;
      }
      if (path === "/data/site-content.json") {
        const content = await cmsService.getPublicContent();
        reply(request, response, 200, JSON.stringify(content), {
          "Content-Type": MIME_TYPES[".json"],
        });
        return true;
      }
      const aliases = { "/fabrics": "/tkani", "/furnitura": "/fyrnityra", "/privacy": "/popd", "/studio": "/company", "/shop": "/catalog", "/curtains": "/", "/projects/quiet-living-room": "/projects" };
      if (aliases[path]) {
        const query = (request.url || "").includes("?") ? request.url.slice(request.url.indexOf("?")) : "";
        reply(request, response, 301, "", { Location: aliases[path] + query });
        return true;
      }
      // The old Tilda sitemap is still known to crawlers. Keep it valid too.
      if (path === "/sitemap.xml" || path === "/sitemap-store.xml") {
        const [content, blog] = await Promise.all([
          cmsService.getPublicContent(),
          cmsService.getPublicBlog(),
        ]);
        reply(request, response, 200, renderSitemap(content, blog, origin), {
          "Content-Type": MIME_TYPES[".xml"],
        });
        return true;
      }
      if (path === "/blog" || path.startsWith("/blog/")) {
        const blog = publishedBlog(await cmsService.getPublicBlog());
        const normalized = path.replace(/\/+$/, "");
        const known = blogPaths(blog).has(normalized);
        if (known && normalized !== (request.url || "").split("?")[0]) {
          const queryIndex = (request.url || "").indexOf("?");
          const query = queryIndex < 0 ? "" : request.url.slice(queryIndex);
          reply(request, response, 301, "", { Location: normalized + query });
          return true;
        }
        const html = await renderer(request.url, template, blog);
        reply(request, response, known ? 200 : 404, html, {
          "Content-Type": MIME_TYPES[".html"],
          ...(!known ? { "X-Robots-Tag": "noindex, follow" } : {}),
        });
        return true;
      }

      const admin = path === "/admin" || path.startsWith("/admin/");
      const candidate = resolve(directory, `.${path}`);
      let file;
      let info;
      try {
        file = await realpath(candidate);
        const relative = file.slice(directory.length + 1);
        const normalizedRelative = relative.split(sep).join("/").toLowerCase();
        if (
          (file !== directory && !file.startsWith(directory + sep)) ||
          relative.split(sep).some((segment) => segment.startsWith(".")) ||
          /^(?:server|blog)(?:\/|$)/.test(normalizedRelative) ||
          ["data/site-content.json", "sitemap.xml"].includes(normalizedRelative)
        ) {
          reply(request, response, 404, "Файл не найден.");
          return true;
        }
        info = await stat(file);
      } catch (error) {
        if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
      }
      if (info?.isFile()) {
        const image = /^image\//.test(MIME_TYPES[extname(file).toLowerCase()] || "");
        const imageHeaders = image ? {
          "ETag": `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`,
          "Last-Modified": info.mtime.toUTCString(),
          "Cache-Control": path.startsWith("/assets/")
            ? "public, max-age=31536000, immutable"
            : "public, max-age=604800",
        } : {};
        if (image) {
          const tags = request.headers["if-none-match"];
          const modifiedSince = request.headers["if-modified-since"];
          const unchanged = tags !== undefined
            ? tags.split(",").some((tag) => tag.trim() === "*" || tag.trim().replace(/^W\//, "") === imageHeaders.ETag.replace(/^W\//, ""))
            : modifiedSince && Math.floor(info.mtimeMs / 1000) <= Math.floor(Date.parse(modifiedSince) / 1000);
          if (unchanged) {
            response.writeHead(304, imageHeaders);
            response.end();
            return true;
          }
        }
        const bytes = await readFile(file);
        reply(request, response, 200, bytes, {
          "Content-Type":
            MIME_TYPES[extname(file).toLowerCase()] ||
            "application/octet-stream",
          "Cache-Control": path.startsWith("/assets/")
            ? "public, max-age=31536000, immutable"
            : "no-cache",
          ...imageHeaders,
          ...(admin ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
        });
        return true;
      }
      let knownHtmlPage = false;
      if (!info && extname(path) === ".html") {
        const content = await cmsService.getPublicContent();
        knownHtmlPage = (content.pages || []).some(
          (page) => page.path === path,
        );
      }
      if (
        (info?.isDirectory() && path !== "/" && !admin) ||
        (extname(path) && !knownHtmlPage)
      ) {
        reply(request, response, 404, "Файл не найден.");
        return true;
      }
      const page = admin ? null : publicPageHead(path, template, await cmsService.getPublicContent());
      const html = admin
        ? template
            .replace(/<meta\s+[^>]*name=["']robots["'][^>]*>/gi, "")
            .replace(
              "</head>",
              '<meta name="robots" content="noindex, nofollow"><link rel="manifest" href="/admin/manifest.webmanifest"><link rel="apple-touch-icon" href="/admin/icon-192.png"><meta name="theme-color" content="#2d4b3e">\n</head>',
            )
        : page.html;
      reply(request, response, page?.status || 200, html, {
        "Content-Type": MIME_TYPES[".html"],
        ...(admin ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
      });
    } catch (error) {
      console.error("Site response failed:", error.code || error.name);
      if (!response.headersSent)
        reply(
          request,
          response,
          503,
          "Сайт временно недоступен. Попробуйте ещё раз.",
        );
      else response.destroy();
    }
    return true;
  };
}
