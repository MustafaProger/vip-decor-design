import { ArrowUpRight, HeartHandshake } from "lucide-react";
import { Link } from "react-router-dom";
import { ButtonLink } from "./Button";
import { RevealSection } from "./Motion";
import "./referral.css";

export const referralPath = "/referral";

export function ReferralNote() {
  return (
    <Link className="referral-note" to={referralPath}>
      <HeartHandshake size={22} aria-hidden="true" />
      <span>
        <strong>Верните 15% стоимости своего заказа</strong>
        <span>
          Заказ нового клиента — в течение месяца с даты вашего заказа.
          Подробнее
        </span>
      </span>
      <ArrowUpRight size={18} aria-hidden="true" />
    </Link>
  );
}

export default function ReferralPromo({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <RevealSection
      className={`referral-promo ${compact ? "referral-promo--compact" : "home-section"}`}
      aria-label="Возврат 15% за рекомендацию"
    >
      <div className="referral-promo-number" aria-hidden="true">
        <span>
          15<span>%</span>
        </span>
        <small>возвращаем вам</small>
      </div>
      <div className="referral-promo-copy">
        <p className="eyebrow">СПАСИБО ЗА ВАШУ РЕКОМЕНДАЦИЮ</p>
        <h2>
          {compact
            ? "Рекомендуйте нас — вернём 15%"
            : "Красивым интерьером хочется делиться"}
        </h2>
        <p>
          Вернём 15% стоимости вашего заказа, если новый клиент по вашей
          рекомендации оформит заказ в течение месяца с даты оформления вашего.
        </p>
        {!compact && (
          <p className="referral-promo-example">
            Ваш заказ на 100 000 ₽ — возврат 15 000 ₽.
          </p>
        )}
      </div>
      <ButtonLink to={referralPath} className="referral-promo-link">
        Как получить возврат <ArrowUpRight size={18} aria-hidden="true" />
      </ButtonLink>
    </RevealSection>
  );
}
