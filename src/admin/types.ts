import type { Article, ArticleSection } from "../blog/content";
import type { Category, Product } from "../lib/content";

export type PublicationStatus = "draft" | "published";
export type CMSProduct = Product & {
  status: PublicationStatus;
  version: number;
  [key: string]: unknown;
};
export type CMSPost = Article & {
  id: string;
  status: PublicationStatus;
  version: number;
  [key: string]: unknown;
};
export type CMSSection = ArticleSection;
export type CMSContent = {
  products: CMSProduct[];
  posts: CMSPost[];
  categories: Category[];
  blogCategories: { slug: string; title: string; description?: string }[];
};
export type InquiryStatus = "new" | "in_progress" | "completed" | "spam";
export type CMSInquiry = {
  id: string;
  status: InquiryStatus;
  version: number;
  note?: string;
  createdAt?: string;
  receivedAt?: string;
  name?: string;
  phone?: string;
  email?: string;
  comment?: string;
  context?: string;
  selection?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};
export type Session = {
  authenticated: boolean;
  setupRequired: boolean;
  username?: string;
  csrfToken?: string;
};
export type MediaResult = { url: string; width: number; height: number };
export const inquiryLabels: Record<InquiryStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  completed: "Завершена",
  spam: "Спам",
};
export const publicationLabels: Record<PublicationStatus, string> = {
  draft: "Черновик",
  published: "Опубликовано",
};
export const formatDate = (value?: string) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
export const titleSlug = (value: string) => {
  const letters: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya",
  };
  return [...value.toLowerCase()]
    .map((char) => letters[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};
