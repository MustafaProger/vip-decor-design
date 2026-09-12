import type { Edition, Product } from "./content";

export type PropertyChoice = {
  index: number;
  label: string;
  adjustment: number | null;
  raw: string;
};
export type PropertyGroup = {
  key: string;
  title: string;
  choices: PropertyChoice[];
  sourceIndex: number;
};
export type ProductSelection = {
  editionIndex: number;
  properties: Record<string, number>;
};
export type EditionAttribute = { title: string; value: string };
export type ProductQuote = {
  basePrice: number | null;
  oldBasePrice: number | null;
  unitPrice: number | null;
  adjustment: number | null;
  sku: string;
  variantKey: string;
  variantLabel: string;
  availableQuantity: number | null;
  image: string;
  attributes: EditionAttribute[];
  selectedProperties: {
    title: string;
    value: string;
    adjustment: number | null;
  }[];
};

const RESERVED_EDITION_KEYS = new Set([
  "uid",
  "externalid",
  "sku",
  "price",
  "priceold",
  "quantity",
  "img",
  "originalImg",
]);
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Tilda publishes both "3 390.00" and "3390.0000". Empty prices stay unknown. */
export function parseSourcePrice(value: unknown): number | null {
  if (typeof value === "number")
    return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Preserve source surcharges, including unusual values such as +10173. */
export function parsePropertyChoice(raw: string, index = 0): PropertyChoice {
  const separator = raw.lastIndexOf("=");
  if (separator < 0) return { index, label: raw.trim(), adjustment: 0, raw };
  const label = raw.slice(0, separator).trim();
  const expression = raw.slice(separator + 1).trim();
  const sign = expression.startsWith("+")
    ? 1
    : expression.startsWith("-")
      ? -1
      : null;
  const amount = sign === null ? null : parseSourcePrice(expression.slice(1));
  return {
    index,
    label,
    adjustment: amount === null || sign === null ? null : amount * sign,
    raw,
  };
}

export function getPropertyGroups(product: Product): PropertyGroup[] {
  return (product.variants?.properties || []).flatMap((value, sourceIndex) => {
    const property = asRecord(value);
    if (
      !property ||
      typeof property.title !== "string" ||
      typeof property.values !== "string"
    )
      return [];
    const choices = property.values
      .split(/\r?\n/)
      .map((line, index) => parsePropertyChoice(line, index))
      .filter((choice) => choice.label.length > 0);
    return choices.length
      ? [
          {
            key: `property-${sourceIndex}`,
            title: property.title,
            choices,
            sourceIndex,
          },
        ]
      : [];
  });
}

export function getEditionAttributes(
  edition: Edition | undefined,
): EditionAttribute[] {
  return Object.entries(edition || {}).flatMap(([title, value]) =>
    !RESERVED_EDITION_KEYS.has(title) &&
    value !== null &&
    value !== undefined &&
    String(value).length > 0
      ? [{ title, value: String(value) }]
      : [],
  );
}

export function getDefaultSelection(
  product: Product,
  editionUid?: string | null,
): ProductSelection {
  const editionIndex = editionUid
    ? (product.variants?.editions || []).findIndex(
        (edition) => String(edition.uid) === editionUid,
      )
    : 0;
  return {
    editionIndex: Math.max(0, editionIndex),
    properties: Object.fromEntries(
      getPropertyGroups(product).map((group) => [
        group.key,
        group.choices[0].index,
      ]),
    ),
  };
}

export function quoteProduct(
  product: Product,
  selection: ProductSelection,
): ProductQuote {
  const editions = product.variants?.editions || [];
  if (
    !Number.isInteger(selection.editionIndex) ||
    selection.editionIndex < 0 ||
    selection.editionIndex >= Math.max(1, editions.length)
  )
    throw new RangeError("Выбранного варианта нет в каталоге.");
  const edition = editions[selection.editionIndex];
  const basePrice =
    edition && Object.hasOwn(edition, "price")
      ? parseSourcePrice(edition.price)
      : parseSourcePrice(product.price);
  const rawOldPrice =
    parseSourcePrice(edition?.priceold) ?? parseSourcePrice(product.oldPrice);
  const oldBasePrice =
    rawOldPrice !== null && basePrice !== null && rawOldPrice > basePrice
      ? rawOldPrice
      : null;
  const attributes = getEditionAttributes(edition);
  const selectedProperties = getPropertyGroups(product).map((group) => {
    const choice = group.choices.find(
      (item) => item.index === selection.properties[group.key],
    );
    if (!choice)
      throw new RangeError(`Выберите допустимое значение «${group.title}».`);
    return {
      key: group.key,
      title: group.title,
      value: choice.label,
      adjustment: choice.adjustment,
      index: choice.index,
    };
  });
  const adjustment = selectedProperties.some((item) => item.adjustment === null)
    ? null
    : selectedProperties.reduce((sum, item) => sum + item.adjustment!, 0);
  const amount =
    basePrice !== null && adjustment !== null
      ? Math.round((basePrice + adjustment) * 100) / 100
      : null;
  const unitPrice = amount !== null && amount >= 0 ? amount : null;
  const availableQuantity =
    edition?.quantity === "" || edition?.quantity == null
      ? null
      : parseSourcePrice(edition.quantity);
  const sku = edition?.sku == null ? product.sku || "" : String(edition.sku);
  return {
    basePrice,
    oldBasePrice,
    unitPrice,
    adjustment,
    sku,
    variantKey: JSON.stringify({
      edition: String(edition?.uid ?? selection.editionIndex),
      properties: selectedProperties.map((item) => [item.key, item.index]),
    }),
    variantLabel: [
      ...attributes.map((item) => `${item.title}: ${item.value}`),
      ...selectedProperties.map((item) => `${item.title}: ${item.value}`),
      ...(sku ? [`Артикул: ${sku}`] : []),
    ].join(" · "),
    availableQuantity,
    image: typeof edition?.img === "string" ? edition.img : "",
    attributes,
    selectedProperties,
  };
}

export function productGallery(product: Product): string[] {
  return [
    ...new Set(
      [
        product.image,
        ...product.images,
        ...(product.variants?.editions || []).map((edition) =>
          typeof edition.img === "string" ? edition.img : "",
        ),
      ].filter(Boolean),
    ),
  ];
}
