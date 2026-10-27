/** Retry read-only public requests after a brief transport failure. */
export async function publicFetch(url: string, signal: AbortSignal) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
      });
      if (!response.ok) {
        if (response.status < 500)
          throw new Error(
            "Не удалось загрузить данные сайта. Попробуйте ещё раз.",
          );
        throw new TypeError("Сайт временно недоступен. Попробуйте ещё раз.");
      }
      return await response.json();
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      const transient =
        error instanceof TypeError ||
        (error instanceof DOMException && error.name === "TimeoutError");
      if (!transient || attempt === 2) throw error;
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(
          () => {
            signal.removeEventListener("abort", abort);
            resolve();
          },
          400 * (attempt + 1),
        );
        signal.addEventListener("abort", abort, { once: true });
      });
    }
  }
}
