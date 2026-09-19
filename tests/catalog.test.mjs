import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  catalogCategories,
  primaryProductCategory,
  catalogFamilies,
  catalogFilterGroups,
  categoryFamily,
  compareCatalogProducts,
  getCategoryCounts,
  matchesCatalogTypes,
  productCategoryPaths,
} from "../src/lib/catalog.ts";

const { products, categories: importedCategories } = JSON.parse(
  fs.readFileSync(
    new URL("../src/data/site-content.json", import.meta.url),
    "utf8",
  ),
);
const categories = catalogCategories(importedCategories);
const paths = (product) => product.categoryPaths || [product.categoryPath];

test("catalogue families hide empty directions and include every imported product", () => {
  const counts = getCategoryCounts(products);
  const visible = catalogFamilies(categories, counts);
  assert.deepEqual(
    visible.map((category) => category.path),
    [
      "/tkani",
      "/tyl",
      "/rulonnieshtori",
      "/zhaluzi",
      "/karnizi",
      "/derzhateli-dlya-shtor",
      "/kisti",
      "/kartini",
    ],
  );
  for (const product of products)
    assert.equal(
      visible.filter((category) =>
        productCategoryPaths(product).has(category.path),
      ).length,
      1,
      `Exactly one visible family for ${product.id}`,
    );
  assert.equal(
    new Set(products.map((product) => product.id)).size,
    products.length,
  );
  for (const category of visible)
    assert.equal(
      counts.get(category.path),
      products.filter((product) =>
        productCategoryPaths(product).has(category.path),
      ).length,
    );
});

test("legacy decor remains complete and textile types exclude sheers", () => {
  const orphanPainting = products.find(
    (product) =>
      paths(product).includes("/kartini") && !paths(product).includes("/decor"),
  );
  assert.ok(orphanPainting);
  assert.ok(productCategoryPaths(orphanPainting).has("/decor"));
  assert.ok(!paths(orphanPainting).includes("/decor"));
  const counts = getCategoryCounts(products);
  for (const category of categories.filter(
    (category) => categoryFamily(category.path) !== category.path,
  ))
    assert.equal(
      counts.get(category.path) || 0,
      products.filter(
        (product) =>
          paths(product).includes(category.path) &&
          (categoryFamily(category.path) !== "/tkani" ||
            !productCategoryPaths(product).has("/tyl")),
      ).length,
    );
});

test("default sort keeps all window textiles before interior products and preserves family order", () => {
  const sorted = [...products].sort(compareCatalogProducts);
  assert.deepEqual(
    new Set(sorted.map((product) => product.id)),
    new Set(products.map((product) => product.id)),
  );
  const isWindow = (product) =>
    ["/tkani", "/tyl", "/rulonnieshtori", "/zhaluzi"].some((path) =>
      productCategoryPaths(product).has(path),
    );
  const firstInterior = sorted.findIndex((product) => !isWindow(product));
  assert.ok(firstInterior > 0);
  assert.ok(sorted.slice(0, firstInterior).every(isWindow));
  assert.ok(sorted.slice(firstInterior).every((product) => !isWindow(product)));
  assert.deepEqual(
    sorted.filter((product) => paths(product).includes("/blekayt")),
    products.filter((product) => paths(product).includes("/blekayt")),
  );
});

test("contextual facets contain no family duplicates, empty choices, or fixed collection values", () => {
  const counts = getCategoryCounts(products);
  const familyPaths = catalogFamilies(categories, counts).map(
    (category) => category.path,
  );
  const options = catalogFilterGroups(categories, products).flatMap(
    (group) => group.options,
  );
  assert.ok(options.some((option) => option.path === "/blekayt"));
  assert.equal(
    new Set(options.map((option) => option.path)).size,
    options.length,
  );
  assert.ok(
    options.every(
      (option) => option.count > 0 && !familyPaths.includes(option.path),
    ),
  );
  const blackout = products.filter((product) =>
    paths(product).includes("/blekayt"),
  );
  assert.equal(catalogFilterGroups(categories, blackout).length, 0);
  const rods = products.filter((product) =>
    productCategoryPaths(product).has("/karnizi"),
  );
  assert.deepEqual(
    catalogFilterGroups(categories, rods).map((group) => group.id),
    ["mounting", "rod-material"],
  );
});

test("rod mounting and material intersect; alternatives within a facet and across families unite", () => {
  const actualRods = products.filter((product) =>
    matchesCatalogTypes(product, ["/nastenniekarnizi", "/derevanniekarnizi"]),
  );
  const expectedRods = products.filter(
    (product) =>
      paths(product).includes("/nastenniekarnizi") &&
      paths(product).includes("/derevanniekarnizi"),
  );
  assert.ok(expectedRods.length > 0);
  assert.deepEqual(actualRods, expectedRods);
  const alternatives = ["/blekayt", "/barxat", "/kartini"];
  assert.deepEqual(
    products.filter((product) => matchesCatalogTypes(product, alternatives)),
    products.filter((product) =>
      alternatives.some((path) => paths(product).includes(path)),
    ),
  );
  assert.ok(products.every((product) => matchesCatalogTypes(product, [])));
});

test("decor is partitioned by source product type, including misleading names and old memberships", () => {
  const snapshot = JSON.stringify(products);
  const counts = getCategoryCounts(products);
  assert.equal(counts.get("/decor"), 131);
  assert.equal(counts.get("/derzhateli-dlya-shtor"), 39);
  assert.equal(counts.get("/kisti"), 11);
  assert.equal(counts.get("/kartini"), 81);
  assert.equal(counts.get("/tkani"), 199);
  assert.equal(counts.get("/tyl"), 69);
  for (const [id, expected] of [
    ["287412431401", "/derzhateli-dlya-shtor"], // Рама is a curtain holder.
    ["524414571151", "/derzhateli-dlya-shtor"], // Горный хрусталь is a hook.
    ["406157933491", "/derzhateli-dlya-shtor"], // Tieback imported into /kisti.
    ["629417490401", "/derzhateli-dlya-shtor"],
    ["564605563351", "/kisti"], // Кисть Элегант was only in /decor.
  ]) {
    assert.equal(
      primaryProductCategory(products.find((product) => product.id === id)),
      expected,
    );
  }
  const legacyDecor = products.filter((product) =>
    productCategoryPaths(product).has("/decor"),
  );
  assert.deepEqual(
    catalogFilterGroups(categories, legacyDecor)[0].options.map(
      (option) => option.path,
    ),
    ["/derzhateli-dlya-shtor", "/kisti", "/kartini"],
  );
  assert.equal(
    JSON.stringify(products),
    snapshot,
    "Imported products must not be mutated",
  );
});

test("explicit CMS category choices take precedence over imported name heuristics", () => {
  const managed = {
    ...products[0],
    title: "Кисть — название коллекции",
    category: "Держатели",
    categoryPath: "/derzhateli-dlya-shtor",
    categoryPaths: ["/derzhateli-dlya-shtor"],
    categoryOverride: true,
  };
  assert.ok(productCategoryPaths(managed).has("/derzhateli-dlya-shtor"));
  assert.ok(productCategoryPaths(managed).has("/decor"));
  assert.ok(!productCategoryPaths(managed).has("/kisti"));
  const tassel = {
    ...managed,
    title: "Модель 123",
    categoryPath: "/kisti",
    categoryPaths: ["/kisti"],
  };
  assert.ok(productCategoryPaths(tassel).has("/kisti"));
  assert.ok(!productCategoryPaths(tassel).has("/derzhateli-dlya-shtor"));
});
