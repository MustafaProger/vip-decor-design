import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createInquiryServer } from "./index.mjs";
import { validateProduct, validatePost } from "./cms-validation.mjs";

const ORIGIN = "http://localhost:5180";
const credentials = {
  username: "studio",
  password: "test-password-long-enough",
};
const product = {
  id: "seed-product",
  title: "Ткань",
  description: "Описание ткани",
  price: 1234,
  image: "/images/fabric.webp",
  images: ["/images/fabric.webp"],
  url: "/product/seed-product",
  category: "Ткани",
  categoryPath: "/tkani",
  categoryPaths: ["/tkani"],
  variants: {
    editions: [
      {
        uid: 1,
        sku: "SKU-1",
        price: "1 234.00",
        quantity: "5",
        img: "",
        Цвет: "Белый",
      },
    ],
    properties: [
      { title: "Размер", values: "1=+0\n2=+1234", params: { type: "single" } },
    ],
    options: [],
    rawPrice: "1234",
  },
};
const post = {
  slug: "seed-post",
  status: "published",
  category: "textiles",
  title: "Ткани для дома",
  seoTitle: "Ткани для дома — рекомендации",
  description: "Подбираем ткани",
  excerpt: "Рекомендации",
  intro: "Начните с образца.",
  image: {
    src: "/images/post.webp",
    alt: "Образцы ткани",
    caption: "Образцы",
    width: 1200,
    height: 675,
    variants: [],
  },
  sections: [
    { id: "colour", title: "Цвет", paragraphs: ["Сравните цвет у окна."] },
  ],
  sources: [],
  related: [],
};
const seedContent = {
  crawledAt: "2026-09-19",
  pages: [],
  products: [product],
  categories: [
    { path: "/tkani", title: "Ткани", description: "Ткани", image: "" },
  ],
  contacts: { phones: [], email: "", address: "", socials: [] },
  gallery: [],
};
const seedBlog = {
  posts: [post],
  categories: [
    { slug: "textiles", title: "Текстиль", description: "Ткани и шторы" },
  ],
};

