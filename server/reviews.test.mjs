import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReviewService } from "./reviews.mjs";

const DAY = 24 * 60 * 60 * 1000;
const photoUrl =
  "https://avatars.mds.yandex.net/get-altay/1234/photo_test/orig";
const tinyPNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC",
  "base64",
);

function snapshot(count = 1) {
  return {
    businessId: "223039913433",
    businessName: "VIP Decor Design",
    sourceUrl:
      "https://yandex.ru/maps/org/vip_decor_design/223039913433/reviews/",
    widgetUrl: "https://yandex.ru/maps-reviews-widget/223039913433?comments",
    checkedAt: "2026-09-15",
    rating: 5,
    ratingCount: count,
    reviewCount: count,
    importedCount: count,
    complete: true,
    coverageNote: "Test fixture",
    reviews: Array.from({ length: count }, (_, i) => ({
      id: `review-${i}`,
      author: `Клиент ${i}`,
      date: "2026-09-01T10:00:00.000Z",
      rating: 5,
      excerpt: `Отзыв ${i}`,
      isExcerpt: true,
      photos: [],
    })),
  };
}

async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), "vip-reviews-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const seedPath = join(directory, "seed.json");
  await writeFile(seedPath, JSON.stringify(snapshot()));
  let time = Date.parse("2026-09-15T12:00:00Z");
  const options = {
    dataDirectory: join(directory, "cache"),
    seedPath,
    now: () => time,
    ...overrides,
  };
  return {
    options,
    directory,
    service: await createReviewService(options),
    advance: (amount) => {
      time += amount;
    },
  };
}

test("page reads use the seed/cache without making source requests", async (t) => {
  let calls = 0;
  const { service } = await fixture(t, {
    fetchReviews: async () => {
      calls++;
      return snapshot();
    },
  });
  const first = await service.getSnapshot();
  first.reviews[0].author = "Changed by consumer";
  assert.equal((await service.readSnapshot()).reviews[0].author, "Клиент 0");
  assert.equal(calls, 0);
  assert.equal((await service.getStatus()).status, "seed");
});

test("daily cooldown survives restart and one refresh becomes due after 24 hours", async (t) => {
  let calls = 0;
  const { service, options, advance } = await fixture(t, {
    fetchReviews: async () => {
      calls++;
      return snapshot(2);
    },
  });
  assert.equal((await service.refreshIfDue()).status, "updated");
  assert.equal((await service.refreshIfDue()).status, "fresh");
  const restarted = await createReviewService(options);
  assert.equal((await restarted.refreshIfDue()).status, "fresh");
  assert.equal((await restarted.getSnapshot()).importedCount, 2);
  advance(DAY - 1);
  assert.equal((await restarted.refreshIfDue()).status, "fresh");
  advance(1);
  assert.equal((await restarted.refreshIfDue()).status, "updated");
  assert.equal(calls, 2);
});

test("single-flight callers share one source batch and a second service respects the lock", async (t) => {
  let calls = 0;
  let release;
  let entered;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const { service, options } = await fixture(t, {
    fetchReviews: async () => {
      calls++;
      entered();
      await gate;
      return snapshot(2);
    },
  });
  const one = service.refreshIfDue();
  const two = service.refreshIfDue();
  assert.equal(one, two);
  await started;
  const secondProcess = await createReviewService(options);
  assert.equal((await secondProcess.refreshIfDue()).status, "locked");
  assert.equal((await secondProcess.getSnapshot()).importedCount, 1);
  release();
  assert.equal((await one).status, "updated");
  assert.equal((await two).snapshot.importedCount, 2);
  assert.equal((await secondProcess.refreshIfDue()).status, "fresh");
  assert.equal(calls, 1);
});

test("failed source attempts retain last good data and do not retry on visits or restart", async (t) => {
  let calls = 0;
  const { service, options, advance } = await fixture(t, {
    fetchReviews: async () => {
      calls++;
      if (calls === 1) return snapshot(2);
      throw new Error(
        "Network detail containing credentials must never be persisted",
      );
    },
  });
  await service.refreshIfDue();
  const good = await service.getSnapshot();
  advance(DAY);
  const failed = await service.refreshIfDue();
  assert.equal(failed.status, "failed");
  assert.equal(failed.refresh.errorCode, "REFRESH_FAILED");
  assert.equal(failed.refresh.lastSuccessAt, good.refreshedAt);
  assert.deepEqual(failed.snapshot, good);
  const restarted = await createReviewService(options);
  assert.equal((await restarted.refreshIfDue()).status, "fresh");
  assert.equal(calls, 2);
  assert.doesNotMatch(
    await readFile(join(options.dataDirectory, "status.json"), "utf8"),
    /credentials|Network detail/,
  );
});

