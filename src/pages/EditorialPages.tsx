import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  MapPin,
  Phone,
  Mail,
  Navigation,
  Layers,
  Ruler,
  ArrowRight,
} from "lucide-react";
import { useStore } from "../lib/store";
import { Breadcrumbs, Picture } from "../components/Primitives";
import { Reveal, RevealSection } from "../components/Motion";
import guide from "../data/fabric-guide.json";

export function HelpStrip({
  context = "Консультация дизайнера",
}: {
  context?: string;
}) {
  const { discuss } = useStore();
  return (
    <section className="help-strip surface">
      <div>
        <p className="eyebrow">ВМЕСТЕ ПРОЩЕ</p>
        <h2>Нужна помощь с выбором?</h2>
        <p>Обсудите ваш интерьер с дизайнером.</p>
      </div>
      <div className="help-detail">
        <Layers strokeWidth={1.3} />
        <span>
          Ткани
          <br />и фактуры
        </span>
      </div>
      <div className="help-detail">
        <Ruler strokeWidth={1.3} />
        <span>
          Размеры
          <br />и детали
        </span>
      </div>
      <button className="button" onClick={() => discuss(context)}>
        Получить консультацию <ArrowUpRight size={18} />
      </button>
    </section>
  );
}

export function Contacts() {
  const { data, discuss } = useStore();
  const map =
    "https://yandex.ru/maps/?rtext=~" +
    encodeURIComponent("Москва, Сокольническая площадь 4А") +
    "&rtt=auto";
  return (
    <div className="container glass-contacts">
      <Breadcrumbs items={[{ label: "Контакты" }]} />
      <div className="contact-composition">
        <Reveal className="contact-visual">
          <figure className="contact-photo">
            <Picture
              src={data.gallery[14]?.src}
              alt="Шторы и покрывало в интерьере — работа VIP DECOR DESIGN"
              eager
            />
            <figcaption className="glass-caption">
              Текстиль в интерьере · наша работа
            </figcaption>
          </figure>
          <a
            className="location-card surface"
            href={map}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="location-icon">
              <Navigation size={25} strokeWidth={1.3} />
            </span>
            <div>
              <span className="eyebrow">ШОУРУМ В МОСКВЕ</span>
              <strong>Сокольническая площадь, 4А</strong>
              <span>2 этаж, павильон 226</span>
            </div>
            <ArrowUpRight size={23} />
          </a>
        </Reveal>
        <Reveal className="contact-content" delay={0.08}>
          <p className="eyebrow">КОНТАКТЫ</p>
          <h1>Контакты и шоурум</h1>
          <p className="page-lead">
            Приходите в шоурум — подберём ткани и обсудим детали.
          </p>
          <section
            className="contact-card surface"
            aria-label="Адрес и контакты"
          >
            <h2>Будем рады знакомству</h2>
            <div className="contact-row">
              <MapPin strokeWidth={1.4} />
              <div>
                <address>{data.contacts.address}</address>
                <a
                  className="text-link"
                  href={map}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Построить маршрут <ArrowUpRight size={16} />
                </a>
              </div>
            </div>
            <div className="contact-row">
              <Phone strokeWidth={1.4} />
              <div className="contact-phones">
                {data.contacts.phones.map((phone) => (
                  <a key={phone} href={"tel:" + phone.replace(/[^+\d]/g, "")}>
                    {phone}
                  </a>
                ))}
              </div>
            </div>
            <div className="contact-row contact-email">
              <Mail strokeWidth={1.4} />
              <a href={"mailto:" + data.contacts.email}>
                {data.contacts.email}
              </a>
            </div>
            <button
              className="button"
              onClick={() => discuss("Контакты — обсудить интерьер")}
            >
              Обсудить проект <ArrowUpRight size={18} />
            </button>
            <a
              className="button secondary contact-call"
              href={"tel:" + data.contacts.phones[0].replace(/[^+\d]/g, "")}
            >
              <Phone size={18} /> Позвонить
            </a>
          </section>
          <div className="social-links">
            {data.contacts.socials.map((s) => (
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                key={s.url}
              >
                {s.title}
                <ArrowUpRight size={14} />
              </a>
            ))}
          </div>
        </Reveal>
      </div>
    </div>
  );
}

