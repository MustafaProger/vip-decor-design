/** Translate public Tilda filter URLs; preserve unrelated campaign/query parameters. */
export function translateLegacyFilters(input: URLSearchParams) {
  const output = new URLSearchParams(input);
  for (const [key, value] of input) {
    const match = /^tfc_(.+)\[\d+\]$/.exec(key);
    if (!match) continue;
    const field = match[1];
    let translated = false;
    if (field === "sort") {
      const sort = {
        "price:asc": "price-asc",
        "price:desc": "price-desc",
        "title:asc": "name",
      }[value];
      if (sort) {
        if (!output.has("sort")) output.set("sort", sort);
        translated = true;
      }
    } else if (field === "price:min" || field === "price:max") {
      const name = field === "price:min" ? "minPrice" : "maxPrice";
      if (/^\d+(?:\.\d+)?$/.test(value)) {
        if (!output.has(name)) output.set(name, value);
        translated = true;
      }
    } else if (field === "option:273743") {
      if (!output.has("color"))
        value
          .split(input.has("tfc_div") ? ":::" : "+")
          .filter(Boolean)
          .forEach((color) => output.append("color", color));
      translated = true;
    }
    if (translated) output.delete(key);
  }
  if (
    ![...output.keys()].some(
      (key) => key !== "tfc_div" && key.startsWith("tfc_"),
    )
  )
    output.delete("tfc_div");
  return output;
}
