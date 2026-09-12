import { motion, useReducedMotion } from "framer-motion";
import { projectCaption } from "../data/gallery-presentation";
import { Reveal } from "../components/Motion";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowLeft, ArrowRight } from "lucide-react";
import { useStore } from "../lib/store";
import { Breadcrumbs, Picture } from "../components/Primitives";
import Modal from "../components/Modal";
export default function Projects() {
  const { data } = useStore();
  const [active, setActive] = useState<number | null>(null);
  const [shown, setShown] = useState(24);
  const reduced = useReducedMotion();
  return (
    <div className="container projects-page">
      <Breadcrumbs items={[{ label: "Проекты" }]} />
      <p className="eyebrow">ТЕКСТИЛЬ В ПРОСТРАНСТВЕ</p>
      <h1>
        У каждого дома
        <br />
        свой характер.
      </h1>
      <p className="page-intro">
        Свет, цвет и драпировка меняют ощущение комнаты.
        <br />
        Собрали наши работы и идеи для вашего интерьера.
      </p>
      <Link className="project-wide" to="/projects/quiet-living-room">
        <Picture
          src="/images/concept-living.webp"
          alt="Тихая гостиная — концепция интерьера"
          eager
        />
        <div>
          <p className="eyebrow">КОНЦЕПЦИЯ ИНТЕРЬЕРА</p>
          <h2>
            Тихая гостиная
            <ArrowUpRight size={30} />
          </h2>
          <span>Посмотреть концепцию</span>
        </div>
      </Link>
      <Reveal className="section-heading two-sided" id="our-work">
        <h2>Галерея наших работ</h2>
        <span>{data.gallery.length} фотографий</span>
      </Reveal>
      <div className="gallery-grid">
        {data.gallery.slice(0, shown).map((photo, i) => (
          <motion.button
            initial={reduced ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            whileFocus={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.08 }}
            transition={{
              duration: reduced ? 0 : 0.5,
              delay: reduced ? 0 : (i % 3) * 0.05,
            }}
            key={photo.src + i}
            onClick={() => setActive(i)}
            aria-label={
              "Открыть фотографию " + (i + 1) + ": " + projectCaption(photo.src)
            }
          >
            <div className="gallery-photo">
              <Picture
                src={photo.src}
                alt={projectCaption(photo.src) || photo.alt}
              />
              <span className="gallery-open" aria-hidden="true">
                <ArrowUpRight size={24} />
              </span>
            </div>
            <span>
              {projectCaption(photo.src) || "Текстиль в интерьере"}{" "}
              <span className="gallery-index">
                {String(i + 1).padStart(2, "0")}
              </span>
            </span>
          </motion.button>
        ))}
      </div>
      {shown < data.gallery.length && (
        <div className="load-more">
          <button
            className="button secondary"
            onClick={() => setShown((s) => s + 24)}
          >
            Показать ещё
          </button>
        </div>
      )}
      <Modal
        open={active !== null}
        onClose={() => setActive(null)}
        title="Фотография из галереи"
        className="gallery-dialog"
      >
        {active !== null && (
          <>
            <motion.div
              className="gallery-slide"
              key={active}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduced ? 0 : 0.25 }}
            >
              <Picture
                src={data.gallery[active].src}
                alt={
                  projectCaption(data.gallery[active].src) ||
                  data.gallery[active].alt
                }
                fit="contain"
                eager
              />
            </motion.div>
            <div className="gallery-controls">
              <button
                className="icon-button"
                onClick={() =>
                  setActive(
                    (active - 1 + data.gallery.length) % data.gallery.length,
                  )
                }
                aria-label="Предыдущая фотография"
              >
                <ArrowLeft />
              </button>
              <span aria-live="polite">
                {active + 1} / {data.gallery.length}
              </span>
              <button
                className="icon-button"
                onClick={() => setActive((active + 1) % data.gallery.length)}
                aria-label="Следующая фотография"
              >
                <ArrowRight />
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
export function ConceptProject() {
  const { data } = useStore();
  return (
    <div className="container concept-page">
      <Breadcrumbs
        items={[
          { label: "Проекты", to: "/projects" },
          { label: "Тихая гостиная" },
        ]}
      />
      <div className="concept-title">
        <div>
          <p className="eyebrow">КОНЦЕПЦИЯ ИНТЕРЬЕРА</p>
          <h1>Тихая гостиная</h1>
        </div>
        <p>
          Мягкий дневной свет,
          <br />
          природные оттенки
          <br />и свободная драпировка.
        </p>
      </div>
      <figure className="concept-photo">
        <Picture
          src="/images/concept-living.webp"
          alt="Концепция гостиной с льняными портьерами, белым тюлем и природными оттенками"
          eager
        />
        <figcaption>КОНЦЕПЦИЯ ИНТЕРЬЕРА · VIP DECOR DESIGN</figcaption>
      </figure>
      <div className="concept-story">
        <div>
          <p className="eyebrow">ИДЕЯ ПРОСТРАНСТВА</p>
          <h2>
            Когда текстиль
            <br />
            становится архитектурой.
          </h2>
          <Link className="button" to="/selection?source=quiet-living-room">
            Хочу похожее оформление
            <ArrowUpRight size={20} />
          </Link>
        </div>
        <div>
          <p>
            Лён смягчает свет, тюль добавляет воздуха, а спокойные оттенки
            собирают интерьер в единое целое.
          </p>
          <div className="concept-swatches">
            {["Лён", "Вуаль", "Текстиль"].map((name, i) => (
              <figure key={name}>
                <Picture
                  src={
                    data.categories.find(
                      (c) =>
                        c.path ===
                        (i === 0
                          ? "/lnanaiatkan"
                          : i === 1
                            ? "/vual"
                            : "/decor"),
                    )?.image
                  }
                  alt={"Вдохновение для фактуры: " + name}
                />
                <figcaption>{name}</figcaption>
              </figure>
            ))}
          </div>
          <p className="fine-print">
            Концепция показывает идею оформления. Изображение интерьера создано
            с помощью ИИ и не является фотографией выполненного заказа. Фактуры
            иллюстрируют настроение; состав и наличие подбираются отдельно.
          </p>
        </div>
      </div>
    </div>
  );
}
