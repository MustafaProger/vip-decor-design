import data from "../data/blog.json";
export type ArticleImage = {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
  variants: { src: string; width: number }[];
};
export type ArticleSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  list?: string[];
  callout?: string;
  table?: { headers: string[]; rows: string[][] };
  links?: { href: string; label: string }[];
  citations?: string[];
};
export type Article = {
  slug: string;
  category: string;
  title: string;
  seoTitle: string;
  description: string;
  excerpt: string;
  intro: string;
  image: ArticleImage;
  sections: ArticleSection[];
  sources: { id: string; title: string; url: string; note: string }[];
  related: string[];
  datePublished?: string;
  dateModified?: string;
};
export const posts: Article[] = data.posts;
export const categories = data.categories;
export const postPath = (p: Article) => `/blog/${p.slug}`;
export const categoryPath = (slug: string) => `/blog/category/${slug}`;
export const readingMinutes = (p: Article) =>
  Math.max(
    1,
    Math.ceil(
      [
        p.intro,
        ...p.sections.flatMap((s) => [
          ...(s.paragraphs || []),
          ...(s.list || []),
          ...(s.table?.rows.flat() || []),
        ]),
      ]
        .join(" ")
        .split(/\s+/).length / 180,
    ),
  );
export function blogPage(path: string) {
  const normalized = path.replace(/\/$/, "");
  const post = posts.find((p) => postPath(p) === normalized);
  const category = categories.find((c) => categoryPath(c.slug) === normalized);
  const known = normalized === "/blog" || !!post || !!category;
  return { post, category, known, path: normalized };
}
export function blogMetadata(path: string) {
  const page = blogPage(path);
  return {
    title: `${page.post?.seoTitle || (page.category ? `${page.category.title} — статьи о доме` : page.known ? "Блог об интерьере, дизайне и обустройстве дома" : "Статья не найдена")} — VIP DECOR DESIGN`,
    description:
      page.post?.description ||
      page.category?.description ||
      "Идеи и практические советы для дома: стили интерьера, цвет и фактуры, картины, декор, шторы и домашний текстиль. Блог VIP DECOR DESIGN.",
    canonical: `https://vip2d.ru${page.path}`,
    robots: page.known
      ? "index, follow, max-image-preview:large"
      : "noindex, follow",
    image: `https://vip2d.ru${(page.post || posts[0])?.image.src || "/images/concept-living.webp"}`,
  };
}
export function blogSchema(path: string) {
  const { post, category, known } = blogPage(path);
  if (!known) return [];
  const meta = blogMetadata(path);
  const currentCategory =
    category || categories.find((c) => c.slug === post?.category);
  const crumbs = [
    { name: "Главная", item: "https://vip2d.ru/" },
    { name: "Блог", item: "https://vip2d.ru/blog" },
  ];
  if (currentCategory)
    crumbs.push({
      name: currentCategory.title,
      item: `https://vip2d.ru${categoryPath(currentCategory.slug)}`,
    });
  if (post) crumbs.push({ name: post.title, item: meta.canonical });
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        ...c,
      })),
    },
    post
      ? {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          "@id": `${meta.canonical}#article`,
          url: meta.canonical,
          mainEntityOfPage: { "@type": "WebPage", "@id": meta.canonical },
          headline: post.title,
          description: post.description,
          inLanguage: "ru-RU",
          image: [meta.image],
          articleSection: currentCategory?.title,
          publisher: {
            "@type": "Organization",
            name: "VIP DECOR DESIGN",
            url: "https://vip2d.ru/",
          },
          citation: post.sources.map((s) => s.url),
          ...(post.datePublished ? { datePublished: post.datePublished } : {}),
          ...(post.dateModified ? { dateModified: post.dateModified } : {}),
        }
      : {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: category?.title || "Блог об интерьере и доме",
          url: meta.canonical,
          description: meta.description,
          inLanguage: "ru-RU",
          mainEntity: {
            "@type": "ItemList",
            itemListElement: posts
              .filter((p) => !category || p.category === category.slug)
              .map((p, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: `https://vip2d.ru${postPath(p)}`,
                name: p.title,
              })),
          },
        },
  ];
}
