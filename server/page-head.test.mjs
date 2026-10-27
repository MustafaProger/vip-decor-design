import test from "node:test";
import assert from "node:assert/strict";
import { publicPageHead } from "./page-head.mjs";

const template =
  '<html><head><title>Old</title><meta name="description" content="old"></head><body><div id="root"></div></body></html>';
test("public HTML includes current CMS product metadata without JavaScript", () => {
  const content = {
    products: [
      {
        id: "101",
        title: "Ткань <Свет> & тень",
        sku: "A-10",
        description: "<p>Мягкая &amp; плотная</p>",
        url: "https://vip2d.ru/tkani/tproduct/101",
        images: [],
      },
    ],
  };
  const result = publicPageHead("/tkani/tproduct/101", template, content);
  assert.equal(result.status, 200);
  assert.match(result.html, /Ткань &lt;Свет&gt; &amp; тень · A-10/);
  assert.match(result.html, /Мягкая &amp; плотная/);
  assert.match(
    result.html,
    /rel="canonical" href="https:\/\/vip2d.ru\/tkani\/tproduct\/101"/,
  );
  assert.equal((result.html.match(/<title>/g) || []).length, 1);
  assert.equal((result.html.match(/name="description"/g) || []).length, 1);
  assert.equal(publicPageHead("/product/101", template, content).status, 200);
});
test("known pages have their own metadata and unknown URLs are 404", () => {
  assert.match(
    publicPageHead("/catalog", template, {}).html,
    /Каталог штор, тканей и карнизов/,
  );
  assert.equal(publicPageHead("/does-not-exist", template, {}).status, 404);
  assert.match(
    publicPageHead("/does-not-exist", template, {}).html,
    /noindex, follow/,
  );
  assert.equal(publicPageHead("/cart", template, {}).status, 200);
});
