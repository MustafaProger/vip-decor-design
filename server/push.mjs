import { DatabaseSync } from "node:sqlite";
import { readFile, mkdir, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, createECDH, ECDH, randomUUID } from "node:crypto";
import webpush from "web-push";
import { CmsError } from "./cms-validation.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const DAY = 86400000;
export function validateSubscription(value) {
  let url;
  try {
    url = new URL(value?.endpoint);
  } catch {
    throw new CmsError(400, "Некорректная подписка браузера.");
  }
  const host = url.hostname;
  // Do not let authenticated clients turn the sender into an arbitrary HTTP client.
  const allowed =
    host === "fcm.googleapis.com" ||
    host === "updates.push.services.mozilla.com" ||
    host.endsWith(".push.services.mozilla.com") ||
    host === "web.push.apple.com" ||
    host.endsWith(".web.push.apple.com");
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !allowed ||
    value.endpoint.length > 4096
  )
    throw new CmsError(400, "Этот адрес службы push не поддерживается.");
  const { p256dh, auth } = value.keys || {};
  if (
    typeof p256dh !== "string" ||
    typeof auth !== "string" ||
    !/^[\w-]+$/.test(p256dh) ||
    !/^[\w-]+$/.test(auth) ||
    Buffer.from(auth, "base64url").length !== 16
  )
    throw new CmsError(400, "Некорректные ключи подписки.");
  try {
    if (Buffer.from(p256dh, "base64url").length !== 65) throw Error();
    ECDH.convertKey(Buffer.from(p256dh, "base64url"), "prime256v1");
  } catch {
    throw new CmsError(400, "Некорректный ключ браузера.");
  }
  return { endpoint: url.href, keys: { p256dh, auth } };
}

