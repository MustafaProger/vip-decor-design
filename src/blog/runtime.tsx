import { createContext, useContext } from "react";
import { seedBlog, type BlogData } from "./content";

// Each SSR request owns its snapshot. No shared mutable content between requests.
export const BlogContext = createContext<BlogData>(seedBlog);
export const useBlogData = () => useContext(BlogContext);

export function readBlogBootstrap(): BlogData | undefined {
  if (typeof document === "undefined") return undefined;
  const element = document.getElementById("blog-bootstrap");
  if (!element) return undefined;
  try {
    const value = JSON.parse(element.textContent || "");
    if (Array.isArray(value.posts) && Array.isArray(value.categories))
      return value;
  } catch {
    /* The API fetch can recover an invalid bootstrap. */
  }
  return undefined;
}
