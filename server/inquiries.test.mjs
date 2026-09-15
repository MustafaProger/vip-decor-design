import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createInquiryServer } from "./index.mjs";

async function withServer(run) {
  const directory = await mkdtemp(join(tmpdir(), "vip-decor-inquiry-test-"));
  const server = await createInquiryServer({
    dataDirectory: directory,
    allowedOrigins: ["http://localhost:5173"],
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/inquiries`;
  const send = (payload, headers = {}) =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
        ...headers,
      },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
  try {
    await run({ directory, send });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(directory, { recursive: true, force: true });
  }
}

function valid() {
  return {
    name: "Тестовая заявка",
    phone: "+7 000 000-00-00",
    comment: "Автоматическая проверка без отправки.",
    consent: true,
    requestId: randomUUID(),
    selection: {
      room: "Гостиная",
      material: "Помогите выбрать",
      dimensionsUnknown: false,
      widthCm: 240.5,
    },
  };
}

test("saves locally and deduplicates concurrent retries with the same request id", async () => {
  await withServer(async ({ send, directory }) => {
    const payload = valid();
    const responses = await Promise.all([
      send(payload),
      send(payload),
      send(payload),
    ]);
    assert.ok(responses.every((response) => response.status === 201));
    const results = await Promise.all(
      responses.map((response) => response.json()),
    );
    assert.equal(new Set(results.map((result) => result.id)).size, 1);
    assert.equal(results[0].status, "saved_locally");
    assert.match(results[0].message, /Передача заявки менеджеру ещё не подключена/);
    const records = (await readFile(join(directory, "inquiries.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(records.length, 1);
    assert.equal(records[0].selection.widthCm, 240.5);
    assert.equal(records[0].deliveryStatus, "local_only");
    const conflict = await send({ ...payload, name: "Другая заявка" });
    assert.equal(conflict.status, 409);
  });
});

test("rejects invalid contact fields, missing consent and invalid dimensions without saving", async () => {
  await withServer(async ({ send, directory }) => {
    const invalidContact = await send({
      ...valid(),
      name: "",
      phone: "wrong",
      consent: false,
    });
    assert.equal(invalidContact.status, 422);
    const body = await invalidContact.json();
    assert.deepEqual(Object.keys(body.error.fields).sort(), [
      "consent",
      "name",
      "phone",
    ]);
    for (const widthCm of [0, -1, "240"]) {
      const invalidDimension = await send({
        ...valid(),
        selection: {
          room: "Гостиная",
          material: "Помогите выбрать",
          dimensionsUnknown: false,
          widthCm,
        },
      });
      assert.equal(invalidDimension.status, 422);
    }
    await assert.rejects(readFile(join(directory, "inquiries.jsonl"), "utf8"), {
      code: "ENOENT",
    });
  });
});

test("rejects cross-origin, malformed JSON and oversized requests", async () => {
  await withServer(async ({ send }) => {
    assert.equal(
      (await send(valid(), { Origin: "https://untrusted.example" })).status,
      403,
    );
    assert.equal(
      (await send(valid(), { "Sec-Fetch-Site": "cross-site" })).status,
      403,
    );
    assert.equal((await send("{ broken")).status, 400);
    assert.equal(
      (await send({ ...valid(), comment: "x".repeat(20000) })).status,
      413,
    );
    assert.equal(
      (await send(valid(), { "Content-Type": "text/plain" })).status,
      415,
    );
  });
});

test("accepts optional dimensions and the unknown option without inventing measurements", async () => {
  await withServer(async ({ send, directory }) => {
    const payload = valid();
    payload.selection = {
      room: "Кухня",
      material: "Лёгкие и воздушные",
      dimensionsUnknown: true,
    };
    assert.equal((await send(payload)).status, 201);
    const record = JSON.parse(
      (await readFile(join(directory, "inquiries.jsonl"), "utf8")).trim(),
    );
    assert.equal(record.selection.dimensionsUnknown, true);
    assert.equal("widthCm" in record.selection, false);
    assert.equal("heightCm" in record.selection, false);
  });
});
