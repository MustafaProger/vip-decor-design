import { ArrowUpRight } from "lucide-react";
import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { ButtonLink } from "../components/Button";
import { Reveal } from "../components/Motion";
import { ArrowLink, Picture } from "../components/Primitives";
import { useStore } from "../lib/store";
import "./home.css";

const Reviews = lazy(() => import("../components/Reviews"));

const directions = [
  ["/tkani", "Ткани для штор", "Фактура, цвет и плотность"],
  ["/tyl", "Тюль", "Мягкий дневной свет"],
  ["/karnizi", "Карнизы", "Продуманные крепления"],
  ["/decor", "Декор", "Детали, которые дополняют"],
];
const steps = [
  [
    "Обсудим вашу идею",
    "Расскажите о комнате и желаемом результате. Подберём ткани, оттенки и способ крепления.",
  ],
  [
    "Согласуем каждую деталь",
    "После замера определим количество ткани, стоимость работ и сроки изготовления.",
  ],
  [
    "Сошьём и установим",
    "Изготовим шторы по вашим размерам, доставим, отпарим и аккуратно повесим.",
  ],
];

export default function Home() {
  const { data } = useStore();
  return (
    <div className="home-page container">
      <section className="home-opening" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <p className="eyebrow">VIP DECOR DESIGN · МОСКВА</p>
          <h1 id="home-title">
            Шторы на заказ
            <br />
            для вашего дома
          </h1>
          <p className="home-hero-description">
            Ткани, в которые влюбляешься.
            <br />
            Шторы, с которыми хочется жить.
          </p>
          <p className="home-hero-service">
            От первого образца ткани до последней складки — берём всё на себя.
          </p>
          <div className="home-actions">
            <ButtonLink to="/selection">
              Обсудить мои шторы <ArrowUpRight size={19} />
            </ButtonLink>
            <ArrowLink to="/catalog">Выбрать ткань</ArrowLink>
          </div>
        </div>
        <figure className="home-hero-photo">
          <img
            src="/images/concept-living.webp"
            alt="Светлые портьеры и воздушный тюль в гостиной — идея оформления"
            width="1672"
            height="941"
            fetchPriority="high"
            decoding="async"
          />
          <figcaption>Идея оформления · визуализация</figcaption>
        </figure>
      </section>

      <section
        className="home-section home-order"
        id="order"
        aria-labelledby="home-order-title"
      >
        <div className="home-order-heading">
          <div>
            <p className="eyebrow">ОТ ЗАМЕРА ДО УСТАНОВКИ</p>
            <h2 id="home-order-title">Всё начинается с вашей идеи</h2>
            <p>
              Начать можно с фотографии комнаты и примерных размеров окна.
              Остальное обсудим вместе.
            </p>
          </div>
          <ArrowLink to="/price">Цены на пошив</ArrowLink>
        </div>
        <ol className="home-order-steps" aria-label="Как заказать шторы">
          {steps.map(([title, text], index) => (
            <li key={title}>
              <Reveal className="home-order-step">
                <span className="home-step-number" aria-hidden="true">
                  0{index + 1}
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="home-section home-materials"
        aria-labelledby="home-catalog-title"
      >
        <div className="section-heading two-sided">
          <div>
            <p className="eyebrow">ФАКТУРА, СВЕТ И ДЕТАЛИ</p>
            <h2 id="home-catalog-title">То, из чего складывается уют</h2>
          </div>
          <ArrowLink to="/catalog">Весь каталог</ArrowLink>
        </div>
        <div className="home-directions">
          {directions.map(([path, title, description]) => (
            <Link
              to={`/catalog?category=${encodeURIComponent(path)}`}
              className="home-direction"
              key={path}
            >
              <Picture
                src={
                  data.categories.find((category) => category.path === path)
                    ?.image
                }
                alt={title}
              />
              <div>
                <h3>
                  {title}
                  <ArrowUpRight size={19} aria-hidden="true" />
                </h3>
                <p>{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="home-section home-reviews" id="reviews">
        <Suspense
          fallback={
            <p className="home-reviews-loading" role="status">
              Загружаем отзывы клиентов…
            </p>
          }
        >
          <Reviews variant="preview" />
        </Suspense>
      </div>

      <section className="home-help" aria-labelledby="home-help-title">
        <div>
          <p className="eyebrow">ПРИГЛАШАЕМ В ШОУРУМ</p>
          <h2 id="home-help-title">
            Почувствуйте ткань.
            <br />
            Представьте её дома.
          </h2>
          <p>
            Посмотрите оттенки вживую и найдите свою фактуру вместе с
            дизайнером.
          </p>
          <p className="home-help-address">{data.contacts.address}</p>
        </div>
        <div className="home-help-actions">
          <ButtonLink to="/selection">
            Обсудить мой заказ <ArrowUpRight size={18} />
          </ButtonLink>
          <ArrowLink to="/contacts">Контакты и маршрут</ArrowLink>
        </div>
      </section>
    </div>
  );
}
