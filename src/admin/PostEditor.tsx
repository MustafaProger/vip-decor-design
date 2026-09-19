import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Field, ImageField, JsonField } from "./Fields";
import {
  titleSlug,
  type CMSContent,
  type CMSPost,
  type CMSSection,
  type MediaResult,
} from "./types";

export function PostEditor({
  item,
  onChange,
  content,
  upload,
  onInvalid,
}: {
  item: CMSPost;
  onChange: (item: CMSPost) => void;
  content: CMSContent;
  upload: (file: File) => Promise<MediaResult>;
  onInvalid: (key: string, invalid: boolean) => void;
}) {
  const set = <K extends keyof CMSPost>(key: K, value: CMSPost[K]) =>
    onChange({ ...item, [key]: value });
  const section = (index: number, change: Partial<CMSSection>) =>
    set(
      "sections",
      item.sections.map((entry, position) =>
        position === index ? { ...entry, ...change } : entry,
      ),
    );
  const move = (index: number, direction: number) => {
    const sections = [...item.sections];
    [sections[index], sections[index + direction]] = [
      sections[index + direction],
      sections[index],
    ];
    set("sections", sections);
  };
  return (
    <div className="cms-editor-columns">
      <div className="cms-editor-main">
        <section className="cms-card cms-form-card">
          <h2>Основное</h2>
          <div className="cms-form-grid">
            <Field label="Заголовок статьи *" wide>
              <input
                required
                maxLength={240}
                value={item.title}
                onChange={(event) => {
                  const title = event.target.value;
                  onChange({
                    ...item,
                    title,
                    ...(item.version === 0 &&
                    (!item.slug || item.slug === titleSlug(item.title))
                      ? { slug: titleSlug(title) }
                      : {}),
                  });
                }}
              />
            </Field>
            <Field
              label="Адрес статьи *"
              hint="Латинские буквы, цифры и дефисы. Изменение адреса меняет ссылку на статью."
            >
              <div className="cms-prefixed-input">
                <span>/blog/</span>
                <input
                  required
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  value={item.slug}
                  onChange={(event) => set("slug", event.target.value)}
                />
              </div>
            </Field>
            <Field label="Рубрика *">
              <select
                required
                value={item.category}
                onChange={(event) => set("category", event.target.value)}
              >
                {content.blogCategories.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Краткое описание для карточки" wide>
              <textarea
                rows={3}
                value={item.excerpt}
                onChange={(event) => set("excerpt", event.target.value)}
              />
            </Field>
            <Field label="Вступление" wide>
              <textarea
                rows={5}
                value={item.intro}
                onChange={(event) => set("intro", event.target.value)}
              />
            </Field>
          </div>
        </section>
        <section className="cms-card cms-form-card">
          <div className="cms-section-heading">
            <div>
              <h2>Содержание статьи</h2>
              <p>Соберите статью из разделов. Порядок можно менять.</p>
            </div>
            <span className="cms-counter">{item.sections.length}</span>
          </div>
          <div className="cms-sections">
            {item.sections.map((entry, index) => (
              <section className="cms-article-section" key={entry.id || index}>
                <div className="cms-section-heading">
                  <h3>Раздел {index + 1}</h3>
                  <div className="cms-inline">
                    <button
                      type="button"
                      className="cms-icon-button"
                      aria-label={`Переместить раздел ${index + 1} выше`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      className="cms-icon-button"
                      aria-label={`Переместить раздел ${index + 1} ниже`}
                      disabled={index === item.sections.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      className="cms-icon-button cms-danger-text"
                      aria-label={`Удалить раздел ${index + 1}`}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Удалить раздел «${entry.title || index + 1}»?`,
                          )
                        ) {
                          set(
                            "sections",
                            item.sections.filter(
                              (_, position) => index !== position,
                            ),
                          );
                          onInvalid(`section-${entry.id}`, false);
                        }
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <Field label="Название раздела *">
                  <input
                    required
                    value={entry.title}
                    onChange={(event) =>
                      section(index, { title: event.target.value })
                    }
                  />
                </Field>
                <Field label="Текст" hint="Разделяйте абзацы пустой строкой.">
                  <textarea
                    rows={7}
                    value={(entry.paragraphs || []).join("\n\n")}
                    onChange={(event) =>
                      section(index, {
                        paragraphs: event.target.value.split(/\n\n/),
                      })
                    }
                  />
                </Field>
                <Field
                  label="Список"
                  hint="Каждый пункт с новой строки. Оставьте пустым, если список не нужен."
                >
                  <textarea
                    rows={3}
                    value={(entry.list || []).join("\n")}
                    onChange={(event) =>
                      section(index, {
                        list: event.target.value
                          ? event.target.value.split("\n")
                          : [],
                      })
                    }
                  />
                </Field>
                <Field label="Выделенная мысль">
                  <textarea
                    rows={2}
                    value={entry.callout || ""}
                    onChange={(event) =>
                      section(index, { callout: event.target.value })
                    }
                  />
                </Field>
                <div className="cms-section-links">
                  <span className="cms-field-title">Ссылки в разделе</span>
                  {(entry.links || []).map((link, linkIndex) => (
                    <div className="cms-repeat-row" key={linkIndex}>
                      <input
                        aria-label={`Текст ссылки ${linkIndex + 1} раздела ${index + 1}`}
                        placeholder="Текст ссылки"
                        value={link.label}
                        onChange={(event) =>
                          section(index, {
                            links: entry.links!.map((value, position) =>
                              linkIndex === position
                                ? { ...value, label: event.target.value }
                                : value,
                            ),
                          })
                        }
                      />
                      <input
                        aria-label={`Адрес ссылки ${linkIndex + 1} раздела ${index + 1}`}
                        placeholder="/shop или https://…"
                        value={link.href}
                        onChange={(event) =>
                          section(index, {
                            links: entry.links!.map((value, position) =>
                              linkIndex === position
                                ? { ...value, href: event.target.value }
                                : value,
                            ),
                          })
                        }
                      />
                      <button
                        className="cms-icon-button"
                        type="button"
                        aria-label="Убрать ссылку"
                        onClick={() =>
                          section(index, {
                            links: entry.links!.filter(
                              (_, position) => linkIndex !== position,
                            ),
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="cms-text-button"
                    onClick={() =>
                      section(index, {
                        links: [
                          ...(entry.links || []),
                          { label: "", href: "" },
                        ],
                      })
                    }
                  >
                    <Plus size={14} />
                    Добавить ссылку
                  </button>
                </div>
                <details className="cms-details">
                  <summary>Таблица и ссылки на источники</summary>
                  <Field
                    label="ID раздела"
                    hint="Якорь для навигации по статье."
                  >
                    <input
                      value={entry.id}
                      onChange={(event) =>
                        section(index, { id: event.target.value })
                      }
                    />
                  </Field>
                  <Field
                    label="Источники раздела"
                    hint="ID источников через запятую. Источники добавляются ниже."
                  >
                    <input
                      value={(entry.citations || []).join(", ")}
                      onChange={(event) =>
                        section(index, {
                          citations: event.target.value
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </Field>
                  <JsonField
                    label="Таблица (JSON)"
                    value={entry.table || null}
                    onValidityChange={(invalid) =>
                      onInvalid(`section-${entry.id}`, invalid)
                    }
                    onChange={(value) => {
                      if (
                        value === null ||
                        (typeof value === "object" &&
                          "headers" in value &&
                          "rows" in value &&
                          Array.isArray(value.headers) &&
                          Array.isArray(value.rows))
                      ) {
                        section(index, {
                          table: (value || undefined) as CMSSection["table"],
                        });
                      } else onInvalid(`section-${entry.id}`, true);
                    }}
                  />
                </details>
              </section>
            ))}
          </div>
          <button
            type="button"
            className="cms-button cms-secondary cms-full-width"
            onClick={() =>
              set("sections", [
                ...item.sections,
                {
                  id: `section-${crypto.randomUUID().slice(0, 8)}`,
                  title: "",
                  paragraphs: [],
                },
              ])
            }
          >
            <Plus size={16} />
            Добавить раздел
          </button>
        </section>
        <section className="cms-card cms-form-card">
          <h2>Источники</h2>
          <p className="cms-muted">
            Ссылки на материалы, которые использованы в статье.
          </p>
          {item.sources.map((source, index) => (
            <div className="cms-article-section" key={index}>
              <div className="cms-section-heading">
                <h3>Источник {index + 1}</h3>
                <button
                  type="button"
                  className="cms-icon-button"
                  aria-label={`Удалить источник ${index + 1}`}
                  onClick={() =>
                    onChange({
                      ...item,
                      sources: item.sources.filter(
                        (_, position) => index !== position,
                      ),
                      sections: item.sections.map((section) => ({
                        ...section,
                        ...(section.citations
                          ? {
                              citations: section.citations.filter(
                                (id) => id !== source.id,
                              ),
                            }
                          : {}),
                      })),
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="cms-form-grid">
                {(
                  [
                    ["id", "ID"],
                    ["title", "Название"],
                    ["url", "Адрес"],
                    ["note", "Примечание"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      value={source[key]}
                      onChange={(event) =>
                        onChange({
                          ...item,
                          sources: item.sources.map((value, position) =>
                            index === position
                              ? { ...value, [key]: event.target.value }
                              : value,
                          ),
                          ...(key === "id"
                            ? {
                                sections: item.sections.map((section) => ({
                                  ...section,
                                  ...(section.citations
                                    ? {
                                        citations: section.citations.map(
                                          (id) =>
                                            id === source.id
                                              ? event.target.value
                                              : id,
                                        ),
                                      }
                                    : {}),
                                })),
                              }
                            : {}),
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            className="cms-text-button"
            onClick={() =>
              set("sources", [
                ...item.sources,
                {
                  id: `source-${crypto.randomUUID().slice(0, 8)}`,
                  title: "",
                  url: "",
                  note: "",
                },
              ])
            }
          >
            <Plus size={16} />
            Добавить источник
          </button>
        </section>
      </div>
      <aside className="cms-editor-aside">
        <section className="cms-card cms-form-card">
          <h2>Публикация</h2>
          <Field label="Статус">
            <select
              value={item.status}
              onChange={(event) =>
                set("status", event.target.value as CMSPost["status"])
              }
            >
              <option value="draft">Черновик</option>
              <option value="published">Опубликовано</option>
            </select>
          </Field>
          <p className="cms-muted">
            Черновик доступен только в CMS. После сохранения опубликованная
            статья появится на сайте.
          </p>
          <Field label="Дата публикации">
            <input
              type="date"
              value={item.datePublished?.slice(0, 10) || ""}
              onChange={(event) =>
                set("datePublished", event.target.value || undefined)
              }
            />
          </Field>
        </section>
        <section className="cms-card cms-form-card">
          <h2>Обложка</h2>
          <ImageField
            value={item.image.src}
            upload={upload}
            onChange={(src, result) =>
              set("image", {
                ...item.image,
                src,
                variants: [],
                ...(result
                  ? { width: result.width, height: result.height }
                  : {}),
              })
            }
          />
          <Field label="Описание изображения (alt)">
            <textarea
              rows={3}
              value={item.image.alt}
              onChange={(event) =>
                set("image", { ...item.image, alt: event.target.value })
              }
            />
          </Field>
          <Field label="Подпись под изображением">
            <textarea
              rows={2}
              value={item.image.caption}
              onChange={(event) =>
                set("image", { ...item.image, caption: event.target.value })
              }
            />
          </Field>
        </section>
        <section className="cms-card cms-form-card">
          <h2>Поисковая выдача</h2>
          <Field label="SEO-заголовок">
            <input
              maxLength={240}
              value={item.seoTitle}
              onChange={(event) => set("seoTitle", event.target.value)}
            />
          </Field>
          <Field label="Описание страницы">
            <textarea
              rows={5}
              maxLength={500}
              value={item.description}
              onChange={(event) => set("description", event.target.value)}
            />
          </Field>
          <div className="cms-search-preview">
            <small>vip2d.ru › blog › {item.slug || "article"}</small>
            <strong>{item.seoTitle || item.title || "Заголовок статьи"}</strong>
            <p>{item.description || "Описание статьи для поисковой выдачи"}</p>
          </div>
        </section>
        <section className="cms-card cms-form-card">
          <h2>Читайте также</h2>
          <div className="cms-checkbox-list">
            {content.posts
              .filter((post) => post.id !== item.id)
              .map((post) => (
                <label key={post.id}>
                  <input
                    type="checkbox"
                    checked={item.related.includes(post.slug)}
                    onChange={(event) =>
                      set(
                        "related",
                        event.target.checked
                          ? [...item.related, post.slug]
                          : item.related.filter((slug) => slug !== post.slug),
                      )
                    }
                  />
                  <span>{post.title}</span>
                </label>
              ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