async function fixture(t, cmsOptions = {}) {
  const directory = await mkdtemp(join(tmpdir(), "vip-cms-test-"));
  let server;
  let base;
  let cookie = "";
  let csrf = "";
  const start = async () => {
    server = await createInquiryServer({
      dataDirectory: directory,
      allowedOrigins: [ORIGIN],
      reviewService: { getSnapshot: async () => ({ reviews: [] }) },
      cmsOptions: { seedContent, seedBlog, ...cmsOptions },
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const close = async () => {
    if (server?.listening)
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
  };
  await start();
  t.after(async () => {
    await close();
    await rm(directory, { recursive: true, force: true });
  });
  const request = (
    path,
    {
      method = "GET",
      body,
      headers = {},
      authenticated = true,
      origin = ORIGIN,
    } = {},
  ) =>
    fetch(base + path, {
      method,
      headers: {
        ...(origin ? { Origin: origin } : {}),
        ...(authenticated && cookie
          ? { Cookie: cookie, "X-CSRF-Token": csrf }
          : {}),
        ...(body === undefined || Buffer.isBuffer(body)
          ? {}
          : { "Content-Type": "application/json" }),
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : Buffer.isBuffer(body)
            ? body
            : JSON.stringify(body),
    });
  const setSession = async (response) => {
    cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
    const payload = await response.json();
    csrf = payload.csrfToken || "";
    return payload;
  };
  const setup = async () => {
    const token = (
      await readFile(join(directory, "cms-setup-token"), "utf8")
    ).trim();
    const response = await request("/api/cms/setup", {
      method: "POST",
      body: { ...credentials, token },
    });
    assert.equal(response.status, 201);
    await setSession(response);
  };
  return {
    directory,
    request,
    setup,
    setSession,
    close,
    start,
    service: () => server.cmsService,
  };
}

async function item(response, status = 200) {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body.item;
}

test("private data is inaccessible before login; one-time setup and CSRF protect mutations", async (t) => {
  const f = await fixture(t, { cookieSecure: true });
  assert.deepEqual(await (await f.request("/api/cms/session")).json(), {
    authenticated: false,
    setupRequired: true,
  });
  for (const path of ["/api/cms/content", "/api/cms/inquiries"])
    assert.equal((await f.request(path)).status, 401);
  assert.equal(
    (await stat(join(f.directory, "cms-setup-token"))).mode & 0o777,
    0o600,
  );
  assert.equal(
    (
      await f.request("/api/cms/setup", {
        method: "POST",
        origin: null,
        body: credentials,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request("/api/cms/setup", {
        method: "POST",
        body: { ...credentials, token: "я".repeat(64) },
      })
    ).status,
    403,
  );
  const token = (
    await readFile(join(f.directory, "cms-setup-token"), "utf8")
  ).trim();
  assert.equal(
    (
      await f.request("/api/cms/setup", {
        method: "POST",
        body: { ...credentials, password: "short", token },
      })
    ).status,
    422,
  );
  await f.setup();
  await assert.rejects(readFile(join(f.directory, "cms-setup-token")), {
    code: "ENOENT",
  });
  assert.equal(
    (await stat(join(f.directory, "cms.sqlite"))).mode & 0o777,
    0o600,
  );
  assert.equal(
    (
      await f.request("/api/cms/setup", {
        method: "POST",
        body: { ...credentials, token },
      })
    ).status,
    409,
  );
  const active = await (await f.request("/api/cms/session")).json();
  assert.equal(active.authenticated, true);
  assert.equal(active.username, "studio");
  assert.match(active.csrfToken, /^[a-f0-9]{64}$/);
  assert.equal(
    (
      await f.request("/api/cms/products", {
        method: "POST",
        headers: { "X-CSRF-Token": "" },
        body: { ...product, id: "new", status: "draft" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request("/api/cms/products", {
        method: "POST",
        origin: "https://attacker.example",
        body: { ...product, id: "new", status: "draft" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request("/api/cms/products", {
        method: "POST",
        headers: { "Sec-Fetch-Site": "cross-site" },
        body: { ...product, id: "new", status: "draft" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await f.request("/api/cms/logout", { method: "POST" })).status,
    200,
  );
  assert.equal((await f.request("/api/cms/content")).status, 401);
  assert.equal(
    (
      await f.request("/api/cms/login", {
        method: "POST",
        body: { ...credentials, password: "incorrect" },
      })
    ).status,
    401,
  );
  const login = await f.request("/api/cms/login", {
    method: "POST",
    body: credentials,
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  assert.match(login.headers.get("set-cookie"), /; Secure/);
  await f.setSession(login);
  assert.equal((await f.request("/api/cms/content")).status, 200);
});

test("sessions expire and failed authentication is rate limited", async (t) => {
  let time = Date.now();
  const f = await fixture(t, { now: () => time, maxAuthAttempts: 3 });
  await f.setup();
  time += 13 * 60 * 60 * 1000;
  assert.equal(
    (await (await f.request("/api/cms/session")).json()).authenticated,
    false,
  );
  assert.equal((await f.request("/api/cms/content")).status, 401);
  for (let i = 0; i < 3; i++)
    assert.equal(
      (
        await f.request("/api/cms/login", {
          method: "POST",
          body: { ...credentials, password: "wrong" },
        })
      ).status,
      401,
    );
  const limited = await f.request("/api/cms/login", {
    method: "POST",
    body: credentials,
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "900");
  time += 16 * 60 * 1000;
  assert.equal(
    (await f.request("/api/cms/login", { method: "POST", body: credentials }))
      .status,
    200,
  );
});

test("product CRUD persists, isolates drafts, rejects stale edits and does not reseed deleted data", async (t) => {
  const f = await fixture(t);
  await f.setup();
  const draft = await item(
    await f.request("/api/cms/products", {
      method: "POST",
      body: { ...product, id: "new-product", status: "draft" },
    }),
    201,
  );
  assert.equal(draft.version, 1);
  assert.deepEqual(draft.variants, product.variants);
  assert.equal(
    (await (await f.request("/api/content", { authenticated: false })).json())
      .products.length,
    1,
  );
  assert.equal(
    (await f.request("/api/cms/products", { method: "POST", body: draft }))
      .status,
    409,
  );
  const published = await item(
    await f.request("/api/cms/products/new-product", {
      method: "PUT",
      body: { ...draft, status: "published", title: "Опубликованный товар" },
    }),
  );
  assert.equal(published.version, 2);
  assert.equal(
    (await (await f.request("/api/content")).json()).products.length,
    2,
  );
  assert.equal(
    (
      await f.request("/api/cms/products/new-product", {
        method: "PUT",
        body: draft,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request("/api/cms/products/new-product?version=1", {
        method: "DELETE",
      })
    ).status,
    409,
  );
  const unsafeBodies = [
    { image: "javascript:alert(1)" },
    { descriptionHtml: '<img src=x onerror="alert(1)">' },
    { title: "<script>alert(1)</script>" },
    { variants: { editions: [null] } },
    { variants: { editions: [{ img: "data:text/html,script" }] } },
    { categoryPath: "/not-a-category" },
    { unexpected: true },
  ];
  for (const unsafe of unsafeBodies)
    assert.equal(
      (
        await f.request("/api/cms/products/new-product", {
          method: "PUT",
          body: { ...published, ...unsafe },
        })
      ).status,
      422,
    );
  await f.close();
  await f.start();
  const afterRestart = await (await f.request("/api/cms/content")).json();
  assert.equal(
    afterRestart.products.find((p) => p.id === "new-product").title,
    "Опубликованный товар",
  );
  for (const existing of afterRestart.products)
    assert.equal(
      (
        await f.request(
          `/api/cms/products/${existing.id}?version=${existing.version}`,
          { method: "DELETE" },
        )
      ).status,
      200,
    );
  await f.close();
  await f.start();
  assert.deepEqual(
    (await (await f.request("/api/content")).json()).products,
    [],
  );
  assert.equal(
    (await f.request("/api/cms/unknown", { method: "POST", body: {} })).status,
    404,
  );
});

test("blog drafts stay private, publishing validates content, and dates are never invented", async (t) => {
  const f = await fixture(t);
  await f.setup();
  const blankDraft = {
    ...post,
    id: "draft-post",
    slug: "draft-post",
    status: "draft",
    seoTitle: "",
    description: "",
    excerpt: "",
    intro: "",
    image: { ...post.image, src: "", alt: "" },
    sections: [],
  };
  const draft = await item(
    await f.request("/api/cms/posts", { method: "POST", body: blankDraft }),
    201,
  );
  assert.equal(
    (await (await f.request("/api/blog", { authenticated: false })).json())
      .posts.length,
    1,
  );
  assert.equal(
    (
      await f.request("/api/cms/posts/draft-post", {
        method: "PUT",
        body: { ...draft, status: "published" },
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await f.request("/api/cms/posts/draft-post", {
        method: "PUT",
        body: { ...draft, slug: "category" },
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await f.request("/api/cms/posts/draft-post", {
        method: "PUT",
        body: { ...draft, slug: "seed-post" },
      })
    ).status,
    409,
  );
  const published = await item(
    await f.request("/api/cms/posts/draft-post", {
      method: "PUT",
      body: {
        ...post,
        ...draft,
        ...post,
        id: draft.id,
        slug: draft.slug,
        version: draft.version,
        status: "published",
      },
    }),
  );
  assert.equal(published.datePublished, undefined);
  assert.equal(published.dateModified, undefined);
  assert.equal((await (await f.request("/api/blog")).json()).posts.length, 2);
  const unsafePost = {
    ...published,
    sections: [
      {
        id: "unsafe",
        title: "Ссылка",
        links: [{ href: "javascript:alert(1)", label: "Нажать" }],
      },
    ],
  };
  assert.equal(
    (
      await f.request("/api/cms/posts/draft-post", {
        method: "PUT",
        body: unsafePost,
      })
    ).status,
    422,
  );
  const content = await (await f.request("/api/cms/content")).json();
  for (const existing of content.posts)
    await item(
      await f.request(`/api/cms/posts/${existing.id}`, {
        method: "PUT",
        body: { ...existing, status: "draft" },
      }),
    );
  assert.deepEqual(await (await f.request("/api/blog")).json(), {
    posts: [],
    categories: [],
  });
});

test("all imported catalog and blog entries can be edited without corrupting metadata", async () => {
  const content = JSON.parse(
    await readFile(
      new URL("../src/data/site-content.json", import.meta.url),
      "utf8",
    ),
  );
  const blog = JSON.parse(
    await readFile(new URL("../src/data/blog.json", import.meta.url), "utf8"),
  );
  assert.equal(content.products.length, 477);
  assert.equal(blog.posts.length, 3);
  for (const source of content.products) {
    const input = { ...source, status: "published", version: 1 };
    assert.deepEqual(
      validateProduct(input, content.categories),
      input,
      source.id,
    );
  }
  for (const source of blog.posts) {
    const input = {
      ...source,
      id: source.slug,
      status: "published",
      version: 1,
    };
    assert.deepEqual(validatePost(input, blog.categories), input, source.slug);
  }
});

test("existing and new inquiries appear only for authenticated admins and status notes persist", async (t) => {
  const f = await fixture(t);
  const historical = {
    id: randomUUID(),
    requestId: randomUUID(),
    fingerprint: "legacy",
    name: "Мария",
    phone: "+7 000 000-00-00",
    email: "test@example.com",
    context: "Карточка товара",
    comment: "Нужна консультация",
    createdAt: "2026-09-18T10:00:00.000Z",
    deliveryStatus: "local_only",
    selection: { room: "Гостиная", widthCm: 250 },
    consent: true,
  };
  await writeFile(
    join(f.directory, "inquiries.jsonl"),
    `${JSON.stringify(historical)}\n{partial`,
    { mode: 0o600 },
  );
  assert.equal(
    (await f.request("/api/cms/inquiries", { authenticated: false })).status,
    401,
  );
  await f.setup();
  const previous = (await (await f.request("/api/cms/inquiries")).json())
    .inquiries[0];
  assert.equal(previous.phone, historical.phone);
  assert.deepEqual(previous.selection, historical.selection);
  assert.equal(previous.status, "new");
  // Restart after the interrupted legacy write. The next record must remain readable.
  await f.close();
  await f.start();
  const submitted = await f.request("/api/inquiries", {
    method: "POST",
    authenticated: false,
    body: {
      name: "Покупатель",
      phone: "+7 000 000-00-01",
      consent: true,
      requestId: randomUUID(),
      comment: "Новая заявка",
    },
  });
  assert.equal(submitted.status, 201);
  const saved = await item(
    await f.request(`/api/cms/inquiries/${historical.id}`, {
      method: "PATCH",
      body: {
        status: "in_progress",
        note: "Уточнить ткань",
        version: previous.version,
      },
    }),
  );
  assert.equal(saved.version, 2);
  assert.equal(saved.note, "Уточнить ткань");
  assert.equal(
    (
      await f.request(`/api/cms/inquiries/${historical.id}`, {
        method: "PATCH",
        body: { status: "completed", note: "stale", version: 1 },
      })
    ).status,
    409,
  );
  await f.close();
  await f.start();
  const records = (await (await f.request("/api/cms/inquiries")).json())
    .inquiries;
  assert.equal(records.length, 2);
  assert.equal(
    records.find((entry) => entry.id === historical.id).note,
    "Уточнить ткань",
  );
  assert.equal(
    (await f.request("/api/inquiries", { authenticated: false })).status,
    405,
  );
  const publicContent = JSON.stringify(
    await (await f.request("/api/content", { authenticated: false })).json(),
  );
  assert.equal(publicContent.includes(historical.phone), false);
  assert.equal(publicContent.includes(historical.email), false);
});

test("uploads decode and transcode raster images, require authentication, and serve immutable safe files", async (t) => {
  const f = await fixture(t);
  const jpeg = await sharp({
    create: { width: 3000, height: 1800, channels: 3, background: "#cfbfa8" },
  })
    .jpeg()
    .toBuffer();
  assert.equal(
    (
      await f.request("/api/cms/media", {
        method: "POST",
        body: jpeg,
        headers: { "Content-Type": "image/jpeg" },
      })
    ).status,
    401,
  );
  await f.setup();
  assert.equal(
    (
      await f.request("/api/cms/media", {
        method: "POST",
        body: Buffer.from("<svg></svg>"),
        headers: { "Content-Type": "image/svg+xml" },
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await f.request("/api/cms/media", {
        method: "POST",
        body: Buffer.from("not an image"),
        headers: { "Content-Type": "image/jpeg" },
      })
    ).status,
    422,
  );
  const response = await f.request("/api/cms/media", {
    method: "POST",
    body: jpeg,
    headers: { "Content-Type": "image/jpeg" },
  });
  assert.equal(response.status, 201);
  const image = await response.json();
  assert.match(image.url, /^\/api\/cms-media\/[a-f0-9]{64}\.webp$/);
  assert.equal(image.width, 2400);
  assert.equal(image.height, 1440);
  const served = await f.request(image.url, { authenticated: false });
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/webp");
  assert.match(served.headers.get("cache-control"), /immutable/);
  const metadata = await sharp(
    Buffer.from(await served.arrayBuffer()),
  ).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.exif, undefined);
  assert.equal(
    (await f.request("/api/cms-media/cms.sqlite", { authenticated: false }))
      .status,
    404,
  );
  assert.equal(
    (
      await f.request("/api/cms-media/%2e%2e%2fcms.sqlite", {
        authenticated: false,
      })
    ).status,
    404,
  );
});
