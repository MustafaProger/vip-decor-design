// Owner-confirmed rates, 11 October 2026. Apply to page copy only;
// product prices, editorial CMS records and customer quotations stay intact.
function updateCopy(value) {
  if (Array.isArray(value)) return value.map(updateCopy);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, updateCopy(item)]),
  );
  if (typeof value !== "string") return value;
  return value
    .replace(/(предоплат[аеуы]?\s*)(?:от\s*)?50\s*%/gi, "$160–70%")
    .replace(/1 метр строчки тюль 120 руб/g, "1 метр строчки тюль 220 руб")
    .replace(/1 метр сторочки портьера 150 руб/g, "1 метр строчки портьера 250 руб")
    .replace(/Стоимость курьерской доставки:?\s*от 400 руб(?:лей)?\.?\s*в зависимости от размера товара\.?/gi, "Стоимость курьерской доставки по Москве: 1 000 руб.")
    .replace(/Стоимость курьерской доставки:?\s*от 400 руб(?:лей)?\.?/gi, "Стоимость курьерской доставки по Москве: 1 000 руб.")
    .replace(/400 р\./g, "1 000 р.");
}

export function applyCurrentPricing(content) {
  return { ...content, pages: (content.pages || []).map((page) =>
    ["/", "/price", "/dostavka", "/page13486315.html"].includes(page.path)
      ? updateCopy(page) : page,
  ) };
}
