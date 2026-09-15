import { ArrowUpRight, CalendarDays, Ruler, ShieldCheck } from "lucide-react";
import { useStore } from "../lib/store";
import { Reveal } from "./Motion";
import "./service-refresh.css";

export function Benefits() {
  const { discuss } = useStore();
  const terms = [
    {
      title: "Сроки",
      accent: "От 3 дней",
      text: "Экспресс-пошив — от 3 дней после предоплаты. Сроки вашего заказа согласуем до начала работ.",
      Icon: CalendarDays,
    },
    {
      title: "Установка",
      accent: "Последний штрих",
      text: "Готовые шторы отпарим и повесим. Состав работ согласуем при оформлении заказа.",
      Icon: Ruler,
    },
    {
      title: "Гарантия",
      accent: "1 год на изделия",
      text: "Подробные условия заказа обсудим до начала работ.",
      Icon: ShieldCheck,
    },
  ];
  return (
    <section
      className="service-assurance"
      id="service-terms"
      aria-labelledby="service-terms-title"
    >
      <Reveal className="service-assurance-heading">
        <div>
          <p className="eyebrow">ЗАБОТА О ВАШЕМ ЗАКАЗЕ</p>
          <h2 id="service-terms-title">Условия работы</h2>
        </div>
        <button
          className="button"
          onClick={() => discuss("Условия заказа штор и текстиля")}
        >
          Обсудить заказ <ArrowUpRight size={18} />
        </button>
      </Reveal>
      <div className="service-assurance-grid">
        {terms.map(({ title, accent, text, Icon }, index) => (
          <Reveal
            className="service-assurance-card"
            key={title}
            delay={index * 0.06}
          >
            <div className="service-assurance-label">
              <span className="service-assurance-icon">
                <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <span>{title}</span>
            </div>
            <h3>{accent}</h3>
            <p>{text}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
