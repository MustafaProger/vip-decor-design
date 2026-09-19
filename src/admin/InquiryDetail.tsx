import { Mail, Phone } from "lucide-react";
import { Field } from "./Fields";
import {
  formatDate,
  inquiryLabels,
  type CMSInquiry,
  type InquiryStatus,
} from "./types";

export function InquiryDetail({
  item,
  onChange,
}: {
  item: CMSInquiry;
  onChange: (value: CMSInquiry) => void;
}) {
  const data = { ...item.payload, ...item };
  const selectionNames: Record<string, string> = {
    room: "Комната",
    material: "Материал",
    widthCm: "Ширина, см",
    heightCm: "Высота, см",
    dimensionsUnknown: "Размеры пока неизвестны",
    products: "Товары",
    items: "Состав заявки",
    total: "Сумма",
  };
  function display(value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Да" : "Нет";
    if (Array.isArray(value)) return value.map(display).join("; ");
    if (typeof value === "object")
      return Object.entries(value)
        .map(
          ([key, entry]) => `${selectionNames[key] || key}: ${display(entry)}`,
        )
        .join(", ");
    return String(value);
  }
  return (
    <div className="cms-editor-columns">
      <div className="cms-editor-main">
        <section className="cms-card cms-form-card">
          <h2>Контакт клиента</h2>
          <h3 className="cms-contact-name">
            {String(data.name || "Без имени")}
          </h3>
          <div className="cms-contact-links">
            {data.phone && (
              <a href={`tel:${String(data.phone).replace(/[^+\d]/g, "")}`}>
                <Phone size={17} />
                {String(data.phone)}
              </a>
            )}
            {data.email && (
              <a href={`mailto:${String(data.email)}`}>
                <Mail size={17} />
                {String(data.email)}
              </a>
            )}
          </div>
          <dl className="cms-detail-list">
            <div>
              <dt>Получена</dt>
              <dd>{formatDate(item.createdAt || item.receivedAt)}</dd>
            </div>
            <div>
              <dt>Номер</dt>
              <dd>{item.id}</dd>
            </div>
            {data.context && (
              <div>
                <dt>Интерес клиента</dt>
                <dd>{display(data.context)}</dd>
              </div>
            )}
          </dl>
        </section>
        <section className="cms-card cms-form-card">
          <h2>Комментарий клиента</h2>
          <p className="cms-inquiry-comment">{display(data.comment)}</p>
        </section>
        {data.selection && (
          <section className="cms-card cms-form-card">
            <h2>Параметры подбора</h2>
            <dl className="cms-detail-list">
              {Object.entries(data.selection).map(([key, value]) => (
                <div key={key}>
                  <dt>{selectionNames[key] || key}</dt>
                  <dd>{display(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {Boolean(data.cart || data.items || data.calculation) && (
          <section className="cms-card cms-form-card">
            <h2>Детали заказа</h2>
            <p className="cms-inquiry-comment">
              {display(data.cart || data.items || data.calculation)}
            </p>
          </section>
        )}
      </div>
      <aside className="cms-editor-aside">
        <section className="cms-card cms-form-card">
          <h2>Работа с заявкой</h2>
          <Field label="Статус">
            <select
              value={item.status}
              onChange={(event) =>
                onChange({
                  ...item,
                  status: event.target.value as InquiryStatus,
                })
              }
            >
              {Object.entries(inquiryLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Внутренняя заметка" hint="Видна только в CMS.">
            <textarea
              rows={9}
              maxLength={10000}
              placeholder="Итоги разговора, следующий шаг, договорённости…"
              value={item.note || ""}
              onChange={(event) =>
                onChange({ ...item, note: event.target.value })
              }
            />
          </Field>
        </section>
        <div className="cms-notice">
          <Mail size={18} />
          <div>
            <strong>Почта пока не подключена</strong>
            <p>
              Обращения сохраняются в CMS. Уведомления и отправку писем можно
              подключить позже.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
