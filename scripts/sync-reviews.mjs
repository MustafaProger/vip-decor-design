import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createReviewService } from "../server/reviews.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDirectory = resolve(
  process.env.INQUIRY_DATA_DIR || resolve(root, "data/runtime"),
);
const service = await createReviewService({
  dataDirectory: resolve(runtimeDirectory, "reviews"),
  seedPath: resolve(root, "src/data/yandex-reviews.json"),
  mediaDirectory: resolve(runtimeDirectory, "reviews/media"),
});
const result = process.argv.includes("--status")
  ? { refresh: await service.getStatus() }
  : await service.refreshIfDue();
console.log(
  JSON.stringify(
    {
      status: result.status,
      reviews: result.snapshot?.reviews?.length,
      photos: result.snapshot?.reviews?.reduce(
        (count, review) => count + (review.photos?.length || 0),
        0,
      ),
      refresh: result.refresh,
    },
    null,
    2,
  ),
);
if (result.status === "failed") process.exitCode = 1;
