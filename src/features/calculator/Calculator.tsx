import { useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { InquiryError, submitInquiry } from "../../lib/inquiry";
import {
  calculateCurtainsRange,
  DEFAULT_INPUT,
  FABRICS,
  formatPrice,
  MOUNTS,
  SEWING,
  type CalculatorInput,
} from "./model";
import "./Calculator.css";

type Contact = { name: string; email: string; phone: string; consent: boolean };
type Errors = Partial<Record<keyof Contact, string>>;

function ChoiceGroup<T extends string | number>({
  name,
  value,
  options,
  onChange,
  className = "",
}: {
  name: string;
  value: T;
  options: readonly { value: T; label: string; price?: number; max?: number }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`calc-choices ${className}`}>
      {options.map((option) => (
        <label
          className={`calc-choice ${value === option.value ? "calc-choice-selected" : ""}`}
          key={option.value}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span className="calc-choice-mark" aria-hidden="true" />
          <span className="calc-choice-name">{option.label}</span>
          <span className="calc-choice-price">
            {formatPrice(option.price ?? Number(option.value))}{option.max ? `–${formatPrice(option.max)}` : ""} ₽/{option.value === "eyelet" ? "шт" : "м"}
          </span>
        </label>
      ))}
    </div>
  );
}

export default function Calculator({
  onDiscuss,
}: {
  onDiscuss?: (context: string) => void;
}) {
  const [input, setInput] = useState<CalculatorInput>(DEFAULT_INPUT);
  const [contact, setContact] = useState<Contact>({
    name: "",
    email: "",
    phone: "",
    consent: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const sending = useRef(false);
  const total = calculateCurtainsRange(input);
  const totalText = total.min === total.max ? formatPrice(total.min) : `${formatPrice(total.min)}–${formatPrice(total.max)}`;
  const fabricName = FABRICS.find((item) => item.value === input.fabric)!.label;
  const sewingName = SEWING.find((item) => item.value === input.sewing)!.label;
  const mounting = MOUNTS.find((item) => item.value === input.mount)!;
  const mountName = mounting.label;
  const mountQuantity = input.mount === "eyelet" ? input.eyeletCount : input.width;
  const mountUnit = input.mount === "eyelet" ? "шт" : "м";
  const context = `Калькулятор штор: ткань ${fabricName} (${formatPrice(input.fabric)}${input.fabric === 9500 ? "–55 000" : ""} ₽/м), подшив ${sewingName} (${input.sewing} ₽/м), длина строчки ${input.sewingLength} м, крепление ${mountName} (${mounting.price} ₽/${mountUnit}), количество крепления ${mountQuantity} ${mountUnit}, метраж ткани ${input.width} м. Предварительная стоимость ${totalText} ₽.`;

  function updateInput<K extends keyof CalculatorInput>(key: K, value: CalculatorInput[K]) {
    setInput((previous) => ({ ...previous, [key]: value }));
    requestId.current = crypto.randomUUID();
    setStatus("");
  }
  function updateContact<Key extends keyof Contact>(
    key: Key,
    value: Contact[Key],
  ) {
    setContact((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
    requestId.current = crypto.randomUUID();
    setStatus("");
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const nextErrors: Errors = {};
    if (contact.name.trim().length < 2)
      nextErrors.name = "Укажите имя, не менее двух символов.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()))
      nextErrors.email = "Укажите email в формате name@example.ru.";
    const digits = contact.phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15)
      nextErrors.phone = "Укажите телефон: от 10 до 15 цифр.";
    if (!contact.consent)
      nextErrors.consent =
        "Подтвердите согласие на обработку персональных данных.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      event.currentTarget
        .querySelector<HTMLInputElement>(
          `[name="${Object.keys(nextErrors)[0]}"]`,
        )
        ?.focus();
      return;
    }
    sending.current = true;
    setPending(true);
    setStatus("");
    try {
      const result = await submitInquiry({
        name: contact.name.trim(),
        email: contact.email.trim(),
        phone: contact.phone.trim(),
        comment: "",
        consent: true,
        context,
        requestId: requestId.current,
      });
      setStatus(result.message);
    } catch (error) {
      if (error instanceof InquiryError && error.fields)
        setErrors(error.fields);
      setStatus(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить расчёт. Ваши данные остались в форме. Попробуйте ещё раз.",
      );
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return (
    <div className="calc-page">
      <div className="calc-shell">
        <div className="calc-intro">
          <h1>Калькулятор стоимости штор</h1>
          <p>
            Выберите ткань, подшив и крепление для предварительного расчёта.
          </p>
        </div>
        <div className="calc-layout">
          <div className="calc-options">
            <fieldset className="calc-fieldset" disabled={pending}>
              <legend>
                <span className="calc-step">01</span>Материал ткани
              </legend>
              <p className="calc-hint">
                Подробнее о материалах — в разделе{" "}
                <Link to="/kakpodobrat">«Как подобрать»</Link>.
              </p>
              <ChoiceGroup
                name="tkani"
                value={input.fabric}
                options={FABRICS}
                onChange={(value) => updateInput("fabric", value)}
              />
            </fieldset>
            <fieldset className="calc-fieldset" disabled={pending}>
              <legend>
                <span className="calc-step">02</span>Подшив
              </legend>
              <ChoiceGroup
                name="podshif"
                value={input.sewing}
                options={SEWING}
                onChange={(value) => updateInput("sewing", value)}
                className="calc-choices-two"
              />
              <label className="calc-hint" htmlFor="calc-sewing-length">Длина строчки, м</label>
              <input className="calc-input" id="calc-sewing-length" type="number" min="0.01" step="0.01"
                value={input.sewingLength}
                onChange={(event) => {
                  const value = event.target.valueAsNumber;
                  if (Number.isFinite(value) && value > 0) updateInput("sewingLength", value);
                }} />
              <p className="calc-hint">Общая длина всех строчек. Укажите её отдельно от метража ткани.</p>
            </fieldset>
            <fieldset className="calc-fieldset" disabled={pending}>
              <legend>
                <span className="calc-step">03</span>Крепление
              </legend>
              <p className="calc-hint">
                От крепления зависит, как ткань собирается в складки.{" "}
                <Link to="/fyrnityra">Смотреть фурнитуру</Link>.
              </p>
              <ChoiceGroup
                name="kreplenie"
                value={input.mount}
                options={MOUNTS}
                onChange={(value) => updateInput("mount", value)}
                className="calc-choices-mount"
              />
              {input.mount === "eyelet" && <>
                <label className="calc-hint" htmlFor="calc-eyelet-count">Количество люверсов, шт</label>
                <input className="calc-input" id="calc-eyelet-count" type="number" min="1" step="1"
                  value={input.eyeletCount}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber;
                    if (Number.isSafeInteger(value) && value > 0) updateInput("eyeletCount", value);
                  }} />
              </>}
            </fieldset>
            <fieldset className="calc-fieldset" disabled={pending}>
              <legend>
                <span className="calc-step">04</span>Метраж ткани
              </legend>
              <div className="calc-width-heading">
                <label className="calc-width-caption" htmlFor="calc-width">
                  В метрах, от 1 до 6
                </label>
                <output className="calc-width-value" htmlFor="calc-width">
                  {input.width} м
                </output>
              </div>
              <input
                className="calc-range"
                id="calc-width"
                name="sirina"
                type="range"
                min="1"
                max="6"
                step="1"
                value={input.width}
                onChange={(event) =>
                  updateInput("width", Number(event.target.value))
                }
              />
              <div className="calc-ticks" aria-hidden="true">
                {[1, 2, 3, 4, 5, 6].map((value) => (
                  <span key={value}>{value}</span>
                ))}
              </div>
            </fieldset>
            <details className="calc-explanation">
              <summary>Как рассчитывается стоимость</summary>
              <p>
                Калькулятор использует опубликованные тарифы VIP DECOR DESIGN:
                ткань и лента считаются по метражу ткани, пошив — по общей длине
                строчек, люверсы с установкой — по количеству штук.
              </p>
              <p>
                ({formatPrice(input.fabric)}{input.fabric === 9500 ? "–55 000" : ""} × {input.width}) + ({formatPrice(input.sewing)} × {input.sewingLength}) +{" "}
                ({formatPrice(mounting.price)} × {mountQuantity}) ={" "}
                {totalText} ₽.
              </p>
              <p>
                Окончательная стоимость зависит от согласованных параметров
                заказа. Высота, количество полотен, доставка и монтаж в эту
                формулу не входят.
              </p>
            </details>
          </div>
          <aside className="calc-summary" aria-label="Результат расчёта">
            <p className="calc-eyebrow">Ваше оформление</p>
            <h2>Ваш расчёт</h2>
            <dl>
              <div className="calc-summary-row">
                <dt>Ткань</dt>
                <dd>{fabricName} · {input.width} м × {formatPrice(input.fabric)} ₽</dd>
              </div>
              <div className="calc-summary-row">
                <dt>Подшив</dt>
                <dd>{sewingName} · {input.sewingLength} м × {formatPrice(input.sewing)} ₽ = {formatPrice(input.sewingLength * input.sewing)} ₽</dd>
              </div>
              <div className="calc-summary-row">
                <dt>Крепление</dt>
                <dd>{mountName} · {mountQuantity} {mountUnit} × {formatPrice(mounting.price)} ₽</dd>
              </div>
              <div className="calc-summary-row">
                <dt>Метраж ткани</dt>
                <dd>{input.width} м</dd>
              </div>
            </dl>
            <div className="calc-total">
              <span className="calc-total-label">
                Предварительная стоимость
              </span>
              <output
                aria-live="polite"
                aria-label="Предварительная стоимость штор"
              >
                {totalText} ₽
              </output>
            </div>
            <p className="calc-disclaimer">
              Стоимость комплекта штор, полученная в результате данного расчёта,
              является приблизительной ценой и не может являться основанием для
              заключения договора или оформления заказа по данной цене. Не
              является публичной офертой. Для получения точного коммерческого
              предложения необходимо предварительно обсудить со специалистами
              все параметры заказа.
            </p>
            {onDiscuss && (
              <button
                className="calc-button calc-button-outline"
                type="button"
                onClick={() => onDiscuss(context)}
              >
                Обсудить расчёт <ArrowUpRight size={17} aria-hidden="true" />
              </button>
            )}
            <form
              className="calc-contact"
              onSubmit={handleSubmit}
              noValidate
              aria-label="Заявка по расчёту"
            >
              <h3>Сохранить ваш расчёт</h3>
              <p className="calc-contact-description">
                Оставьте контакты вместе с параметрами оформления. Точную
                стоимость согласует дизайнер.
              </p>
              {(["name", "email", "phone"] as const).map((key) => (
                <label className="calc-field" key={key}>
                  <span>
                    {key === "name"
                      ? "Ваше имя"
                      : key === "email"
                        ? "Email"
                        : "Телефон"}{" "}
                    *
                  </span>
                  <input
                    className="calc-input"
                    name={key}
                    type={
                      key === "email"
                        ? "email"
                        : key === "phone"
                          ? "tel"
                          : "text"
                    }
                    autoComplete={key === "phone" ? "tel" : key}
                    value={contact[key]}
                    onChange={(event) => updateContact(key, event.target.value)}
                    required
                    aria-invalid={Boolean(errors[key])}
                    aria-describedby={
                      errors[key] ? `calc-error-${key}` : undefined
                    }
                    disabled={pending}
                    maxLength={
                      key === "phone" ? 30 : key === "name" ? 100 : 254
                    }
                  />
                  {errors[key] && (
                    <span className="calc-error" id={`calc-error-${key}`}>
                      {errors[key]}
                    </span>
                  )}
                </label>
              ))}
              <label className="calc-consent">
                <input
                  type="checkbox"
                  name="consent"
                  checked={contact.consent}
                  onChange={(event) =>
                    updateContact("consent", event.target.checked)
                  }
                  required
                  aria-invalid={Boolean(errors.consent)}
                  aria-describedby={
                    errors.consent ? "calc-error-consent" : undefined
                  }
                  disabled={pending}
                />
                <span>
                  Я согласен с{" "}
                  <Link to="/popd">
                    политикой обработки персональных данных
                  </Link>
                  .
                </span>
              </label>
              {errors.consent && (
                <p className="calc-error" id="calc-error-consent">
                  {errors.consent}
                </p>
              )}
              <button className="calc-button" type="submit" disabled={pending}>
                {pending ? "Сохраняем…" : "Сохранить расчёт"}
                <ArrowRight size={17} aria-hidden="true" />
              </button>
              {status && (
                <p className="calc-status" role="status">
                  {status}
                </p>
              )}
            </form>
          </aside>
        </div>
      </div>
    </div>
  );
}
