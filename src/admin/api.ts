export class CMSApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function cmsRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    file?: File;
  } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`/api/cms${path}`, {
      method: options.method || "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.file ? { "Content-Type": options.file.type } : {}),
        ...(options.token ? { "X-CSRF-Token": options.token } : {}),
      },
      body:
        options.file ??
        (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        typeof result?.error === "string"
          ? result.error
          : result?.error?.message || result?.message;
      throw new CMSApiError(
        response.status === 409
          ? "Запись уже изменена в другой вкладке. Скопируйте свои правки и загрузите актуальную версию перед сохранением."
          : response.status === 401
            ? "Сессия завершена. Войдите снова, чтобы продолжить. Ваши правки остаются в форме."
            : detail || "Не удалось выполнить действие. Попробуйте ещё раз.",
        response.status,
      );
    }
    if (!result && response.status !== 204)
      throw new CMSApiError(
        "Сервер вернул неверный ответ. Проверьте подключение CMS.",
        502,
      );
    return result as T;
  } catch (error) {
    if (error instanceof CMSApiError) throw error;
    throw new CMSApiError(
      error instanceof Error && error.name === "AbortError"
        ? "Сервер не ответил вовремя. Правки сохранены в форме — попробуйте ещё раз."
        : "Нет соединения с сервером. Проверьте сеть и повторите действие.",
      0,
    );
  } finally {
    window.clearTimeout(timeout);
  }
}
