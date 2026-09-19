// CMS accepts structured text and safe links; it never stores executable markup.
export class CmsError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}
export const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (field) => {
  throw new CmsError(422, `Проверьте поле «${field}».`);
};
export function text(value, field, max = 10000, min = 0) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    value.trim().length < min ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    fail(field);
  return value;
}
function keys(value, allowed, field) {
  if (
    !object(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    fail(field);
}
export function identifier(value, field = "идентификатор") {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,149}$/.test(value)
  )
    fail(field);
  return value;
}
function slug(value, field = "адрес статьи") {
  if (
    typeof value !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
    value.length > 150
  )
    fail(field);
  return value;
}
function list(value, field, max = 100) {
  if (!Array.isArray(value) || value.length > max) fail(field);
  return value;
}
function safeText(value, field, max = 10000, min = 0) {
  text(value, field, max, min);
  if (/<\/?[a-z!][^>]*>/i.test(value))
    fail(`${field}: используйте обычный текст`);
  return value;
}
function texts(value, field, max = 100, size = 10000) {
  list(value, field, max).forEach((entry) => safeText(entry, field, size));
}
function dimension(value, field) {
  if (!Number.isInteger(value) || value < 1 || value > 30000) fail(field);
}
export function safeLink(value, field, { empty = false, local = false } = {}) {
  text(value, field, 2000);
  if (!value && empty) return value;
  if (
    !value ||
    /[\s\\<>"'\u0000-\u001f]/.test(value) ||
    /%0[0-9a-f]|%1[0-9a-f]|%7f/i.test(value)
  )
    fail(field);
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (local) fail(field);
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      fail(field);
  } catch {
    fail(field);
  }
  return value;
}
function safeTree(value, field, depth = 0) {
  if (depth > 8) fail(field);
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(field);
    return;
  }
  if (typeof value === "string") {
    safeText(value, field, 20000);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 1000) fail(field);
    value.forEach((entry) => safeTree(entry, field, depth + 1));
    return;
  }
  if (!object(value) || Object.keys(value).length > 100) fail(field);
  for (const [key, entry] of Object.entries(value)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) fail(field);
    safeText(key, field, 150);
    if (
      ["img", "image", "src", "url", "href"].includes(key) &&
      typeof entry === "string"
    )
      safeLink(entry, field, { empty: true });
    else safeTree(entry, field, depth + 1);
  }
}
export function validateProduct(input, categories) {
  keys(
    input,
    [
      "id",
      "title",
      "description",
      "shortDescription",
      "descriptionHtml",
      "price",
      "priceText",
      "oldPrice",
      "sku",
      "image",
      "images",
      "url",
      "category",
      "categoryPath",
      "categoryPaths",
      "categoryOverride",
      "properties",
      "variants",
      "sourceSnapshot",
      "imageStatus",
      "status",
      "version",
      "updatedAt",
    ],
    "товар",
  );
  identifier(input.id);
  safeText(input.title, "название", 300, 1);
  safeText(input.description, "описание", 50000);
  if (
    input.price !== null &&
    (typeof input.price !== "number" ||
      !Number.isFinite(input.price) ||
      input.price < 0 ||
      input.price > 1e10)
  )
    fail("цена");
  safeText(input.category, "категория", 300, 1);
  safeLink(input.image, "главное изображение", {
    empty: input.status === "draft",
  });
  list(input.images, "изображения", 50).forEach((image) =>
    safeLink(image, "изображение"),
  );
  safeLink(input.url, "ссылка товара", { empty: true });
  for (const key of [
    "shortDescription",
    "priceText",
    "oldPrice",
    "sku",
    "sourceSnapshot",
    "imageStatus",
  ]) {
    if (
      input[key] !== undefined &&
      !(key === "priceText" && input[key] === null)
    )
      safeText(input[key], key, key === "shortDescription" ? 5000 : 2000);
  }
  if (input.descriptionHtml !== undefined) {
    text(input.descriptionHtml, "описание HTML", 100000);
    // Existing imports only use <br/>. Small formatting tags are allowed without attributes.
    const withoutSafeTags = input.descriptionHtml.replace(
      /<\/?(?:br|p|strong|em|b|i|ul|ol|li)\s*\/?>/gi,
      "",
    );
    if (/[<>]/.test(withoutSafeTags))
      fail(
        "описание HTML: разрешено только простое форматирование без атрибутов",
      );
  }
  if (
    input.categoryOverride !== undefined &&
    typeof input.categoryOverride !== "boolean"
  )
    fail("выбор категории");
  const paths = new Set(categories.map((category) => category.path));
  if (input.categoryPath !== undefined && !paths.has(input.categoryPath))
    fail("раздел каталога");
  if (input.categoryPaths !== undefined)
    list(input.categoryPaths, "разделы каталога", 50).forEach((path) => {
      if (!paths.has(path)) fail("раздел каталога");
    });
  if (input.properties !== undefined)
    list(input.properties, "характеристики", 100).forEach((property) => {
      keys(property, ["name", "value"], "характеристика");
      safeText(property.name, "название характеристики", 300, 1);
      safeText(property.value, "значение характеристики", 2000);
    });
  if (input.variants !== undefined) {
    keys(
      input.variants,
      [
        "editions",
        "properties",
        "options",
        "rawPrice",
        "quantity",
        "unit",
        "portion",
      ],
      "варианты",
    );
    for (const key of ["editions", "properties", "options"])
      if (input.variants[key] !== undefined)
        list(input.variants[key], key, 1000);
    for (const edition of input.variants.editions || []) {
      if (
        !object(edition) ||
        Object.values(edition).some(
          (value) =>
            value !== null &&
            !["string", "number", "boolean"].includes(typeof value),
        )
      )
        fail("исполнение товара");
      for (const key of ["uid", "sku", "price", "priceold", "quantity"])
        if (
          edition[key] != null &&
          !["string", "number"].includes(typeof edition[key])
        )
          fail(`исполнение: ${key}`);
      if (edition.img !== undefined)
        safeLink(edition.img, "фото исполнения", { empty: true });
      if (edition.originalImg !== undefined)
        safeLink(edition.originalImg, "исходное фото исполнения", {
          empty: true,
        });
    }
    for (const key of ["properties", "options"])
      for (const value of input.variants[key] || [])
        if (!object(value)) fail(`варианты: ${key}`);
    safeTree(input.variants, "варианты");
  }
  if (!["draft", "published"].includes(input.status)) fail("статус публикации");
  return structuredClone(input);
}
export function validatePost(input, categories) {
  keys(
    input,
    [
      "id",
      "slug",
      "status",
      "category",
      "title",
      "seoTitle",
      "description",
      "excerpt",
      "intro",
      "image",
      "sections",
      "sources",
      "related",
      "datePublished",
      "dateModified",
      "version",
      "updatedAt",
    ],
    "статья",
  );
  identifier(input.id);
  slug(input.slug);
  if (input.slug === "category") fail("адрес статьи зарезервирован");
  if (!categories.some((category) => category.slug === input.category))
    fail("категория статьи");
  for (const key of ["title", "seoTitle", "description", "excerpt", "intro"])
    safeText(
      input[key],
      key,
      key === "intro" ? 20000 : 3000,
      key === "title" || input.status === "published" ? 1 : 0,
    );
  if (!["draft", "published"].includes(input.status)) fail("статус публикации");
  keys(
    input.image,
    ["src", "alt", "caption", "width", "height", "variants", "originalSrc"],
    "обложка",
  );
  safeLink(input.image.src, "обложка", { empty: input.status === "draft" });
  safeText(
    input.image.alt,
    "описание обложки",
    2000,
    input.status === "published" ? 1 : 0,
  );
  safeText(input.image.caption, "подпись обложки", 3000);
  dimension(input.image.width, "ширина обложки");
  dimension(input.image.height, "высота обложки");
  if (input.image.originalSrc !== undefined)
    safeLink(input.image.originalSrc, "исходная обложка", { empty: true });
  input.image.variants ??= [];
  list(input.image.variants, "размеры обложки", 10).forEach((variant) => {
    keys(variant, ["src", "width"], "вариант обложки");
    safeLink(variant.src, "вариант обложки");
    dimension(variant.width, "ширина обложки");
  });
  const sectionIds = new Set();
  list(input.sections, "разделы статьи", 100).forEach((section) => {
    keys(
      section,
      [
        "id",
        "title",
        "paragraphs",
        "list",
        "callout",
        "table",
        "links",
        "citations",
      ],
      "раздел статьи",
    );
    identifier(section.id, "идентификатор раздела");
    if (sectionIds.has(section.id)) fail("повторяющийся идентификатор раздела");
    sectionIds.add(section.id);
    safeText(section.title, "название раздела", 1000);
    for (const key of ["paragraphs", "list"])
      if (section[key] !== undefined) texts(section[key], key, 150, 20000);
    if (section.callout !== undefined)
      safeText(section.callout, "заметка", 10000);
    if (section.table !== undefined) {
      keys(section.table, ["headers", "rows"], "таблица");
      texts(section.table.headers, "заголовки таблицы", 30, 2000);
      list(section.table.rows, "строки таблицы", 100).forEach((row) => {
        texts(row, "ячейки таблицы", 30, 2000);
        if (row.length !== section.table.headers.length)
          fail("количество ячеек таблицы");
      });
    }
    if (section.links !== undefined)
      list(section.links, "ссылки раздела", 50).forEach((link) => {
        keys(link, ["href", "label"], "ссылка");
        safeLink(link.href, "адрес ссылки");
        safeText(link.label, "название ссылки", 2000);
      });
    if (section.citations !== undefined)
      list(section.citations, "источники раздела", 100).forEach((value) =>
        identifier(value),
      );
  });
  if (
    input.status === "published" &&
    !input.sections.some((section) =>
      [
        ...(section.paragraphs || []),
        ...(section.list || []),
        section.callout || "",
        ...(section.table?.rows.flat() || []),
      ].some((value) => value.trim().length > 0),
    )
  )
    fail("добавьте содержимое статьи перед публикацией");
  const sourceIds = new Set();
  list(input.sources, "источники", 100).forEach((source) => {
    keys(source, ["id", "title", "url", "note"], "источник");
    identifier(source.id);
    if (sourceIds.has(source.id)) fail("повторяющийся источник");
    sourceIds.add(source.id);
    safeText(source.title, "название источника", 2000);
    safeLink(source.url, "ссылка источника");
    safeText(source.note, "примечание источника", 5000);
  });
  for (const section of input.sections)
    for (const citation of section.citations || [])
      if (!sourceIds.has(citation)) fail("ссылка на неизвестный источник");
  list(input.related, "связанные статьи", 100).forEach((value) => slug(value));
  for (const key of ["datePublished", "dateModified"]) {
    if (input[key] !== undefined) text(input[key], key, 64);
    if (
      input[key] !== undefined &&
      input[key] !== "" &&
      (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(input[key]) ||
        !Number.isFinite(Date.parse(input[key])))
    )
      fail(key);
  }
  return structuredClone(input);
}
export function validateCredentials(input) {
  if (!object(input)) fail("учётная запись");
  text(input.username, "логин", 80, 3);
  if (!/^[a-zA-Z0-9_.@-]+$/.test(input.username))
    fail("логин: латинские буквы, цифры, точка, дефис или @");
  text(input.password, "пароль", 200, 12);
}
export function version(value) {
  if (!Number.isInteger(value) || value < 1)
    throw new CmsError(
      422,
      "Укажите версию записи. Обновите страницу и повторите сохранение.",
    );
  return value;
}
