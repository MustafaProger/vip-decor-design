/// <reference types="vite/client" />

export type SelectionAnswers = {
  room: string;
  material: string;
  widthCm?: number;
  heightCm?: number;
  dimensionsUnknown: boolean;
};

export type InquiryValues = {
  name: string;
  phone: string;
  comment: string;
  consent: boolean;
};

export type InquiryPayload = InquiryValues & {
  email?: string;
  context?: string;
  selection?: SelectionAnswers;
  requestId: string;
};

export type InquiryResult = {
  id: string;
  status: "saved_locally" | "sent";
  message: string;
};

export type InquiryErrors = Partial<Record<keyof InquiryValues, string>>;

export function validateInquiry(values: InquiryValues): InquiryErrors {
  const errors: InquiryErrors = {};
  if (values.name.trim().length < 2)
    errors.name = "Укажите имя: не менее двух символов.";
  else if (values.name.trim().length > 100)
    errors.name = "Имя должно быть не длиннее 100 символов.";
  const digits = values.phone.replace(/\D/g, "");
  if (
    !/^[+\d\s()\-]+$/.test(values.phone.trim()) ||
    digits.length < 10 ||
    digits.length > 15
  ) {
    errors.phone = "Введите телефон с кодом страны, например +7 999 123-45-67.";
  }
  if (values.comment.length > 3000)
    errors.comment = "Сократите комментарий до 3000 символов.";
  if (!values.consent)
    errors.consent = "Для сохранения заявки необходимо ваше согласие.";
  return errors;
}

export class InquiryError extends Error {
  fields?: InquiryErrors;

  constructor(message: string, fields?: InquiryErrors) {
    super(message);
    this.name = "InquiryError";
    this.fields = fields;
  }
}

export async function submitInquiry(
  payload: InquiryPayload,
): Promise<InquiryResult> {
  const endpoint = import.meta.env.VITE_INQUIRY_ENDPOINT || "/api/inquiries";
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      credentials: "same-origin",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new InquiryError(
        body?.error?.message ||
          "Не удалось сохранить заявку. Проверьте соединение и попробуйте ещё раз.",
        body?.error?.fields,
      );
    }
    if (
      !body ||
      typeof body.id !== "string" ||
      !["saved_locally", "sent"].includes(body.status)
    ) {
      throw new InquiryError(
        "Сервер не подтвердил сохранение заявки. Данные остались в форме.",
      );
    }
    return {
      id: body.id,
      status: body.status,
      message:
        body.status === "saved_locally"
          ? "Заявка сохранена в локальной версии. Доставка в компанию ещё не подключена."
          : "Заявка отправлена. Компания получила ваше обращение.",
    };
  } catch (error) {
    if (error instanceof InquiryError) throw error;
    throw new InquiryError(
      error instanceof Error && error.name === "AbortError"
        ? "Сервер не ответил вовремя. Ввод сохранён — попробуйте ещё раз."
        : "Не удалось связаться с сервером. Ввод сохранён — проверьте соединение и попробуйте ещё раз.",
    );
  } finally {
    window.clearTimeout(timeout);
  }
}
