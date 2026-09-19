import { CountUp } from "../components/CountUp";
import { postPath, categoryPath } from "../blog/content";
import { useBlogData } from "../blog/runtime";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Award,
  Layers3,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useStore } from "../lib/store";
import { Breadcrumbs, Picture, EmptyState } from "../components/Primitives";
import { Reveal } from "../components/Motion";
import { Benefits } from "../components/ServiceSections";
import { localHref, type SourcePage } from "../lib/content";
import "./company-refresh.css";
function prepareHTML(raw: string, pageTitle = "") {
  const doc = new DOMParser().parseFromString(raw, "text/html");
  const normalized = (s: string) =>
    s.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  doc.querySelectorAll("h1, h2, h3, h4").forEach((h) => {
    const text = h.textContent?.trim() || "";
    if (!text || normalized(text) === normalized(pageTitle)) {
      h.remove();
      return;
    }
    const next = doc.createElement(
      h.tagName === "H1" ? "h2" : h.tagName.toLowerCase(),
    );
    next.textContent = text;
    h.replaceWith(next);
  });
  doc.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href) a.setAttribute("href", localHref(href));
    if (a.querySelector("table")) a.textContent = a.textContent?.trim() || "";
    a.classList.add("source-link");
  });
  // The imported div wrappers have no layout metadata. Unwrap them and keep
  // actual paragraphs, headings, lists, links and data tables in reading order.
  [...doc.querySelectorAll("div")].reverse().forEach((div) => {
    if (
      div.closest("a, td, th, li") ||
      div.querySelector("div, p, h2, h3, h4, ul, ol, table")
    ) {
      div.replaceWith(...div.childNodes);
    } else if (div.textContent?.trim()) {
      const p = doc.createElement("p");
      p.innerHTML = div.innerHTML.replace(
        /^(\s*<br\s*\/?>)+|(<br\s*\/?>\s*)+$/gi,
        "",
      );
      div.replaceWith(p);
    } else div.remove();
  });
  return doc.body.innerHTML;
}
export function OriginalContent({
  page,
  blockIds,
}: {
  page: SourcePage;
  blockIds?: string[];
}) {
  const blocks = page.blocks?.filter(
    (b) =>
      (!blockIds || blockIds.includes(b.id)) &&
      (b.html || !["Left", "Right"].includes(b.heading)),
  );
  return (
    <div className="original-content">
      {blocks?.length ? (
        blocks.map((b) => (
          <section className="original-block" id={b.id} key={b.id}>
            {b.html ? (
              <div
                className="source-text"
                dangerouslySetInnerHTML={{
                  __html: prepareHTML(b.html, page.title),
                }}
              />
            ) : (
              <>
                <h2>{b.heading}</h2>
                {b.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </>
            )}
          </section>
        ))
      ) : page.html ? (
        <div
          className="source-text"
          dangerouslySetInnerHTML={{
            __html: prepareHTML(page.html, page.title),
          }}
        />
      ) : (
        page.paragraphs.map((p, i) => <p key={i}>{p}</p>)
      )}
    </div>
  );
}
export default function Information({ page }: { page: SourcePage }) {
  const { data, discuss } = useStore();
  const home = data.pages.find((p) => p.path === "/");
  const isDelivery = ["/dostavka", "/page13486315.html"].includes(page.path);
  const title =
    page.path === "/kakpodobrat" ? "Как подобрать шторы" : page.title;
  const images = page.images.filter(
    (img, i, arr) =>
      !img.src.includes("/resizeb/20") &&
      arr.findIndex((x) => x.src === img.src) === i,
  );
  const category = data.categories.find((c) => c.path === page.path);
  if (category && !category.sourceHasCatalog) {
    const relatedPaths = ["/podyshki", "/pokrivala"].includes(page.path)
      ? [
          "/tkani",
          "/kisti",
          page.path === "/podyshki" ? "/pokrivala" : "/podyshki",
        ]
      : ["/fyrnityra", "/shnypki"].includes(page.path)
        ? ["/karnizi", "/kisti", "/tyl"]
        : ["/tkani", "/tyl", "/karnizi"];
    return (
      <article className="container direction-editorial">
        <Breadcrumbs
          items={[
            { label: "Все направления", to: "/catalog" },
            { label: title },
          ]}
        />
        <div className="direction-editorial-hero">
          <figure>
            <Picture src={images[0]?.src} alt={images[0]?.alt || title} eager />
          </figure>
          <div className="direction-editorial-copy surface">
            <p className="eyebrow">ИНТЕРЬЕРНЫЙ ТЕКСТИЛЬ И ДЕТАЛИ</p>
            <h1>{title}</h1>
            <OriginalContent page={page} />
            <button
              className="button"
              onClick={() => discuss("Подбор — " + title)}
            >
              Обсудить с дизайнером <ArrowUpRight size={18} />
            </button>
            <Link className="text-link" to="/projects">
              Отзывы клиентов <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>
        {images.length > 1 && (
          <div className="article-gallery">
            {images.slice(1).map((im, i) => (
              <Picture key={im.src + i} src={im.src} alt={im.alt || title} />
            ))}
          </div>
        )}
        <section className="direction-related">
          <div className="section-heading">
            <h2>Дополните интерьер</h2>
            <Link className="text-link" to="/catalog">
              Все направления <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="direction-related-grid">
            {relatedPaths.map((path) => {
              const item = data.categories.find((c) => c.path === path);
              return (
                item && (
                  <Link to={path} className="surface" key={path}>
                    <Picture src={item.image} alt={item.title} />
                    <span>
                      {item.title}
                      <ArrowUpRight size={21} />
                    </span>
                  </Link>
                )
              );
            })}
          </div>
        </section>
      </article>
    );
  }
  return (
    <article className="container information-page">
      <Breadcrumbs items={[{ label: title }]} />
      <p className="eyebrow">VIP DECOR DESIGN</p>
      <h1>{title}</h1>
      {images[0] && (
        <figure className="article-cover">
          <Picture src={images[0].src} alt={images[0].alt || title} eager />
        </figure>
      )}
      <OriginalContent page={page} />
      {isDelivery && home && (
        <OriginalContent
          page={home}
          blockIds={["rec207714893", "rec217629625"]}
        />
      )}
      {images.length > 1 && (
        <div className="article-gallery">
          {images.slice(1).map((im, i) => (
            <Picture key={im.src + i} src={im.src} alt={im.alt || title} />
          ))}
        </div>
      )}
      {!["/popd", "/dostavka", "/page13486315.html"].includes(page.path) && (
        <div className="article-actions">
          <Link className="button" to="/selection">
            Подобрать шторы
            <ArrowUpRight size={19} />
          </Link>
          <Link className="text-link" to="/catalog">
            Все направления
            <ArrowUpRight size={18} />
          </Link>
        </div>
      )}
    </article>
  );
}
export function Company() {
  const { data, discuss } = useStore();
  // Business figures supplied by the owner, independent of the online inventory.
  const facts = [
    { value: "20 120", label: "Довольных клиентов", Icon: UsersRound },
    { value: "10 000", label: "Тканей в наличии", Icon: Layers3 },
    { value: "120", label: "Лучших мировых брендов", Icon: Sparkles },
    { value: "21", label: "Год успешной работы", Icon: Award },
  ];
  const services = [
    {
      title: "Шторы по вашим размерам",
      text: "Портьеры, тюль, ламбрекены и бандо. Подберём сочетание ткани и формы под ваш интерьер.",
      image: data.gallery.find((photo) =>
        photo.src.endsWith("74a4c8d1c28498b376.webp"),
      )?.src,
      alt: "Портьеры и тюль в интерьере — работа VIP Decor Design",
      to: "/curtains",
      action: "Выбрать оформление",
    },
    {
      title: "Домашний текстиль",
      text: "Покрывала, мебельные чехлы, подушки и декоративные валики. Детали, которые собирают интерьер воедино.",
      image: data.gallery.find((photo) =>
        photo.src.endsWith("bdf7eaa4894d2a9641.webp"),
      )?.src,
      alt: "Бирюзовое покрывало и подушки — работа VIP Decor Design",
      to: "/projects",
      action: "Отзывы клиентов",
    },
    {
      title: "Оформление окна",
      text: "Подбор карнизов и креплений, навеска и отпаривание. Продумываем каждую деталь готового окна.",
      image: data.categories.find((category) => category.path === "/karnizi")
        ?.image,
      alt: "Декоративный карниз и крепления для штор",
      to: "/karnizi",
      action: "Подобрать карниз",
    },
  ];
  return (
    <div className="container company-page">
      <Breadcrumbs items={[{ label: "О компании" }]} />
      <div className="studio-intro company-intro">
        <Reveal>
          <p className="eyebrow">КОМПАНИЯ VIP DECOR DESIGN</p>
          <h1>О компании</h1>
          <p>
            Шьём шторы и домашний текстиль в Москве. Подбираем ткани,
            изготавливаем и устанавливаем изделия.
          </p>
          <div className="company-intro-actions">
            <button
              className="button"
              onClick={() => discuss("Знакомство с VIP Decor Design")}
            >
              Обсудить ваш интерьер <ArrowUpRight size={18} />
            </button>
            <Link className="text-link" to="/contacts">
              В гости в шоурум <ArrowUpRight size={18} />
            </Link>
          </div>
        </Reveal>
        <Reveal delay={0.12} className="company-portrait">
          <Picture
            src={
              data.gallery.find((photo) =>
                photo.src.endsWith("df413fa7967205199b.webp"),
              )?.src || data.gallery[2]?.src
            }
            alt="Оформление окон в гостиной — работа VIP Decor Design"
            eager
          />
          <span className="portrait-caption">Работа VIP DECOR DESIGN</span>
        </Reveal>
      </div>
      <section
        className="company-numbers"
        aria-labelledby="company-numbers-title"
      >
        <Reveal className="company-numbers-heading">
          <p className="eyebrow">ОПЫТ В КАЖДОЙ ДЕТАЛИ</p>
          <h2 id="company-numbers-title">Компания в цифрах</h2>
        </Reveal>
        <div className="company-numbers-grid">
          {facts.map(({ value, label, Icon }, index) => (
            <Reveal className="company-number" key={label} delay={index * 0.06}>
              <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
              <strong>
                <CountUp value={Number(value.replace(/\s/g, ""))} />
              </strong>
              <span>{label}</span>
            </Reveal>
          ))}
        </div>
      </section>
      <section
        className="company-expertise"
        id="rec207714885"
        aria-labelledby="company-expertise-title"
      >
        <Reveal className="company-expertise-heading" id="rec208310200">
          <div>
            <p className="eyebrow">ОТ ИДЕИ ДО ГОТОВОГО ИНТЕРЬЕРА</p>
            <h2 id="company-expertise-title">Что мы делаем</h2>
          </div>
          <p id="rec217622225">
            Дизайнер, мастер по пошиву и монтажник сопровождают заказ от выбора
            ткани до установки.
          </p>
        </Reveal>
        <div className="company-expertise-grid">
          {services.map((service, index) => (
            <Reveal
              className="company-service"
              key={service.title}
              delay={index * 0.06}
            >
              <figure>
                <Picture src={service.image} alt={service.alt} />
                <span className="company-service-index" aria-hidden="true">
                  0{index + 1}
                </span>
              </figure>
              <div className="company-service-copy">
                <h3>{service.title}</h3>
                <p>{service.text}</p>
                <Link className="button secondary" to={service.to}>
                  {service.action} <ArrowUpRight size={18} />
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </section>
      <Benefits />
      <div className="studio-links">
        <Link to="/price">
          Цены на пошив
          <ArrowUpRight />
        </Link>
        <Link to="/page13486315.html">
          Доставка и оплата
          <ArrowUpRight />
        </Link>
        <Link to="/projects">
          Отзывы клиентов
          <ArrowUpRight />
        </Link>
      </div>
    </div>
  );
}
export function Sitemap() {
  const { data } = useStore();
  const { posts, categories } = useBlogData();
  return (
    <div className="container information-page">
      <Breadcrumbs items={[{ label: "Карта сайта" }]} />
      <h1>Карта сайта</h1>
      <div className="sitemap-links">
        {[
          ["/blog", "Блог об интерьере"],
          ...categories.map((c) => [categoryPath(c.slug), c.title]),
          ...posts.map((p) => [postPath(p), p.title]),
          ["/selection", "Подбор штор"],
          ["/calculator", "Калькулятор"],
          ["/company", "О компании"],
          ["/projects", "Отзывы клиентов"],
          ["/contacts", "Контакты"],
          ["/price", "Прайс на пошив"],
          ...data.pages.map((p) => [p.path, p.title]),
        ].map(([path, title]) => (
          <Link key={path} to={path}>
            {title}
            <ArrowUpRight size={17} />
          </Link>
        ))}
      </div>
    </div>
  );
}
export function NotFound() {
  return (
    <div className="container not-found-page">
      <p className="error-number" aria-hidden="true">
        404
      </p>
      <h1 className="sr-only">Страница не найдена</h1>
      <EmptyState
        title="Эта страница не найдена."
        text="Загляните в коллекции или вернитесь на главную."
        to="/catalog"
        link="Все направления"
      />
    </div>
  );
}
