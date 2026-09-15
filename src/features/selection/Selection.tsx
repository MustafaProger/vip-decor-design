import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import InquiryForm from "../inquiry/InquiryForm";
import type { SelectionAnswers } from "../../lib/inquiry";
import "./selection.css";

const rooms = [
  { id: "living", title: "Гостиная", image: "/images/concept-living.webp" },
  { id: "bedroom", title: "Спальня", image: "/images/concept-bedroom.webp" },
  { id: "kids", title: "Детская", image: "/images/concept-kids.webp" },
  { id: "kitchen", title: "Кухня", image: "/images/concept-kitchen.webp" },
];
const materials = [
  {
    title: "Лёгкие и воздушные",
    description: "Мягкий свет, полупрозрачные фактуры",
    icon: "light",
  },
  {
    title: "Плотные и спокойные",
    description: "Уединение и выразительные складки",
    icon: "dense",
  },
  {
    title: "Сочетание портьер и тюля",
    description: "Несколько слоёв и разные сценарии света",
    icon: "layered",
  },
  {
    title: "Помогите выбрать",
    description: "Разберёмся вместе с дизайнером",
    icon: "unknown",
  },
];
const stepLabels = ["Комната", "Материалы", "Размеры", "Контакты"];

export default function Selection({
  onDiscuss,
}: {
  onDiscuss?: (context: string) => void;
}) {
  const [searchParams] = useSearchParams();
  const source = (
    searchParams.get("context") ||
    searchParams.get("source") ||
    ""
  ).slice(0, 1800);
  const [step, setStep] = useState(0);
  const [room, setRoom] = useState("living");
  const [material, setMaterial] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [dimensionsUnknown, setDimensionsUnknown] = useState(false);
  const [error, setError] = useState("");
  const [dimensionErrors, setDimensionErrors] = useState<{
    width?: string;
    height?: string;
  }>({});
  const [complete, setComplete] = useState(false);
  const [pending, setPending] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  const selectedRoom = rooms.find((item) => item.id === room) || rooms[0];
  const context = source ? `Подбор штор · ${source}` : "Подбор штор";
  const answers: SelectionAnswers = {
    room: selectedRoom.title,
    material,
    widthCm: !dimensionsUnknown && width !== "" ? Number(width) : undefined,
    heightCm: !dimensionsUnknown && height !== "" ? Number(height) : undefined,
    dimensionsUnknown,
  };

  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    headingRef.current?.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 900px)").matches) {
      headingRef.current?.scrollIntoView({
        behavior: "instant",
        block: "start",
      });
    }
  }, [step]);

  function next() {
    setError("");
    if (step === 1 && !material) {
      setError(
        "Выберите предпочтение. Если пока не определились, нажмите «Помогите выбрать».",
      );
      return;
    }
    if (step === 2 && !dimensionsUnknown) {
      const errors: { width?: string; height?: string } = {};
      if (
        width !== "" &&
        (!Number.isFinite(Number(width)) || Number(width) <= 0)
      )
        errors.width = "Укажите ширину больше нуля или оставьте поле пустым.";
      if (
        height !== "" &&
        (!Number.isFinite(Number(height)) || Number(height) <= 0)
      )
        errors.height = "Укажите высоту больше нуля или оставьте поле пустым.";
      setDimensionErrors(errors);
      if (Object.keys(errors).length) {
        document
          .getElementById(errors.width ? "selection-width" : "selection-height")
          ?.focus();
        return;
      }
    }
    setStep((current) => Math.min(current + 1, 3));
  }

  function back() {
    setError("");
    setStep((current) => Math.max(0, current - 1));
  }

  return (
    <section className="selection-page">
      <nav className="selection-breadcrumb" aria-label="Хлебные крошки">
        <Link to="/">Главная</Link>
        <span aria-hidden="true">/</span>
        <span>Подбор штор</span>
      </nav>
      <header className="selection-header">
        <h1>Подбор штор</h1>
        <p>Укажите комнату, материал и размеры окна.</p>
      </header>
      <div className="selection-progress">
        <ol aria-label="Этапы подбора">
          {stepLabels.map((label, index) => (
            <li
              key={label}
              className={index <= step ? "selection-step-active" : ""}
              aria-current={index === step ? "step" : undefined}
            >
              <span className="selection-step-dot" aria-hidden="true">
                {index < step ? "✓" : ""}
              </span>
              <span className="selection-step-number">0{index + 1}</span>
              <span>{label}</span>
            </li>
          ))}
        </ol>
        <span className="selection-step-count" aria-live="polite">
          Шаг {step + 1} из 4
        </span>
      </div>
      <div className="selection-layout">
        <figure className="selection-visual">
          <img
            src={selectedRoom.image}
            alt={`Концепция: ${selectedRoom.title.toLowerCase()} с мягким естественным светом и шторами`}
            width="1200"
            height="1500"
          />
          <figcaption>
            <span>Концепция интерьера</span>
            <span>{selectedRoom.title}</span>
          </figcaption>
        </figure>
        <div className="selection-questions">
          <h2 ref={headingRef} tabIndex={-1}>
            {
              [
                "Для какой комнаты подбираем шторы?",
                "Какие фактуры вам ближе?",
                "Несколько слов о размерах.",
                complete
                  ? "Ваше пространство — начало истории."
                  : "Как с вами связаться?",
              ][step]
            }
          </h2>
          {step === 0 && (
            <>
              <p className="selection-step-description">
                Выберите пространство, которое хотите преобразить.
              </p>
              <fieldset className="selection-room-grid">
                <legend className="selection-sr-only">Комната</legend>
                {rooms.map((item) => (
                  <label
                    key={item.id}
                    className={`selection-room ${room === item.id ? "selection-room-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="room"
                      value={item.id}
                      checked={room === item.id}
                      onChange={() => setRoom(item.id)}
                    />
                    <img src={item.image} alt="" width="400" height="270" />
                    <span className="selection-room-name">{item.title}</span>
                    <span className="selection-room-check" aria-hidden="true">
                      ✓
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className="selection-small-note">
                Поможем с тканью, пошивом и установкой.
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <p className="selection-step-description">
                Можно выбрать настроение. С конкретной тканью определимся
                вместе.
              </p>
              <fieldset
                className="selection-materials"
                aria-describedby={error ? "selection-step-error" : undefined}
              >
                <legend className="selection-sr-only">
                  Предпочтения по материалам
                </legend>
                {materials.map((item) => (
                  <label
                    key={item.title}
                    className={`selection-material ${material === item.title ? "selection-material-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="material"
                      value={item.title}
                      checked={material === item.title}
                      onChange={() => {
                        setMaterial(item.title);
                        setError("");
                      }}
                    />
                    <span
                      className={`selection-fabric-mark selection-fabric-${item.icon}`}
                      aria-hidden="true"
                    >
                      {item.icon === "unknown" ? "?" : ""}
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                    </span>
                    <span
                      className="selection-material-dot"
                      aria-hidden="true"
                    />
                  </label>
                ))}
              </fieldset>
            </>
          )}
          {step === 2 && (
            <>
              <p className="selection-step-description">
                Примерных значений достаточно. Если замеров пока нет, пропустите
                этот шаг.
              </p>
              <div className="selection-dimensions">
                <div className="selection-dimension-field">
                  <label htmlFor="selection-width">
                    Ширина окна <span>в сантиметрах</span>
                  </label>
                  <input
                    id="selection-width"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="any"
                    placeholder="Например, 240"
                    value={width}
                    disabled={dimensionsUnknown}
                    onChange={(event) => {
                      setWidth(event.target.value);
                      setDimensionErrors((current) => ({
                        ...current,
                        width: undefined,
                      }));
                    }}
                    aria-invalid={!!dimensionErrors.width}
                    aria-describedby={
                      dimensionErrors.width
                        ? "selection-width-error"
                        : undefined
                    }
                  />
                  {dimensionErrors.width && (
                    <p
                      id="selection-width-error"
                      className="selection-field-error"
                    >
                      {dimensionErrors.width}
                    </p>
                  )}
                </div>
                <div className="selection-dimension-field">
                  <label htmlFor="selection-height">
                    Высота от карниза до пола <span>в сантиметрах</span>
                  </label>
                  <input
                    id="selection-height"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="any"
                    placeholder="Например, 280"
                    value={height}
                    disabled={dimensionsUnknown}
                    onChange={(event) => {
                      setHeight(event.target.value);
                      setDimensionErrors((current) => ({
                        ...current,
                        height: undefined,
                      }));
                    }}
                    aria-invalid={!!dimensionErrors.height}
                    aria-describedby={
                      dimensionErrors.height
                        ? "selection-height-error"
                        : undefined
                    }
                  />
                  {dimensionErrors.height && (
                    <p
                      id="selection-height-error"
                      className="selection-field-error"
                    >
                      {dimensionErrors.height}
                    </p>
                  )}
                </div>
                <label className="selection-unknown">
                  <input
                    type="checkbox"
                    checked={dimensionsUnknown}
                    onChange={(event) => {
                      setDimensionsUnknown(event.target.checked);
                      setDimensionErrors({});
                    }}
                  />
                  <span>Пока не знаю</span>
                </label>
              </div>
              <p className="selection-measure-note">
                Точные размеры снимем перед пошивом. На этом этапе стоимость не
                рассчитывается.
              </p>
            </>
          )}
          <div hidden={step !== 3}>
            {!complete && (
              <p className="selection-step-description">
                Оставьте контакты и всё, что важно для вашего проекта.
              </p>
            )}
            <InquiryForm
              context={context}
              selection={answers}
              onSuccess={() => setComplete(true)}
              onPendingChange={setPending}
              beforeActions={
                <button
                  className="selection-back"
                  type="button"
                  onClick={back}
                  disabled={pending}
                >
                  ← Назад
                </button>
              }
            >
              <dl className="selection-summary" aria-label="Ваш выбор">
                <div>
                  <dt>Комната</dt>
                  <dd>{selectedRoom.title}</dd>
                </div>
                <div>
                  <dt>Материалы</dt>
                  <dd>{material || "Не выбраны"}</dd>
                </div>
                <div>
                  <dt>Размеры</dt>
                  <dd>
                    {dimensionsUnknown || (!width && !height)
                      ? "Уточним при замере"
                      : `${width ? `Ширина ${width} см` : "Ширина не указана"} · ${height ? `Высота ${height} см` : "Высота не указана"}`}
                  </dd>
                </div>
              </dl>
            </InquiryForm>
          </div>
          {error && (
            <p
              id="selection-step-error"
              className="selection-field-error"
              role="alert"
            >
              {error}
            </p>
          )}
          {step < 3 && (
            <div className="selection-actions">
              {step > 0 && (
                <button className="selection-back" type="button" onClick={back}>
                  ← Назад
                </button>
              )}
              <button className="selection-next" type="button" onClick={next}>
                Далее <span aria-hidden="true">→</span>
              </button>
            </div>
          )}
          {step === 0 && (
            <p className="selection-price-note">
              Стоимость уточним после выбора материалов и замера.
            </p>
          )}
        </div>
      </div>
      <footer className="selection-footer">
        {onDiscuss ? (
          <button
            type="button"
            onClick={() =>
              onDiscuss(
                `${context} · ${selectedRoom.title}${material ? ` · ${material}` : ""}`,
              )
            }
          >
            Нужна помощь? Обсудить с дизайнером{" "}
            <span aria-hidden="true">↗</span>
          </button>
        ) : (
          <a href="tel:+74959693189">
            Нужна помощь? +7 495 969-31-89 <span aria-hidden="true">↗</span>
          </a>
        )}
        <p>Иллюстрация для вдохновения. Она не показывает результат подбора.</p>
      </footer>
    </section>
  );
}
