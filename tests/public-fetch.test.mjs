import test from "node:test";
import assert from "node:assert/strict";
import { publicFetch } from "../src/lib/publicFetch.ts";

test("read-only public loading recovers from a network reset", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    if (++calls === 1) throw new TypeError("Failed to fetch");
    return Response.json({ products: [] });
  });
  assert.deepEqual(
    await publicFetch("/api/content", new AbortController().signal),
    { products: [] },
  );
  assert.equal(calls, 2);
});
test("aborted navigation stops retries and client errors are not retried", async (t) => {
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("", { status: 404 });
  });
  await assert.rejects(publicFetch("/api/content", controller.signal));
  assert.equal(calls, 1);
  t.mock.method(globalThis, "fetch", async () => {
    controller.abort();
    throw controller.signal.reason;
  });
  await assert.rejects(publicFetch("/api/content", controller.signal), {
    name: "AbortError",
  });
});
