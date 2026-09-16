import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import {
  blogPage,
  categories,
  categoryPath,
  posts,
  postPath,
  readingMinutes,
  type Article,
  type ArticleImage,
} from "./content";
import "./blog.css";

function EditorialImage({
  image,
  hero = false,
}: {
  image: ArticleImage;
  hero?: boolean;
}) {
  return (
    <img
      src={image.src}
      srcSet={image.variants.map((v) => `${v.src} ${v.width}w`).join(", ")}
      sizes={
        hero
          ? "(max-width: 760px) 100vw, 85vw"
          : "(max-width: 760px) 100vw, 40vw"
      }
      alt={image.alt}
      width={image.width}
      height={image.height}
      loading={hero ? "eager" : "lazy"}
      fetchPriority={hero ? "high" : undefined}
      decoding="async"
    />
  );
}
export function ArticleCard({
  post,
  featured = false,
}: {
  post: Article;
  featured?: boolean;
}) {
  const category = categories.find((c) => c.slug === post.category);
  return (
    <article className={`blog-card${featured ? " blog-card-featured" : ""}`}>
      <Link
        to={postPath(post)}
        className="blog-card-image"
        tabIndex={-1}
        aria-hidden="true"
      >
        <EditorialImage image={post.image} hero={featured} />
      </Link>
      <div className="blog-card-copy">
        <div className="blog-meta">
          <Link to={categoryPath(post.category)}>{category?.title}</Link>
          <span>≈ {readingMinutes(post)} мин чтения</span>
        </div>
        <h2>
          <Link to={postPath(post)}>
            {post.title}
            <ArrowUpRight size={22} aria-hidden="true" />
          </Link>
        </h2>
        <p>{post.excerpt}</p>
        <Link
          className="blog-read"
          to={postPath(post)}
          aria-label={`Читать: ${post.title}`}
        >
          Читать статью <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
export function RecommendedArticles() {
  return (
    <section
      className="home-section blog-recommendations"
      aria-labelledby="home-blog-title"
    >
      <div className="section-heading two-sided">
        <div>
          <p className="eyebrow">ИДЕИ ДЛЯ ВАШЕГО ДОМА</p>
          <h2 id="home-blog-title">Интерьер начинается с деталей</h2>
        </div>
        <Link className="text-link" to="/blog">
          Все статьи <ArrowUpRight size={18} />
        </Link>
      </div>
      <div className="blog-grid">
        {posts.slice(0, 3).map((p) => (
          <ArticleCard key={p.slug} post={p} />
        ))}
      </div>
    </section>
  );
}
function Crumbs({
  post,
  category,
}: {
  post?: Article;
  category?: { slug: string; title: string };
}) {
  const currentCategory =
    category || categories.find((c) => c.slug === post?.category);
  return (
    <nav className="blog-breadcrumbs" aria-label="Хлебные крошки">
      <ol>
        <li>
          <Link to="/">Главная</Link>
        </li>
        <li>
          {post || category ? (
            <Link to="/blog">Блог</Link>
          ) : (
            <span aria-current="page">Блог</span>
          )}
        </li>
        {currentCategory && (
          <li>
            {post ? (
              <Link to={categoryPath(currentCategory.slug)}>
                {currentCategory.title}
              </Link>
            ) : (
              <span aria-current="page">{currentCategory.title}</span>
            )}
          </li>
        )}
        {post && (
          <li>
            <span aria-current="page">{post.title}</span>
          </li>
        )}
      </ol>
    </nav>
  );
}
function ArticlePage({ post }: { post: Article }) {
  const category = categories.find((c) => c.slug === post.category);
  const related = post.related
    .map((slug) => posts.find((p) => p.slug === slug))
    .filter((p): p is Article => !!p);
  return (
    <div className="container blog-page blog-article-page">
      <Crumbs post={post} />
      <article>
        <header className="blog-article-heading">
          <div className="blog-meta">
            <Link to={categoryPath(post.category)}>{category?.title}</Link>
            <span>≈ {readingMinutes(post)} мин чтения</span>
          </div>
          <h1>{post.title}</h1>
          <p className="blog-lead">{post.intro}</p>
          {(post.datePublished || post.dateModified) && (
            <p className="blog-meta">
              {post.datePublished && (
                <span>
                  Опубликовано:{" "}
                  <time dateTime={post.datePublished}>
                    {post.datePublished}
                  </time>
                </span>
              )}
              {post.dateModified && (
                <span>
                  Обновлено:{" "}
                  <time dateTime={post.dateModified}>{post.dateModified}</time>
                </span>
              )}
            </p>
          )}
        </header>
        <figure
          className={`blog-cover${post.category === "art-and-decor" ? " blog-cover-art" : ""}`}
        >
          <EditorialImage image={post.image} hero />
          <figcaption>{post.image.caption}</figcaption>
        </figure>
        <div className="blog-reading-layout">
          <nav className="blog-toc" aria-label="Оглавление статьи">
            <p className="eyebrow">В ЭТОЙ СТАТЬЕ</p>
            <ol>
              {post.sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.title}</a>
                </li>
              ))}
            </ol>
            <a className="blog-source-jump" href="#sources">
              Источники материала
            </a>
          </nav>
          <div className="blog-prose">
            {post.sections.map((s) => (
              <section id={s.id} key={s.id} aria-labelledby={`${s.id}-title`}>
                <h2 id={`${s.id}-title`}>{s.title}</h2>
                {s.paragraphs?.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
                {s.list && (
                  <ul>
                    {s.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {s.table && (
                  <div
                    className="blog-table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label={s.title}
                  >
                    <table>
                      <caption className="sr-only">{s.title}</caption>
                      <thead>
                        <tr>
                          {s.table.headers.map((h) => (
                            <th scope="col" key={h}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {s.table.rows.map((r, i) => (
                          <tr key={i}>
                            {r.map((c, j) =>
                              j === 0 ? (
                                <th scope="row" key={j}>
                                  {c}
                                </th>
                              ) : (
                                <td key={j}>{c}</td>
                              ),
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {s.callout && (
                  <aside className="blog-note">
                    <p>{s.callout}</p>
                  </aside>
                )}
                {s.citations?.map((id) => {
                  const source = post.sources.find((c) => c.id === id);
                  return (
                    source && (
                      <p key={id} className="blog-citation">
                        Источник:{" "}
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {source.title}
                        </a>
                      </p>
                    )
                  );
                })}
                {s.links && (
                  <div className="blog-context-links">
                    {s.links.map((l) => (
                      <Link to={l.href} key={l.href}>
                        {l.label}
                        <ArrowUpRight size={17} aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            ))}
            <section
              id="sources"
              className="blog-sources"
              aria-labelledby="sources-title"
            >
              <h2 id="sources-title">Источники и пояснения</h2>
              <p>
                Ссылки ниже подтверждают фактические сведения. Сочетания,
                размеры для примерки и примеры комнат — варианты оформления,
                которые можно адаптировать под свой дом.
              </p>
              <ol>
                {post.sources.map((s) => (
                  <li id={`source-${s.id}`} key={s.id}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.title}
                    </a>
                    <p>{s.note}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      </article>
      {related.length > 0 && (
        <section className="blog-related" aria-labelledby="related-title">
          <p className="eyebrow">ПРОДОЛЖИТЬ ЗНАКОМСТВО</p>
          <h2 id="related-title">Больше идей для вашего дома</h2>
          <div className="blog-grid">
            {related.map((p) => (
              <ArticleCard post={p} key={p.slug} />
            ))}
          </div>
        </section>
      )}
      <Link className="blog-read" to="/blog">
        Вернуться ко всем статьям <ArrowRight size={18} />
      </Link>
    </div>
  );
}
export default function Blog({ path }: { path: string }) {
  const { post, category, known } = blogPage(path);
  if (!known)
    return (
      <div className="container blog-page">
        <Crumbs />
        <h1>Статья не найдена</h1>
        <p>Возможно, адрес изменился или публикация ещё не вышла.</p>
        <Link className="blog-read" to="/blog">
          Все статьи о доме <ArrowRight size={18} />
        </Link>
      </div>
    );
  if (post) return <ArticlePage post={post} />;
  const visible = posts.filter(
    (p) => !category || p.category === category.slug,
  );
  return (
    <div className="container blog-page">
      <Crumbs category={category} />
      <header className="blog-heading">
        <p className="eyebrow">ЖУРНАЛ VIP DECOR DESIGN</p>
        <h1>
          {category?.title || (
            <>
              Дом, в котором
              <br />
              хочется жить
            </>
          )}
        </h1>
        <p>
          {category?.description ||
            "Об интерьере и его деталях: цвете, свете, искусстве и текстиле. Понятные советы, чтобы найти свои сочетания и воплотить их дома."}
        </p>
      </header>
      <nav className="blog-categories" aria-label="Рубрики блога">
        <Link to="/blog" aria-current={!category ? "page" : undefined}>
          Все статьи
        </Link>
        {categories.map((c) => (
          <Link
            key={c.slug}
            to={categoryPath(c.slug)}
            aria-current={category?.slug === c.slug ? "page" : undefined}
          >
            {c.title}
          </Link>
        ))}
      </nav>
      {visible[0] && <ArticleCard post={visible[0]} featured />}
      {visible.length > 1 && (
        <section className="blog-more" aria-labelledby="more-title">
          <div className="section-heading">
            <p className="eyebrow">ПРАКТИКА И ВДОХНОВЕНИЕ</p>
            <h2 id="more-title">Ещё о доме</h2>
          </div>
          <div className="blog-grid">
            {visible.slice(1).map((p) => (
              <ArticleCard post={p} key={p.slug} />
            ))}
          </div>
        </section>
      )}
      <aside className="blog-service">
        <div>
          <p className="eyebrow">ОТ ИДЕИ К ВАШЕМУ ИНТЕРЬЕРУ</p>
          <h2>Начнём с оформления окна</h2>
          <p>
            Поделитесь фотографией комнаты и пожеланиями — обсудим шторы и
            подходящие ткани.
          </p>
        </div>
        <Link className="button" to="/selection">
          Подобрать шторы <ArrowUpRight size={18} />
        </Link>
      </aside>
    </div>
  );
}
