import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  getDefaultSelection,
  getPropertyGroups,
  parseSourcePrice,
  parsePropertyChoice,
  productGallery,
  quoteProduct,
} from "../src/lib/commerce.ts";

const catalog = JSON.parse(
  fs.readFileSync(
    new URL("../src/data/site-content.json", import.meta.url),
    "utf8",
  ),
).products;
const byId = (id) => catalog.find((product) => product.id === id);

test("price parser distinguishes omitted prices from zero and parses Tilda formatting", () => {
  assert.equal(parseSourcePrice("3 390.00"), 3390);
  assert.equal(parseSourcePrice("3\u00a0390,50"), 3390.5);
  assert.equal(parseSourcePrice("0"), 0);
  for (const missing of [
    "",
    " ",
    null,
    undefined,
    NaN,
    "нет",
    "15₽",
    "-10",
    "Infinity",
  ])
    assert.equal(parseSourcePrice(missing), null);
});

test("source metre surcharges are preserved literally instead of inferred multiplication", () => {
  const product = byId("325186268288");
  const selection = getDefaultSelection(product);
  const metres = getPropertyGroups(product).find(
    (group) => group.title === "Метр",
  );
  selection.properties[metres.key] = metres.choices.find(
    (choice) => choice.label === "4",
  ).index;
  const quote = quoteProduct(product, selection);
  assert.equal(quote.basePrice, 3390);
  assert.equal(quote.adjustment, 10173);
  assert.equal(quote.unitPrice, 13563);
  assert.notEqual(quote.unitPrice, 3390 * 4);
  assert.ok(quote.variantLabel.includes("Метр: 4"));
});

test("switching an edition preserves the actual SKU and separate additional color property", () => {
  const product = byId("360082752021");
  const selection = getDefaultSelection(product);
  const first = quoteProduct(product, selection);
  selection.editionIndex = 1;
  const second = quoteProduct(product, selection);
  assert.equal(first.sku, "6201");
  assert.equal(second.sku, "3801");
  assert.notEqual(first.variantKey, second.variantKey);
  assert.equal(second.unitPrice, 1650);
  assert.ok(second.variantLabel.includes("Цвет: зеленый"));
  assert.ok(second.variantLabel.includes("цвет: 1010"));
});

test("unknown base prices stay unknown despite suggestive metre options", () => {
  const product = byId("612443265731");
  const selection = getDefaultSelection(product);
  selection.properties["property-0"] = 1;
  const quote = quoteProduct(product, selection);
  assert.equal(quote.adjustment, 3850);
  assert.equal(quote.unitPrice, null);
  assert.equal(quote.basePrice, null);
});

test("missing or impossible choices are rejected and malformed modifiers cannot become free", () => {
  const product = byId("325186268288");
  assert.throws(
    () => quoteProduct(product, { editionIndex: 9, properties: {} }),
    RangeError,
  );
  const selection = getDefaultSelection(product);
  selection.properties["property-0"] = 300;
  assert.throws(() => quoteProduct(product, selection), RangeError);
  assert.equal(parsePropertyChoice("Доплата=+неизвестно").adjustment, null);
  assert.equal(parsePropertyChoice("Скидка=-50").adjustment, -50);
  assert.equal(parsePropertyChoice("Без подшива").adjustment, 0);
});

test("canonical variant keys depend on selections, not object insertion order", () => {
  const product = byId("325186268288");
  const selection = getDefaultSelection(product);
  const reversed = {
    ...selection,
    properties: Object.fromEntries(
      Object.entries(selection.properties).reverse(),
    ),
  };
  assert.equal(
    quoteProduct(product, selection).variantKey,
    quoteProduct(product, reversed).variantKey,
  );
  reversed.properties["property-1"] = 1;
  assert.notEqual(
    quoteProduct(product, selection).variantKey,
    quoteProduct(product, reversed).variantKey,
  );
});

test("all imported editions and every property option produce finite prices or explicit unknowns", () => {
  for (const product of catalog) {
    const selection = getDefaultSelection(product);
    for (
      let index = 0;
      index < (product.variants?.editions?.length || 1);
      index++
    ) {
      const quote = quoteProduct(product, {
        ...selection,
        editionIndex: index,
      });
      assert.ok(
        quote.unitPrice === null ||
          (Number.isFinite(quote.unitPrice) && quote.unitPrice >= 0),
        product.id,
      );
    }
    for (const group of getPropertyGroups(product))
      for (const choice of group.choices) {
        assert.notEqual(
          choice.adjustment,
          null,
          `${product.id} / ${group.title} / ${choice.raw}`,
        );
        assert.doesNotThrow(() =>
          quoteProduct(product, {
            ...selection,
            properties: { ...selection.properties, [group.key]: choice.index },
          }),
        );
      }
  }
});

test("source edition quantity and all unique gallery photographs survive normalization", () => {
  const painting = byId("339617905841");
  assert.equal(
    quoteProduct(painting, getDefaultSelection(painting)).availableQuantity,
    1,
  );
  const product = byId("360082752021");
  assert.equal(productGallery(product).length, 4);
  for (const image of product.images)
    assert.ok(productGallery(product).includes(image));
});

test("published old price remains the original base price when selecting metre surcharges", () => {
  const product = byId("263657166731");
  const selection = getDefaultSelection(product);
  assert.equal(quoteProduct(product, selection).unitPrice, 490);
  assert.equal(quoteProduct(product, selection).oldBasePrice, 1550);
  selection.properties["property-0"] = 1;
  const quote = quoteProduct(product, selection);
  assert.equal(quote.unitPrice, 980);
  assert.equal(quote.oldBasePrice, 1550);
  assert.equal(
    quoteProduct(
      byId("325186268288"),
      getDefaultSelection(byId("325186268288")),
    ).oldBasePrice,
    null,
  );
  assert.ok(!quote.variantLabel.includes("originalImg"));
  assert.ok(!quote.variantLabel.includes("https://"));
});

test("published editionuid deep links select the matching variant without guessing unknown IDs", () => {
  const product = byId("360082752021");
  const selection = getDefaultSelection(product, "728478267392");
  assert.equal(selection.editionIndex, 1);
  assert.equal(quoteProduct(product, selection).sku, "3801");
  assert.equal(getDefaultSelection(product, "missing-edition").editionIndex, 0);
});
