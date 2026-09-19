import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import {
  readFile,
  writeFile,
  mkdir,
  chmod,
  unlink,
  readdir,
  rename,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  CmsError,
  object,
  text,
  identifier,
  validateCredentials,
  validateProduct,
  validatePost,
  version,
} from "./cms-validation.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scrypt = promisify(scryptCallback);
const COOKIE = "vip_cms_session";
const SESSION_TTL = 12 * 60 * 60 * 1000;
const JSON_LIMIT = 1024 * 1024;
const IMAGE_LIMIT = 12 * 1024 * 1024;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const randomToken = () => randomBytes(32).toString("hex");
const compare = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));

function reply(response, status, value, headers = {}) {
  if (response.destroyed) return;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(JSON.stringify(value));
}
async function readBytes(request, limit) {
  if (Number(request.headers["content-length"]) > limit)
    throw new CmsError(413, "Размер файла или записи превышает допустимый.");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit)
      throw new CmsError(413, "Размер файла или записи превышает допустимый.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function readJson(request) {
  if (
    request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new CmsError(415, "Ожидается формат JSON.");
  try {
    return JSON.parse((await readBytes(request, JSON_LIMIT)).toString("utf8"));
  } catch (error) {
    if (error instanceof CmsError) throw error;
    throw new CmsError(400, "Не удалось прочитать JSON.");
  }
}
const readJsonFile = async (path) => JSON.parse(await readFile(path, "utf8"));
const hashPassword = async (password, salt) =>
  Buffer.from(
    await scrypt(password, salt, 64, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    }),
  ).toString("hex");

async function loadSeeds(options) {
  const content =
    options.seedContent ||
    (await readJsonFile(
      options.seedContentPath ||
        resolve(rootDirectory, "src/data/site-content.json"),
    ));
  if (options.seedBlog) return { content, blog: options.seedBlog };
  const generated = await readJsonFile(
    options.seedBlogPath || resolve(rootDirectory, "src/data/blog.json"),
  );
  const blogDirectory =
    options.blogDirectory || resolve(rootDirectory, "content/blog");
  const posts = [];
  for (const filename of (await readdir(blogDirectory)).filter(
    (name) => name.endsWith(".json") && name !== "categories.json",
  )) {
    const source = await readJsonFile(resolve(blogDirectory, filename));
    const prepared = generated.posts.find((post) => post.slug === source.slug);
    posts.push({
      ...source,
      image: prepared?.image || {
        ...source.image,
        variants: source.image?.variants || [],
      },
    });
  }
  return {
    content,
    blog: {
      posts,
      categories: await readJsonFile(resolve(blogDirectory, "categories.json")),
    },
  };
}

