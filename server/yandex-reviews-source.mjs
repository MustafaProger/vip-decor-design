import { createHash } from "node:crypto";

export const YANDEX_BUSINESS_ID = "223039913433";
export const YANDEX_REVIEWS_URL =
  "https://yandex.com/maps/org/vip_decor_design/223039913433/reviews/";
const PUBLIC_SOURCE_URL =
  "https://yandex.ru/maps/org/vip_decor_design/223039913433/reviews/";
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_PAGES = 20;
const MAX_REVIEWS = 10_000;

export class YandexReviewsSourceError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "YandexReviewsSourceError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new YandexReviewsSourceError(code, message);
}

function integer(value, name, min = 0, max = MAX_REVIEWS) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail("SOURCE_SCHEMA_CHANGED", `Invalid source ${name}.`);
  }
  return value;
}

function text(value, name, maxLength = 50_000) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    fail("SOURCE_SCHEMA_CHANGED", `Invalid source ${name}.`);
  }
  return value.trim();
}

function normalizeText(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function publicId(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(value)) {
    fail("SOURCE_SCHEMA_CHANGED", "Invalid author public identifier.");
  }
  return value;
}

function profileId(review) {
  if (!review?.authorUrl) return null;
  const match =
    /^https:\/\/yandex\.(?:com|ru)\/maps\/user\/([a-zA-Z0-9_-]{8,128})\/?$/.exec(
      review.authorUrl,
    );
  return match?.[1] ?? null;
}

function attachmentUrl(value, template = false) {
  if (typeof value !== "string")
    fail("SOURCE_SCHEMA_CHANGED", "Missing attachment URL.");
  const input = template ? value.replace("{size}", "orig") : value;
  let url;
  try {
    url = new URL(input);
  } catch {
    fail("SOURCE_SCHEMA_CHANGED", "Invalid attachment URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "avatars.mds.yandex.net" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/get-altay\/\d+\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(url.pathname)
  ) {
    fail("SOURCE_SCHEMA_CHANGED", "Untrusted or non-review attachment URL.");
  }
  return url.href;
}

function attachmentIdentity(value) {
  try {
    return new URL(attachmentUrl(value)).pathname
      .split("/")
      .slice(0, 4)
      .join("/");
  } catch {
    return null;
  }
}

function date(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    fail("SOURCE_SCHEMA_CHANGED", "Invalid review date.");
  }
  return new Date(value).toISOString();
}

function reviewKey(review) {
  return `${profileId(review) ?? normalizeText(review.author)}\u0000${review.date}`;
}

