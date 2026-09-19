import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, ImageField, JsonField } from "./Fields";
import type { CMSContent, CMSProduct, MediaResult } from "./types";

export function ProductEditor({
  item,
  onChange,
  content,
  upload,
  onInvalid,
}: {
  item: CMSProduct;
  onChange: (item: CMSProduct) => void;
  content: CMSContent;
  upload: (file: File) => Promise<MediaResult>;
  onInvalid: (key: string, invalid: boolean) => void;
}) {
  const [galleryDraft, setGalleryDraft] = useState("");
  const addGalleryImage = (image: string) => {
    if (image.trim()) {
      onChange({
        ...item,
        images: [...new Set([...item.images, image.trim()])],
      });
      setGalleryDraft("");
    }
  };
  const set = <K extends keyof CMSProduct>(key: K, value: CMSProduct[K]) =>
    onChange({ ...item, [key]: value });
  const editions = item.variants?.editions || [];
  const editEdition = (index: number, key: string, value: string) =>
    set("variants", {
      ...item.variants,
      editions: editions.map((entry, position) =>
        index === position ? { ...entry, [key]: value } : entry,
      ),
    });
  return (
    <div className="cms-editor-columns">
      <div className="cms-editor-main">
        <section className="cms-card cms-form-card">
          <h2>Основное</h2>
          <div className="cms-form-grid">
            <Field label="Название товара *" wide>
              <input
                required
                maxLength={240}
                value={item.title}
                onChange={(event) => set("title", event.target.value)}
              />
            </Field>
            <Field label="Артикул">
              <input
                value={item.sku || ""}
                onChange={(event) => set("sku", event.target.value)}
              />
            </Field>
            <Field label="Подпись категории">
              <input
                value={item.category}
                onChange={(event) => set("category", event.target.value)}
              />
            </Field>
            <Field label="Краткое описание" wide>
              <textarea
                rows={2}
                value={item.shortDescription || ""}
                onChange={(event) =>
                  set("shortDescription", event.target.value)
                }
              />
            </Field>
            <Field label="Описание товара" wide>
              <textarea
                rows={9}
                value={item.description}
                onChange={(event) =>
                  onChange({
                    ...item,
                    description: event.target.value,
                    descriptionHtml: undefined,
                  })
                }
              />
            </Field>
          </div>
        </section>
        <section className="cms-card cms-form-card">
          <h2>Цена</h2>
          <div className="cms-form-grid">
            <Field label="Цена, ₽" hint="Пустое поле — цена по запросу.">
              <input
                type="number"
                min={0}
                step="0.01"
                value={item.price ?? ""}
                onChange={(event) =>
                  onChange({
                    ...item,
                    price:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                    priceText: event.target.value,
                  })
                }
              />
            </Field>
            <Field label="Старая цена, ₽">
              <input
                type="number"
                min={0}
                step="0.01"
                value={
                  item.oldPrice?.replace(/\s/g, "").replace(",", ".") || ""
                }
                onChange={(event) => set("oldPrice", event.target.value)}
              />
            </Field>
          </div>
          {editions.length > 0 && (
            <p className="cms-notice">
              У товара есть варианты. Цена в карточке и цены вариантов
              редактируются отдельно. Проверьте таблицу вариантов перед
              публикацией.
            </p>
          )}
        </section>
        <section className="cms-card cms-form-card">
          <h2>Фотографии</h2>
          <ImageField
            label="Главное изображение"
            value={item.image}
            upload={upload}
            onChange={(image) =>
              onChange({
                ...item,
                image,
                images: [
                  ...new Set(
                    [
                      image,
                      ...item.images.filter((src) => src !== item.image),
                    ].filter(Boolean),
                  ),
                ],
              })
            }
          />
          <div className="cms-gallery">
            {item.images
              .filter((src) => src !== item.image)
              .map((src, index) => (
                <div className="cms-gallery-item" key={`${src}-${index}`}>
                  <img src={src} alt={`Дополнительное фото ${index + 1}`} />
                  <button
                    type="button"
                    className="cms-icon-button"
                    aria-label={`Удалить фото ${index + 1}`}
                    onClick={() =>
                      set(
                        "images",
                        item.images.filter((image) => image !== src),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
          </div>
          <ImageField
            label="Добавить в галерею"
            value={galleryDraft}
            upload={upload}
            onChange={(image, result) => {
              if (result) addGalleryImage(image);
              else setGalleryDraft(image);
            }}
          />
          {galleryDraft && (
            <button
              type="button"
              className="cms-button cms-secondary"
              onClick={() => addGalleryImage(galleryDraft)}
            >
              <Plus size={16} />
              Добавить фото по адресу
            </button>
          )}
          <details className="cms-details">
            <summary>Адреса фотографий</summary>
            <Field label="Галерея" hint="Один адрес на строку.">
              <textarea
                rows={4}
                value={item.images.join("\n")}
                onChange={(event) =>
                  set("images", event.target.value.split("\n"))
                }
                onBlur={(event) =>
                  set(
                    "images",
                    event.target.value
                      .split("\n")
                      .map((image) => image.trim())
                      .filter(Boolean),
                  )
                }
              />
            </Field>
          </details>
        </section>
        <section className="cms-card cms-form-card">
          <div className="cms-section-heading">
            <h2>Характеристики</h2>
            <span className="cms-counter">{item.properties?.length || 0}</span>
          </div>
          {(item.properties || []).map((property, index) => (
            <div className="cms-repeat-row" key={index}>
              <input
                aria-label={`Название характеристики ${index + 1}`}
                placeholder="Например, состав"
                value={property.name}
                onChange={(event) =>
                  set(
                    "properties",
                    item.properties!.map((entry, position) =>
                      index === position
                        ? { ...entry, name: event.target.value }
                        : entry,
                    ),
                  )
                }
              />
              <input
                aria-label={`Значение характеристики ${index + 1}`}
                placeholder="100% хлопок"
                value={property.value}
                onChange={(event) =>
                  set(
                    "properties",
                    item.properties!.map((entry, position) =>
                      index === position
                        ? { ...entry, value: event.target.value }
                        : entry,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="cms-icon-button"
                aria-label={`Удалить характеристику ${index + 1}`}
                onClick={() =>
                  set(
                    "properties",
                    item.properties!.filter(
                      (_, position) => index !== position,
                    ),
                  )
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="cms-text-button"
            onClick={() =>
              set("properties", [
                ...(item.properties || []),
                { name: "", value: "" },
              ])
            }
          >
            <Plus size={16} />
            Добавить характеристику
          </button>
        </section>
        <section className="cms-card cms-form-card">
          <div className="cms-section-heading">
            <div>
              <h2>Варианты товара</h2>
              <p>Цены, артикулы и остатки каждого исполнения.</p>
            </div>
            <span className="cms-counter">{editions.length}</span>
          </div>
          {editions.map((edition, index) => (
            <div key={index} className="cms-article-section">
              <div className="cms-section-heading">
                <h3>
                  {Object.entries(edition)
                    .filter(
                      ([key, value]) =>
                        ![
                          "uid",
                          "externalid",
                          "sku",
                          "price",
                          "priceold",
                          "quantity",
                          "img",
                        ].includes(key) && typeof value !== "object",
                    )
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(" · ") || `Вариант ${index + 1}`}
                </h3>
                <button
                  type="button"
                  className="cms-icon-button"
                  aria-label={`Удалить вариант ${index + 1}`}
                  onClick={() => {
                    if (window.confirm("Удалить этот вариант товара?"))
                      set("variants", {
                        ...item.variants,
                        editions: editions.filter(
                          (_, position) => index !== position,
                        ),
                      });
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="cms-form-grid">
                <Field label="Артикул варианта">
                  <input
                    value={edition.sku || ""}
                    onChange={(event) =>
                      editEdition(index, "sku", event.target.value)
                    }
                  />
                </Field>
                <Field label="Цена варианта, ₽">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={String(edition.price ?? "")
                      .replace(/\s/g, "")
                      .replace(",", ".")}
                    onChange={(event) =>
                      editEdition(index, "price", event.target.value)
                    }
                  />
                </Field>
                <Field label="Старая цена варианта, ₽">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={String(edition.priceold ?? "")
                      .replace(/\s/g, "")
                      .replace(",", ".")}
                    onChange={(event) =>
                      editEdition(index, "priceold", event.target.value)
                    }
                  />
                </Field>
                <Field label="Остаток" hint="Пустое поле — остаток не указан.">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={edition.quantity ?? ""}
                    onChange={(event) =>
                      editEdition(index, "quantity", event.target.value)
                    }
                  />
                </Field>
                {Object.entries(edition)
                  .filter(
                    ([key, value]) =>
                      ![
                        "uid",
                        "externalid",
                        "sku",
                        "price",
                        "priceold",
                        "quantity",
                        "img",
                      ].includes(key) && typeof value === "string",
                  )
                  .map(([key, value]) => (
                    <Field label={key} key={key}>
                      <input
                        value={String(value)}
                        onChange={(event) =>
                          editEdition(index, key, event.target.value)
                        }
                      />
                    </Field>
                  ))}
              </div>
              <Field label="Изображение варианта">
                <input
                  value={edition.img || ""}
                  onChange={(event) =>
                    editEdition(index, "img", event.target.value)
                  }
                />
              </Field>
            </div>
          ))}
          <button
            type="button"
            className="cms-text-button"
            onClick={() =>
              set("variants", {
                ...item.variants,
                editions: [
                  ...editions,
                  {
                    uid: crypto.randomUUID(),
                    sku: "",
                    price: item.price ?? "",
                    quantity: "",
                    img: "",
                    Вариант: "",
                  },
                ],
              })
            }
          >
            <Plus size={16} />
            Добавить вариант
          </button>
          <details className="cms-details">
            <summary>Дополнительные параметры вариантов</summary>
            <p className="cms-muted">
              Здесь доступны опции, надбавки и импортированные параметры.
              Обычные поля выше сохраняют их без изменений.
            </p>
            <JsonField
              label="Варианты и опции (JSON)"
              value={item.variants || { editions: [] }}
              onValidityChange={(invalid) => onInvalid("variants", invalid)}
              onChange={(value) => {
                if (
                  value &&
                  typeof value === "object" &&
                  !Array.isArray(value) &&
                  (!("editions" in value) ||
                    (Array.isArray(value.editions) &&
                      value.editions.every(
                        (edition) =>
                          edition &&
                          typeof edition === "object" &&
                          !Array.isArray(edition) &&
                          Object.values(edition).every(
                            (field) =>
                              field === null ||
                              ["string", "number", "boolean"].includes(
                                typeof field,
                              ),
                          ) &&
                          ["uid", "sku", "price", "priceold", "quantity"].every(
                            (key) =>
                              edition[key] == null ||
                              ["string", "number"].includes(
                                typeof edition[key],
                              ),
                          ) &&
                          (edition.img === undefined ||
                            typeof edition.img === "string"),
                      )))
                )
                  set("variants", value as CMSProduct["variants"]);
                else onInvalid("variants", true);
              }}
            />
          </details>
        </section>
      </div>
      <aside className="cms-editor-aside">
        <section className="cms-card cms-form-card">
          <h2>Публикация</h2>
          <Field label="Статус">
            <select
              value={item.status}
              onChange={(event) =>
                set("status", event.target.value as CMSProduct["status"])
              }
            >
              <option value="draft">Черновик</option>
              <option value="published">Опубликовано</option>
            </select>
          </Field>
          <p className="cms-muted">
            Опубликованный товар доступен в каталоге. Черновик виден только в
            CMS.
          </p>
          <Field label="ID товара">
            <input readOnly value={item.id} />
          </Field>
        </section>
        <section className="cms-card cms-form-card">
          <h2>Категории</h2>
          <Field label="Основная категория">
            <select
              value={item.categoryPath || ""}
              onChange={(event) => {
                const categoryPath = event.target.value;
                const category = content.categories.find(
                  (entry) => entry.path === categoryPath,
                );
                onChange({
                  ...item,
                  categoryOverride: true,
                  categoryPath,
                  category: category?.title || item.category,
                  categoryPaths: [
                    ...new Set(
                      [
                        categoryPath,
                        ...(item.categoryPaths || []).filter(
                          (path) => path !== item.categoryPath,
                        ),
                      ].filter(Boolean),
                    ),
                  ],
                });
              }}
            >
              <option value="">Выберите категорию</option>
              {content.categories.map((category) => (
                <option key={category.path} value={category.path}>
                  {category.title}
                </option>
              ))}
            </select>
          </Field>
          <span className="cms-field-title">Показывать в разделах</span>
          <div className="cms-checkbox-list">
            {content.categories.map((category) => (
              <label key={category.path}>
                <input
                  type="checkbox"
                  checked={(item.categoryPaths || [item.categoryPath]).includes(
                    category.path,
                  )}
                  disabled={category.path === item.categoryPath}
                  onChange={(event) =>
                    onChange({
                      ...item,
                      categoryOverride: true,
                      categoryPaths: event.target.checked
                        ? [
                            ...new Set([
                              ...(item.categoryPaths || []),
                              category.path,
                            ]),
                          ]
                        : (item.categoryPaths || []).filter(
                            (path) => path !== category.path,
                          ),
                    })
                  }
                />
                <span>{category.title}</span>
              </label>
            ))}
          </div>
        </section>
        <section className="cms-card cms-form-card">
          <h2>Дополнительно</h2>
          <Field label="Исходный адрес товара">
            <input
              value={item.url}
              onChange={(event) => set("url", event.target.value)}
            />
          </Field>
          <details className="cms-details">
            <summary>Форматированное описание</summary>
            <Field
              label="Описание в HTML"
              hint="При изменении обычного описания форматированная версия сбрасывается, чтобы на сайте отображался новый текст."
            >
              <textarea
                rows={7}
                className="cms-code"
                value={item.descriptionHtml || ""}
                onChange={(event) => set("descriptionHtml", event.target.value)}
              />
            </Field>
          </details>
        </section>
      </aside>
    </div>
  );
}