export async function createCmsService(options = {}) {
  const dataDirectory = resolve(
    options.dataDirectory ||
      process.env.INQUIRY_DATA_DIR ||
      resolve(rootDirectory, "data/runtime"),
  );
  const mediaDirectory = resolve(dataDirectory, "cms-media");
  const setupTokenPath = resolve(dataDirectory, "cms-setup-token");
  const databasePath = resolve(dataDirectory, "cms.sqlite");
  const inquiryPath = resolve(dataDirectory, "inquiries.jsonl");
  const allowedOrigins = new Set(
    options.allowedOrigins ||
      (
        process.env.APP_ORIGIN ||
        `http://localhost:5180,http://127.0.0.1:5180,http://localhost:4173,http://127.0.0.1:4173,http://localhost:${process.env.INQUIRY_PORT || process.env.PORT || 3001},http://127.0.0.1:${process.env.INQUIRY_PORT || process.env.PORT || 3001}`
      )
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
  );
  const now = options.now || Date.now;
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  await mkdir(mediaDirectory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(databasePath);
  await chmod(databasePath, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entities (kind TEXT NOT NULL, id TEXT NOT NULL, slug TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(kind,id), UNIQUE(kind,slug));
    CREATE TABLE IF NOT EXISTS admins (username TEXT PRIMARY KEY, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS inquiries (id TEXT PRIMARY KEY, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', note TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1);
  `);
  function transaction(run) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  try {
    if (!db.prepare("SELECT value FROM meta WHERE key='seeded'").get()) {
      const { content, blog } = await loadSeeds(options);
      transaction(() => {
        // Seed once. Subsequent source rebuilds must never overwrite editorial changes.
        if (db.prepare("SELECT value FROM meta WHERE key='seeded'").get())
          return;
        const storeMeta = db.prepare(
          "INSERT INTO meta(key,value) VALUES (?,?)",
        );
        const { products, ...chrome } = content;
        storeMeta.run("content", JSON.stringify(chrome));
        storeMeta.run("blogCategories", JSON.stringify(blog.categories));
        const insert = db.prepare(
          "INSERT INTO entities(kind,id,slug,status,version,updated_at,body) VALUES (?,?,?,?,1,?,?)",
        );
        for (const [kind, items] of [
          ["products", products],
          ["posts", blog.posts],
        ]) {
          for (const item of items) {
            const id = item.id || item.slug;
            const status = item.status === "draft" ? "draft" : "published";
            insert.run(
              kind,
              id,
              kind === "posts" ? item.slug : id,
              status,
              new Date(now()).toISOString(),
              JSON.stringify({ ...item, id, status }),
            );
          }
        }
        storeMeta.run("seeded", new Date(now()).toISOString());
      });
    }
  } catch (error) {
    db.close();
    throw error;
  }
  const chrome = JSON.parse(
    db.prepare("SELECT value FROM meta WHERE key='content'").get().value,
  );
  const blogCategories = JSON.parse(
    db.prepare("SELECT value FROM meta WHERE key='blogCategories'").get().value,
  );
  const catalogCategories = [...chrome.categories];
  if (
    !catalogCategories.some(
      (category) => category.path === "/derzhateli-dlya-shtor",
    )
  )
    catalogCategories.push({
      path: "/derzhateli-dlya-shtor",
      title: "Держатели для штор",
      description: "Держатели, подхваты, магниты, крючки и розетки для штор.",
      image: "",
    });
  const hasAdmin = () => !!db.prepare("SELECT 1 FROM admins LIMIT 1").get();
  let setupToken;
  if (!hasAdmin()) {
    try {
      setupToken = randomToken();
      await writeFile(setupTokenPath, `${setupToken}\n`, {
        flag: "wx",
        mode: 0o600,
      });
    } catch (error) {
      if (error.code !== "EEXIST") {
        db.close();
        throw error;
      }
      setupToken = (await readFile(setupTokenPath, "utf8")).trim();
      if (!/^[a-f0-9]{64}$/.test(setupToken)) {
        db.close();
        throw new Error(
          "Invalid CMS setup token file; remove the file and restart before initial setup.",
        );
      }
      await chmod(setupTokenPath, 0o600);
    }
  } else {
    await unlink(setupTokenPath).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  const attempts = new Map();
  const throttled = (request) => {
    const current = now();
    for (const [key, attempt] of attempts)
      if (attempt.until <= current) attempts.delete(key);
    const key = request.socket.remoteAddress || "unknown";
    const attempt = attempts.get(key) || {
      count: 0,
      until: current + 15 * 60 * 1000,
    };
    if (
      attempt.count >= (options.maxAuthAttempts || 8) ||
      attempts.size > 10000
    )
      throw new CmsError(
        429,
        "Слишком много попыток. Повторите вход через 15 минут.",
      );
    attempt.count++;
    attempts.set(key, attempt);
  };
  function requireOrigin(request) {
    if (
      typeof request.headers.origin !== "string" ||
      !allowedOrigins.has(request.headers.origin) ||
      request.headers["sec-fetch-site"] === "cross-site"
    )
      throw new CmsError(
        403,
        "Запрос разрешён только со страницы этого сайта.",
      );
  }
  function sessionFor(request) {
    const token = (request.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const session = db
      .prepare("SELECT * FROM sessions WHERE token_hash=? AND expires_at>?")
      .get(digest(token), now());
    return session || null;
  }
  function requireSession(request, mutation = false) {
    const session = sessionFor(request);
    if (!session) throw new CmsError(401, "Войдите в панель управления.");
    if (mutation) {
      requireOrigin(request);
      if (!compare(request.headers["x-csrf-token"], session.csrf_token))
        throw new CmsError(
          403,
          "Сессия страницы устарела. Обновите страницу и повторите действие.",
        );
    }
    return session;
  }
  function sessionPayload(session) {
    return session
      ? {
          authenticated: true,
          setupRequired: false,
          username: session.username,
          csrfToken: session.csrf_token,
        }
      : { authenticated: false, setupRequired: !hasAdmin() };
  }
  function establishSession(request, response, username) {
    const token = randomToken();
    const csrf = randomToken();
    db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(now());
    db.prepare(
      "INSERT INTO sessions(token_hash,username,csrf_token,expires_at) VALUES (?,?,?,?)",
    ).run(digest(token), username, csrf, now() + SESSION_TTL);
    const secure =
      options.cookieSecure ??
      (process.env.NODE_ENV === "production" ||
        request.socket.encrypted ||
        request.headers.origin?.startsWith("https://"));
    response.setHeader(
      "Set-Cookie",
      `${COOKIE}=${token}; Path=/api/cms; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}${secure ? "; Secure" : ""}`,
    );
    return {
      authenticated: true,
      setupRequired: false,
      username,
      csrfToken: csrf,
    };
  }
  function entity(row, publicView = false) {
    const body = JSON.parse(row.body);
    if (publicView) {
      delete body.status;
      delete body.version;
      delete body.updatedAt;
      if (row.kind === "posts") delete body.id;
      return body;
    }
    return { ...body, version: row.version, updatedAt: row.updated_at };
  }
  function entities(kind, publicView = false) {
    return db
      .prepare(
        `SELECT * FROM entities WHERE kind=?${publicView ? " AND status='published'" : ""} ORDER BY rowid`,
      )
      .all(kind)
      .map((row) => entity(row, publicView));
  }
  function getPublicContent() {
    const products = entities("products", true);
    const categories = chrome.categories.map((category) => ({
      ...category,
      count: products.filter(
        (product) =>
          product.categoryPath === category.path ||
          product.categoryPaths?.includes(category.path),
      ).length,
    }));
    return { ...structuredClone(chrome), categories, products };
  }
  function getPublicBlog() {
    const posts = entities("posts", true);
    return {
      posts,
      categories: structuredClone(
        blogCategories.filter((category) =>
          posts.some((post) => post.category === category.slug),
        ),
      ),
    };
  }
  async function syncInquiries() {
    let source;
    try {
      source = await readFile(inquiryPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    const insert = db.prepare(
      "INSERT OR IGNORE INTO inquiries(id,body) VALUES (?,?)",
    );
    transaction(() => {
      for (const line of source.split("\n")) {
        if (!line.trim()) continue;
        let record;
        try {
          record = JSON.parse(line);
        } catch {
          continue; /* An active JSONL writer may have a partial last line. */
        }
        if (object(record) && typeof record.id === "string" && record.createdAt)
          insert.run(record.id, JSON.stringify(record));
      }
    });
  }
  const inquiryRecord = (row) => ({
    ...JSON.parse(row.body),
    status: row.status,
    note: row.note,
    version: row.version,
  });

  async function handle(request, response) {
    const route = request.url?.split("?")[0] || "/";
    if (
      !["/api/content", "/api/blog"].includes(route) &&
      route !== "/api/cms" &&
      !route.startsWith("/api/cms/") &&
      !route.startsWith("/api/cms-media/")
    )
      return false;
    try {
      const method = request.method;
      if (route === "/api/content" || route === "/api/blog") {
        if (method !== "GET")
          throw new CmsError(405, "Используйте GET для просмотра материалов.");
        reply(
          response,
          200,
          route === "/api/content" ? getPublicContent() : getPublicBlog(),
        );
        return true;
      }
      if (route.startsWith("/api/cms-media/")) {
        if (!["GET", "HEAD"].includes(method))
          throw new CmsError(405, "Используйте GET для просмотра фотографии.");
        if (!/^\/api\/cms-media\/[a-f0-9]{64}\.webp$/.test(route))
          throw new CmsError(404, "Фотография не найдена.");
        let bytes;
        try {
          bytes = await readFile(
            resolve(mediaDirectory, route.split("/").pop()),
          );
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          throw new CmsError(404, "Фотография не найдена.");
        }
        response.writeHead(200, {
          "Content-Type": "image/webp",
          "Content-Length": bytes.length,
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        });
        response.end(method === "HEAD" ? undefined : bytes);
        return true;
      }
      if (route === "/api/cms/session" && method === "GET") {
        reply(response, 200, sessionPayload(sessionFor(request)));
        return true;
      }
      if (
        ["/api/cms/setup", "/api/cms/login"].includes(route) &&
        method === "POST"
      ) {
        requireOrigin(request);
        throttled(request);
        const input = await readJson(request);
        if (route === "/api/cms/setup") {
          if (hasAdmin())
            throw new CmsError(
              409,
              "Администратор уже создан. Войдите с логином и паролем.",
            );
          if (!object(input) || !compare(input.token, setupToken))
            throw new CmsError(403, "Неверный код первоначальной настройки.");
          validateCredentials(input);
          const salt = randomToken();
          const passwordHash = await hashPassword(input.password, salt);
          transaction(() => {
            if (hasAdmin())
              throw new CmsError(409, "Администратор уже создан.");
            db.prepare(
              "INSERT INTO admins(username,salt,password_hash,created_at) VALUES (?,?,?,?)",
            ).run(
              input.username,
              salt,
              passwordHash,
              new Date(now()).toISOString(),
            );
          });
          setupToken = undefined;
          await unlink(setupTokenPath).catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
          attempts.delete(request.socket.remoteAddress || "unknown");
          reply(
            response,
            201,
            establishSession(request, response, input.username),
          );
          return true;
        }
        if (
          !object(input) ||
          typeof input.username !== "string" ||
          input.username.length > 80 ||
          typeof input.password !== "string" ||
          input.password.length > 200
        )
          throw new CmsError(401, "Неверный логин или пароль.");
        const admin = db
          .prepare("SELECT * FROM admins WHERE username=?")
          .get(input.username);
        const candidate = await hashPassword(
          input.password,
          admin?.salt || "cms-dummy-auth-salt",
        );
        if (!admin || !compare(candidate, admin.password_hash))
          throw new CmsError(401, "Неверный логин или пароль.");
        attempts.delete(request.socket.remoteAddress || "unknown");
        reply(
          response,
          200,
          establishSession(request, response, admin.username),
        );
        return true;
      }
      const mutation = !["GET", "HEAD"].includes(method);
      const session = requireSession(request, mutation);
      if (route === "/api/cms/logout" && method === "POST") {
        db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
          session.token_hash,
        );
        response.setHeader(
          "Set-Cookie",
          `${COOKIE}=; Path=/api/cms; HttpOnly; SameSite=Strict; Max-Age=0`,
        );
        reply(response, 200, { authenticated: false, setupRequired: false });
        return true;
      }
      if (route === "/api/cms/content" && method === "GET") {
        reply(response, 200, {
          products: entities("products"),
          categories: structuredClone(catalogCategories),
          posts: entities("posts"),
          blogCategories: structuredClone(blogCategories),
        });
        return true;
      }
      if (route === "/api/cms/inquiries" && method === "GET") {
        await syncInquiries();
        reply(response, 200, {
          inquiries: db
            .prepare("SELECT * FROM inquiries ORDER BY rowid DESC")
            .all()
            .map(inquiryRecord),
        });
        return true;
      }
      const inquiryMatch = route.match(
        /^\/api\/cms\/inquiries\/([a-zA-Z0-9_-]+)$/,
      );
      if (inquiryMatch && method === "PATCH") {
        const input = await readJson(request);
        if (
          !object(input) ||
          Object.keys(input).some(
            (key) => !["status", "note", "version"].includes(key),
          ) ||
          !["new", "in_progress", "completed", "spam"].includes(input.status)
        )
          throw new CmsError(422, "Укажите корректный статус заявки.");
        text(input.note, "заметка", 10000);
        version(input.version);
        await syncInquiries();
        const item = transaction(() => {
          const previous = db
            .prepare("SELECT * FROM inquiries WHERE id=?")
            .get(inquiryMatch[1]);
          if (!previous) throw new CmsError(404, "Заявка не найдена.");
          if (previous.version !== input.version)
            throw new CmsError(
              409,
              "Заявка уже изменена. Обновите список перед сохранением.",
            );
          db.prepare(
            "UPDATE inquiries SET status=?,note=?,version=version+1 WHERE id=?",
          ).run(input.status, input.note, inquiryMatch[1]);
          return inquiryRecord(
            db
              .prepare("SELECT * FROM inquiries WHERE id=?")
              .get(inquiryMatch[1]),
          );
        });
        reply(response, 200, { item });
        return true;
      }
      const collectionMatch = route.match(
        /^\/api\/cms\/(products|posts)(?:\/([a-zA-Z0-9_-]+))?$/,
      );
      if (collectionMatch) {
        const [, kind, id] = collectionMatch;
        if ((!id && method === "POST") || (id && method === "PUT")) {
          let input = await readJson(request);
          if (!object(input)) throw new CmsError(422, "Ожидается запись.");
          if (!id && input.id === undefined)
            input.id =
              kind === "posts"
                ? input.slug
                : `product-${randomBytes(8).toString("hex")}`;
          if (id && input.id !== id)
            throw new CmsError(422, "Идентификатор записи нельзя изменить.");
          identifier(input.id);
          if (id) version(input.version);
          const checked =
            kind === "products"
              ? validateProduct(input, catalogCategories)
              : validatePost(input, blogCategories);
          delete checked.version;
          delete checked.updatedAt;
          const item = transaction(() => {
            const previous = db
              .prepare("SELECT * FROM entities WHERE kind=? AND id=?")
              .get(kind, checked.id);
            if (id && !previous) throw new CmsError(404, "Запись не найдена.");
            if (!id && previous)
              throw new CmsError(
                409,
                "Запись с таким идентификатором уже существует.",
              );
            if (id && previous.version !== input.version)
              throw new CmsError(
                409,
                "Запись уже изменена. Обновите страницу перед сохранением.",
              );
            const entitySlug = kind === "posts" ? checked.slug : checked.id;
            const duplicate = db
              .prepare(
                "SELECT id FROM entities WHERE kind=? AND slug=? AND id<>?",
              )
              .get(kind, entitySlug, checked.id);
            if (duplicate)
              throw new CmsError(
                409,
                "Этот адрес уже используется другой записью.",
              );
            const nextVersion = previous ? previous.version + 1 : 1;
            db.prepare(
              "INSERT INTO entities(kind,id,slug,status,version,updated_at,body) VALUES (?,?,?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET slug=excluded.slug,status=excluded.status,version=excluded.version,updated_at=excluded.updated_at,body=excluded.body",
            ).run(
              kind,
              checked.id,
              entitySlug,
              checked.status,
              nextVersion,
              new Date(now()).toISOString(),
              JSON.stringify(checked),
            );
            return entity(
              db
                .prepare("SELECT * FROM entities WHERE kind=? AND id=?")
                .get(kind, checked.id),
            );
          });
          reply(response, id ? 200 : 201, { item });
          return true;
        }
        if (id && method === "DELETE") {
          const currentVersion = Number(
            new URL(request.url, "http://localhost").searchParams.get(
              "version",
            ),
          );
          version(currentVersion);
          transaction(() => {
            const previous = db
              .prepare("SELECT version FROM entities WHERE kind=? AND id=?")
              .get(kind, id);
            if (!previous) throw new CmsError(404, "Запись не найдена.");
            if (previous.version !== currentVersion)
              throw new CmsError(
                409,
                "Запись уже изменена. Обновите страницу перед удалением.",
              );
            db.prepare("DELETE FROM entities WHERE kind=? AND id=?").run(
              kind,
              id,
            );
          });
          reply(response, 200, { deleted: true, id });
          return true;
        }
        throw new CmsError(405, "Метод запроса не поддерживается.");
      }
      if (route === "/api/cms/media" && method === "POST") {
        const contentType = request.headers["content-type"]
          ?.split(";")[0]
          .trim()
          .toLowerCase();
        if (!["image/jpeg", "image/png", "image/webp"].includes(contentType))
          throw new CmsError(415, "Загрузите JPG, PNG или WebP.");
        const bytes = await readBytes(request, IMAGE_LIMIT);
        let output;
        try {
          const pipeline = sharp(bytes, {
            limitInputPixels: 40000000,
            animated: false,
            failOn: "warning",
          });
          const meta = await pipeline.metadata();
          if (
            !["jpeg", "png", "webp"].includes(meta.format) ||
            (meta.pages || 1) > 1 ||
            !meta.width ||
            !meta.height
          )
            throw new Error("Unsupported image");
          output = await pipeline
            .rotate()
            .resize({
              width: 2400,
              height: 2400,
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: 88 })
            .toBuffer({ resolveWithObject: true });
        } catch {
          throw new CmsError(
            422,
            "Не удалось прочитать изображение. Максимум: 12 МБ и 40 миллионов пикселей.",
          );
        }
        const filename = `${digest(output.data)}.webp`;
        // Publish only the fully written image; equal content digests always contain the same bytes.
        const temporaryPath = resolve(mediaDirectory, `.${randomToken()}.tmp`);
        try {
          await writeFile(temporaryPath, output.data, {
            flag: "wx",
            mode: 0o600,
          });
          await rename(temporaryPath, resolve(mediaDirectory, filename));
        } finally {
          await unlink(temporaryPath).catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
        }
        reply(response, 201, {
          url: `/api/cms-media/${filename}`,
          width: output.info.width,
          height: output.info.height,
        });
        return true;
      }
      throw new CmsError(404, "Адрес CMS не найден.");
    } catch (error) {
      const status =
        error instanceof CmsError
          ? error.statusCode
          : ["/api/content", "/api/blog"].includes(route)
            ? 503
            : 500;
      if (status >= 500)
        console.error("CMS operation failed:", error.code || error.name);
      if (status === 429) response.setHeader("Retry-After", "900");
      reply(response, status, {
        error: {
          message:
            status >= 500
              ? "Не удалось выполнить действие. Повторите попытку."
              : error.message,
        },
      });
    }
    return true;
  }
  let closed = false;
  return {
    handle,
    getPublicContent,
    getPublicBlog,
    dataDirectory,
    mediaDirectory,
    setupTokenPath,
    databasePath,
    close() {
      if (!closed) {
        closed = true;
        db.close();
      }
    },
  };
}
