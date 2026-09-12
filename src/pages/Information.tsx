import { Link } from "react-router-dom";
import { ArrowUpRight, MapPin, Phone, Mail } from "lucide-react";
import { useStore } from "../lib/store";
import { Breadcrumbs, Picture, EmptyState } from "../components/Primitives";
import { Reveal } from "../components/Motion";
import { Benefits, MeasurementCTA } from "../components/ServiceSections";
import { localHref, type SourcePage } from "../lib/content";
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
  const { data } = useStore();
  const home = data.pages.find((p) => p.path === "/");
  const isDelivery = ["/dostavka", "/page13486315.html"].includes(page.path);
  const title =
    page.path === "/kakpodobrat" ? "Как подобрать шторы" : page.title;
  const images = page.images.filter(
    (img, i, arr) =>
      !img.src.includes("/resizeb/20") &&
      arr.findIndex((x) => x.src === img.src) === i,
  );
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
  const { data } = useStore();
  return (
    <div className="container company-page">
      <Breadcrumbs items={[{ label: "О компании" }]} />
      <div className="studio-intro company-intro">
        <Reveal>
          <p className="eyebrow">КОМПАНИЯ VIP DECOR DESIGN</p>
          <h1>
            Красота —<br />
            внимание
            <br />к деталям.
          </h1>
          <p>
            Индивидуальный пошив и текстильное оформление интерьеров. От выбора
            ткани до последней складки.
          </p>
          <Link className="text-link" to="/contacts">
            Познакомимся в шоуруме
            <ArrowUpRight size={18} />
          </Link>
        </Reveal>
        <Reveal delay={0.12} className="company-portrait">
          <Picture
            src={data.gallery[2]?.src}
            alt="Узорчатые портьеры в интерьере — работа VIP Decor Design"
            eager
          />
          <span className="portrait-caption">
            Фактура, которую хочется рассматривать.
          </span>
        </Reveal>
      </div>
      <Reveal
        id="rec224459428"
        className="company-facts"
        aria-label="Компания в цифрах"
      >
        {[
          ["21", "год работы"],
          ["20 120", "довольных клиентов"],
          ["10 000", "тканей в наличии"],
          ["120", "мировых брендов"],
        ].map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </Reveal>
      <section className="company-story service-section" id="rec207714885">
        <Reveal id="rec208310200">
          <p className="eyebrow">О НАС</p>
          <h2>
            Одна команда.
            <br />
            Цельный интерьер.
          </h2>
        </Reveal>
        <Reveal id="rec217622225" delay={0.08}>
          <p className="story-lead">
            Мы — компания VIP DECOR DESIGN. Помогаем сделать дом уютнее с
            помощью тканей, света и деталей.
          </p>
          <p>
            В нашей команде работают дизайнеры, мастера по пошиву и специалисты
            по монтажу. Подбираем материалы и аксессуары, продумываем оформление
            и берём на себя изготовление и установку.
          </p>
          <p>
            Работаем с мировыми брендами и собственным производством. Шьём
            шторы, ламбрекены и бандо, покрывала, мебельные чехлы и декоративные
            валики.
          </p>
          <Link className="text-link" to="/projects">
            Посмотреть наши работы
            <ArrowUpRight size={18} />
          </Link>
        </Reveal>
      </section>
      <Benefits />
      <MeasurementCTA />
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
          Галерея работ
          <ArrowUpRight />
        </Link>
      </div>
    </div>
  );
}
export function Curtains() {
  const { data } = useStore();
  return (
    <div className="container curtains-page">
      <Breadcrumbs items={[{ label: "Шторы на заказ" }]} />
      <div className="studio-intro curtains-intro" id="rec214513799">
        <div>
          <p className="eyebrow">ИНДИВИДУАЛЬНЫЙ ПОШИВ</p>
          <h1>
            Шторы, которые
            <br />
            подходят
            <br />
            именно вам.
          </h1>
          <p>
            Начнём с особенностей вашей комнаты, подберём ткань и создадим
            оформление, с которым дома станет уютнее.
          </p>
          <Link className="button" to="/selection">
            Подобрать шторы
            <ArrowUpRight size={20} />
          </Link>
        </div>
        <figure>
          <Picture
            src="/images/concept-living.webp"
            alt="Концепция интерьера с натуральными портьерами"
            eager
          />
          <figcaption className="image-note">Концепция интерьера</figcaption>
        </figure>
      </div>
      <section className="service-section curtain-collection">
        <Reveal className="service-heading">
          <p className="eyebrow">НАЙДИТЕ СВОЙ СИЛУЭТ</p>
          <h2>Разные формы. Ваш характер.</h2>
          <p>От лаконичных римских штор до мягкой классической драпировки.</p>
        </Reveal>
        <div className="curtain-types">
          {data.pages
            .filter((p) =>
              [
                "/rimskieshtori",
                "/franzusckieshtoru",
                "/avstriskieshtori",
                "/klasiheskieshtori",
              ].includes(p.path),
            )
            .map((p) => (
              <Link key={p.path} to={p.path}>
                <Picture src={p.images[0]?.src} alt={p.title} />
                <h2>
                  {p.title}
                  <ArrowUpRight size={20} />
                </h2>
              </Link>
            ))}
        </div>
      </section>
      <Benefits />
      <section className="service-section curtains-process">
        <Reveal className="service-heading">
          <p className="eyebrow">КАК ВСЁ ПРОИСХОДИТ</p>
          <h2>От идеи до готового окна.</h2>
        </Reveal>
        <div className="order-steps">
          {[
            [
              "Знакомство и замер",
              "Обсудим комнату, ваши пожелания и размеры окна.",
            ],
            [
              "Ткани и детали",
              "Подберём фактуры, оттенки, карнизы и согласуем оформление.",
            ],
            [
              "Пошив и установка",
              "Изготовим текстиль, доставим, отпарим и повесим шторы.",
            ],
          ].map(([title, text], i) => (
            <Reveal key={title} delay={i * 0.07}>
              <span className="step-number">0{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </Reveal>
          ))}
        </div>
      </section>
      <MeasurementCTA />
    </div>
  );
}
export function Price() {
  const { data } = useStore();
  const home = data.pages.find((p) => p.path === "/");
  return (
    <article className="container information-page">
      <Breadcrumbs items={[{ label: "Прайс на пошив" }]} />
      <p className="eyebrow">РАБОТА С ТЕКСТИЛЕМ</p>
      <h1>Цена каждой детали.</h1>
      {home && <OriginalContent page={home} blockIds={["rec214496134"]} />}
      <Link className="button" to="/calculator">
        Рассчитать стоимость штор
        <ArrowUpRight size={19} />
      </Link>
    </article>
  );
}
export function Contacts() {
  const { data, discuss } = useStore();
  return (
    <div className="container contacts-page">
      <Breadcrumbs items={[{ label: "Контакты" }]} />
      <p className="eyebrow">БУДЕМ РАДЫ ЗНАКОМСТВУ</p>
      <h1>
        Приходите
        <br />
        за вдохновением.
      </h1>
      <div className="contacts-layout">
        <div>
          <h2>Шоурум в Москве</h2>
          <p className="contact-line">
            <MapPin size={22} />
            {data.contacts.address}
          </p>
          <p>
            Рассмотрите ткани вживую, почувствуйте фактуру
            <br />и обсудите свой интерьер с дизайнером.
          </p>
          <a
            className="text-link"
            href="https://yandex.ru/maps/?text=Москва%20Сокольническая%20площадь%204А"
            target="_blank"
            rel="noopener noreferrer"
          >
            Построить маршрут
            <ArrowUpRight size={18} />
          </a>
        </div>
        <div>
          <h2>Давайте поговорим</h2>
          {data.contacts.phones.map((p) => (
            <a
              className="contact-line"
              key={p}
              href={"tel:" + p.replace(/[^+\d]/g, "")}
            >
              <Phone size={19} />
              {p}
            </a>
          ))}
          <a className="contact-line" href={"mailto:" + data.contacts.email}>
            <Mail size={20} />
            {data.contacts.email}
          </a>
          <div className="social-links">
            {data.contacts.socials.map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {s.title}
                <ArrowUpRight size={16} />
              </a>
            ))}
          </div>
          <button className="button" onClick={() => discuss()}>
            Обсудить проект
            <ArrowUpRight size={19} />
          </button>
        </div>
      </div>
    </div>
  );
}
export function Sitemap() {
  const { data } = useStore();
  return (
    <div className="container information-page">
      <Breadcrumbs items={[{ label: "Карта сайта" }]} />
      <h1>Всё, что вам нужно.</h1>
      <div className="sitemap-links">
        {[
          ["/selection", "Подбор штор"],
          ["/calculator", "Калькулятор"],
          ["/company", "О компании"],
          ["/projects", "Проекты"],
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
    <div className="container">
      <EmptyState
        title="Эта страница не найдена."
        text="Загляните в коллекции или вернитесь на главную."
        to="/catalog"
        link="Все направления"
      />
    </div>
  );
}
