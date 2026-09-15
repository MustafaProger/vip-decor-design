import { Link } from "react-router-dom";
import { ArrowUpRight, Phone, Mail } from "lucide-react";
import { useStore } from "../lib/store";
import { Breadcrumbs } from "../components/Primitives";
import { OriginalContent } from "./Information";
import type { SourcePage } from "../lib/content";

export function Delivery({ page }: { page: SourcePage }) {
  const { data } = useStore();
  const home = data.pages.find((p) => p.path === "/");
  const get = (id: string) =>
    page.blocks?.find((b) => b.id === id)?.paragraphs || [];
  const delivery = get("rec223728204");
  const pickup = get("rec228163923");
  const pay = get("rec223728206");
  const groups = [
    ["delivery", "Доставка"],
    ["pickup", "Самовывоз"],
    ["payment", "Оплата"],
    ["questions", "Связаться с нами"],
  ];
  return (
    <article className="container delivery-page">
      <Breadcrumbs items={[{ label: page.title }]} />
      <header className="delivery-intro" id="rec223728202">
        <p className="eyebrow">ВАШ ЗАКАЗ</p>
        <h1>Доставка и оплата</h1>
        <p className="page-lead">
          Курьерская доставка, самовывоз и условия оплаты.
        </p>
      </header>
      <div className="reading-layout">
        <nav className="reading-nav surface" aria-label="Разделы доставки">
          {groups.map(([id, title], i) => (
            <a href={"#" + id} key={id}>
              <span>0{i + 1}</span>
              {title}
              <ArrowUpRight size={16} />
            </a>
          ))}
          <Link to="/contacts">
            Контакты компании <ArrowUpRight size={16} />
          </Link>
        </nav>
        <div className="delivery-sections">
          <section className="surface delivery-section" id="delivery">
            <p className="eyebrow" id="rec223728203">
              01 / ПОЛУЧЕНИЕ ЗАКАЗА
            </p>
            <h2>Доставка</h2>
            <div className="transport-grid" id="rec223728204">
              <article className="transport-card">
                <h3>
                  По Москве
                  <br />
                  до 10 кг
                </h3>
                <p>{delivery[3]}</p>
                <p>{delivery[4]}</p>
                <p>{delivery[5]}</p>
                <p className="transport-price">{delivery[6]}</p>
              </article>
              <article className="transport-card">
                <h3>
                  По Москве
                  <br />
                  более 10 кг
                </h3>
                <p>{delivery[8]}</p>
                <p>{delivery[9]}</p>
                <p>{delivery[10]}</p>
                <p className="transport-price">{delivery[11]}</p>
              </article>
              <article className="transport-card">
                <h3>{delivery[12]}</h3>
                <p>{delivery[13]}</p>
                <p>
                  {delivery[14]} {delivery[15]}
                </p>
                <p className="transport-price">
                  {delivery[16]} {delivery[17]}
                </p>
              </article>
            </div>
          </section>
          <section className="surface delivery-section" id="pickup">
            <p className="eyebrow" id="rec228163889">
              02 / В УДОБНОМ МЕСТЕ
            </p>
            <h2>Самовывоз</h2>
            <div className="transport-grid" id="rec228163923">
              <article className="transport-card">
                <h3>{pickup[0]}</h3>
                <p>
                  {pickup[1]}, {pickup[2]}
                </p>
                <p>
                  {pickup[3]} {pickup[4].replace("20:оо", "20:00")}
                </p>
                <p>{pickup[5]}</p>
                <p className="transport-price">{pickup[6].replace("*", "")}</p>
                <Link className="text-link" to="/contacts">
                  Контакты и маршрут <ArrowUpRight size={16} />
                </Link>
              </article>
              <article className="transport-card">
                <h3>{pickup[7]}</h3>
                <p>{pickup[8]}</p>
                <p>{pickup[10]}</p>
                <a
                  className="text-link"
                  href="https://www.dellin.ru/contacts/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Пункты самовывоза <ArrowUpRight size={16} />
                </a>
              </article>
              <article className="transport-card">
                <h3>{pickup[11]}</h3>
                <p>{pickup[12]}</p>
                <p>{pickup[13]}</p>
                <a
                  className="text-link"
                  href="https://www.pochta.ru/offices"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Почтовые отделения <ArrowUpRight size={16} />
                </a>
              </article>
            </div>
          </section>
          <section className="surface delivery-section" id="payment">
            <p className="eyebrow" id="rec223728205">
              03 / УСЛОВИЯ ЗАКАЗА
            </p>
            <h2>Оплата</h2>
            <div className="transport-grid" id="rec223728206">
              <article className="transport-card">
                <h3>{pay[0]}</h3>
                <p>{pay[1]}</p>
                <p className="transport-price">{pay[2]}</p>
              </article>
              <article className="transport-card">
                <h3>{pay[3]}</h3>
                <p>{pay[4]}</p>
                <p className="transport-price">{pay[5]}</p>
              </article>
            </div>
          </section>
          <section className="surface delivery-section" id="questions">
            <p className="eyebrow">04 / ПОМОЖЕМ РАЗОБРАТЬСЯ</p>
            <h2 id="rec223728207">Остались вопросы?</h2>
            <p className="page-lead">Свяжитесь с нами удобным способом.</p>
            <div className="delivery-contacts">
              <a href="tel:+79690359889">
                <Phone size={18} />
                +7 969 035 98 89
              </a>
              <a href="mailto:info@vip2d.ru">
                <Mail size={18} />
                info@vip2d.ru
              </a>
              <Link className="text-link" to="/contacts">
                Все контакты <ArrowUpRight size={18} />
              </Link>
            </div>
          </section>
          {home && (
            <details className="surface delivery-section">
              <summary>
                Дополнительные условия доставки и оплаты{" "}
                <span aria-hidden="true">+</span>
              </summary>
              <OriginalContent
                page={home}
                blockIds={["rec207714893", "rec217629625"]}
              />
            </details>
          )}
        </div>
      </div>
    </article>
  );
}

