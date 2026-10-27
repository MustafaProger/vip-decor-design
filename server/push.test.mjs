import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, appendFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createECDH, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import webpush from "web-push";
import { createPushService, validateSubscription } from "./push.mjs";
import { createInquiryServer } from "./index.mjs";
const keys = webpush.generateVAPIDKeys();
const curve = createECDH("prime256v1");
curve.generateKeys();
const subscription = {
  endpoint: "https://fcm.googleapis.com/wp/example",
  keys: {
    p256dh: curve.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  },
};
async function fixture(t, send = async () => {}) {
  const dir = await mkdtemp(join(tmpdir(), "vip-push-"));
  let clock = Date.now();
  let service;
  const start = () =>
    createPushService({
      dataDirectory: dir,
      keys,
      send,
      now: () => clock,
      intervalMs: 0,
    });
  service = await start();
  t.after(async () => {
    service.close();
    await rm(dir, { recursive: true, force: true });
  });
  return {
    dir,
    get service() {
      return service;
    },
    tick(ms = 1) {
      clock += ms;
    },
    async restart() {
      service.close();
      service = await start();
    },
    async add(id = "inquiry-1") {
      await appendFile(
        join(dir, "inquiries.jsonl"),
        JSON.stringify({
          id,
          createdAt: new Date(clock).toISOString(),
          name: "PRIVATE NAME",
          phone: "PRIVATE PHONE",
          comment: "PRIVATE TEXT",
        }) + "\n",
      );
    },
    jobs() {
      const db = new DatabaseSync(join(dir, "push.sqlite"));
      const result = db.prepare("SELECT * FROM jobs").all();
      db.close();
      return result;
    },
  };
}
test("only known HTTPS push services and valid browser keys are accepted", () => {
  assert.deepEqual(validateSubscription(subscription), subscription);
  for (const endpoint of [
    "https://127.0.0.1/x",
    "http://fcm.googleapis.com/x",
    "https://fcm.googleapis.com.evil.test/x",
    "https://user@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
  ])
    assert.throws(() => validateSubscription({ ...subscription, endpoint }));
  assert.throws(() =>
    validateSubscription({
      ...subscription,
      keys: { ...subscription.keys, p256dh: "invalid" },
    }),
  );
});
test("one private-free push per inquiry and subscription despite repeated scans and restart", async (t) => {
  const sent = [];
  const f = await fixture(t, async (...args) => sent.push(args));
  f.service.subscribe(subscription, "admin");
  f.tick();
  await f.add();
  await Promise.all([f.service.scan(), f.service.scan()]);
  await f.restart();
  await f.service.scan();
  assert.equal(sent.length, 1);
  const message = JSON.parse(sent[0][1]);
  assert.equal(message.url, "/admin?inquiry=inquiry-1");
  assert.ok(!sent[0][1].includes("PRIVATE"));
  assert.equal(f.jobs()[0].state, "accepted");
  assert.equal(sent[0][2].vapidDetails.publicKey, keys.publicKey);
});
test("pre-install historical records and records before subscribing are not notified", async (t) => {
  const sent = [];
  const f = await fixture(t, async (...args) => sent.push(args));
  await f.add("before-sub");
  f.tick(100);
  f.service.subscribe(subscription, "admin");
  await f.service.scan();
  assert.equal(sent.length, 0);
  await f.restart();
  f.tick();
  await f.add("after-sub");
  await f.service.scan();
  assert.equal(sent.length, 1);
});
test("404/410 removes stale subscription and pending jobs", async (t) => {
  const f = await fixture(t, async () => {
    throw Object.assign(Error(), { statusCode: 410 });
  });
  f.service.subscribe(subscription, "admin");
  f.tick();
  await f.add();
  await f.service.scan();
  assert.equal(
    f.service.status(subscription.endpoint, "admin").subscribed,
    false,
  );
  assert.equal(f.jobs().length, 0);
});
test("temporary failure retries after backoff with stable topic; unauthorized provider response stops", async (t) => {
  const topics = [];
  let count = 0;
  const f = await fixture(t, async (_sub, _body, options) => {
    topics.push(options.topic);
    if (++count === 1) throw { statusCode: 503 };
  });
  f.service.subscribe(subscription, "admin");
  f.tick();
  await f.add();
  await f.service.scan();
  await f.service.scan();
  assert.equal(count, 1);
  assert.equal(f.jobs()[0].state, "pending");
  f.tick(30001);
  await f.restart();
  await f.service.scan();
  assert.equal(count, 2);
  assert.equal(topics[0], topics[1]);
});
test("unsubscribe is owner scoped and removes queued messages; test is rate limited without inquiries", async (t) => {
  const f = await fixture(t);
  f.service.subscribe(subscription, "admin");
  f.service.unsubscribe(subscription.endpoint, "other");
  assert.equal(
    f.service.status(subscription.endpoint, "admin").subscribed,
    true,
  );
  assert.throws(() => f.service.test(subscription.endpoint, "other"));
  f.service.test(subscription.endpoint, "admin");
  assert.throws(() => f.service.test(subscription.endpoint, "admin"));
  await f.service.scan();
  await assert.rejects(readFile(join(f.dir, "inquiries.jsonl")));
  f.service.unsubscribe(subscription.endpoint, "admin");
  assert.equal(f.jobs().length, 0);
});
test("inquiry API idempotency produces one durable push and subscriptions require session, origin and CSRF", async (t) => {
  const sent = [];
  const f = await fixture(t, async (...args) => sent.push(args));
  const origin = "http://localhost:5180";
  const server = await createInquiryServer({
    dataDirectory: f.dir,
    allowedOrigins: [origin],
    pushService: f.service,
    reviewService: {},
    cmsOptions: {
      seedContent: { products: [], categories: [] },
      seedBlog: { posts: [], categories: [] },
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(
    () =>
      new Promise((r) => {
        server.close(r);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = "GET", body, headers = {}) =>
    fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await request("/api/cms/push/config")).status, 401);
  const setupToken = (
    await readFile(join(f.dir, "cms-setup-token"), "utf8")
  ).trim();
  const setup = await request("/api/cms/setup", "POST", {
    username: "push-tester",
    password: "a-test-password-for-push",
    token: setupToken,
  });
  assert.equal(setup.status, 201);
  const session = await setup.json();
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (
      await request("/api/cms/push/subscription", "POST", subscription, {
        Cookie: cookie,
      })
    ).status,
    403,
  );
  const headers = { Cookie: cookie, "X-CSRF-Token": session.csrfToken };
  assert.equal(
    (
      await request("/api/cms/push/subscription", "POST", subscription, {
        ...headers,
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/cms/push/subscription", "POST", subscription, headers))
      .status,
    200,
  );
  const inquiry = {
    requestId: "push-test-request-12345",
    name: "Тест уведомлений",
    phone: "+70000000000",
    consent: true,
  };
  const first = await request("/api/inquiries", "POST", inquiry);
  assert.equal(first.status, 201);
  const id = (await first.json()).id;
  assert.equal((await request("/api/inquiries", "POST", inquiry)).status, 201);
  await f.service.scan();
  assert.equal(sent.length, 1);
  assert.equal(JSON.parse(sent[0][1]).url, `/admin?inquiry=${id}`);
});
