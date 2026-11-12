import { access } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import products from "../src/data/sale-20261112.json" with { type: "json" };
import featuredCategories from "../src/data/featured-categories.json" with { type: "json" };
import { validateProduct } from "../server/cms-validation.mjs";

// Apply once to an initialized CMS. Never overwrite a card edited in the CMS.
const directory = process.argv[2];
if (!directory)
  throw new Error(
    "Usage: node scripts/import-sale-20261112.mjs <runtime-directory>",
  );
const database = resolve(directory, "cms.sqlite");
await access(database);
const db = new DatabaseSync(database);
try {
  db.exec("PRAGMA busy_timeout=5000");
  const { categories } = JSON.parse(
    db.prepare("SELECT value FROM meta WHERE key='content'").get().value,
  );
  const cards = products.map(({ photos, ...product }) => {
    const images = photos.map((name) => `/images/sale-20261112/${name}.webp`);
    return validateProduct(
      {
        ...product,
        priceText: String(product.price),
        url: `https://vip2d.ru/product/${product.id}`,
        categoryPaths: [product.categoryPath, "/sale"],
        categoryOverride: true,
        image: images[0],
        images,
        status: "published",
      },
      [...categories, ...featuredCategories],
    );
  });
  await Promise.all(
    cards.flatMap(({ images }) =>
      images.map((image) =>
        access(fileURLToPath(new URL(`../dist${image}`, import.meta.url))),
      ),
    ),
  );
  db.exec("BEGIN IMMEDIATE");
  const insert = db.prepare(
    "INSERT INTO entities(kind,id,slug,status,version,updated_at,body) VALUES ('products',?,?,?,1,?,?) ON CONFLICT(kind,id) DO NOTHING",
  );
  const timestamp = new Date().toISOString();
  const report = cards.map((card) => ({
    id: card.id,
    inserted: Boolean(
      insert.run(card.id, card.id, card.status, timestamp, JSON.stringify(card))
        .changes,
    ),
  }));
  db.exec("COMMIT");
  console.log(JSON.stringify(report));
} finally {
  db.close();
}
