import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchYandexReviews,
  parseYandexReviewsPage,
  YandexReviewsSourceError,
  YANDEX_BUSINESS_ID,
  YANDEX_REVIEWS_URL,
} from "./yandex-reviews-source.mjs";

const photoBase =
  "https://avatars.mds.yandex.net/get-altay/12345/photo_review_1";

function rawReview(index = 1, { photo = false } = {}) {
  const authorId = `public_user_${index}`;
  return {
    reviewId: `source-review-${index}`,
    businessId: YANDEX_BUSINESS_ID,
    author: {
      name: `Клиент ${index}`,
      publicId: authorId,
      avatarUrl: "https://example.com/irrelevant-avatar.jpg",
    },
    updatedTime: `2026-09-${String(index).padStart(2, "0")}T12:30:00.000Z`,
    rating: 5,
    text: `Ткани и пошив для комнаты клиента ${index}. Всё понравилось.`,
    photos: photo
      ? [
          {
            type: "photo",
            businessId: YANDEX_BUSINESS_ID,
            copyright: { publicId: authorId },
            urlTemplate: `${photoBase}/{size}`,
          },
        ]
      : [],
  };
}

function card({ page = 1, count = 3, limit = 2, reviews } = {}) {
  const offset = (page - 1) * limit;
  const entries =
    reviews ||
    Array.from({ length: Math.min(limit, count - offset) }, (_, i) =>
      rawReview(offset + i + 1),
    );
  return {
    id: YANDEX_BUSINESS_ID,
    title: "VIP Decor Design",
    photos: [{ url: "https://example.com/unrelated-business-gallery.jpg" }],
    ratingData: { ratingValue: 5, ratingCount: count + 4, reviewCount: count },
    reviewResults: {
      reviews: entries,
      params: {
        page,
        count,
        limit,
        offset,
        totalPages: Math.max(1, Math.ceil(count / limit)),
        loadedReviewsCount: offset + entries.length,
        reviewsRemained: count - offset - entries.length,
      },
    },
  };
}

function html(value) {
  return `<html><script class="irrelevant">{}</script><script type="application/json" class="state-view">${JSON.stringify({ stack: [{ results: { items: [value] } }] })}</script></html>`;
}

function fetchFixture(cards, calls = []) {
  return async (url, options) => {
    calls.push({ url, options });
    const index = Number(new URL(url).searchParams.get("page") || 1) - 1;
    assert.ok(cards[index], `Unexpected page request: ${index + 1}`);
    return new Response(html(cards[index]), {
      headers: { "Content-Type": "text/html" },
    });
  };
}

function code(expected) {
  return (error) =>
    error instanceof YandexReviewsSourceError && error.code === expected;
}

test("parser accounts for cumulative pagination and normalizes only review attachments", () => {
  const first = card({
    reviews: [rawReview(1, { photo: true }), rawReview(2)],
  });
  const result = parseYandexReviewsPage(html(first));
  assert.equal(result.count, 3);
  assert.equal(result.totalPages, 2);
  assert.equal(result.reviews.length, 2);
  assert.deepEqual(result.reviews[0].photos, [
    { src: `${photoBase}/orig`, sourceUrl: `${photoBase}/orig` },
  ]);
  assert.equal(result.reviews[1].photos.length, 0);
  assert.equal("avatarUrl" in result.reviews[0], false);
  const second = parseYandexReviewsPage(html(card({ page: 2 })), { page: 2 });
  assert.equal(second.reviews.length, 1);
  assert.equal(second.reviews[0].author, "Клиент 3");
});

