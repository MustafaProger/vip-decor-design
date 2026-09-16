import type { Category, Product } from "./content";

const families = [
  {
    path: "/tkani",
    children: ["/lnanaiatkan", "/barxat", "/blekayt", "/zhakkard", "/atlas"],
  },
  {
    path: "/tyl",
    children: ["/vual", "/organza", "/tulsetka", "/tulizlna", "/mikrovual"],
  },
  {
    path: "/rulonnieshtori",
    children: ["/klassicheskierulonnieshtori", "/blekaytrulonnieshtori"],
  },
  {
    path: "/zhaluzi",
    children: ["/gorizontalniezhaluzi", "/vertikalniezhaluzi"],
  },
  {
    path: "/karnizi",
    children: [
      "/nastenniekarnizi",
      "/potolochniekarnizi",
      "/derevanniekarnizi",
      "/metallicheskiekarnizi",
      "/plastikoviekarnizi",
    ],
  },
  {
    path: "/derzhateli-dlya-shtor",
    children: [],
  },
  {
    path: "/kisti",
    children: [],
  },
  {
    path: "/kartini",
    children: [],
  },
];

export function categoryFamily(path: string) {
  return (
    families.find(
      (family) => family.path === path || family.children.includes(path),
    )?.path || path
  );
}

/** Presentation taxonomy; the imported inventory stays unchanged. */
export function productCategoryPaths(product: Product) {
  const paths = new Set(
    (product.categoryPaths || [product.categoryPath]).filter(
      (path): path is string => Boolean(path),
    ),
  );
  const label = `${product.title} ${product.category}`.toLocaleLowerCase("ru");
  if (paths.has("/decor") || paths.has("/kisti") || paths.has("/kartini")) {
    paths.add("/decor"); // Keep the legacy collection accessible.
    if (!paths.has("/kartini")) {
      // The old /kisti collection also contained two tiebacks, and missed
      // seven products explicitly named as tassels in the source inventory.
      paths.delete("/kisti");
      paths.add(/кист[ьи]/.test(label) ? "/kisti" : "/derzhateli-dlya-shtor");
    }
  }
  for (const path of [...paths]) paths.add(categoryFamily(path));
  if (paths.has("/tyl")) {
    // Sheers had also been imported into the broad curtain-fabric collection.
    paths.delete("/tkani");
    for (const path of families[0].children) paths.delete(path);
  }
  return paths;
}

export function catalogCategories(categories: Category[]): Category[] {
  return [
    ...categories.map((category) =>
      category.path === "/kisti"
        ? { ...category, title: "Кисти для штор" }
        : category,
    ),
    {
      path: "/derzhateli-dlya-shtor",
      title: "Держатели для штор",
      description: "Держатели, подхваты, магниты, крючки и розетки для штор.",
      image: "",
    },
  ];
}

export function primaryProductCategory(product: Product) {
  const paths = [...productCategoryPaths(product)];
  return (
    paths.find(
      (path) => !["/tkani", "/tyl", "/shop", "/decor"].includes(path),
    ) || paths.find((path) => path !== "/shop")
  );
}

export function getCategoryCounts(products: Product[]) {
  const counts = new Map<string, number>();
  for (const product of products)
    for (const path of productCategoryPaths(product))
      counts.set(path, (counts.get(path) || 0) + 1);
  return counts;
}

export function orderedCategories(categories: Category[]) {
  const order = families.flatMap((family) => [family.path, ...family.children]);
  const rank = (path: string) => {
    const index = order.indexOf(path);
    return index < 0 ? order.length : index;
  };
  return [...categories].sort(
    (a, b) =>
      rank(a.path) - rank(b.path) || a.title.localeCompare(b.title, "ru"),
  );
}

export function catalogFamilies(
  categories: Category[],
  counts: Map<string, number>,
) {
  return orderedCategories(categories).filter(
    (category) =>
      category.path !== "/decor" &&
      categoryFamily(category.path) === category.path &&
      (counts.get(category.path) || 0) > 0,
  );
}

export function categoryLabel(category: Category) {
  return category.path === "/tkani"
    ? "Ткани для штор"
    : category.path === "/lnanaiatkan"
      ? "Лён"
      : category.title;
}

/** Preserve source order within each family, with window textiles first. */
export function compareCatalogProducts(a: Product, b: Product) {
  const rank = (product: Product) => {
    const paths = productCategoryPaths(product);
    const index = families.findIndex((family) => paths.has(family.path));
    return index < 0 ? families.length : index;
  };
  return rank(a) - rank(b);
}

const filterDefinitions = [
  {
    id: "textile",
    branch: "textile",
    title: "Вид ткани",
    paths: [...families[0].children, ...families[1].children],
  },
  {
    id: "roller",
    branch: "roller",
    title: "Вид рулонных штор",
    paths: families[2].children,
  },
  {
    id: "blinds",
    branch: "blinds",
    title: "Вид жалюзи",
    paths: families[3].children,
  },
  {
    id: "mounting",
    branch: "rods",
    title: "Крепление карниза",
    paths: ["/nastenniekarnizi", "/potolochniekarnizi"],
  },
  {
    id: "rod-material",
    branch: "rods",
    title: "Материал карниза",
    paths: [
      "/derevanniekarnizi",
      "/metallicheskiekarnizi",
      "/plastikoviekarnizi",
    ],
  },
  {
    id: "decor",
    branch: "decor",
    title: "Аксессуары и картины",
    paths: ["/derzhateli-dlya-shtor", "/kisti", "/kartini"],
  },
];

export function catalogFilterGroups(
  categories: Category[],
  source: Product[],
  selected: string[] = [],
) {
  const counts = getCategoryCounts(source);
  return filterDefinitions
    .filter(
      (group) =>
        group.id !== "decor" ||
        source.every((product) =>
          productCategoryPaths(product).has("/decor"),
        ) ||
        selected.some((path) => group.paths.includes(path)),
    )
    .map((group) => ({
      ...group,
      options: group.paths.flatMap((path) => {
        const category = categories.find(
          (candidate) => candidate.path === path,
        );
        const count = counts.get(path) || 0;
        // An option covering the whole collection cannot narrow it any further.
        return category &&
          count > 0 &&
          (count < source.length || selected.includes(path))
          ? [{ ...category, count }]
          : [];
      }),
    }))
    .filter((group) => group.options.length > 0);
}

/** Alternatives within a facet are OR; rod material and mounting combine with AND.
 * Independent product families are alternatives, so selecting linen and paintings
 * in the complete catalogue returns both, rather than an impossible intersection.
 */
export function matchesCatalogTypes(product: Product, selected: string[]) {
  if (!selected.length) return true;
  const paths = productCategoryPaths(product);
  const branches = new Map<string, Map<string, string[]>>();
  for (const path of selected) {
    const definition = filterDefinitions.find((group) =>
      group.paths.includes(path),
    );
    const branch = definition?.branch || "legacy";
    const group = definition?.id || "legacy";
    if (!branches.has(branch)) branches.set(branch, new Map());
    const groups = branches.get(branch)!;
    groups.set(group, [...(groups.get(group) || []), path]);
  }
  return [...branches.values()].some((groups) =>
    [...groups.values()].every((alternatives) =>
      alternatives.some((path) => paths.has(path)),
    ),
  );
}