test("partial, duplicate, and mismatched source snapshots cannot replace the complete cache", async (t) => {
  const variants = [
    { ...snapshot(2), complete: false },
    { ...snapshot(2), importedCount: 1 },
    { ...snapshot(2), reviewCount: 3 },
    { ...snapshot(2), businessId: "wrong-business" },
    { ...snapshot(2), reviews: [snapshot().reviews[0], snapshot().reviews[0]] },
  ];
  let current;
  const { service } = await fixture(t, { fetchReviews: async () => current });
  const good = await service.getSnapshot();
  for (current of variants) {
    assert.equal(
      (await service.refreshIfDue({ force: true })).status,
      "failed",
    );
    assert.deepEqual(await service.getSnapshot(), good);
  }
});

test("new photos become optimized local WebP before publishing and exact sources are reused", async (t) => {
  let downloads = 0;
  const next = snapshot(2);
  next.reviews[0].photos = [{ src: photoUrl, sourceUrl: photoUrl }];
  const { service } = await fixture(t, {
    fetchReviews: async () => structuredClone(next),
    fetchImpl: async (url, options) => {
      assert.equal(url, photoUrl);
      assert.equal(options.redirect, "error");
      downloads++;
      return new Response(tinyPNG, {
        headers: { "Content-Type": "image/png" },
      });
    },
  });
  const first = await service.refreshIfDue();
  assert.equal(first.status, "updated");
  const photo = first.snapshot.reviews[0].photos[0];
  assert.match(photo.src, /^\/api\/review-media\/[a-f0-9]{64}\.webp$/);
  assert.equal(photo.sourceUrl, photoUrl);
  assert.equal(photo.width, 1);
  assert.equal(photo.height, 1);
  const bytes = await readFile(
    join(service.mediaDirectory, photo.src.split("/").at(-1)),
  );
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  assert.equal((await service.refreshIfDue({ force: true })).status, "updated");
  assert.equal(downloads, 1);
});

test("a failed photo download prevents a partial snapshot from replacing the cache", async (t) => {
  const next = snapshot(2);
  next.reviews[0].photos = [{ src: photoUrl, sourceUrl: photoUrl }];
  const { service } = await fixture(t, {
    fetchReviews: async () => next,
    fetchImpl: async () => new Response("blocked", { status: 403 }),
  });
  const good = await service.getSnapshot();
  const result = await service.refreshIfDue();
  assert.equal(result.status, "failed");
  assert.equal(result.refresh.errorCode, "PHOTO_DOWNLOAD_FAILED");
  assert.deepEqual(await service.getSnapshot(), good);
});

test("photo allowlist rejects outside hosts and oversized responses without publishing", async (t) => {
  let source = "https://example.com/private.jpg";
  let downloads = 0;
  const { service } = await fixture(t, {
    fetchReviews: async () => {
      const next = snapshot(2);
      next.reviews[0].photos = [{ src: source, sourceUrl: source }];
      return next;
    },
    fetchImpl: async () => {
      downloads++;
      return new Response(tinyPNG, {
        headers: { "Content-Type": "image/png", "Content-Length": "99999999" },
      });
    },
  });
  assert.equal(
    (await service.refreshIfDue()).refresh.errorCode,
    "INVALID_PHOTO",
  );
  assert.equal(downloads, 0);
  source = photoUrl;
  assert.equal(
    (await service.refreshIfDue({ force: true })).refresh.errorCode,
    "PHOTO_TOO_LARGE",
  );
  assert.equal(downloads, 1);
  assert.equal((await service.getSnapshot()).importedCount, 1);
});

test("an expired lock from a stopped process is recovered", async (t) => {
  const { service, options } = await fixture(t, {
    fetchReviews: async () => snapshot(2),
  });
  await writeFile(
    join(options.dataDirectory, "refresh.lock"),
    JSON.stringify({
      token: "abandoned",
      pid: 99999999,
      startedAt: Date.parse("2026-09-14T10:00:00Z"),
    }),
  );
  assert.equal((await service.refreshIfDue()).status, "updated");
  await assert.rejects(readFile(join(options.dataDirectory, "refresh.lock")), {
    code: "ENOENT",
  });
});
