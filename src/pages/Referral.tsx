import { ArrowUpRight, HeartHandshake } from "lucide-react";
import { Button } from "../components/Button";
import { Breadcrumbs } from "../components/Primitives";
import { Reveal, RevealSection } from "../components/Motion";
import { useStore } from "../lib/store";
import "../components/referral.css";

const steps = [
  [
    "Расскажите о нас",
    "Порекомендуйте VIP DECOR DESIGN тому, кто выбирает шторы, ткани или декор для своего дома.",
  ],
  [
    "Пригласите в течение месяца",
    "Новый клиент должен оформить заказ в течение одного месяца с даты оформления вашего заказа. Сообщите менеджеру, что он пришёл по вашей рекомендации.",
  ],
  [
    "Получите 15% обратно",
    "Если новый клиент оформил заказ в этот срок, вернём вам 15% стоимости вашего заказа. Способ и срок выплаты согласуйте с менеджером.",
  ],
];
const questions = [
  [
    "С какого момента считается месяц?",
    "С даты оформления вашего собственного заказа. В течение одного месяца новый клиент, которого вы порекомендовали, должен также оформить заказ в VIP DECOR DESIGN.",
  ],
  [
    "Что будет, если за месяц никто не оформит заказ?",
    "Возврат 15% по акции не начисляется. Ваш собственный заказ остаётся на согласованных условиях.",
  ],
  [
    "От какой суммы рассчитываются 15%?",
    "От суммы вашего заказа — заказа клиента, который порекомендовал нас. Например, при сумме вашего заказа 100 000 ₽ возврат составит 15 000 ₽.",
  ],
  [
    "Достаточно ли просто поделиться ссылкой?",
    "Для возврата новый клиент должен оформить заказ в VIP DECOR DESIGN в течение месяца с даты вашего заказа. Сообщите менеджеру о рекомендации, чтобы мы могли её учесть.",
  ],
  [
    "Это скидка на покупку?",
    "Это денежный возврат за привлечённого клиента. Он не уменьшает стоимость текущего заказа в корзине.",
  ],
  [
    "Как узнать детали и получить возврат?",
    "Обратитесь к менеджеру. До участия уточните, какой ваш заказ учитывается, как зафиксировать рекомендацию, способ и срок выплаты, а также возможность сочетания с другими предложениями.",
  ],
];

export default function Referral() {
  const { discuss } = useStore();
  const participate = () =>
    discuss(
      "Акция: возврат 15% от моего заказа за заказ нового клиента в течение месяца с даты оформления моего заказа. Хочу уточнить условия и зарегистрировать рекомендацию.",
    );
  return (
    <div className="container referral-page">
      <Breadcrumbs items={[{ label: "Возврат за рекомендацию" }]} />
      <RevealSection className="referral-hero">
        <div className="referral-hero-copy">
          <p className="eyebrow">ПРОГРАММА РЕКОМЕНДАЦИЙ</p>
          <h1>
            Делитесь уютом.
            <br />
            Получайте 15% обратно.
          </h1>
          <p className="referral-lead">
            Вернём 15% стоимости вашего собственного заказа, если новый клиент
            по вашей рекомендации оформит заказ в течение одного месяца с даты
            оформления вашего заказа.
          </p>
          <Button onClick={participate}>
            Обсудить участие <ArrowUpRight size={18} aria-hidden="true" />
          </Button>
        </div>
        <div className="referral-return">
          <HeartHandshake size={32} strokeWidth={1.3} aria-hidden="true" />
          <p className="referral-return-value">
            15<span>%</span>
          </p>
          <p>
            от вашего заказа
            <br />
            возвращаем вам
          </p>
          <div className="referral-return-example">
            <span>
              Например, ваш заказ <strong>100 000 ₽</strong>
            </span>
            <span>
              Ваш возврат <strong>15 000 ₽</strong>
            </span>
          </div>
        </div>
      </RevealSection>

      <section
        className="referral-steps"
        aria-labelledby="referral-steps-title"
      >
        <p className="eyebrow">ТРИ ПРОСТЫХ ШАГА</p>
        <h2 id="referral-steps-title">Хорошие рекомендации возвращаются</h2>
        <ol>
          {steps.map(([title, description], index) => (
            <li key={title}>
              <Reveal delay={index * 0.08}>
                <span className="referral-step-number">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <RevealSection
        className="referral-details"
        aria-labelledby="referral-details-title"
      >
        <div>
          <p className="eyebrow">ПОНЯТНО О ГЛАВНОМ</p>
          <h2 id="referral-details-title">О программе</h2>
          <p>
            Один месяц с даты вашего заказа, чтобы поделиться рекомендацией и
            получить возврат.
          </p>
        </div>
        <div className="referral-faq">
          {questions.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </RevealSection>

      <RevealSection className="referral-contact">
        <div>
          <h2>Есть кому нас порекомендовать?</h2>
          <p>
            Напишите нам — поможем разобраться в деталях и учесть вашу
            рекомендацию.
          </p>
        </div>
        <Button onClick={participate}>
          Связаться с менеджером <ArrowUpRight size={18} aria-hidden="true" />
        </Button>
      </RevealSection>
    </div>
  );
}
