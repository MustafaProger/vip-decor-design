import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import App from "../App";
import {
  blogMetadata,
  blogPage,
  blogSchema,
  seedBlog,
  type BlogData,
} from "./content";
const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function renderBlogDocument(
  url: string,
  template: string,
  blog: BlogData = seedBlog,
) {
  const path = new URL(url, "https://vip2d.ru").pathname;
  const metadata = blogMetadata(path, blog);
  const root = renderToString(
    <StaticRouter location={url}>
      <App initialBlog={blog} />
    </StaticRouter>,
  );
  const head =
    `<title>${escape(metadata.title)}</title>\n<meta name="description" content="${escape(metadata.description)}"/>\n<meta name="robots" content="${metadata.robots}"/>\n<link rel="canonical" href="${escape(metadata.canonical)}"/>\n` +
    Object.entries({
      "og:title": metadata.title,
      "og:description": metadata.description,
      "og:url": metadata.canonical,
      "og:image": metadata.image,
      "og:type": blogPage(path, blog).post ? "article" : "website",
      "og:locale": "ru_RU",
    })
      .map(
        ([property, content]) =>
          `<meta data-blog-meta property="${property}" content="${escape(content)}"/>`,
      )
      .join("\n") +
    `<script data-blog-meta type="application/ld+json">${JSON.stringify(blogSchema(path, blog)).replaceAll("<", "\\u003c")}</script>`;
  return template
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<meta\s+name="description"[\s\S]*?\/>/, "")
    .replace("</head>", () => `${head}\n</head>`)
    .replace(
      '<div id="root"></div>',
      () =>
        `<div id="root">${root}</div><script id="blog-bootstrap" type="application/json">${JSON.stringify(blog).replaceAll("<", "\\u003c")}</script>`,
    );
}
