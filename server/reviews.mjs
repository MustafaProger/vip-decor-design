import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serverDirectory = dirname(fileURLToPath(import.meta.url));
const DAY = 24 * 60 * 60 * 1000;
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const MAX_REFRESH_MS = 3 * 60 * 1000;
const LOCK_MAX_AGE_MS = 10 * 60 * 1000;
const SAFE_MEDIA_FILE = /^[a-f0-9]{64}\.webp$/;
const SAFE_ERRORS = new Set([
  "SOURCE_BLOCKED",
  "INCOMPLETE_SNAPSHOT",
  "NETWORK_ERROR",
  "INVALID_SNAPSHOT",
  "INVALID_PHOTO",
  "PHOTO_TOO_LARGE",
  "PHOTO_DOWNLOAD_FAILED",
  "REFRESH_TIMEOUT",
]);

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function trustedPhotoUrl(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "avatars.mds.yandex.net" ||
      url.port ||
      url.username ||
      url.password ||
      !/^\/get-altay\/\d+\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(url.pathname)
    )
      return false;
    return !url.search && !url.hash;
  } catch {
    return false;
  }
}

function validLocalPhoto(src) {
  return (
    typeof src === "string" &&
    (/^\/images\/reviews\/[a-zA-Z0-9_-]+\.webp$/.test(src) ||
      (src.startsWith("/api/review-media/") &&
        SAFE_MEDIA_FILE.test(src.slice("/api/review-media/".length))))
  );
}

/** Refuse partial imports before touching the public cache. */
function validateSnapshot(snapshot, { localPhotos = false } = {}) {
  if (
    !snapshot ||
    snapshot.businessId !== "223039913433" ||
    snapshot.complete !== true ||
    !Array.isArray(snapshot.reviews) ||
    !snapshot.reviews.length ||
    snapshot.reviews.length > 10000 ||
    snapshot.importedCount !== snapshot.reviews.length ||
    snapshot.reviewCount !== snapshot.reviews.length ||
    !Number.isFinite(snapshot.rating) ||
    snapshot.rating < 0 ||
    snapshot.rating > 5 ||
    !Number.isInteger(snapshot.ratingCount) ||
    snapshot.ratingCount < snapshot.reviewCount
  ) {
    throw failure("INVALID_SNAPSHOT");
  }
  const ids = new Set();
  for (const review of snapshot.reviews) {
    if (
      !review ||
      typeof review.id !== "string" ||
      !review.id ||
      ids.has(review.id) ||
      typeof review.author !== "string" ||
      !review.author.trim() ||
      typeof review.excerpt !== "string" ||
      !review.excerpt.trim() ||
      !Number.isInteger(review.rating) ||
      review.rating < 1 ||
      review.rating > 5 ||
      !Number.isFinite(Date.parse(review.date)) ||
      !Array.isArray(review.photos) ||
      review.photos.length > 100
    ) {
      throw failure("INVALID_SNAPSHOT");
    }
    ids.add(review.id);
    for (const photo of review.photos) {
      if (
        !photo ||
        !trustedPhotoUrl(photo.sourceUrl) ||
        (localPhotos &&
          (!validLocalPhoto(photo.src) ||
            !Number.isInteger(photo.width) ||
            photo.width <= 0 ||
            !Number.isInteger(photo.height) ||
            photo.height <= 0))
      )
        throw failure("INVALID_PHOTO");
    }
  }
  return snapshot;
}

async function atomicJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", {
      mode: 0o600,
    });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

