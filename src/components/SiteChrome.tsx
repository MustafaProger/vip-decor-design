import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  Heart,
  Menu,
  ShoppingBag,
  Phone,
  MapPin,
  Mail,
} from "lucide-react";
import { useStore } from "../lib/store";
import Modal from "./Modal";
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="VIP Decor Design — главная">
      <span>VIP</span>
      <small>DECOR DESIGN</small>
    </Link>
  );
}
export function Header() {
  const { favorites, cart, discuss } = useStore();
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  const nav = [
    ["/curtains", "Шторы на заказ"],
    ["/tkani", "Ткани"],
    ["/projects", "Проекты"],
    ["/company", "О компании"],
  ];
  return (
    <>
      <a className="skip-link" href="#main-content">
        Перейти к содержимому
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Основная навигация">
            {nav.map(([to, label]) => (
              <NavLink key={to} to={to}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="header-actions">
            <button className="button header-discuss" onClick={() => discuss()}>
              Обсудить проект
            </button>
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
              className={
                "icon-button header-cart " +
                (pathname === "/" && !cart.length ? "home-cart" : "")
              }
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
        <p className="eyebrow">VIP DECOR DESIGN</p>
        <h2>Ваше пространство</h2>
        <nav aria-label="Мобильная навигация">
          {[
            ...nav,
            ["/catalog", "Все направления"],
            ["/calculator", "Калькулятор"],
            ["/contacts", "Контакты"],
            ["/cart", "Корзина"],
          ].map(([to, label]) => (
            <Link key={to} to={to} onClick={() => setMenu(false)}>
              {label}
              <ArrowUpRight size={22} />
            </Link>
          ))}
        </nav>
        <a className="menu-phone" href="tel:+74959693189">
          +7 495 969 31 89
        </a>
      </Modal>
    </>
  );
}
export function Footer() {
  const { data, discuss } = useStore();
  return (
    <>
      <section className="contact-band">
        <div className="container contact-band-inner">
          <div>
            <p className="eyebrow">НАЧНЁМ С ВАШЕЙ ИДЕИ</p>
            <h2>
              Давайте найдём текстиль
              <br />
              для вашего дома.
            </h2>
            <p>
              Расскажите о комнате и о том, что хочется изменить.
              <br />
              Начнём с ваших пожеланий.
            </p>
          </div>
          <button className="button button-light" onClick={() => discuss()}>
            Обсудить проект
            <ArrowUpRight size={20} />
          </button>
        </div>
      </section>
      <footer className="site-footer">
        <div className="container">
          <div className="footer-top">
            <div>
              <Brand />
              <p className="footer-tagline">Фактура. Свет. Тишина.</p>
            </div>
            <div>
              <p className="eyebrow">ЗАГЛЯНИТЕ В ШОУРУМ</p>
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
              <p className="eyebrow">МЫ НА СВЯЗИ</p>
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
              {data.categories.slice(0, 10).map((c) => (
                <Link key={c.path} to={c.path}>
                  {c.title}
                </Link>
              ))}
              <Link to="/catalog">Все направления</Link>
            </div>
            <div>
              <h3>Компания</h3>
              <Link to="/company">О нас</Link>
              <Link to="/projects">Галерея работ</Link>
              <Link to="/curtains">Индивидуальный пошив</Link>
              <Link to="/price">Прайс на пошив</Link>
              <Link to="/contacts">Контакты</Link>
            </div>
            <div>
              <h3>Ваш проект</h3>
              <Link to="/selection">Подобрать шторы</Link>
              <Link to="/calculator">Рассчитать стоимость</Link>
              <Link to="/kakpodobrat">Как подобрать</Link>
              <Link to="/favorites">Избранное</Link>
              <Link to="/cart">Корзина</Link>
            </div>
            <div>
              <h3>Информация</h3>
              <Link to="/page13486315.html">Доставка и оплата</Link>
              <Link to="/privacy">Политика конфиденциальности</Link>
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
      <div className="mobile-action">
        <button onClick={() => discuss()}>
          Обсудить проект
          <ArrowUpRight size={21} />
        </button>
      </div>
    </>
  );
}
