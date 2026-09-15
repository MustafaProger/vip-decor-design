import type { Category, Product } from "./content";

/** Count memberships from the actual products, including parent categories. */
export function getCategoryCounts(products: Product[]) {
  const counts = new Map<string, number>();
  for (const product of products) {
    for (const path of new Set(
      product.categoryPaths || [product.categoryPath],
    )) {
      if (path) counts.set(path, (counts.get(path) || 0) + 1);
    }
  }
  return counts;
}

const categoryOrder = [
  "/tkani",
  "/lnanaiatkan",
  "/barxat",
  "/blekayt",
  "/zhakkard",
  "/atlas",
  "/tyl",
  "/vual",
  "/organza",
  "/tulsetka",
  "/tulizlna",
  "/mikrovual",
  "/karnizi",
  "/nastenniekarnizi",
  "/potolochniekarnizi",
  "/derevanniekarnizi",
  "/metallicheskiekarnizi",
  "/plastikoviekarnizi",
  "/rulonnieshtori",
  "/klassicheskierulonnieshtori",
  "/blekaytrulonnieshtori",
  "/zhaluzi",
  "/gorizontalniezhaluzi",
  "/vertikalniezhaluzi",
  "/decor",
  "/kartini",
  "/kisti",
  "/podyshki",
  "/pokrivala",
];

export function orderedCategories(categories: Category[]) {
  const rank = (path: string) => {
    const index = categoryOrder.indexOf(path);
    return index < 0 ? categoryOrder.length : index;
  };
  return [...categories].sort(
    (a, b) =>
      rank(a.path) - rank(b.path) || a.title.localeCompare(b.title, "ru"),
  );
}

export function categoryLabel(category: Category) {
  return category.path === "/tkani"
    ? "Ткани"
    : category.path === "/lnanaiatkan"
      ? "Лён"
      : category.title;
}
