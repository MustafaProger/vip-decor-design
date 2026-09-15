import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInquiryServer } from "./index.mjs";

test("review HTTP reads are cached, read-only and do not trigger Yandex refresh", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vip-reviews-http-"));
  let refreshCalls = 0;
  const snapshot = {
    businessId: "223039913433",
    reviews: [{ id: "cached-review" }],
  };
  const service = {
    mediaDirectory: directory,
    getSnapshot: async () => snapshot,
    refreshIfDue: () => {
      refreshCalls++;
    },
  };
  const server = await createInquiryServer({
    dataDirectory: directory,
    reviewService: service,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (let i = 0; i < 3; i++) {
      const response = await fetch(base + "/api/reviews");
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), snapshot);
    }
    assert.equal(
      (await fetch(base + "/api/reviews", { method: "POST" })).status,
      405,
    );
    assert.equal(refreshCalls, 0);
    assert.equal(
      (await fetch(base + "/api/review-media/not-a-hash.webp")).status,
      404,
    );
    const name = "a".repeat(64) + ".webp";
    await writeFile(join(directory, name), Buffer.from("test-webp-response"));
    const photo = await fetch(base + "/api/review-media/" + name);
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get("content-type"), "image/webp");
    assert.match(photo.headers.get("cache-control"), /immutable/);
    assert.equal(
      (await fetch(base + "/api/review-media/" + name, { method: "POST" }))
        .status,
      405,
    );
    assert.equal(
      (await fetch(base + "/api/review-media/" + "b".repeat(64) + ".webp"))
        .status,
      404,
    );
    assert.equal(
      (await fetch(base + "/api/review-media/" + name, { method: "HEAD" }))
        .status,
      200,
    );
    assert.equal(refreshCalls, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
