import { pageMetadata } from "../src/lib/metadata.ts";

const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export function publicPageHead(path, template, content) {
  path = path.replace(/\/$/, "") || "/";
  const source = content.pages?.find((page) => page.path === path);
  const product = content.products?.find((item) => {
    if (path === `/product/${item.id}`) return true;
    try {
      return (
        decodeURIComponent(new URL(item.url, "https://vip2d.ru").pathname) ===
        path
      );
    } catch {
      return false;
    }
  });
  const metadata = pageMetadata(path, source, product);
  const head = `<title>${escape(metadata.title)}</title>\n<meta name="description" content="${escape(metadata.description)}">\n<meta name="robots" content="${escape(metadata.robots)}">\n<link rel="canonical" href="${escape(metadata.canonical)}">`;
  return {
    status:
      metadata.robots.startsWith("noindex") &&
      !["/cart", "/favorites"].includes(path)
        ? 404
        : 200,
    html: template
      .replace(/<title>[\s\S]*?<\/title>/gi, "")
      .replace(/<meta\b[^>]*name=["'](?:description|robots)["'][^>]*>/gi, "")
      .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, "")
      .replace("</head>", () => `${head}\n</head>`),
  };
}
