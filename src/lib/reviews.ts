import { useEffect, useState } from "react";
import reviewSeed from "../data/yandex-reviews.json";

export type ReviewPhoto = {
  src: string;
  sourceUrl: string;
  width?: number;
  height?: number;
};
export type Review = {
  id: string;
  author: string;
  date: string;
  rating: number;
  sourceUrl: string;
  excerpt: string;
  isExcerpt: boolean;
  fullText?: string;
  photos: ReviewPhoto[];
};
export type ReviewData = {
  sourceUrl: string;
  checkedAt: string;
  rating: number;
  ratingCount: number;
  reviewCount: number;
  reviews: Review[];
  businessExperience: { years: number; isMinimum: boolean; sourceUrl: string };
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function sourceUrl(value: unknown): value is string {
  if (!text(value)) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
function imageUrl(value: unknown): value is string {
  return (
    text(value) &&
    (/^\/images\/reviews\/[a-zA-Z0-9_-]+\.webp$/.test(value) ||
      /^\/api\/review-media\/[a-f0-9]{64}\.webp$/i.test(value) ||
      sourceUrl(value))
  );
}
function count(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}
function rating(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 5
  );
}
function parsePhoto(value: unknown): ReviewPhoto | null {
  if (!record(value) || !imageUrl(value.src) || !sourceUrl(value.sourceUrl))
    return null;
  return {
    src: value.src,
    sourceUrl: value.sourceUrl,
    ...(count(value.width) && value.width > 0 ? { width: value.width } : {}),
    ...(count(value.height) && value.height > 0
      ? { height: value.height }
      : {}),
  };
}
function parseReview(value: unknown): Review | null {
  if (
    !record(value) ||
    !text(value.id) ||
    !text(value.author) ||
    !text(value.date) ||
    !Number.isFinite(Date.parse(value.date)) ||
    !rating(value.rating) ||
    !sourceUrl(value.sourceUrl) ||
    !text(value.excerpt)
  )
    return null;
  return {
    id: value.id,
    author: value.author,
    date: value.date,
    rating: value.rating,
    sourceUrl: value.sourceUrl,
    excerpt: value.excerpt,
    isExcerpt: typeof value.isExcerpt === "boolean" ? value.isExcerpt : true,
    ...(text(value.fullText) ? { fullText: value.fullText } : {}),
    photos: Array.isArray(value.photos)
      ? value.photos
          .map(parsePhoto)
          .filter((photo): photo is ReviewPhoto => photo !== null)
      : [],
  };
}
export function parseReviewData(value: unknown): ReviewData | null {
  if (
    !record(value) ||
    !Array.isArray(value.reviews) ||
    !sourceUrl(value.sourceUrl) ||
    !text(value.checkedAt) ||
    !rating(value.rating) ||
    !count(value.ratingCount) ||
    !count(value.reviewCount)
  )
    return null;
  const experience = value.businessExperience;
  if (
    !record(experience) ||
    !count(experience.years) ||
    typeof experience.isMinimum !== "boolean" ||
    !sourceUrl(experience.sourceUrl)
  )
    return null;
  const reviews = value.reviews.map(parseReview);
  if (
    reviews.some((review) => review === null) ||
    (!reviews.length && value.reviewCount > 0)
  )
    return null;
  const validReviews = reviews as Review[];
  if (validReviews.length !== value.reviewCount) return null;
  if (
    new Set(validReviews.map((review) => review.id)).size !==
    validReviews.length
  )
    return null;
  return {
    sourceUrl: value.sourceUrl,
    checkedAt: value.checkedAt,
    rating: value.rating,
    ratingCount: value.ratingCount,
    reviewCount: value.reviewCount,
    reviews: validReviews,
    businessExperience: {
      years: experience.years,
      isMinimum: experience.isMinimum,
      sourceUrl: experience.sourceUrl,
    },
  };
}

export function sortReviewsPhotosFirst(reviews: Review[]): Review[] {
  return reviews
    .map((review, index) => ({ review, index }))
    .sort(
      (a, b) =>
        Number(b.review.photos.length > 0) -
          Number(a.review.photos.length > 0) || a.index - b.index,
    )
    .map(({ review }) => review);
}

let cachedData: ReviewData = reviewSeed;

export function useReviewsData(): ReviewData {
  const [data, setData] = useState<ReviewData>(() => cachedData);
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/api/reviews", {
          signal: controller.signal,
          cache: "no-cache",
        });
        if (!response.ok) return;
        const nextData = parseReviewData(await response.json());
        if (!nextData || controller.signal.aborted) return;
        cachedData = nextData;
        setData(nextData);
      } catch {
        // Keep the last valid response or the bundled snapshot available offline.
      }
    }
    void refresh();
    return () => controller.abort();
  }, []);
  return data;
}