export function Privacy({ page }: { page: SourcePage }) {
  const { data } = useStore();
  const headings = [
    "Общие положения",
    "Основные понятия, используемые в Политике",
    "Оператор может обрабатывать следующие персональные данные Пользователя",
    "Цели обработки персональных данных",
    "Правовые основания обработки персональных данных",
    "Порядок сбора, хранения, передачи и других видов обработки персональных данных",
    "Трансграничная передача персональных данных",
    "Заключительные положения",
  ];
  const sections = headings.map((title, i) => ({
    title,
    number: i + 1,
    paragraphs: [] as string[],
  }));
  let active = 0;
  for (const text of page.blocks
    ?.find((b) => b.id === "rec232435805")
    ?.paragraphs.slice(1) || []) {
    const start = text.match(/^(\d+)\. (?!\d)/);
    if (start) active = Number(start[1]) - 1;
    const clean = start
      ? text.replace(`${active + 1}. ${headings[active]}`, "").trim()
      : text;
    if (clean)
      sections[active].paragraphs.push(
        clean
          .replace(/privacy@thismywebsite[·.]com/g, data.contacts.email)
          .replace(
            /https[ː:]\/\/thismywebsite[·.]com\/privacy\//g,
            "https://vip2d.ru/popd",
          ),
      );
  }
  return (
    <article className="container policy-page">
      <Breadcrumbs items={[{ label: page.title }]} />
      <header className="policy-intro" id="rec232435803">
        <p className="eyebrow">ДОКУМЕНТЫ КОМПАНИИ</p>
        <h1>Политика обработки персональных данных</h1>
      </header>
      <div className="reading-layout">
        <nav className="reading-nav surface" aria-label="Разделы политики">
          {sections.map((s) => (
            <a key={s.number} href={"#policy-" + s.number}>
              <span>{s.number.toString().padStart(2, "0")}</span>
              {s.title}
            </a>
          ))}
        </nav>
        <div className="policy-content surface" id="rec232435805">
          {sections.map((s) => (
            <section
              className="policy-section"
              id={"policy-" + s.number}
              key={s.number}
            >
              <h2>
                {s.number}. {s.title}
              </h2>
              {s.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