test("complete collection preserves stable IDs, exact known photo URL variants and business facts", async () => {
  const first = card({
    reviews: [rawReview(1, { photo: true }), rawReview(2)],
  });
  const knownPhoto = {
    src: "/images/reviews/known-work.webp",
    sourceUrl: `${photoBase}/XXXL`,
    width: 900,
    height: 1400,
  };
  const previousSnapshot = {
    businessId: YANDEX_BUSINESS_ID,
    businessExperience: { years: 21, source: "owner" },
    reviews: [
      {
        id: "stable-local-id",
        idType: "local",
        sourceReviewId: "source-review-1",
        author: "Клиент 1",
        date: rawReview(1).updatedTime,
        authorUrl: "https://yandex.com/maps/user/public_user_1",
        excerpt: "Ткани и пошив",
        photos: [knownPhoto],
      },
    ],
  };
  const calls = [];
  const result = await fetchYandexReviews({
    previousSnapshot,
    fetchImpl: fetchFixture([first, card({ page: 2 })], calls),
    now: "2026-09-15T12:00:00Z",
  });
  assert.equal(result.complete, true);
  assert.equal(result.importedCount, 3);
  assert.equal(result.reviewCount, 3);
  assert.equal(result.ratingCount, 7);
  assert.equal(result.photoCount, 1);
  assert.equal(result.reviewsWithPhotos, 1);
  assert.equal(result.reviews[0].id, "stable-local-id");
  assert.equal(result.reviews[0].excerpt, "Ткани и пошив");
  assert.deepEqual(result.reviews[0].photos, [knownPhoto]);
  assert.deepEqual(
    result.businessExperience,
    previousSnapshot.businessExperience,
  );
  assert.deepEqual(
    calls.map(({ url }) => url),
    [YANDEX_REVIEWS_URL, `${YANDEX_REVIEWS_URL}?page=2`],
  );
  assert.ok(calls.every(({ options }) => options.redirect === "manual"));
});

test("new reviews receive source IDs and bounded excerpts without inventing portraits", async () => {
  const item = rawReview(1);
  item.text = Array.from({ length: 35 }, (_, i) => `слово${i + 1}`).join(" ");
  const result = await fetchYandexReviews({
    fetchImpl: fetchFixture([card({ count: 1, reviews: [item] })]),
  });
  assert.equal(result.reviews[0].id, item.reviewId);
  assert.equal(result.reviews[0].excerpt.split(" ").length, 24);
  assert.equal(result.reviews[0].isExcerpt, true);
  assert.match(result.reviews[0].excerpt, /…$/);
  assert.deepEqual(result.reviews[0].photos, []);
  assert.match(result.reviews[0].sourceUrl, /public_user_1/);
});

test("wrong business IDs and mismatched photo authors are rejected", () => {
  const wrongCard = card();
  wrongCard.id = "another-business";
  assert.throws(
    () => parseYandexReviewsPage(html(wrongCard)),
    code("SOURCE_BUSINESS_MISMATCH"),
  );
  const wrongReview = card();
  wrongReview.reviewResults.reviews[0].businessId = "another-business";
  assert.throws(
    () => parseYandexReviewsPage(html(wrongReview)),
    code("SOURCE_BUSINESS_MISMATCH"),
  );
  const item = rawReview(1, { photo: true });
  item.photos[0].copyright.publicId = "different_author";
  assert.throws(
    () => parseYandexReviewsPage(html(card({ count: 1, reviews: [item] }))),
    code("SOURCE_SCHEMA_CHANGED"),
  );
});

test("partial pages, stale counters, invalid stars and duplicate photos are rejected", () => {
  const variants = [];
  const missing = card();
  missing.reviewResults.reviews.pop();
  variants.push([missing, "INCOMPLETE_SNAPSHOT"]);
  const wrongOffset = card();
  wrongOffset.reviewResults.params.offset = 1;
  variants.push([wrongOffset, "INCOMPLETE_SNAPSHOT"]);
  const wrongLoaded = card({ page: 2 });
  wrongLoaded.reviewResults.params.loadedReviewsCount = 1;
  variants.push([wrongLoaded, "INCOMPLETE_SNAPSHOT", 2]);
  const wrongRatingCount = card();
  wrongRatingCount.ratingData.reviewCount = 4;
  variants.push([wrongRatingCount, "INCOMPLETE_SNAPSHOT"]);
  const fractional = card();
  fractional.reviewResults.reviews[0].rating = 4.5;
  variants.push([fractional, "SOURCE_SCHEMA_CHANGED"]);
  const duplicatePhotos = card({
    reviews: [rawReview(1, { photo: true }), rawReview(2)],
  });
  duplicatePhotos.reviewResults.reviews[0].photos.push({
    ...duplicatePhotos.reviewResults.reviews[0].photos[0],
  });
  variants.push([duplicatePhotos, "INCOMPLETE_SNAPSHOT"]);
  for (const [value, expected, page = 1] of variants) {
    assert.throws(
      () => parseYandexReviewsPage(html(value), { page }),
      code(expected),
    );
  }
});