// Transcribed from /#rec214496134. Every amount, "от" and unit is retained.
export const priceGroups = [
  {
    id: "curtains",
    title: "Шторы и тюль",
    items: [
      ["Строчка тюля", "120", "м", ""],
      ["Строчка портьеры", "150", "м", ""],
      ["Люверс с установкой", "180", "шт", ""],
      ["Пошив ламбрекена", "от 1 600", "м", ""],
      ["Бандо с пошивом", "3 500", "м", ""],
      ["Римская штора", "2 350", "метр", ""],
    ],
  },
  {
    id: "bedspreads",
    title: "Покрывала",
    items: [
      ["Покрывало", "от 7 350", "", "Фабричная стёжка, подкладка, пошив"],
    ],
  },
  {
    id: "accessories",
    title: "Аксессуары",
    items: [
      ["Наволочка", "от 650", "шт", ""],
      ["Подхват", "от 500", "шт", ""],
      [
        "Валик с работой",
        "3 500",
        "",
        "Единица расчёта в прайсе не указана — уточните у дизайнера.",
      ],
    ],
  },
];
export function Price() {
  const { data, discuss } = useStore();
  const { hash } = useLocation();
  return (
    <div className="container price-page">
      <Breadcrumbs items={[{ label: "Цены на пошив" }]} />
      <div className="price-composition">
        <div className="price-main">
          <header className="price-intro">
            <p className="eyebrow">ПОШИВ ИНТЕРЬЕРНОГО ТЕКСТИЛЯ</p>
            <h1>Цены на пошив</h1>
            <p className="page-lead">
              Шторы, покрывала и декоративный текстиль.
            </p>
          </header>
          <div className="price-sheet surface" id="rec214496134">
            <nav className="segmented price-nav" aria-label="Категории прайса">
              {priceGroups.map((g) => (
                <a
                  key={g.id}
                  href={"#" + g.id}
                  aria-current={
                    (hash || "#curtains") === "#" + g.id ? "true" : undefined
                  }
                >
                  {g.title}
                </a>
              ))}
            </nav>
            {priceGroups.map((g, i) => (
              <RevealSection className="price-category" id={g.id} key={g.id}>
                <h2>
                  <span>0{i + 1}</span>
                  {g.title}
                </h2>
                <table>
                  <caption className="sr-only">Цены: {g.title}</caption>
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">Услуга</th>
                      <th scope="col">Стоимость и единица</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map(([title, price, unit, note]) => (
                      <tr key={title}>
                        <th scope="row">
                          {title}
                          {note && <small>{note}</small>}
                        </th>
                        <td>
                          <span className="price-value">{price} ₽</span>
                          {unit && (
                            <span className="price-unit"> / {unit}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </RevealSection>
            ))}
            <p className="price-note">
              Точную стоимость вашего заказа уточнит дизайнер после обсуждения
              ткани, размеров и деталей пошива.
            </p>
          </div>
          <div className="price-related">
            <Link to="/pokrivala" className="surface">
              <Picture
                src={
                  data.categories.find((c) => c.path === "/pokrivala")?.image
                }
                alt="Покрывала"
              />
              <span>
                <strong>Покрывала</strong>Посмотреть коллекцию
              </span>
              <ArrowUpRight size={22} />
            </Link>
            <Link to="/podyshki" className="surface">
              <Picture
                src={data.categories.find((c) => c.path === "/podyshki")?.image}
                alt="Декоративные подушки"
              />
              <span>
                <strong>Подушки</strong>Детали для вашего дома
              </span>
              <ArrowUpRight size={22} />
            </Link>
          </div>
        </div>
        <aside className="price-aside">
          <figure>
            <Picture
              src={data.gallery[10]?.src}
              alt="Лёгкий тюль и портьера из галереи VIP DECOR DESIGN"
              eager
            />
            <figcaption>ФАКТУРА. СВЕТ. ДЕТАЛИ.</figcaption>
          </figure>
          <div className="price-calculation surface">
            <p className="eyebrow">ОТ ИДЕИ К РАСЧЁТУ</p>
            <h2>
              Рассчитаем
              <br />
              ваш проект
            </h2>
            <p>Выберите ткань и параметры будущих штор.</p>
            <Link className="button" to="/calculator">
              Рассчитать стоимость <ArrowUpRight size={18} />
            </Link>
            <Link className="text-link" to="/tkani">
              Выбрать ткани <ArrowUpRight size={17} />
            </Link>
            <button
              className="text-link"
              onClick={() => discuss("Консультация по прайсу на пошив")}
            >
              Обсудить пошив <ArrowUpRight size={17} />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

const rooms = [
  {
    id: "bedroom",
    title: "Спальня",
    index: 0,
    subtitle: "Мягкий свет. Спокойные оттенки. Комфортный сон.",
    tips: [
      ["Затемнение", "Жаккард, атлас и блэкаут помогают ограничить свет."],
      ["Фактура", "Сочетайте шторы с покрывалом и подушками."],
      ["Цвет", "Учитывайте оттенки стен и рисунок ткани."],
    ],
    links: ["/blekayt", "/zhakkard"],
  },
  {
    id: "living",
    title: "Гостиная",
    index: 2,
    subtitle: "Текстиль, который собирает интерьер воедино.",
    tips: [
      ["Стиль", "Поддержите характер комнаты тканью и драпировкой."],
      ["Пропорции", "Рисунок и длина штор меняют восприятие окна."],
      ["Свет", "Светлые оттенки помогают сделать комнату просторнее."],
    ],
    links: ["/barxat", "/atlas"],
  },
  {
    id: "children",
    title: "Детская",
    index: 1,
    subtitle: "Уютная комната с вниманием к каждой детали.",
    tips: [
      [
        "Безопасность",
        "Надёжно закрепите карниз. Декор — вне досягаемости ребёнка.",
      ],
      ["Материал", "Рассмотрите лён и хлопок для оформления комнаты."],
      ["Сон", "Плотные шторы помогают затемнить комнату днём."],
    ],
    links: ["/lnanaiatkan", "/blekayt"],
  },
  {
    id: "kitchen",
    title: "Кухня",
    index: 6,
    subtitle: "Практичность, лёгкость и ваш любимый оттенок.",
    tips: [
      ["Форма", "Рассмотрите короткие шторы «кафе» или римские."],
      ["Свет", "Органза и вуаль подходят для лёгких занавесок."],
      ["Детали", "Выбирайте оформление с учётом интерьера кухни."],
    ],
    links: ["/rimskieshtori", "/organza"],
  },
  {
    id: "study",
    title: "Кабинет",
    index: 3,
    subtitle: "Свет, который помогает сосредоточиться.",
    tips: [
      ["Освещение", "Регулируйте свет с помощью рулонных штор или жалюзи."],
      ["Защита", "Плотная ткань помогает защитить обстановку от солнца."],
      ["Стиль", "Согласуйте шторы с общим оформлением кабинета."],
    ],
    links: ["/rulonnieshtori", "/vual"],
  },
  {
    id: "office",
    title: "Офис",
    index: 4,
    subtitle: "Удобное решение для рабочего пространства.",
    tips: [
      ["Практичность", "Учитывайте регулярную чистку и износостойкость."],
      ["Свет", "Сочетайте жалюзи с лёгкими занавесками."],
      ["Характер", "Поддержите цветом и формой атмосферу вашей команды."],
    ],
    links: ["/zhaluzi", "/rulonnieshtori"],
  },
  {
    id: "dining",
    title: "Столовая",
    index: 5,
    subtitle: "Мягкость ткани для тёплых встреч за столом.",
    tips: [
      ["Настроение", "Атлас и бархат — для выразительной обстановки."],
      ["Лёгкость", "Лён и хлопок создают непринуждённую атмосферу."],
      ["Сочетание", "Поддержите шторы скатертью или тканью-компаньоном."],
    ],
    links: ["/atlas", "/lnanaiatkan"],
  },
  {
    id: "bathroom",
    title: "Ванная",
    index: 7,
    subtitle: "Свет и приватность с учётом влажности.",
    tips: [
      ["Влажность", "Выбирайте материал для условий ванной комнаты."],
      ["Уход", "Отдавайте предпочтение тканям, которые легко стирать."],
      ["Приватность", "Учитывайте вид из окна и необходимую плотность."],
    ],
    links: ["/tkani"],
  },
  {
    id: "hallway",
    title: "Прихожая",
    index: 8,
    subtitle: "Первое впечатление начинается у двери.",
    tips: [
      ["Пространство", "Лёгкие занавески зрительно увеличивают комнату."],
      ["Свет", "Для тёмной прихожей нужна светопроницаемая ткань."],
      ["Масштаб", "В небольшом помещении выбирайте лаконичный дизайн."],
    ],
    links: ["/vual", "/tyl"],
  },
  {
    id: "terrace",
    title: "Терраса",
    index: 9,
    subtitle: "Текстиль для отдыха и смены сезонов.",
    tips: [
      ["Сезон", "Летом — лёгкие ткани, в прохладу — защитные материалы."],
      ["Практичность", "На открытом воздухе учитывайте дождь и частый уход."],
      ["Доступ", "Шторы не должны мешать проходу и открыванию двери."],
    ],
    links: ["/tkani"],
  },
  {
    id: "loggia",
    title: "Лоджия",
    index: 9,
    subtitle: "Светлое пространство для отдыха.",
    tips: [
      ["Проход", "Оставьте возможность свободно пользоваться дверью."],
      ["Форма", "Римские, рулонные или тканевые — с учётом пространства."],
      ["Стиль", "Поддержите общую тему оформления лоджии."],
    ],
    links: ["/rimskieshtori", "/rulonnieshtori"],
  },
  {
    id: "veranda",
    title: "Веранда",
    index: 9,
    subtitle: "Уют на границе дома и сада.",
    tips: [
      ["Лето", "Лёгкие прозрачные ткани пропускают дневной свет."],
      ["Погода", "Учитывайте воздействие солнца, дождя и росы."],
      ["Уход", "Выбирайте практичные материалы для частой чистки."],
    ],
    links: ["/tkani"],
  },
  {
    id: "winter-garden",
    title: "Зимний сад",
    index: 10,
    subtitle: "Меняйте текстиль вслед за временем года.",
    tips: [
      ["Сезон", "Плотные ткани зимой, лёгкие — летом."],
      ["Свет", "Вуаль, тюль и органза придают комнате лёгкость."],
      ["Цвет", "Рассмотрите оттенки ванили и слоновой кости."],
    ],
    links: ["/vual", "/organza"],
  },
  {
    id: "fireplace",
    title: "Каминный зал",
    index: 10,
    subtitle: "Тёплая атмосфера для спокойных вечеров.",
    tips: [
      [
        "Безопасность",
        "Обсудите с дизайнером требования к ткани рядом с камином.",
      ],
      ["Форма", "Учитывайте устройство окна и планировку."],
      ["Стиль", "Классические шторы поддерживают атмосферу комнаты."],
    ],
    links: ["/klasiheskieshtori"],
  },
];
export function FabricGuide() {
  const { data } = useStore();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const room = rooms.find((r) => "#" + r.id === hash) || rooms[0];
  const source = guide[room.index];
  useEffect(() => {
    if (rooms.slice(4).some((r) => "#" + r.id === hash)) setExpanded(true);
  }, [hash]);
  return (
    <div className="container fabric-guide">
      <Breadcrumbs items={[{ label: "Как подобрать ткань" }]} />
      <header className="guide-intro" id="rec212854343">
        <p className="eyebrow">ГИД ПО ТКАНЯМ</p>
        <h1>Как выбрать шторы</h1>
        <p className="page-lead">Ткани и карнизы для разных комнат.</p>
      </header>
      <nav className="room-picker segmented" aria-label="Выберите комнату">
        {rooms.slice(0, 4).map((r) => (
          <a
            key={r.id}
            href={"#" + r.id}
            aria-current={r.id === room.id ? "true" : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate("#" + r.id, { preventScrollReset: true });
            }}
          >
            {r.title}
          </a>
        ))}
        <button
          aria-expanded={expanded}
          aria-controls="all-rooms"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Свернуть" : "Все комнаты"}{" "}
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </button>
      </nav>
      <nav
        className="all-rooms"
        id="all-rooms"
        aria-label="Другие помещения"
        hidden={!expanded}
      >
        {rooms.slice(4).map((r) => (
          <a
            key={r.id}
            href={"#" + r.id}
            aria-current={r.id === room.id ? "true" : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate("#" + r.id, { preventScrollReset: true });
            }}
          >
            {r.title}
          </a>
        ))}
      </nav>
      <section
        className="room-feature surface"
        id="rec227749970"
        aria-labelledby="room-heading"
      >
        <figure className="room-photo">
          <Picture
            src={source.image}
            alt={source.title + " — иллюстрация из гида VIP DECOR DESIGN"}
            eager
          />
          <figcaption className="glass-caption">
            Вдохновение для вашего интерьера
          </figcaption>
        </figure>
        <div className="room-description">
          <p className="eyebrow">ВАША КОМНАТА</p>
          <h2 id="room-heading" aria-live="polite">
            {room.title}
          </h2>
          <p className="room-subtitle">{room.subtitle}</p>
          <ol className="room-tips">
            {room.tips.map(([title, text], i) => (
              <li key={title}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="guide-materials">
            {room.links.map((path) => {
              const c = data.categories.find((c) => c.path === path);
              return (
                c && (
                  <Link key={path} to={path} className="surface">
                    <Picture src={c.image} alt="" />
                    <span>{c.title}</span>
                    <ArrowRight size={17} />
                  </Link>
                )
              );
            })}
          </div>
          <Link className="button" to="/selection">
            Подобрать ткани <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <details className="room-full surface" key={source.title}>
        <summary>
          Все рекомендации:{" "}
          {source.title === "Терраса"
            ? "терраса, веранда и лоджия"
            : source.title === "Каминный зал"
              ? "зимний сад и каминный зал"
              : source.title.toLowerCase()}
          <span aria-hidden="true">+</span>
        </summary>
        <div className="reading-copy">
          {source.paragraphs.map((p, i) => (
            <p key={i}>{p.replace(/^\s*-\s*/, "")}</p>
          ))}
        </div>
      </details>
      <HelpStrip context={"Подбор ткани — " + room.title} />
      <section className="guide-hardware" id="rec228112273">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ЗАВЕРШАЮЩИЙ ШТРИХ</p>
            <h2>Не забудьте о карнизе.</h2>
          </div>
          <Link className="text-link" to="/karnizi">
            Все карнизы <ArrowUpRight size={18} />
          </Link>
        </div>
        <p className="page-lead">
          Форма окна, вес ткани и свободное движение штор — детали, от которых
          зависит результат.
        </p>
        <div className="hardware-grid" id="rec228113878">
          {guide.slice(11, 16).map((s) => (
            <details className="hardware-card surface" key={s.title}>
              <summary>
                <Picture src={s.image} alt={s.title + " карнизы"} />
                <span>
                  {s.title}
                  <span aria-hidden="true">+</span>
                </span>
              </summary>
              <div className="reading-copy">
                {s.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
                <Link className="text-link" to={s.href}>
                  Посмотреть карнизы <ArrowUpRight size={17} />
                </Link>
              </div>
            </details>
          ))}
        </div>
      </section>
      <section className="guide-compare" id="rec228114766">
        <p className="eyebrow">КАКОЕ РЕШЕНИЕ ВЫБРАТЬ</p>
        <h2>Рулонные шторы или жалюзи?</h2>
        <div className="comparison-grid" id="rec228115391">
          {guide.slice(16).map((s) => (
            <article className="surface" key={s.title}>
              <Picture src={s.image} alt={s.title} />
              <div>
                <h3>{s.title}</h3>
                <details>
                  <summary>
                    Особенности и рекомендации <span aria-hidden="true">+</span>
                  </summary>
                  <div className="reading-copy">
                    {s.paragraphs.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </details>
                <Link className="text-link" to={s.href}>
                  Посмотреть коллекцию <ArrowUpRight size={17} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
      <details className="guide-extra-images surface">
        <summary>
          Ещё иллюстрации из гида <span aria-hidden="true">+</span>
        </summary>
        <div className="article-gallery">
          {data.pages
            .find((p) => p.path === "/kakpodobrat")
            ?.images.filter((im) => !guide.some((g) => g.image === im.src))
            .map((im) => (
              <Picture
                key={im.src}
                src={im.src}
                alt="Иллюстрация к гиду по интерьерному текстилю"
              />
            ))}
        </div>
      </details>
      <section className="guide-subscribe surface" id="rec228130529">
        <div>
          <h2>Идеи и новинки</h2>
          <p>В Telegram VIP DECOR DESIGN.</p>
        </div>
        <a
          className="button secondary"
          href="https://t.me/vipdecordesign"
          target="_blank"
          rel="noopener noreferrer"
        >
          Наш Telegram <ArrowUpRight size={18} />
        </a>
        <a className="text-link" href="mailto:info@vip2d.ru">
          info@vip2d.ru <ArrowUpRight size={16} />
        </a>
      </section>
    </div>
  );
}
