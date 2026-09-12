export type SourceImage = { src: string; alt: string; originalUrl?: string };
export type SourcePage = {
  path: string;
  url: string;
  title: string;
  description: string;
  heading: string;
  paragraphs: string[];
  images: SourceImage[];
  links: { href: string; text: string }[];
  html?: string;
  blocks?: {
    id: string;
    type: string;
    heading: string;
    paragraphs: string[];
    html: string;
  }[];
  status?: number;
};
export type Edition = {
  uid?: string;
  sku?: string;
  price?: string | number;
  quantity?: string | number;
  img?: string;
  [key: string]: unknown;
};
export type Product = {
  id: string;
  title: string;
  description: string;
  price: number | null;
  priceText?: string;
  oldPrice?: string;
  sku?: string;
  image: string;
  images: string[];
  url: string;
  category: string;
  categoryPath?: string;
  categoryPaths?: string[];
  shortDescription?: string;
  descriptionHtml?: string;
  properties?: { name: string; value: string }[];
  variants?: {
    editions?: Edition[];
    properties?: unknown[];
    options?: unknown[];
    rawPrice?: unknown;
  };
};
export type Category = {
  title: string;
  path: string;
  image: string;
  description: string;
  count?: number;
  sourceHasCatalog?: boolean;
};
export type SiteContent = {
  crawledAt: string;
  pages: SourcePage[];
  products: Product[];
  categories: Category[];
  contacts: {
    phones: string[];
    email: string;
    address: string;
    socials: { title: string; url: string }[];
  };
  gallery: { src: string; alt: string; sourcePath: string }[];
};
export const money = (n: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₽";
export const plain = (html: string) => {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent?.trim() || "";
};
export function localHref(href: string) {
  try {
    const url = new URL(href, "https://vip2d.ru");
    if (["vip2d.ru", "www.vip2d.ru"].includes(url.hostname))
      return url.pathname + url.search + url.hash;
  } catch {
    /* preserve original public links */
  }
  return href;
}
export const productHref = (p: Product) =>
  "/product/" + encodeURIComponent(p.id);
export const normalizePath = (path: string) => path.replace(/\/$/, "") || "/";