test("cross-page duplicate reviews and changing source totals cannot publish a collection", async () => {
  await assert.rejects(
    fetchYandexReviews({
      fetchImpl: fetchFixture([
        card(),
        card({ page: 2, reviews: [rawReview(1)] }),
      ]),
    }),
    code("INCOMPLETE_SNAPSHOT"),
  );
  await assert.rejects(
    fetchYandexReviews({
      fetchImpl: fetchFixture([card(), card({ page: 2, count: 4 })]),
    }),
    code("INCOMPLETE_SNAPSHOT"),
  );
});

test("photo host allowlist excludes untrusted resources and path tricks", () => {
  for (const urlTemplate of [
    "https://example.com/photo/{size}",
    "http://avatars.mds.yandex.net/get-altay/123/photo/{size}",
    "https://avatars.mds.yandex.net/get-yapic/123/photo/{size}",
    "https://avatars.mds.yandex.net/get-altay/123/photo/{size}?secret=x",
  ]) {
    const item = rawReview(1, { photo: true });
    item.photos[0].urlTemplate = urlTemplate;
    assert.throws(
      () => parseYandexReviewsPage(html(card({ count: 1, reviews: [item] }))),
      code("SOURCE_SCHEMA_CHANGED"),
    );
  }
});

test("captcha, missing state, malformed state and ambiguous state are explicit failures", () => {
  assert.throws(
    () =>
      parseYandexReviewsPage(
        '<div class="smartcaptcha">Are you a robot?</div>',
      ),
    code("SOURCE_BLOCKED"),
  );
  assert.throws(
    () => parseYandexReviewsPage("<html>Unavailable</html>"),
    code("SOURCE_SCHEMA_CHANGED"),
  );
  assert.throws(
    () => parseYandexReviewsPage('<script class="state-view">{bad}</script>'),
    code("SOURCE_SCHEMA_CHANGED"),
  );
  assert.throws(
    () => parseYandexReviewsPage(html(card()) + html(card())),
    code("SOURCE_SCHEMA_CHANGED"),
  );
});

test("HTTP blocks, redirects and configured response/page limits stop collection", async () => {
  for (const [status, expected] of [
    [403, "SOURCE_BLOCKED"],
    [429, "SOURCE_BLOCKED"],
    [302, "SOURCE_REDIRECT_REJECTED"],
    [500, "SOURCE_HTTP_ERROR"],
  ]) {
    await assert.rejects(
      fetchYandexReviews({
        fetchImpl: async () => new Response(null, { status }),
      }),
      code(expected),
    );
  }
  await assert.rejects(
    fetchYandexReviews({
      fetchImpl: async () =>
        new Response("large", { headers: { "Content-Length": "99999999" } }),
    }),
    code("SOURCE_LIMIT_EXCEEDED"),
  );
  const calls = [];
  await assert.rejects(
    fetchYandexReviews({
      maxPages: 1,
      fetchImpl: fetchFixture([card()], calls),
    }),
    code("SOURCE_LIMIT_EXCEEDED"),
  );
  assert.equal(calls.length, 1);
});

test("AbortSignal cancels before request and while the public request is in flight", async () => {
  const cancelled = new AbortController();
  cancelled.abort();
  let calls = 0;
  await assert.rejects(
    fetchYandexReviews({
      signal: cancelled.signal,
      fetchImpl: async () => {
        calls++;
      },
    }),
    code("SOURCE_ABORTED"),
  );
  assert.equal(calls, 0);
  const active = new AbortController();
  const pending = fetchYandexReviews({
    signal: active.signal,
    fetchImpl: async (_url, { signal }) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => resolve(new Response(html(card()))),
          500,
        );
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("Cancelled", "AbortError"));
          },
          { once: true },
        );
      }),
  });
  active.abort();
  await assert.rejects(pending, code("SOURCE_ABORTED"));
});

test("source request timeout aborts the request and exposes a safe error code", async () => {
  await assert.rejects(
    fetchYandexReviews({
      timeoutMs: 5,
      fetchImpl: async (_url, { signal }) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => resolve(new Response(html(card()))),
            500,
          );
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new DOMException("Timeout", "AbortError"));
            },
            { once: true },
          );
        }),
    }),
    code("SOURCE_TIMEOUT"),
  );
});
