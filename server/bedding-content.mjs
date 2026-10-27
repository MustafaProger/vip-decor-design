import policy from "../src/data/bedding-content.json" with { type: "json" };

// Apply the owner's assortment policy to public content, preserving CMS originals.
export function cleanBeddingContent(value) {
  if (Array.isArray(value)) return value.filter((item) => {
    if (!item || typeof item !== "object") return true;
    return ![item.src, item.originalUrl].some((src) => policy.images.includes(src));
  }).map(cleanBeddingContent);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, cleanBeddingContent(item)]),
  );
  if (typeof value !== "string") return value;
  let result = value;
  for (const [before, after] of Object.entries(policy.replacements)) result = result.replaceAll(before, after);
  return result;
}

// Hide whole off-topic reviews; never rewrite customer quotations or source ratings.
export function cleanBeddingReviews(snapshot) {
  const pattern = new RegExp(policy.reviewPattern, "i");
  const reviews = snapshot.reviews.filter((review) => !pattern.test(
    [review.excerpt, review.fullText].filter(Boolean).join(" "),
  ));
  if (reviews.length === snapshot.reviews.length) return snapshot;
  return { ...snapshot, reviews, publishedReviewCount: reviews.length };
}
