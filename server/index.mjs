import { createServer } from "node:http";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const serverDirectory = dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 16 * 1024;
const LOCAL_MESSAGE =
  "Заявка сохранена в локальной версии. Доставка в студию ещё не подключена.";
const allowedRooms = ["Гостиная", "Спальня", "Детская", "Кухня"];
const allowedMaterials = [
  "Лёгкие и воздушные",
  "Плотные и спокойные",
  "Сочетание портьер и тюля",
  "Помогите выбрать",
];

function reply(response, statusCode, body) {
  if (response.destroyed) return;
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function failure(response, statusCode, message, fields) {
  reply(response, statusCode, {
    error: { message, ...(fields ? { fields } : {}) },
  });
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function validateBody(body) {
  if (!plainObject(body)) return { error: "Ожидался JSON-объект заявки." };
  const fields = {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (name.length < 2 || name.length > 100)
    fields.name = "Укажите имя длиной от 2 до 100 символов.";
  const digits = phone.replace(/\D/g, "");
  if (
    !/^[+\d\s()\-]+$/.test(phone) ||
    digits.length < 10 ||
    digits.length > 15 ||
    phone.length > 40
  ) {
    fields.phone = "Введите корректный телефон с кодом страны.";
  }
  if (
    body.comment !== undefined &&
    (typeof body.comment !== "string" || body.comment.length > 3000)
  )
    fields.comment =
      "Комментарий должен быть текстом не длиннее 3000 символов.";
  if (body.consent !== true)
    fields.consent = "Подтвердите согласие на обработку персональных данных.";
  if (Object.keys(fields).length)
    return { error: "Проверьте отмеченные поля.", fields };
  if (
    typeof body.requestId !== "string" ||
    !/^[a-zA-Z0-9_-]{16,80}$/.test(body.requestId)
  )
    return {
      error:
        "Не удалось определить запрос. Обновите страницу и попробуйте снова.",
    };
  if (
    body.context !== undefined &&
    (typeof body.context !== "string" || body.context.length > 2000)
  )
    return {
      error: "Контекст заявки должен быть текстом не длиннее 2000 символов.",
    };
  if (
    body.email !== undefined &&
    (typeof body.email !== "string" ||
      body.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))
  )
    return { error: "Укажите корректный адрес электронной почты." };
  let selection;
  if (body.selection !== undefined) {
    const input = body.selection;
    if (
      !plainObject(input) ||
      !allowedRooms.includes(input.room) ||
      !allowedMaterials.includes(input.material) ||
      typeof input.dimensionsUnknown !== "boolean"
    )
      return { error: "Проверьте комнату и материалы в подборе." };
    for (const key of ["widthCm", "heightCm"]) {
      if (
        input[key] !== undefined &&
        (typeof input[key] !== "number" ||
          !Number.isFinite(input[key]) ||
          input[key] <= 0)
      )
        return { error: "Размеры должны быть положительными числами." };
    }
    selection = {
      room: input.room,
      material: input.material,
      dimensionsUnknown: input.dimensionsUnknown,
    };
    if (!input.dimensionsUnknown) {
      if (input.widthCm !== undefined) selection.widthCm = input.widthCm;
      if (input.heightCm !== undefined) selection.heightCm = input.heightCm;
    }
  }
  const value = {
    name,
    phone,
    comment,
    consent: true,
    ...(body.email !== undefined ? { email: body.email.trim() } : {}),
    ...(body.context ? { context: body.context.trim() } : {}),
    ...(selection ? { selection } : {}),
  };
  return { value, requestId: body.requestId };
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let rejected = false;
    request.on("data", (chunk) => {
      if (rejected) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        rejected = true;
        chunks.length = 0;
        const error = new Error("Размер заявки превышает допустимый.");
        error.statusCode = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (rejected) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        const error = new Error(
          "Не удалось прочитать заявку: некорректный JSON.",
        );
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on("error", reject);
    request.on("aborted", () => {
      const error = new Error("Передача заявки прервана.");
      error.statusCode = 400;
      reject(error);
    });
  });
}

export async function createInquiryServer(options = {}) {
  const dataDirectory = resolve(
    options.dataDirectory ||
      process.env.INQUIRY_DATA_DIR ||
      resolve(serverDirectory, "../data/runtime"),
  );
  const filePath = resolve(dataDirectory, "inquiries.jsonl");
  const originValues =
    options.allowedOrigins ||
    (
      process.env.APP_ORIGIN ||
      "http://localhost:5180,http://127.0.0.1:5180,http://localhost:4173,http://127.0.0.1:4173"
    ).split(",");
  const allowedOrigins = new Set(
    originValues.map((origin) => origin.trim()).filter(Boolean),
  );
  const records = new Map();
  let queue = Promise.resolve();
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  try {
    const previous = await readFile(filePath, "utf8");
    for (const line of previous.split("\n").filter(Boolean)) {
      try {
        const record = JSON.parse(line);
        if (record.requestId && record.fingerprint && record.id)
          records.set(record.requestId, {
            fingerprint: record.fingerprint,
            result: {
              id: record.id,
              status: "saved_locally",
              message: LOCAL_MESSAGE,
            },
          });
      } catch {
        /* A partial trailing write does not prevent reading confirmed entries. */
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const server = createServer(async (request, response) => {
    const route = request.url?.split("?")[0];
    if (route === "/api/health" && request.method === "GET") {
      reply(response, 200, { status: "ok", delivery: "local_only" });
      return;
    }
    if (route !== "/api/inquiries") {
      failure(response, 404, "Адрес не найден.");
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      failure(response, 405, "Для сохранения заявки используйте POST.");
      return;
    }

    const origin = request.headers.origin;
    const directOrigin = `http://${request.headers.host}`;
    // The Vite proxy keeps the browser Origin; other deployments must set APP_ORIGIN explicitly.
    if (
      typeof origin !== "string" ||
      (!allowedOrigins.has(origin) && origin !== directOrigin)
    ) {
      failure(
        response,
        403,
        "Сохранение заявки разрешено только со страницы этого сайта.",
      );
      return;
    }
    if (request.headers["sec-fetch-site"] === "cross-site") {
      failure(response, 403, "Межсайтовый запрос отклонён.");
      return;
    }
    if (
      !request.headers["content-type"]
        ?.toLowerCase()
        .startsWith("application/json")
    ) {
      failure(response, 415, "Ожидается заявка в формате JSON.");
      return;
    }
    if (Number(request.headers["content-length"]) > MAX_BODY_BYTES) {
      failure(response, 413, "Размер заявки превышает допустимый.");
      return;
    }

    try {
      const checked = validateBody(await readJson(request));
      if (checked.error) {
        failure(response, 422, checked.error, checked.fields);
        return;
      }
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(checked.value))
        .digest("hex");
      // Serialize the duplicate check with the write, including simultaneous requests.
      const saved = queue.then(async () => {
        const existing = records.get(checked.requestId);
        if (existing) {
          if (existing.fingerprint !== fingerprint) {
            const error = new Error(
              "Этот идентификатор заявки уже использован. Обновите форму перед новой отправкой.",
            );
            error.statusCode = 409;
            throw error;
          }
          return existing.result;
        }
        const record = {
          id: randomUUID(),
          requestId: checked.requestId,
          fingerprint,
          createdAt: new Date().toISOString(),
          deliveryStatus: "local_only",
          consentVersion: "local-2026-09",
          ...checked.value,
        };
        await appendFile(filePath, `${JSON.stringify(record)}\n`, {
          encoding: "utf8",
          mode: 0o600,
        });
        const result = {
          id: record.id,
          status: "saved_locally",
          message: LOCAL_MESSAGE,
        };
        records.set(checked.requestId, { fingerprint, result });
        return result;
      });
      queue = saved.catch(() => {});
      reply(response, 201, await saved);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      failure(
        response,
        statusCode,
        statusCode === 500
          ? "Не удалось сохранить заявку на сервере. Попробуйте ещё раз."
          : error.message,
      );
      if (statusCode === 500)
        console.error("Inquiry storage failed:", error.code || error.name);
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.INQUIRY_PORT || 3001);
  const hostname = process.env.INQUIRY_HOST || "127.0.0.1";
  const server = await createInquiryServer();
  server.listen(port, hostname, () =>
    console.log(
      `Local inquiry server: http://${hostname}:${port} (studio delivery is not connected)`,
    ),
  );
}
