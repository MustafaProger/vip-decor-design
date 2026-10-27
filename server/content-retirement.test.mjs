import test from "node:test";
import assert from "node:assert/strict";
import { cleanPublicContent, cleanPublicBlog, isRetiredPath } from "./content-retirement.mjs";
import { renderSitemap } from "./site.mjs";

test("retirement removes publications and links without changing stored data or products", () => {
  const content = {
    pages: [{ path: "/pokrivala" }, { path: "/tkani", links: [
      { href: "https://vip2d.ru/podyshki?ref=old#top" }, { href: "/tyl" },
    ], html: '<p>Ткани</p><a href="/pokrivala/">Покрывала</a><a href="/tyl">Тюль</a>' }],
    categories: [{ path: "/podyshki" }, { path: "/tkani" }],
    products: [{ id: "existing", price: 123, description: "Ткань для подушек" }],
  };
  const before = structuredClone(content);
  const cleaned = cleanPublicContent(content);
  assert.deepEqual(content, before);
  assert.deepEqual(cleaned.products, before.products);
  assert.equal(cleaned.pages.length, 1);
  assert.deepEqual(cleaned.pages[0].links, [{ href: "/tyl" }]);
  assert.doesNotMatch(cleaned.pages[0].html, /pokrivala|Покрывала/);
  assert.match(cleaned.pages[0].html, /href="\/tyl"/);
  assert.deepEqual(cleaned.categories, [{ path: "/tkani" }]);
  assert.deepEqual(cleanPublicContent(cleaned), cleaned);
});

test("retired blog articles disappear with references and empty categories, retaining useful posts", () => {
  const blog = { categories: [{ slug: "curtains" }, { slug: "bedspreads" }], posts: [
    { slug: "kak-vybrat-razmer-pokryvala", category: "bedspreads" },
    { slug: "curtains", category: "curtains", related: ["kak-vybrat-razmer-pokryvala"],
      sections: [{ links: [{ href: "/blog/kak-vybrat-razmer-pokryvala" }, { href: "/selection" }] }] },
  ] };
  const before = structuredClone(blog);
  const cleaned = cleanPublicBlog(blog);
  assert.deepEqual(blog, before);
  assert.equal(cleaned.posts.length, 1);
  assert.deepEqual(cleaned.posts[0].related, []);
  assert.deepEqual(cleaned.posts[0].sections[0].links, [{ href: "/selection" }]);
  assert.deepEqual(cleaned.categories, [{ slug: "curtains" }]);
  const sitemap = renderSitemap({ pages: [{ path: "/pokrivala" }, { path: "/kakpodobrat" }] }, blog);
  assert.doesNotMatch(sitemap, /pokrivala|kak-vybrat-razmer-pokryvala/);
  assert.match(sitemap, /kakpodobrat/);
});

test("retirement recognizes encoded and trailing slash URLs only for this site", () => {
  assert.equal(isRetiredPath("https://www.vip2d.ru/%70okrivala/?ref=old"), true);
  assert.equal(isRetiredPath("https://example.com/pokrivala"), false);
  assert.equal(isRetiredPath("/pokrivala-other"), false);
  assert.equal(isRetiredPath("/selection"), false);
});