export async function createPushService({
  dataDirectory,
  keyFile = process.env.PUSH_VAPID_FILE,
  keys: suppliedKeys,
  send = webpush.sendNotification.bind(webpush),
  now = Date.now,
  intervalMs = 15000,
} = {}) {
  let keys = suppliedKeys;
  if (keyFile) keys = JSON.parse(await readFile(keyFile, "utf8"));
  if (!keys)
    return {
      enabled: false,
      publicKey: null,
      scan: async () => {},
      close: () => {},
    };
  // Validate once at startup, without logging key material.
  const vapid = createECDH("prime256v1");
  vapid.setPrivateKey(Buffer.from(keys.privateKey, "base64url"));
  if (vapid.getPublicKey().toString("base64url") !== keys.publicKey)
    throw new Error("Invalid VAPID key pair");
  const vapidDetails = {
    subject: keys.subject || "mailto:vipdecordesign@yandex.ru",
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  };
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const path = resolve(dataDirectory, "push.sqlite");
  const db = new DatabaseSync(path);
  await chmod(path, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS seen(id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS subscriptions(id TEXT PRIMARY KEY, username TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, tested_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, created_at INTEGER NOT NULL, status_code INTEGER);
  `);
  let closed = false,
    running = null;
  const inquiryFile = resolve(dataDirectory, "inquiries.jsonl");
  async function records() {
    let source;
    try {
      source = await readFile(inquiryFile, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    return source.split("\n").flatMap((line) => {
      try {
        const row = JSON.parse(line);
        return typeof row.id === "string" &&
          /^[\w-]{1,100}$/.test(row.id) &&
          Number.isFinite(Date.parse(row.createdAt))
          ? [row]
          : [];
      } catch {
        return [];
      }
    });
  }
  if (!db.prepare("SELECT 1 FROM meta WHERE key='initialized'").get()) {
    const old = await records();
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of old)
        db.prepare("INSERT OR IGNORE INTO seen VALUES (?)").run(row.id);
      db.prepare("INSERT INTO meta VALUES ('initialized', ?)").run(
        String(now()),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      throw error;
    }
  }
  // A process may have stopped after the provider accepted a message. Reuse the
  // same Topic/tag on retry; exactly-once display is not promised by Web Push.
  db.prepare("UPDATE jobs SET state='pending' WHERE state='sending'").run();
  function remove(id, username) {
    const result = db
      .prepare("DELETE FROM subscriptions WHERE id=? AND username=?")
      .run(id, username);
    if (result.changes)
      db.prepare("DELETE FROM jobs WHERE subscription_id=?").run(id);
  }
  async function run() {
    const rows = await records();
    if (closed) return;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of rows) {
        if (
          !db.prepare("INSERT OR IGNORE INTO seen VALUES (?)").run(row.id)
            .changes
        )
          continue;
        for (const sub of db
          .prepare("SELECT id FROM subscriptions WHERE created_at<=?")
          .all(Date.parse(row.createdAt))) {
          const payload = {
            title: "Новая заявка — VIP Decor",
            body: "На сайте появилось новое обращение. Откройте CMS, чтобы ответить.",
            url: `/admin?inquiry=${encodeURIComponent(row.id)}`,
            tag: `inquiry-${row.id}`,
          };
          db.prepare(
            "INSERT OR IGNORE INTO jobs(id,subscription_id,payload,next_at,created_at) VALUES (?,?,?,?,?)",
          ).run(
            hash(row.id + ":" + sub.id),
            sub.id,
            JSON.stringify(payload),
            now(),
            now(),
          );
        }
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    db.prepare(
      "UPDATE jobs SET state='expired' WHERE state='pending' AND created_at<?",
    ).run(now() - DAY);
    const jobs = db
      .prepare(
        "SELECT jobs.*, subscriptions.body AS subscription FROM jobs JOIN subscriptions ON subscriptions.id=jobs.subscription_id WHERE state='pending' AND next_at<=? ORDER BY created_at LIMIT 30",
      )
      .all(now());
    for (const job of jobs) {
      if (closed) break;
      if (
        !db
          .prepare("SELECT 1 FROM subscriptions WHERE id=?")
          .get(job.subscription_id)
      )
        continue;
      db.prepare(
        "UPDATE jobs SET state='sending',attempts=attempts+1 WHERE id=?",
      ).run(job.id);
      try {
        await send(JSON.parse(job.subscription), job.payload, {
          vapidDetails,
          TTL: Math.max(1, Math.floor((job.created_at + DAY - now()) / 1000)),
          urgency: "normal",
          topic: job.id.slice(0, 32),
          timeout: 10000,
        });
        if (!closed)
          db.prepare(
            "UPDATE jobs SET state='accepted',status_code=201 WHERE id=?",
          ).run(job.id);
      } catch (error) {
        if (closed) break;
        const status = Number(error.statusCode) || 0;
        if (status === 404 || status === 410) {
          db.prepare("DELETE FROM subscriptions WHERE id=?").run(
            job.subscription_id,
          );
          db.prepare("DELETE FROM jobs WHERE subscription_id=?").run(
            job.subscription_id,
          );
        } else {
          const retry =
            (!status || status === 429 || status >= 500) &&
            job.attempts + 1 < 5;
          const retryAfter = Math.min(
            DAY,
            Math.max(0, Number(error.headers?.["retry-after"]) * 1000 || 0),
          );
          db.prepare(
            "UPDATE jobs SET state=?,next_at=?,status_code=? WHERE id=?",
          ).run(
            retry ? "pending" : "failed",
            now() + Math.max(retryAfter, 30000 * 2 ** job.attempts),
            status,
            job.id,
          );
        }
      }
    }
    if (!closed)
      db.prepare(
        "DELETE FROM jobs WHERE state IN ('accepted','expired','failed') AND created_at<?",
      ).run(now() - 7 * DAY);
  }
  function scan() {
    if (closed) return Promise.resolve();
    if (!running)
      running = run().finally(() => {
        running = null;
      });
    return running;
  }
  const timer =
    intervalMs > 0
      ? setInterval(() => {
          void scan().catch(() => console.error("Push queue scan failed"));
        }, intervalMs)
      : null;
  timer?.unref();
  return {
    enabled: true,
    publicKey: keys.publicKey,
    scan,
    status(endpoint, username) {
      const id = typeof endpoint === "string" ? hash(endpoint) : "";
      return {
        enabled: true,
        publicKey: keys.publicKey,
        subscribed: !!db
          .prepare("SELECT 1 FROM subscriptions WHERE id=? AND username=?")
          .get(id, username),
      };
    },
    subscribe(input, username) {
      const sub = validateSubscription(input),
        id = hash(sub.endpoint);
      const existing = db
        .prepare("SELECT username FROM subscriptions WHERE id=?")
        .get(id);
      if (existing && existing.username !== username)
        throw new CmsError(409, "Подписка связана с другой учётной записью.");
      if (
        !existing &&
        db
          .prepare("SELECT count(*) AS n FROM subscriptions WHERE username=?")
          .get(username).n >= 20
      )
        throw new CmsError(409, "Достигнут лимит устройств для уведомлений.");
      db.prepare(
        "INSERT INTO subscriptions(id,username,body,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      ).run(id, username, JSON.stringify(sub), now());
      return { subscribed: true };
    },
    unsubscribe(endpoint, username) {
      remove(hash(String(endpoint)), username);
      return { subscribed: false };
    },
    test(endpoint, username) {
      const id = hash(String(endpoint));
      const sub = db
        .prepare("SELECT * FROM subscriptions WHERE id=? AND username=?")
        .get(id, username);
      if (!sub)
        throw new CmsError(
          404,
          "Сначала включите уведомления на этом устройстве.",
        );
      if (sub.tested_at && now() - sub.tested_at < 60000)
        throw new CmsError(
          429,
          "Повторная проверка будет доступна через минуту.",
        );
      db.prepare("UPDATE subscriptions SET tested_at=? WHERE id=?").run(
        now(),
        id,
      );
      const jobId = hash(randomUUID());
      db.prepare(
        "INSERT INTO jobs(id,subscription_id,payload,next_at,created_at) VALUES (?,?,?,?,?)",
      ).run(
        jobId,
        id,
        JSON.stringify({
          title: "VIP Decor — проверка",
          body: "Push-уведомления на этом устройстве работают.",
          url: "/admin",
          tag: "vip-push-test",
        }),
        now(),
        now(),
      );
      void scan().catch(() => console.error("Push test queue failed"));
      return { queued: true };
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      db.close();
    },
  };
}
