import { motion, useReducedMotion } from "framer-motion";
import { Reveal, MotionLink, ease } from "../components/Motion";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useStore } from "../lib/store";
import { ArrowLink, Picture } from "../components/Primitives";
const steps = [
  [
    "Подбор тканей",
    "Обсудим пространство",
    "Уточним задачу, пожелания и особенности комнаты.",
  ],
  [
    "Индивидуальный пошив",
    "Подберём решение",
    "Согласуем ткани, оттенки и способ крепления.",
  ],
  [
    "Монтаж и декорирование",
    "Изготовим и установим",
    "Подготовим изделия и согласуем оформление на месте.",
  ],
];
export default function Home() {
  const { data } = useStore();
  const reduced = useReducedMotion();
  const directions = [
    {
      title: "Портьерные ткани",
      path: "/tkani",
      image:
        data.categories.find((c) => c.path === "/tkani")?.image ||
        data.products[0]?.image,
    },
    {
      title: "Тюль и вуали",
      path: "/tyl",
      image:
        data.categories.find((c) => c.path === "/tyl")?.image ||
        data.products.find((p) => /тюль|вуаль/i.test(p.category))?.image,
    },
    {
      title: "Декоративный текстиль",
      path: "/decor",
      image: data.categories.find((c) => /декор/i.test(c.title))?.image,
    },
  ];
  return (
    <>
      <section className="hero" aria-labelledby="home-title">
        <motion.div
          className="hero-copy"
          initial={reduced ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.9, ease }}
        >
          <p className="eyebrow">ИНТЕРЬЕРНЫЙ ТЕКСТИЛЬ НА ЗАКАЗ</p>
          <h1 id="home-title">
            Текстиль,
            <br />
            который
            <br />
            создаёт дом.
          </h1>
          <p className="hero-description">
            Шторы и текстиль на заказ.
            <br />
            <span className="desktop-copy">
              От первой идеи до красивой драпировки.
            </span>
            <span className="mobile-copy">От идеи до красивой драпировки.</span>
          </p>
          <MotionLink
            whileTap={reduced ? undefined : { scale: 0.97 }}
            className="button hero-cta"
            to="/selection"
          >
            Подобрать шторы
            <ArrowUpRight size={22} />
          </MotionLink>
          <Link className="hero-secondary" to="/projects">
            Смотреть проекты
          </Link>
          <p className="hero-location">МОСКВА · СОБСТВЕННЫЙ ПОШИВ</p>
        </motion.div>
        <motion.figure
          className="hero-image"
          initial={reduced ? false : { opacity: 0, scale: 1.035 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduced ? 0 : 1.15, ease }}
        >
          <Picture
            src="/images/concept-living.webp"
            alt="Натуральные льняные шторы и лёгкий тюль в залитой солнцем гостиной — концепция интерьера"
            eager
          />
          <figcaption>
            <span>КОНЦЕПЦИЯ ИНТЕРЬЕРА</span>
            <span>ФАКТУРА. СВЕТ. ТИШИНА.</span>
          </figcaption>
        </motion.figure>
      </section>
      <div className="process-strip">
        <div className="container">
          {steps.map(([title], i) => (
            <div key={title}>
              <span className="step-number">0{i + 1}</span>
              <span className="short-rule" />
              <span>{title}</span>
            </div>
          ))}
        </div>
      </div>
      <Reveal className="section container">
        <p className="eyebrow">КОЛЛЕКЦИЯ РЕШЕНИЙ</p>
        <div className="section-heading">
          <h2>
            Ваш интерьер
            <br className="mobile-break" /> начинается с деталей.
          </h2>
        </div>
        <div className="direction-grid">
          {directions.map((d, i) => (
            <Link
              className="direction"
              key={d.title}
              to={
                data.categories.find((c) => c.path === d.path)?.path ||
                (i === 1
                  ? data.categories.find((c) => /тюль/i.test(c.title))?.path
                  : i === 2
                    ? data.categories.find((c) => /декор/i.test(c.title))?.path
                    : d.path) ||
                "/catalog"
              }
            >
              <Picture src={d.image} alt={d.title} />
              <div>
                <span>{d.title}</span>
                <ArrowUpRight size={27} />
              </div>
            </Link>
          ))}
        </div>
        <div className="section-tail">
          <p>
            Шторы, карнизы и текстильные детали,
            <br />
            которые складываются в цельный интерьер.
          </p>
          <ArrowLink to="/catalog">Все направления</ArrowLink>
        </div>
      </Reveal>
      <Reveal className="section project-section">
        <div className="container">
          <div className="section-heading two-sided">
            <div>
              <p className="eyebrow">ПРОСТРАНСТВА И НАСТРОЕНИЯ</p>
              <h2>
                Посмотрите, как
                <br />
                работает текстиль.
              </h2>
            </div>
            <ArrowLink to="/projects">Галерея работ</ArrowLink>
          </div>
          <div className="featured-projects">
            <Link to="/projects/quiet-living-room" className="featured-concept">
              <Picture
                src="/images/concept-living.webp"
                alt="Тихая гостиная — концепция интерьера"
              />
              <div>
                <div>
                  <p className="eyebrow">КОНЦЕПЦИЯ ИНТЕРЬЕРА</p>
                  <h3>Тихая гостиная</h3>
                </div>
                <ArrowUpRight size={26} />
              </div>
            </Link>
            {data.gallery[0] && (
              <Link to="/projects" className="featured-real">
                <Picture
                  src={data.gallery[0].src}
                  alt={
                    data.gallery[0].alt ||
                    "Текстильное оформление из галереи наших работ"
                  }
                />
                <div>
                  <div>
                    <p className="eyebrow">НАШИ РАБОТЫ</p>
                    <h3>Текстиль в интерьере</h3>
                  </div>
                  <ArrowUpRight size={24} />
                </div>
              </Link>
            )}
          </div>
        </div>
      </Reveal>
      <Reveal className="section container tactile-section">
        <div className="tactile-photos">
          {data.products
            .filter(
              (p) => p.categoryPath === "/tkani" || /ткан/i.test(p.category),
            )
            .slice(1, 4)
            .map((p) => (
              <Picture key={p.id} src={p.image} alt={p.title} />
            ))}
        </div>
        <div>
          <p className="eyebrow">ЗНАКОМСТВО С МАТЕРИАЛОМ</p>
          <h2>
            Начните
            <br />с прикосновения.
          </h2>
          <p>
            Рассмотрите фактуру, выберите оттенок и сохраните материалы для
            обсуждения с дизайнером.
          </p>
          <ArrowLink to="/tkani">Смотреть ткани</ArrowLink>
        </div>
      </Reveal>
      <Reveal className="section container how-section">
        <p className="eyebrow">ВНИМАНИЕ К КАЖДОЙ ДЕТАЛИ</p>
        <h2>
          От первого разговора
          <br />
          до последней складки.
        </h2>
        <div className="how-grid">
          {steps.map(([, title, text], i) => (
            <div key={title}>
              <span className="step-number">0{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
        <ArrowLink to="/calculator">Рассчитать стоимость штор</ArrowLink>
      </Reveal>
    </>
  );
}
