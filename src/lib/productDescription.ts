import { plain } from "./content";
import type { Product } from "./content";

// Short introductions to the repeated material texts in the imported catalog.
// Match the description itself: category names do not guarantee composition.
const introductions: [RegExp, string][] = [
  [
    /^(Ткань\s+)?Полиэстер(?=[\s(–-]|$)/i,
    "Мягкая ткань из полиэфирного волокна. Подходит для драпировки и пошива штор.",
  ],
  [
    /^Атлас\s*[-–]/i,
    "Ткань с гладкой блестящей поверхностью. Хорошо драпируется и сочетается с вуалью и бархатом.",
  ],
  [/^Бархат\s*[-–]/i, "Мягкая ткань с ворсистой поверхностью для портьер."],
  [
    /^Блэкаут\s*[-–]/i,
    "Плотная ткань для затемнения комнаты. Степень затемнения выбранного материала уточните при подборе.",
  ],
  [
    /^Льняная ткань\s*[-–]/i,
    "Льняная ткань для штор с выраженной фактурой. Подходит для спокойного текстильного оформления.",
  ],
  [
    /^Органза\s*[-–]/i,
    "Лёгкая прозрачная ткань для оформления окна. Пропускает дневной свет.",
  ],
  [
    /^Микровуаль\s*[-–]/i,
    "Мягкая тонкая прозрачная ткань, сочетающая свойства вуали и органзы.",
  ],
  [
    /^Вуаль\s*[-–]/i,
    "Лёгкая ткань, которая рассеивает свет и собирается в мягкие складки.",
  ],
  [
    /^Тюль-\s*сетка/i,
    "Тюль с открытым сетчатым плетением для лёгкого оформления окна.",
  ],
];

function readable(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/([,;:])(?=[А-ЯЁа-яёA-Za-z])/g, "$1 ")
    .replace(/([.!?])(?=[А-ЯЁA-Z])/g, "$1 ")
    .replace(/([А-ЯЁа-яё])\(/g, "$1 (")
    .replace(/не пропускать цвет/g, "не пропускать свет")
    .trim();
}

export function productDescription(product: Product) {
  const source = product.descriptionHtml || product.description || "";
  // Retain block and list boundaries before stripping markup. Never inject HTML.
  const blocks = source
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, "<br>")
    .split(/<br\s*\/?\s*>|\n+/i)
    .map((text) => readable(plain(text)))
    .filter(Boolean);
  const paragraphs: string[] = [];
  const terms: string[] = [];
  for (const block of blocks) {
    const note = block.search(/\*?\s*Стоимость комплекта штор, полученная/);
    if (note >= 0) {
      if (block.slice(0, note).trim())
        paragraphs.push(block.slice(0, note).trim());
      terms.push(
        block
          .slice(note)
          .replace(/^\*\s*/, "")
          .trim(),
      );
    } else paragraphs.push(block);
  }
  const text = paragraphs.join(" ");
  const introduction = introductions.find(([pattern]) =>
    pattern.test(text),
  )?.[1];
  const sentences = text.split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z])/).filter(Boolean);
  const summary = introduction || sentences.slice(0, 2).join(" ") || text;
  return { summary, paragraphs, terms, hasMore: !!text && summary !== text };
}
