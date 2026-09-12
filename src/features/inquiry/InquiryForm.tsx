import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  InquiryError,
  submitInquiry,
  validateInquiry,
  type InquiryErrors,
  type InquiryResult,
  type InquiryValues,
  type SelectionAnswers,
} from "../../lib/inquiry";
import "./inquiry.css";

type InquiryFormProps = {
  context?: string;
  onSuccess?: () => void;
  onPendingChange?: (pending: boolean) => void;
  selection?: SelectionAnswers;
  children?: ReactNode;
  beforeActions?: ReactNode;
  privacyHref?: string;
};

export function InquiryForm({
  context,
  onSuccess,
  onPendingChange,
  selection,
  children,
  beforeActions,
  privacyHref = "/privacy",
}: InquiryFormProps) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const submissionLock = useRef(false);
  const lastAttempt = useRef<{ snapshot: string; requestId: string } | null>(
    null,
  );
  const [values, setValues] = useState<InquiryValues>({
    name: "",
    phone: "",
    comment: "",
    consent: false,
  });
  const [errors, setErrors] = useState<InquiryErrors>({});
  const [serverError, setServerError] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<InquiryResult | null>(null);

  const setField = <K extends keyof InquiryValues>(
    key: K,
    value: InquiryValues[K],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setServerError("");
  };

  function focusFirstInvalid(nextErrors: InquiryErrors) {
    const first = Object.keys(nextErrors)[0];
    if (first)
      window.requestAnimationFrame(() =>
        formRef.current
          ?.querySelector<HTMLInputElement>(`[name="${first}"]`)
          ?.focus(),
      );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLock.current || result) return;
    const nextErrors = validateInquiry(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      focusFirstInvalid(nextErrors);
      return;
    }
    submissionLock.current = true;
    setPending(true);
    onPendingChange?.(true);
    setServerError("");
    const input = {
      ...values,
      name: values.name.trim(),
      phone: values.phone.trim(),
      comment: values.comment.trim(),
      context,
      selection,
    };
    const snapshot = JSON.stringify(input);
    if (lastAttempt.current?.snapshot !== snapshot) {
      lastAttempt.current = { snapshot, requestId: crypto.randomUUID() };
    }
    try {
      const saved = await submitInquiry({
        ...input,
        requestId: lastAttempt.current.requestId,
      });
      setResult(saved);
      onSuccess?.();
    } catch (error) {
      if (error instanceof InquiryError && error.fields) {
        setErrors(error.fields);
        focusFirstInvalid(error.fields);
      }
      setServerError(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить заявку. Попробуйте ещё раз.",
      );
    } finally {
      submissionLock.current = false;
      setPending(false);
      onPendingChange?.(false);
    }
  }

  if (result) {
    return (
      <section className="inquiry-result" role="status" aria-live="polite">
        <span className="inquiry-result-icon" aria-hidden="true">
          ✓
        </span>
        <h3>
          {result.status === "saved_locally"
            ? "Заявка сохранена"
            : "Спасибо за ваше обращение"}
        </h3>
        <p>{result.message}</p>
        {result.status === "saved_locally" && (
          <p>
            Чтобы обсудить проект со студией сейчас, позвоните{" "}
            <a href="tel:+74959693189">+7 495 969-31-89</a>.
          </p>
        )}
        <p className="inquiry-reference">
          Номер заявки: {result.id.slice(0, 8)}
        </p>
        <button
          type="button"
          className="inquiry-submit"
          onClick={() => {
            setResult(null);
            setValues({ name: "", phone: "", comment: "", consent: false });
            lastAttempt.current = null;
          }}
        >
          Обсудить другой проект
        </button>
      </section>
    );
  }

  return (
    <form
      className="inquiry-form"
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      aria-busy={pending}
    >
      {children}
      {context && <p className="inquiry-context">Ваш интерес: {context}</p>}
      <div className="inquiry-fields">
        <div className="inquiry-field">
          <label htmlFor={`${id}-name`}>
            Ваше имя <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${id}-name`}
            name="name"
            autoComplete="name"
            required
            maxLength={100}
            value={values.name}
            disabled={pending}
            onChange={(event) => setField("name", event.target.value)}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? `${id}-name-error` : undefined}
          />
          {errors.name && (
            <p className="inquiry-field-error" id={`${id}-name-error`}>
              {errors.name}
            </p>
          )}
        </div>
        <div className="inquiry-field">
          <label htmlFor={`${id}-phone`}>
            Телефон <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${id}-phone`}
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            required
            maxLength={40}
            placeholder="+7 999 123-45-67"
            value={values.phone}
            disabled={pending}
            onChange={(event) => setField("phone", event.target.value)}
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? `${id}-phone-error` : undefined}
          />
          {errors.phone && (
            <p className="inquiry-field-error" id={`${id}-phone-error`}>
              {errors.phone}
            </p>
          )}
        </div>
        <div className="inquiry-field inquiry-field-wide">
          <label htmlFor={`${id}-comment`}>
            О вашем проекте{" "}
            <span className="inquiry-optional">— необязательно</span>
          </label>
          <textarea
            id={`${id}-comment`}
            name="comment"
            rows={3}
            maxLength={3000}
            placeholder="Что вам нравится, что важно учесть…"
            value={values.comment}
            disabled={pending}
            onChange={(event) => setField("comment", event.target.value)}
            aria-invalid={!!errors.comment}
            aria-describedby={
              errors.comment ? `${id}-comment-error` : undefined
            }
          />
          {errors.comment && (
            <p className="inquiry-field-error" id={`${id}-comment-error`}>
              {errors.comment}
            </p>
          )}
        </div>
      </div>
      <div className="inquiry-consent-wrap">
        <label className="inquiry-consent" htmlFor={`${id}-consent`}>
          <input
            id={`${id}-consent`}
            name="consent"
            type="checkbox"
            required
            checked={values.consent}
            disabled={pending}
            onChange={(event) => setField("consent", event.target.checked)}
            aria-invalid={!!errors.consent}
            aria-describedby={
              errors.consent ? `${id}-consent-error` : undefined
            }
          />
          <span>
            Я согласен на обработку персональных данных в соответствии с{" "}
            <a href={privacyHref} target="_blank" rel="noreferrer">
              политикой конфиденциальности
            </a>
            .
          </span>
        </label>
        {errors.consent && (
          <p className="inquiry-field-error" id={`${id}-consent-error`}>
            {errors.consent}
          </p>
        )}
      </div>
      {!import.meta.env.VITE_INQUIRY_ENDPOINT && (
        <p className="inquiry-local-note">
          Локальная версия: заявка будет сохранена на этом сервере. Доставка в
          студию ещё не подключена.
        </p>
      )}
      {serverError && (
        <p className="inquiry-server-error" role="alert">
          {serverError}
        </p>
      )}
      <div className="inquiry-actions">
        {beforeActions}
        <button className="inquiry-submit" type="submit" disabled={pending}>
          {pending ? "Сохраняем заявку…" : "Отправить заявку"}
          {!pending && <span aria-hidden="true">↗</span>}
        </button>
      </div>
    </form>
  );
}

export default InquiryForm;
