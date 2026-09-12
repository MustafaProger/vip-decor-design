import {
  ArrowUpRight,
  Ruler,
  Scissors,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useStore } from "../lib/store";
import { Reveal } from "./Motion";

const benefits = [
  {
    icon: Scissors,
    title: "Собственный пошив",
    text: "Шторы, ламбрекены, бандо, покрывала и чехлы — изготавливаем текстиль под ваш интерьер.",
    detail: "Экспресс-пошив штор — от 3 дней после предоплаты.",
  },
  {
    icon: Ruler,
    title: "Оформление под ключ",
    text: "Поможем с цветовой гаммой, тканью и креплениями. Подготовим изделия и установим весь комплект.",
    detail: "От замера до последней складки.",
  },
  {
    icon: Sparkles,
    title: "Забота о деталях",
    text: "Отпарим и повесим готовые шторы. По желанию можно заказать клининговую услугу.",
    detail: "Всё для завершённого интерьера.",
  },
  {
    icon: ShieldCheck,
    title: "Гарантия на изделия",
    text: "Даём гарантию 1 год на все наши изделия. Условия заказа обсудим до начала работы.",
    detail: "Остаёмся на связи после установки.",
  },
];

export function Benefits() {
  return (
    <section
      className="service-section"
      id="rec207850634"
      aria-labelledby="benefits-title"
    >
      <Reveal className="service-heading">
        <p className="eyebrow">ПРОДУМАНО ОТ НАЧАЛА ДО КОНЦА</p>
        <h2 id="benefits-title">Красиво. И без лишних забот.</h2>
      </Reveal>
      <div className="benefits-grid">
        {benefits.map(({ icon: Icon, title, text, detail }, i) => (
          <Reveal className="benefit-card" key={title} delay={i * 0.06}>
            <div className="benefit-top">
              <Icon size={26} strokeWidth={1.3} />
              <span>0{i + 1}</span>
            </div>
            <h3>{title}</h3>
            <p>{text}</p>
            <span className="benefit-detail">{detail}</span>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function MeasurementCTA() {
  const { discuss } = useStore();
  return (
    <Reveal className="measurement-card" id="rec209177378">
      <div>
        <p className="eyebrow">ПЕРВЫЙ ШАГ — ЗНАКОМСТВО</p>
        <h2>Начнём с вашего окна.</h2>
        <p>
          Закажите замер и получите бесплатную консультацию дизайнера. Вместе
          найдём решение для вашей комнаты.
        </p>
        <details className="offer-details">
          <summary>Подарок при оформлении заказа</summary>
          <p>
            При оформлении заказа и внесении предоплаты в день обращения —
            скидка, кисти для декорирования штор или подушки в едином стиле с
            заказом.
          </p>
        </details>
      </div>
      <div className="measurement-actions">
        <button
          className="button"
          onClick={() => discuss("Замер и консультация")}
        >
          Заказать замер
          <ArrowUpRight size={20} />
        </button>
        <Link className="text-link" to="/calculator">
          Сначала рассчитать стоимость
          <ArrowUpRight size={18} />
        </Link>
      </div>
    </Reveal>
  );
}
