import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSiteHandler } from "./site.mjs";

async function withSite(run) {
  const directory = await mkdtemp(join(tmpdir(), "vip-site-test-"));
  const dist = join(directory, "dist");
  await mkdir(join(dist, "server"), { recursive: true });
  await mkdir(join(dist, "assets"));
  await mkdir(join(dist, "admin"));
  await writeFile(
    join(dist, "admin/manifest.webmanifest"),
    '{"start_url":"/admin"}',
  );
  await writeFile(
    join(dist, "admin-sw.js"),
    'self.addEventListener("push", () => {});',
  );
  await mkdir(join(dist, "data"));
  await mkdir(join(dist, "blog/first"), { recursive: true });
  await writeFile(
    join(dist, "index.html"),
    '<!doctype html><html><head><title>Website</title></head><body><div id="root"></div></body></html>',
  );
  await writeFile(join(dist, "server/render.js"), "private-server-code");
  await writeFile(
    join(dist, "assets/app-abc123.js"),
    "public-application-code",
  );
  await writeFile(
    join(dist, "data/site-content.json"),
    '{"products":[{"id":"stale"}]}',
  );
  await writeFile(join(directory, "private.txt"), "outside-private-file");
  await writeFile(join(dist, ".env"), "private-environment");
  await symlink(join(directory, "private.txt"), join(dist, "outside.txt"));
  await symlink(join(dist, "server/render.js"), join(dist, "bundle.js"));
  await writeFile(join(dist, "sitemap.xml"), "stale-sitemap");
  await writeFile(join(dist, "blog/first/index.html"), "stale-blog");
  await symlink(
    join(dist, "data/site-content.json"),
    join(dist, "old-catalog.json"),
  );
  await symlink(join(dist, "sitemap.xml"), join(dist, "cached-sitemap.xml"));
  await symlink(
    join(dist, "blog/first/index.html"),
    join(dist, "old-blog.html"),
  );
  const state = {
    content: {
      pages: [
        { path: "/company", url: "https://vip2d.ru/company" },
        { path: "/page13486315.html" },
      ],
      products: [{ id: "current", url: "https://vip2d.ru/product/current" }],
      categories: [],
    },
    blog: {
      categories: [{ slug: "interior", title: "Интерьер" }],
      posts: [
        {
          slug: "first",
          title: "Первая статья",
          category: "interior",
          status: "published",
        },
      ],
    },
  };
  const cmsService = {
    getPublicContent: async () => structuredClone(state.content),
    getPublicBlog: async () => structuredClone(state.blog),
  };
  const rendererCalls = [];
  const handler = await createSiteHandler({
    distDirectory: dist,
    renderBlogDocument: async (url, template, blog) => {
      rendererCalls.push({ url, blog });
      const titles = blog.posts.map((post) => post.title).join("; ");
      return template.replace(
        '<div id="root"></div>',
        `<main>${titles}</main>`,
      );
    },
  });
  const server = createServer((request, response) =>
    handler(request, response, { cmsService }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const rawGet = (path) =>
    new Promise((resolve, reject) => {
      const request = httpRequest(base, { path }, (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            text: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      });
      request.on("error", reject);
      request.end();
    });
  try {
    await run({ base, state, rendererCalls, rawGet, dist });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

test("blog renders current content and removes unpublished article and category routes immediately", async () => {
  await withSite(async ({ base, state, rendererCalls }) => {
    const first = await fetch(base + "/blog/first");
    assert.equal(first.status, 200);
    assert.match(await first.text(), /Первая статья/);
    state.blog.posts[0].title = "Изменённая статья";
    const changed = await fetch(base + "/blog/first");
    assert.match(await changed.text(), /Изменённая статья/);
    assert.equal(rendererCalls[0].blog.posts[0].title, "Первая статья");
    const publishedSitemap = await fetch(base + "/sitemap.xml").then(
      (response) => response.text(),
    );
    assert.match(publishedSitemap, /\/blog\/first/);
    assert.match(publishedSitemap, /\/blog\/category\/interior/);
    state.blog.posts[0].status = "draft";
    for (const path of [
      "/blog/first",
      "/blog/first/",
      "/blog/category/interior",
    ]) {
      const hidden = await fetch(base + path, { redirect: "manual" });
      assert.equal(hidden.status, 404);
      assert.match(hidden.headers.get("x-robots-tag"), /noindex/);
      assert.doesNotMatch(await hidden.text(), /Изменённая статья/);
    }
    const sitemap = await fetch(base + "/sitemap.xml").then((response) =>
      response.text(),
    );
    assert.doesNotMatch(sitemap, /\/blog\/first|\/blog\/category\/interior/);
    assert.equal((await fetch(base + "/blog")).status, 200);
  });
});

test("blog redirects only known trailing-slash URLs and supports HEAD without a body", async () => {
  await withSite(async ({ base }) => {
    const redirect = await fetch(base + "/blog/first/?source=card", {
      redirect: "manual",
    });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get("location"), "/blog/first?source=card");
    const encoded = await fetch(base + "/blog/%66irst", { redirect: "manual" });
    assert.equal(encoded.status, 301);
    assert.equal(encoded.headers.get("location"), "/blog/first");
    const unknown = await fetch(base + "/blog/missing/", {
      redirect: "manual",
    });
    assert.equal(unknown.status, 404);
    const head = await fetch(base + "/blog/first", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.ok(Number(head.headers.get("content-length")) > 0);
    assert.equal(await head.text(), "");
    assert.equal((await fetch(base + "/blog", { method: "POST" })).status, 405);
  });
});

test("retired directions and articles return 410 for GET and HEAD including old URL variants", async () => {
  await withSite(async ({ base }) => {
    for (const path of ["/podyshki", "/pokrivala/", "/%70okrivala?source=old",
      "/blog/kak-vybrat-razmer-pokryvala", "/blog/kak-sochetat-shtory-pokryvalo-i-podushki/"]) {
      for (const method of ["GET", "HEAD"]) {
        const response = await fetch(base + path, { method, redirect: "manual" });
        assert.equal(response.status, 410, `${method} ${path}`);
        assert.match(response.headers.get("x-robots-tag"), /noindex/);
        assert.equal(response.headers.get("location"), null);
        const body = await response.text();
        if (method === "HEAD") assert.equal(body, "");
        else assert.match(body, /href="\/catalog"/);
      }
    }
    for (const path of ["/selection", "/kakpodobrat", "/price", "/dostavka", "/page13486315.html"]) {
      assert.equal((await fetch(base + path)).status, 200);
    }
  });
});

test("live catalog and sitemap exclude stale, draft and external product URLs", async () => {
  await withSite(async ({ base, state }) => {
    const current = await fetch(base + "/data/site-content.json");
    assert.equal(current.headers.get("cache-control"), "no-store");
    assert.equal((await current.json()).products[0].id, "current");
    state.content.products = [
      { id: "new", url: "https://vip2d.ru/product/new" },
      { id: "hidden", url: "https://vip2d.ru/product/hidden", status: "draft" },
      { id: "external", url: "https://example.com/product/external" },
    ];
    state.content.pages.push(
      { path: "/admin" },
      { path: "/blog/deleted" },
      { path: "/product/stale" },
    );
    const sitemap = await fetch(base + "/sitemap.xml").then((response) =>
      response.text(),
    );
    assert.match(sitemap, /https:\/\/vip2d.ru\/product\/new/);
    assert.doesNotMatch(
      sitemap,
      /\/product\/current|hidden|external|\/admin|deleted|stale/,
    );
    assert.match(sitemap, /\/company/);
    assert.equal(
      (
        await fetch(base + "/data/site-content.json").then((response) =>
          response.json(),
        )
      ).products[0].id,
      "new",
    );
  });
});

test("static serving blocks server bundles, traversal, hidden files, symlinks and directories", async () => {
  await withSite(async ({ base, rawGet }) => {
    const asset = await fetch(base + "/assets/app-abc123.js");
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), /javascript/);
    assert.match(asset.headers.get("cache-control"), /immutable/);
    assert.equal(await asset.text(), "public-application-code");
    for (const path of [
      "/server/render.js",
      "/%73erver/render.js",
      "/server",
      "/.env",
      "/%2eenv",
      "/../private.txt",
      "/%2e%2e/private.txt",
      "/assets/%2e%2e/server/render.js",
      "/assets\\..\\server\\render.js",
      "/outside.txt",
      "/bundle.js",
      "/assets",
      "/assets/",
      "/assets/missing.js",
      "/api/missing",
    ]) {
      const response = await rawGet(path);
      assert.equal(response.status, 404, path);
      assert.doesNotMatch(
        response.text,
        /private-server-code|private-file|private-environment/,
      );
    }
    assert.equal((await rawGet("/%E0%A4%A")).status, 400);
  });
});

test("SPA and legacy HTML routes work, while admin HTML and headers prohibit indexing", async () => {
  await withSite(async ({ base }) => {
    for (const path of [
      "/",
      "/catalog",
      "/product/current",
      "/page13486315.html",
    ]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
      assert.match(await response.text(), /id="root"/);
    }
    for (const path of ["/admin", "/admin/products"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
      assert.match(
        await response.text(),
        /name="robots" content="noindex, nofollow"/,
      );
    }
    assert.equal((await fetch(base + "/unknown.html")).status, 404);
  });
});

test("static aliases cannot expose obsolete catalog, sitemap or prerendered blog records", async () => {
  await withSite(async ({ base, rawGet }) => {
    for (const path of [
      "/data//site-content.json",
      "/data/%2fsite-content.json",
      "/DATA/site-content.json",
      "/SITEMAP.XML",
      "/BLOG/first/index.html",
      "/old-catalog.json",
      "/cached-sitemap.xml",
      "/old-blog.html",
    ]) {
      const response = await rawGet(path);
      assert.equal(response.status, 404, path);
      assert.doesNotMatch(response.text, /stale/);
    }
    assert.equal(
      (
        await fetch(base + "/data/site-content.json").then((response) =>
          response.json(),
        )
      ).products[0].id,
      "current",
    );
    const html = await fetch(base + "/blog/first").then((response) =>
      response.text(),
    );
    assert.match(html, /Первая статья/);
    assert.doesNotMatch(html, /stale-blog/);
  });
});

test("admin install assets do not shadow the authenticated app route", async () => {
  await withSite(async ({ base }) => {
    for (const path of ["/admin", "/admin/", "/admin?inquiry=test-id"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("x-robots-tag"), /noindex/);
      assert.match(await response.text(), /manifest.webmanifest/);
    }
    const manifest = await fetch(base + "/admin/manifest.webmanifest");
    assert.match(
      manifest.headers.get("content-type"),
      /application\/manifest\+json/,
    );
    const worker = await fetch(base + "/admin-sw.js");
    assert.equal(worker.status, 200);
    assert.equal(worker.headers.get("cache-control"), "no-cache");
  });
});


test("images stay cached and revalidate without a body, while replacements invalidate validators", async () => {
  await withSite(async ({ base, dist }) => {
    await mkdir(join(dist, "media"));
    const file = join(dist, "media/photo.webp");
    await writeFile(file, "photo-v1");
    const first = await fetch(base + "/media/photo.webp");
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "public, max-age=604800");
    const etag = first.headers.get("etag");
    const modified = first.headers.get("last-modified");
    assert.ok(etag);
    assert.ok(modified);
    for (const headers of [{ "If-None-Match": etag }, { "If-Modified-Since": modified }]) {
      const cached = await fetch(base + "/media/photo.webp", { headers });
      assert.equal(cached.status, 304);
      assert.equal(await cached.text(), "");
    }
    const head = await fetch(base + "/media/photo.webp", { method: "HEAD" });
    assert.equal(head.headers.get("etag"), etag);
    assert.equal(await head.text(), "");
    await writeFile(file, "photo-v2-replaced");
    const changed = await fetch(base + "/media/photo.webp", { headers: { "If-None-Match": etag, "If-Modified-Since": new Date(Date.now() + 86400000).toUTCString() } });
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.get("etag"), etag);
    assert.equal(await changed.text(), "photo-v2-replaced");
    const missing = await fetch(base + "/media/missing.webp");
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("cache-control"), "no-store");
  });
});