async function optionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function optimizePhoto(buffer) {
  const { default: sharp } = await import("sharp");
  const { data, info } = await sharp(buffer, {
    limitInputPixels: 40_000_000,
    animated: false,
  })
    .rotate()
    .resize({
      width: 1400,
      height: 1400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 86 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

/** A read-only cache loader and a separately invoked daily refresh operation. */
export async function createReviewService(options = {}) {
  const dataDirectory = resolve(
    options.dataDirectory ||
      resolve(serverDirectory, "../data/runtime/reviews"),
  );
  const seedPath = resolve(
    options.seedPath ||
      resolve(serverDirectory, "../src/data/yandex-reviews.json"),
  );
  const mediaDirectory = resolve(
    options.mediaDirectory || resolve(dataDirectory, "media"),
  );
  const publicDirectory = resolve(
    options.publicDirectory || resolve(serverDirectory, "../public"),
  );
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const clock = options.now || (() => Date.now());
  const optimizeImage = options.optimizeImage || optimizePhoto;
  const fetchReviews =
    options.fetchReviews ||
    (async (args) => {
      const { fetchYandexReviews } =
        await import("./yandex-reviews-source.mjs");
      return fetchYandexReviews(args);
    });
  const snapshotPath = resolve(dataDirectory, "snapshot.json");
  const statusPath = resolve(dataDirectory, "status.json");
  const lockPath = resolve(dataDirectory, "refresh.lock");
  const seed = validateSnapshot(await optionalJson(seedPath), {
    localPhotos: true,
  });
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  let inFlight;

  async function getSnapshot() {
    const cached = await optionalJson(snapshotPath);
    if (cached) {
      try {
        return validateSnapshot(cached, { localPhotos: true });
      } catch {
        /* A damaged runtime cache never replaces the checked seed. */
      }
    }
    return structuredClone(seed);
  }

  async function getStatus() {
    return (
      (await optionalJson(statusPath)) || {
        lastAttemptAt: null,
        lastSuccessAt: null,
        status: "seed",
        errorCode: null,
      }
    );
  }

  async function acquireLock() {
    const token = randomUUID();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const handle = await open(lockPath, "wx", 0o600);
        try {
          await handle.writeFile(
            JSON.stringify({
              token,
              pid: process.pid,
              startedAt: Number(clock()),
            }),
          );
        } finally {
          await handle.close();
        }
        return async () => {
          const current = await optionalJson(lockPath);
          if (current?.token === token) await unlink(lockPath).catch(() => {});
        };
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        const existing = await optionalJson(lockPath);
        const info = await stat(lockPath).catch(() => null);
        if (!info) continue;
        let ownerAlive = false;
        if (Number.isInteger(existing?.pid) && existing.pid > 0) {
          try {
            process.kill(existing.pid, 0);
            ownerAlive = true;
          } catch (pidError) {
            ownerAlive = pidError.code !== "ESRCH";
          }
        }
        const age =
          Number(clock()) - (Number(existing?.startedAt) || info.mtimeMs);
        if (ownerAlive || age < LOCK_MAX_AGE_MS) return null;
        // Re-check the inode so an already replaced lock is never deliberately removed.
        const current = await stat(lockPath).catch(() => null);
        if (current?.ino === info.ino) await unlink(lockPath).catch(() => {});
      }
    }
    return null;
  }

  async function photoExists(photo) {
    if (!validLocalPhoto(photo.src)) return false;
    const path = photo.src.startsWith("/api/review-media/")
      ? resolve(mediaDirectory, photo.src.slice("/api/review-media/".length))
      : resolve(publicDirectory, photo.src.slice(1));
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async function downloadPhoto(sourceUrl, signal) {
    if (!trustedPhotoUrl(sourceUrl)) throw failure("INVALID_PHOTO");
    const response = await fetchImpl(sourceUrl, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      redirect: "error",
      headers: { Accept: "image/webp,image/*;q=0.9" },
    });
    if (
      !response.ok ||
      (response.url && !trustedPhotoUrl(response.url)) ||
      !/^image\//i.test(response.headers.get("content-type") || "")
    )
      throw failure("PHOTO_DOWNLOAD_FAILED");
    if (Number(response.headers.get("content-length")) > MAX_PHOTO_BYTES)
      throw failure("PHOTO_TOO_LARGE");
    if (!response.body) throw failure("PHOTO_DOWNLOAD_FAILED");
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_PHOTO_BYTES) throw failure("PHOTO_TOO_LARGE");
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    if (!size) throw failure("PHOTO_DOWNLOAD_FAILED");
    let image;
    try {
      image = await optimizeImage(Buffer.concat(chunks));
    } catch {
      throw failure("INVALID_PHOTO");
    }
    if (
      !Buffer.isBuffer(image.buffer) ||
      !Number.isInteger(image.width) ||
      image.width < 1 ||
      image.width > 1400 ||
      !Number.isInteger(image.height) ||
      image.height < 1 ||
      image.height > 1400
    )
      throw failure("INVALID_PHOTO");
    signal.throwIfAborted();
    const filename =
      createHash("sha256").update(sourceUrl).digest("hex") + ".webp";
    const destination = resolve(mediaDirectory, filename);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await mkdir(mediaDirectory, { recursive: true, mode: 0o700 });
    try {
      await writeFile(temporary, image.buffer, { mode: 0o600 });
      await rename(temporary, destination);
    } finally {
      await unlink(temporary).catch(() => {});
    }
    return {
      src: `/api/review-media/${filename}`,
      sourceUrl,
      width: image.width,
      height: image.height,
    };
  }

  async function materializePhotos(snapshot, previous, signal) {
    const old = new Map(
      previous.reviews.flatMap((review) =>
        review.photos.map((photo) => [photo.sourceUrl, photo]),
      ),
    );
    const ready = new Map();
    for (const review of snapshot.reviews) {
      const photos = [];
      for (const photo of review.photos) {
        signal.throwIfAborted();
        let local = ready.get(photo.sourceUrl);
        if (!local) {
          const known = old.get(photo.sourceUrl);
          local =
            known && (await photoExists(known))
              ? known
              : await downloadPhoto(photo.sourceUrl, signal);
          ready.set(photo.sourceUrl, local);
        }
        photos.push({ ...local });
      }
      review.photos = photos;
    }
    snapshot.photoCount = snapshot.reviews.reduce(
      (total, review) => total + review.photos.length,
      0,
    );
    snapshot.reviewsWithPhotos = snapshot.reviews.filter(
      (review) => review.photos.length,
    ).length;
    return snapshot;
  }

  async function performRefresh({ force = false } = {}) {
    let snapshot = await getSnapshot();
    const release = await acquireLock();
    if (!release)
      return { status: "locked", snapshot, refresh: await getStatus() };
    try {
      const previousStatus = await getStatus();
      const time = Number(clock());
      const previousAttempt = Date.parse(previousStatus.lastAttemptAt);
      if (
        !force &&
        Number.isFinite(previousAttempt) &&
        time - previousAttempt < DAY
      ) {
        return {
          status: "fresh",
          snapshot: await getSnapshot(),
          refresh: previousStatus,
        };
      }
      const attempt = {
        lastAttemptAt: new Date(time).toISOString(),
        lastSuccessAt: previousStatus.lastSuccessAt || null,
        status: "refreshing",
        errorCode: null,
      };
      // Save before any network I/O, including failures and interrupted processes.
      await atomicJson(statusPath, attempt);
      const signal = AbortSignal.timeout(MAX_REFRESH_MS);
      try {
        snapshot = await getSnapshot();
        const input = await fetchReviews({
          previousSnapshot: structuredClone(snapshot),
          fetchImpl,
          now: new Date(time),
          signal,
        });
        signal.throwIfAborted();
        const next = await materializePhotos(
          structuredClone(validateSnapshot(input)),
          snapshot,
          signal,
        );
        validateSnapshot(next, { localPhotos: true });
        next.refreshedAt = new Date(Number(clock())).toISOString();
        await atomicJson(snapshotPath, next);
        const refresh = {
          ...attempt,
          status: "updated",
          lastSuccessAt: next.refreshedAt,
        };
        await atomicJson(statusPath, refresh);
        return { status: "updated", snapshot: next, refresh };
      } catch (error) {
        const errorCode = signal.aborted
          ? "REFRESH_TIMEOUT"
          : SAFE_ERRORS.has(error.code)
            ? error.code
            : "REFRESH_FAILED";
        const refresh = { ...attempt, status: "failed", errorCode };
        await atomicJson(statusPath, refresh);
        return { status: "failed", snapshot: await getSnapshot(), refresh };
      }
    } finally {
      await release();
    }
  }

  function refreshIfDue(options = {}) {
    if (!inFlight)
      inFlight = performRefresh(options).finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  }

  return {
    getSnapshot,
    readSnapshot: getSnapshot,
    getStatus,
    refreshIfDue,
    mediaDirectory,
  };
}