/** Parses the public, server-rendered JSON; no private API or browser state is used. */
export function parseYandexReviewsPage(html, { page = 1 } = {}) {
  integer(page, "requested page", 1, MAX_PAGES);
  if (
    typeof html !== "string" ||
    Buffer.byteLength(html) > MAX_RESPONSE_BYTES
  ) {
    fail("SOURCE_LIMIT_EXCEEDED", "Source page exceeds the response limit.");
  }
  let state;
  for (const match of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,
  )) {
    if (!/\bclass\s*=\s*["'][^"']*\bstate-view\b[^"']*["']/i.test(match[1]))
      continue;
    if (state) fail("SOURCE_SCHEMA_CHANGED", "Ambiguous source state.");
    try {
      state = JSON.parse(match[2]);
    } catch {
      fail("SOURCE_SCHEMA_CHANGED", "Source state is not valid JSON.");
    }
  }
  if (!state) {
    const blocked =
      /(?:showcaptcha|smartcaptcha|captcha-container|"limited"|"captcha"|access denied|are you a robot)/i.test(
        html,
      );
    fail(
      blocked ? "SOURCE_BLOCKED" : "SOURCE_SCHEMA_CHANGED",
      blocked
        ? "Yandex restricted the public source request."
        : "Complete source state is unavailable.",
    );
  }
  const cards = (Array.isArray(state.stack) ? state.stack : [])
    .flatMap((frame) =>
      Array.isArray(frame?.results?.items) ? frame.results.items : [],
    )
    .filter((card) => card?.reviewResults);
  const candidates = cards.filter(
    (card) =>
      String(card.id) === YANDEX_BUSINESS_ID &&
      card.reviewResults?.params?.page === page,
  );
  if (!candidates.length) {
    fail(
      cards.some((card) => String(card.id) !== YANDEX_BUSINESS_ID)
        ? "SOURCE_BUSINESS_MISMATCH"
        : "INCOMPLETE_SNAPSHOT",
      "The requested business review page is unavailable.",
    );
  }
  if (candidates.length !== 1)
    fail("SOURCE_SCHEMA_CHANGED", "Ambiguous business review page.");
  const card = candidates[0];
  const { reviews, params } = card.reviewResults;
  if (!Array.isArray(reviews) || !params || !card.ratingData)
    fail("SOURCE_SCHEMA_CHANGED", "Missing review page data.");
  const count = integer(params.count, "review count");
  const limit = integer(params.limit, "page size", 1, 1000);
  const offset = integer(params.offset, "page offset");
  const totalPages = integer(params.totalPages, "total pages", 1, MAX_PAGES);
  const expectedLength = Math.min(limit, Math.max(0, count - offset));
  // loadedReviewsCount is cumulative: page two of the initial snapshot reports 71, not 21.
  if (
    offset !== (page - 1) * limit ||
    totalPages !== Math.max(1, Math.ceil(count / limit)) ||
    reviews.length !== expectedLength ||
    params.loadedReviewsCount !== offset + reviews.length ||
    params.reviewsRemained !== count - offset - reviews.length ||
    page > totalPages
  ) {
    fail(
      "INCOMPLETE_SNAPSHOT",
      "Source pagination does not account for every review.",
    );
  }
  const ratingCount = integer(card.ratingData.ratingCount, "rating count");
  const reviewCount = integer(
    card.ratingData.reviewCount,
    "aggregate review count",
  );
  const rating = card.ratingData.ratingValue;
  if (
    reviewCount !== count ||
    ratingCount < reviewCount ||
    typeof rating !== "number" ||
    !Number.isFinite(rating) ||
    rating < (ratingCount === 0 ? 0 : 1) ||
    rating > 5
  ) {
    fail("INCOMPLETE_SNAPSHOT", "Source rating totals are inconsistent.");
  }
  const normalizedReviews = reviews.map((raw) => {
    if (String(raw?.businessId) !== YANDEX_BUSINESS_ID)
      fail("SOURCE_BUSINESS_MISMATCH", "A review belongs to another business.");
    const author = text(raw.author?.name, "author", 250);
    const authorId = publicId(raw.author?.publicId);
    const published = date(raw.updatedTime);
    const rating = raw.rating;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      fail("SOURCE_SCHEMA_CHANGED", "Invalid review rating.");
    if (!Array.isArray(raw.photos))
      fail("SOURCE_SCHEMA_CHANGED", "Review attachments are unavailable.");
    const photos = raw.photos.map((photo) => {
      if (
        photo?.type !== "photo" ||
        String(photo.businessId) !== YANDEX_BUSINESS_ID
      )
        fail("SOURCE_SCHEMA_CHANGED", "Invalid review attachment.");
      const copyrightId = publicId(photo.copyright?.publicId);
      if (authorId && copyrightId && authorId !== copyrightId)
        fail(
          "SOURCE_SCHEMA_CHANGED",
          "Attachment author does not match the review.",
        );
      const sourceUrl = attachmentUrl(photo.urlTemplate, true);
      return { src: sourceUrl, sourceUrl };
    });
    if (
      new Set(photos.map((photo) => attachmentIdentity(photo.sourceUrl)))
        .size !== photos.length
    )
      fail("INCOMPLETE_SNAPSHOT", "Duplicate attachment within a review.");
    const sourceReviewId = raw.reviewId
      ? text(raw.reviewId, "review identifier", 250)
      : null;
    return {
      sourceReviewId,
      author,
      publicId: authorId,
      date: published,
      rating,
      text: text(raw.text, "review text"),
      photos,
    };
  });
  return {
    page,
    limit,
    count,
    totalPages,
    rating,
    ratingCount,
    reviewCount,
    businessName: text(card.title, "business title", 250),
    reviews: normalizedReviews,
  };
}

async function readResponse(response, maximum, controller) {
  const declared = Number(response.headers?.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) {
    controller.abort();
    fail("SOURCE_LIMIT_EXCEEDED", "Source response is too large.");
  }
  if (!response.body?.getReader)
    fail("NETWORK_ERROR", "Source returned no readable response body.");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        controller.abort();
        fail("SOURCE_LIMIT_EXCEEDED", "Source response is too large.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* The response may already be aborted. */
    }
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchPage(
  page,
  { fetchImpl, timeoutMs, maxResponseBytes, signal },
) {
  if (signal?.aborted) fail("SOURCE_ABORTED", "Source refresh was cancelled.");
  const url =
    page === 1 ? YANDEX_REVIEWS_URL : `${YANDEX_REVIEWS_URL}?page=${page}`;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  timer.unref?.();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { Accept: "text/html", "Accept-Language": "ru-RU,ru;q=0.9" },
    });
    if (response.status >= 300 && response.status < 400)
      fail("SOURCE_REDIRECT_REJECTED", "Source redirects are not followed.");
    if ([401, 403, 429].includes(response.status))
      fail("SOURCE_BLOCKED", "Yandex restricted the public source request.");
    if (!response.ok)
      fail(
        "SOURCE_HTTP_ERROR",
        "The public source returned an unsuccessful response.",
      );
    if (response.url && response.url !== url)
      fail("SOURCE_REDIRECT_REJECTED", "The source response URL changed.");
    const html = await readResponse(response, maxResponseBytes, controller);
    if (timedOut)
      fail("SOURCE_TIMEOUT", "The public source request timed out.");
    if (signal?.aborted)
      fail("SOURCE_ABORTED", "Source refresh was cancelled.");
    return parseYandexReviewsPage(html, { page });
  } catch (error) {
    if (error instanceof YandexReviewsSourceError) throw error;
    if (timedOut)
      fail("SOURCE_TIMEOUT", "The public source request timed out.");
    if (signal?.aborted)
      fail("SOURCE_ABORTED", "Source refresh was cancelled.");
    throw new YandexReviewsSourceError(
      "NETWORK_ERROR",
      "The public source could not be fetched.",
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

function createExcerpt(fullText, previous) {
  const normalized = normalizeText(fullText);
  if (
    previous?.excerpt &&
    normalizeText(previous.excerpt).split(" ").length <= 24
  ) {
    const quoted = normalizeText(previous.excerpt).replace(/…$/, "");
    if (quoted && normalized.includes(quoted))
      return {
        excerpt: previous.excerpt,
        isExcerpt: normalized !== normalizeText(previous.excerpt),
      };
  }
  const words = normalized.split(" ");
  return {
    excerpt: words.slice(0, 24).join(" ") + (words.length > 24 ? "…" : ""),
    isExcerpt: words.length > 24,
  };
}

/** Fetches one complete collection. Scheduling, media downloads and atomic publication are external. */
export async function fetchYandexReviews({
  previousSnapshot,
  fetchImpl = globalThis.fetch,
  now = new Date(),
  timeoutMs = 15_000,
  maxPages = 10,
  maxResponseBytes = 4 * 1024 * 1024,
  signal,
} = {}) {
  if (typeof fetchImpl !== "function")
    throw new TypeError("fetchImpl must be a function.");
  integer(timeoutMs, "request timeout", 1, 60_000);
  integer(maxPages, "maximum pages", 1, MAX_PAGES);
  integer(maxResponseBytes, "response byte limit", 1, MAX_RESPONSE_BYTES);
  const checkedAt = new Date(now);
  if (!Number.isFinite(checkedAt.getTime()))
    throw new TypeError("now must be a valid date.");
  if (
    previousSnapshot &&
    String(previousSnapshot.businessId) !== YANDEX_BUSINESS_ID
  )
    fail(
      "SOURCE_BUSINESS_MISMATCH",
      "Previous snapshot belongs to another business.",
    );
  const options = { fetchImpl, timeoutMs, maxResponseBytes, signal };
  const first = await fetchPage(1, options);
  if (first.totalPages > maxPages)
    fail(
      "SOURCE_LIMIT_EXCEEDED",
      "Review collection exceeds the configured page limit.",
    );
  const pages = [first];
  for (let page = 2; page <= first.totalPages; page++) {
    const next = await fetchPage(page, options);
    if (
      [
        "count",
        "totalPages",
        "limit",
        "rating",
        "ratingCount",
        "reviewCount",
      ].some((key) => next[key] !== first[key])
    ) {
      fail("INCOMPLETE_SNAPSHOT", "Source totals changed during collection.");
    }
    pages.push(next);
  }
  const previousReviews = Array.isArray(previousSnapshot?.reviews)
    ? previousSnapshot.reviews
    : [];
  const previousIds = new Map(
    previousReviews.flatMap((review) => [
      [review.id, review],
      ...(review.sourceReviewId ? [[review.sourceReviewId, review]] : []),
    ]),
  );
  const previousKeys = new Map(
    previousReviews.map((review) => [reviewKey(review), review]),
  );
  const ids = new Set();
  const identities = new Set();
  const sourceIds = new Set();
  const reviews = pages.flatMap((page) =>
    page.reviews.map((raw) => {
      const authorUrl = raw.publicId
        ? `https://yandex.com/maps/user/${raw.publicId}`
        : undefined;
      const key = reviewKey({ author: raw.author, date: raw.date, authorUrl });
      const old = previousIds.get(raw.sourceReviewId) ?? previousKeys.get(key);
      const id =
        old?.id ??
        raw.sourceReviewId ??
        `local-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`;
      if (
        ids.has(id) ||
        identities.has(key) ||
        (raw.sourceReviewId && sourceIds.has(raw.sourceReviewId))
      )
        fail("INCOMPLETE_SNAPSHOT", "Review pages contain duplicates.");
      ids.add(id);
      identities.add(key);
      if (raw.sourceReviewId) sourceIds.add(raw.sourceReviewId);
      const photos = raw.photos.map((photo) => {
        const known = old?.photos?.find(
          (previous) =>
            attachmentIdentity(previous.sourceUrl) ===
            attachmentIdentity(photo.sourceUrl),
        );
        // Keep a known working size variant (including XXXL when orig is damaged).
        return known ? { ...known } : photo;
      });
      return {
        id,
        idType: old?.idType ?? (raw.sourceReviewId ? "yandex" : "local"),
        ...(raw.sourceReviewId ? { sourceReviewId: raw.sourceReviewId } : {}),
        author: raw.author,
        date: raw.date,
        rating: raw.rating,
        ...(authorUrl ? { authorUrl } : {}),
        sourceUrl: raw.publicId
          ? `https://yandex.com/maps/org/${YANDEX_BUSINESS_ID}/reviews?reviews%5BpublicId%5D=${encodeURIComponent(raw.publicId)}&utm_source=review`
          : page.page === 1
            ? PUBLIC_SOURCE_URL
            : `${YANDEX_REVIEWS_URL}?page=${page.page}`,
        ...createExcerpt(raw.text, old),
        photos,
      };
    }),
  );
  if (reviews.length !== first.count)
    fail("INCOMPLETE_SNAPSHOT", "Not all source reviews were collected.");
  return {
    businessId: YANDEX_BUSINESS_ID,
    businessName: first.businessName,
    sourceUrl: PUBLIC_SOURCE_URL,
    widgetUrl: `https://yandex.ru/maps-reviews-widget/${YANDEX_BUSINESS_ID}?comments`,
    checkedAt: checkedAt.toISOString().slice(0, 10),
    rating: first.rating,
    ratingCount: first.ratingCount,
    reviewCount: first.reviewCount,
    importedCount: reviews.length,
    complete: true,
    coverageNote: `Все ${reviews.length} отзывов из ${pages.length} публичных страниц Яндекс Карт. На сайте приведены краткие выдержки; полные тексты доступны в источнике.`,
    reviews,
    ...(previousSnapshot?.businessExperience
      ? { businessExperience: { ...previousSnapshot.businessExperience } }
      : {}),
    photosCheckedAt: checkedAt.toISOString().slice(0, 10),
    photoCount: reviews.reduce(
      (total, review) => total + review.photos.length,
      0,
    ),
    reviewsWithPhotos: reviews.filter((review) => review.photos.length > 0)
      .length,
    photoCoverageNote:
      "Фотографии работ взяты только из вложений соответствующих отзывов. Фотографии профилей и общая галерея организации не используются.",
  };
}
