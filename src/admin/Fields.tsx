import { useId, useState, type ReactNode } from "react";
import { ImagePlus, Upload, X } from "lucide-react";
import type { MediaResult } from "./types";

export function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`cms-field${wide ? " cms-wide" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function ImageField({
  value,
  onChange,
  upload,
  label = "Изображение",
}: {
  value: string;
  onChange: (value: string, result?: MediaResult) => void;
  upload: (file: File) => Promise<MediaResult>;
  label?: string;
}) {
  const id = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="cms-image-field">
      <div className="cms-image-preview">
        {value ? (
          <img src={value} alt="Предпросмотр изображения" />
        ) : (
          <ImagePlus size={28} />
        )}
      </div>
      <div className="cms-image-controls">
        <Field
          label={label}
          hint="JPEG, PNG или WebP, до 10 МБ. Можно загрузить файл или указать адрес."
        >
          <input
            type="text"
            value={value}
            placeholder="/images/… или https://…"
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
        <div className="cms-inline">
          <label
            className={`cms-button cms-secondary cms-upload ${pending ? "is-disabled" : ""}`}
            htmlFor={id}
          >
            <Upload size={16} />
            {pending ? "Загружаем…" : "Загрузить файл"}
          </label>
          <input
            className="cms-file-input"
            id={id}
            aria-label={`Загрузить: ${label}`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={pending}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > 10 * 1024 * 1024) {
                setError("Размер файла превышает 10 МБ.");
                return;
              }
              if (
                !["image/jpeg", "image/png", "image/webp"].includes(file.type)
              ) {
                setError("Выберите JPEG, PNG или WebP.");
                return;
              }
              setPending(true);
              setError("");
              try {
                const result = await upload(file);
                onChange(result.url, result);
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : "Не удалось загрузить файл.",
                );
              } finally {
                setPending(false);
              }
            }}
          />
          {value && (
            <button
              className="cms-icon-button"
              type="button"
              aria-label="Убрать изображение"
              onClick={() => onChange("")}
            >
              <X size={17} />
            </button>
          )}
        </div>
        {error && (
          <p className="cms-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export function JsonField({
  label,
  value,
  onChange,
  onValidityChange,
}: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  onValidityChange?: (invalid: boolean) => void;
}) {
  const serialized = JSON.stringify(value ?? null, null, 2);
  const [text, setText] = useState(serialized);
  const [lastValue, setLastValue] = useState(serialized);
  const [error, setError] = useState("");
  if (serialized !== lastValue) {
    setLastValue(serialized);
    setText(serialized);
  }
  return (
    <Field
      label={label}
      hint="Дополнительные структурированные данные. Существующие поля сохраняются при обычном редактировании."
    >
      <textarea
        className="cms-code"
        rows={10}
        spellCheck={false}
        value={text}
        aria-invalid={!!error}
        onChange={(event) => {
          setText(event.target.value);
          try {
            const next = JSON.parse(event.target.value);
            setError("");
            onValidityChange?.(false);
            onChange(next);
          } catch {
            setError("Некорректный JSON. Исправьте его перед сохранением.");
            onValidityChange?.(true);
          }
        }}
      />
      {error && (
        <small className="cms-error" role="alert">
          {error}
        </small>
      )}
    </Field>
  );
}

export function Badge({
  status,
  children,
}: {
  status: string;
  children: ReactNode;
}) {
  return <span className={`cms-badge cms-badge-${status}`}>{children}</span>;
}
