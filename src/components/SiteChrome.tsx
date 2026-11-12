import { useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  Heart,
  Menu,
  ShoppingBag,
  Phone,
  MapPin,
  Mail,
  MessageCircle,
} from "lucide-react";
import { useStore } from "../lib/store";
import Modal from "./Modal";
import { Button } from "./Button";
import { isFeaturedCategory } from "../lib/catalog";
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="VIP Decor Design — главная">
      <span>VIP</span>
      <small>DECOR DESIGN</small>
    </Link>
  );
}
export function Header() {
  const { favorites, cart, discuss, data } = useStore();
  const { pathname } = useLocation();
  const header = useRef<HTMLElement>(null);
  const inCatalog =
    ["/catalog", "/shop", "/tkani"].includes(pathname) ||
    isFeaturedCategory(pathname) ||
    data.categories.some((category) => category.path === pathname);
  useLayoutEffect(() => {
    const element = header.current;
    if (!element) return;
    const measure = () => {
      const top = Number.parseFloat(getComputedStyle(element).top) || 0;
      document.documentElement.style.setProperty(
        "--site-header-bottom",
        `${element.offsetHeight + top}px`,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const [menu, setMenu] = useState(false);
  const nav = [
    ["/", "Главная"],
    ["/company", "О компании"],
    ["/catalog", "Каталог"],
    ["/projects", "Отзывы"],
    ["/blog", "Блог"],
  ];
  const isCurrentLink = (to: string) =>
    to === "/catalog"
      ? inCatalog
      : pathname === to || (to !== "/" && pathname.startsWith(`${to}/`));
  return (
    <>
      <a className="skip-link" href="#main-content">
        Перейти к содержимому
      </a>
      <header ref={header} className="site-header">
        <div className="header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Основная навигация">
            {nav.map(([to, label]) => (
              <Link
                key={to}
                to={to}
                className={isCurrentLink(to) ? "active" : undefined}
                aria-current={isCurrentLink(to) ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <Button className="header-discuss" onClick={() => discuss()}>
              Обсудить проект
            </Button>
            <Link
              className="icon-button"
              to="/favorites"
              aria-label={
                "Избранное" + (favorites.length ? ", " + favorites.length : "")
              }
            >
              <Heart size={25} strokeWidth={1.4} />
              {favorites.length > 0 && (
                <span className="counter">{favorites.length}</span>
              )}
            </Link>
            <Link
              className="icon-button header-cart"
              to="/cart"
              aria-label={
                "Корзина" +
                (cart.length
                  ? ", " + cart.reduce((a, b) => a + b.quantity, 0)
                  : "")
              }
            >
              <ShoppingBag size={23} strokeWidth={1.4} />
              {cart.length > 0 && (
                <span className="counter">
                  {cart.reduce((a, b) => a + b.quantity, 0)}
                </span>
              )}
            </Link>
            <button
              className="icon-button menu-button"
              onClick={() => setMenu(true)}
              aria-label="Открыть меню"
              aria-expanded={menu}
            >
              <Menu size={27} strokeWidth={1.4} />
            </button>
          </div>
        </div>
      </header>
      <Modal
        open={menu}
        onClose={() => setMenu(false)}
        title="Меню"
        className="menu-dialog"
      >
        <div className="menu-heading">
          <p className="eyebrow">VIP DECOR DESIGN</p>
          <h2>Меню</h2>
        </div>
        <div className="menu-content">
          <nav aria-label="Мобильная навигация">
            {nav.map(([to, label]) => (
              <Link
                key={to}
                to={to}
                className={isCurrentLink(to) ? "active" : undefined}
                aria-current={isCurrentLink(to) ? "page" : undefined}
                onClick={() => setMenu(false)}
              >
                {label}
                <ArrowUpRight size={22} />
              </Link>
            ))}
          </nav>
          <Button
            className="menu-discuss"
            onClick={() => {
              setMenu(false);
              discuss();
            }}
          >
            Обсудить проект <ArrowUpRight size={18} />
          </Button>
          <section className="menu-contacts" aria-label="Контакты для связи">
            <Link
              className="menu-contact-heading"
              to="/contacts"
              onClick={() => setMenu(false)}
            >
              Контакты <ArrowUpRight size={16} />
            </Link>
            <div className="menu-contact-links">
              {data.contacts.phones.map((phone) => (
                <a key={phone} href={"tel:" + phone.replace(/[^+\d]/g, "")}>
                  <Phone size={16} />
                  {phone}
                </a>
              ))}
              <a href={"mailto:" + data.contacts.email}>
                <Mail size={16} />
                {data.contacts.email}
              </a>
            </div>
            <div className="menu-messengers">
              {data.contacts.socials
                .filter(({ title }) =>
                  ["WhatsApp", "MAX", "Telegram"].includes(title),
                )
                .map((messenger) => (
                  <a
                    key={messenger.url}
                    href={messenger.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={18} />
                    {messenger.title}
                    <ArrowUpRight size={15} />
                  </a>
                ))}
            </div>
          </section>
        </div>
      </Modal>
    </>
  );
}
export function Footer() {
  const { data, discuss } = useStore();
  const { pathname } = useLocation();
  const documentPage =
    ["/popd", "/privacy", "/sitemap", "/blog"].includes(pathname) ||
    pathname.startsWith("/blog/");
  return (
    <>
      <footer className="site-footer">
        <div className="container">
          <div className="footer-top">
            <div>
              <Brand />
              <p className="footer-tagline">Шторы и интерьерный текстиль</p>
            </div>
            <div>
              <p className="eyebrow">ШОУРУМ В МОСКВЕ</p>
              <Link to="/contacts" className="footer-address">
                <MapPin size={19} />
                <span>
                  {data.contacts.address ||
                    "Москва, Сокольническая площадь, 4А, этаж 2, павильон 226"}
                </span>
              </Link>
              <a href={"mailto:" + data.contacts.email}>
                <Mail size={17} />
                {data.contacts.email}
              </a>
            </div>
            <div>
              <p className="eyebrow">КОНТАКТЫ</p>
              {data.contacts.phones.map((p) => (
                <a
                  className="footer-phone"
                  key={p}
                  href={"tel:" + p.replace(/[^+\d]/g, "")}
                >
                  <Phone size={16} />
                  {p}
                </a>
              ))}
            </div>
          </div>
          <div className="footer-links">
            <div>
              <h3>Коллекции</h3>
              {[
                ["/tkani", "Ткани для штор"],
                ["/tyl", "Тюль"],
                ["/karnizi", "Карнизы"],
                ["/derzhateli-dlya-shtor", "Держатели для штор"],
                ["/kisti", "Кисти для штор"],
                ["/kartini", "Картины"],
              ].map(([path, title]) => (
                <Link key={path} to={path}>
                  {title}
                </Link>
              ))}
              <Link to="/catalog">Весь каталог</Link>
            </div>
            <div>
              <h3>Компания</h3>
              <Link to="/company">О нас</Link>
              <Link to="/projects">Отзывы клиентов</Link>
              <Link to="/price">Прайс на пошив</Link>
              <Link to="/referral">Возврат 15% за рекомендацию</Link>
              <Link to="/contacts">Контакты</Link>
            </div>
            <div>
              <h3>Ваш проект</h3>
              <Link to="/selection">Подобрать шторы</Link>
              <Link to="/calculator">Рассчитать стоимость</Link>
              <Link to="/kakpodobrat">Как подобрать</Link>
              <Link to="/blog">Блог об интерьере</Link>
            </div>
            <div>
              <h3>Информация</h3>
              <Link to="/page13486315.html">Доставка и оплата</Link>
              <Link to="/popd">Политика конфиденциальности</Link>
              <Link to="/sitemap">Карта сайта</Link>
              {data.contacts.socials.map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {s.title}
                  <ArrowUpRight size={14} />
                </a>
              ))}
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} VIP DECOR DESIGN</span>
            <span>Шторы и интерьерный текстиль · Москва</span>
            <a href="#top" aria-label="Вернуться наверх">
              Наверх ↑
            </a>
          </div>
        </div>
      </footer>
      {!documentPage && (
        <div className="mobile-action">
          <Button onClick={() => discuss()}>
            Обсудить проект
            <ArrowUpRight size={21} />
          </Button>
        </div>
      )}
    </>
  );
}
