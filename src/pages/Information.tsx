import { Link } from "react-router-dom";
import { ArrowUpRight, MapPin, Phone, Mail } from "lucide-react";
import { useStore } from "../lib/store";
import { Breadcrumbs, Picture, EmptyState } from "../components/Primitives";
import { localHref, type SourcePage } from "../lib/content";
function prepareHTML(raw: string) {
  const doc = new DOMParser().parseFromString(raw, "text/html");
  doc.querySelectorAll("h1").forEach((h) => {
    const next = doc.createElement("h2");
    next.innerHTML = h.innerHTML;
    h.replaceWith(next);
  });
  doc.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href) a.setAttribute("href", localHref(href));
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
              <div dangerouslySetInnerHTML={{ __html: prepareHTML(b.html) }} />
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
        <div dangerouslySetInnerHTML={{ __html: prepareHTML(page.html) }} />
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
export function Studio() {
  const { data } = useStore();
  const home = data.pages.find((p) => p.path === "/");
  const shownElsewhere = new Set([
    ...data.gallery.map((image) => image.src),
    ...data.products.flatMap((product) => [product.image, ...product.images]),
  ]);
  const details =
    home?.images.filter(
      (image, index, images) =>
        !/\.svg(?:\?|$)/i.test(image.src) &&
        !shownElsewhere.has(image.src) &&
        images.findIndex((other) => other.src === image.src) === index,
    ) || [];
  return (
    <div className="container studio-page">
      <Breadcrumbs items={[{ label: "О студии" }]} />
      <div className="studio-intro">
        <div>
          <p className="eyebrow">ЗНАКОМСТВО СО СТУДИЕЙ</p>
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
            Загляните к нам
            <ArrowUpRight size={18} />
          </Link>
        </div>
        <Picture
          src={data.gallery[2]?.src || data.gallery[0]?.src}
          alt="Текстильное оформление из галереи VIP Decor Design"
          eager
        />
      </div>
      {home && (
        <OriginalContent
          page={home}
          blockIds={[
            "rec224459428",
            "rec208310200",
            "rec217622225",
            "rec207714885",
            "rec207850634",
            "rec209177378",
          ]}
        />
      )}
      {details.length > 0 && (
        <section
          className="section"
          id="studio-details"
          aria-labelledby="studio-details-title"
        >
          <h2 id="studio-details-title">Детали студии</h2>
          <div className="article-gallery">
            {details.map((image) => (
              <Picture
                key={image.src}
                src={image.src}
                alt={image.alt || "Текстиль и детали интерьера"}
              />
            ))}
          </div>
        </section>
      )}
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
  const { data, discuss } = useStore();
  const home = data.pages.find((p) => p.path === "/");
  return (
    <div className="container curtains-page">
      <Breadcrumbs items={[{ label: "Шторы на заказ" }]} />
      <div className="studio-intro">
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
          />
          <figcaption className="image-note">Концепция интерьера</figcaption>
        </figure>
      </div>
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
      {home && (
        <OriginalContent
          page={home}
          blockIds={["rec214513799", "rec207850634", "rec209177378"]}
        />
      )}
      <div className="article-actions">
        <Link className="button" to="/calculator">
          Рассчитать стоимость
          <ArrowUpRight size={20} />
        </Link>
        <button
          className="text-link"
          onClick={() => discuss("Замер и консультация")}
        >
          Заказать замер
          <ArrowUpRight size={18} />
        </button>
      </div>
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
          ["/studio", "О студии"],
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
