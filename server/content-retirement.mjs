import { cleanBeddingContent } from "./bedding-content.mjs";
import retirement from "../src/data/content-retirement.json" with { type: "json" };

// A publication policy, not a destructive migration of the CMS database.
// Original records remain recoverable; both runtime and seed builds use this policy.
export function isRetiredPath(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value, "https://vip2d.ru");
    return ["vip2d.ru", "www.vip2d.ru"].includes(url.hostname) &&
      retirement.paths.includes(decodeURIComponent(url.pathname).replace(/\/+$/, ""));
  } catch {
    return false;
  }
}

export function cleanRetiredReferences(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => {
      if (typeof item === "string") return !isRetiredPath(item) &&
        !isRetiredPath(`/blog/${item}`) && !["ПОДУШКИ", "Подушки", "Покрывала"].includes(item);
      return !item || typeof item !== "object" ||
        ![item.path, item.url, item.href].some(isRetiredPath);
    }).map(cleanRetiredReferences);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cleanRetiredReferences(item)]));
  }
  if (typeof value !== "string") return value;
  let result = value.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi,
    (anchor, href) => isRetiredPath(href) ? "" : anchor);
  for (const [before, after] of Object.entries(retirement.replacements)) {
    result = result.replaceAll(before, after);
  }
  return result;
}

export function cleanPublicContent(content) {
  // Clean public descriptions without changing prices, IDs, stock or stored CMS records.
  const { products, ...chrome } = content;
  return cleanBeddingContent({ ...cleanRetiredReferences(chrome), ...(products ? { products: cleanRetiredReferences(products) } : {}) });
}

export function cleanPublicBlog(blog) {
  const posts = cleanRetiredReferences((blog.posts || []).filter(
    (post) => !isRetiredPath(`/blog/${post.slug}`),
  ));
  return cleanBeddingContent({ ...blog, posts, categories: (blog.categories || []).filter(
    (category) => posts.some((post) => post.category === category.slug),
  ) });
}
