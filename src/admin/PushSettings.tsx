import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, X } from "lucide-react";
import { cmsRequest } from "./api";

type Config = { enabled: boolean; publicKey: string | null };
const supported = () =>
  window.isSecureContext &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;
const appleMobile = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () =>
  matchMedia("(display-mode: standalone)").matches ||
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
function applicationKey(value: string) {
  const raw = atob(
    value
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "="),
  );
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
export function PushSettings({ token }: { token?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [permission, setPermission] = useState(
    supported() ? Notification.permission : "default",
  );
  const needsInstall = appleMobile() && !standalone();
  const inspect = useCallback(async () => {
    setError("");
    try {
      const settings = await cmsRequest<Config>("/push/config");
      setConfig(settings);
      if (!supported() || !settings.enabled) return;
      setPermission(Notification.permission);
      const registration =
        await navigator.serviceWorker.getRegistration("/admin");
      const sub = await registration?.pushManager.getSubscription();
      if (!sub) {
        setActive(false);
        return;
      }
      const state = await cmsRequest<{ subscribed: boolean }>("/push/status", {
        method: "POST",
        token,
        body: { endpoint: sub.endpoint },
      });
      setActive(state.subscribed && Notification.permission === "granted");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось проверить уведомления.",
      );
    }
  }, [token]);
  useEffect(() => {
    void inspect();
  }, [inspect]);
  async function enable() {
    if (!config?.publicKey || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // Must be invoked before awaits so Safari retains the direct user gesture.
      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") return;
      const registration = await navigator.serviceWorker.register(
        "/admin-sw.js",
        { scope: "/admin", updateViaCache: "none" },
      );
      // ready is scoped to this document (/admin or /admin/).
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (
        subscription?.options.applicationServerKey &&
        btoa(
          String.fromCharCode(
            ...new Uint8Array(subscription.options.applicationServerKey),
          ),
        )
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "") !== config.publicKey
      ) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ||= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationKey(config.publicKey),
      });
      await cmsRequest("/push/subscription", {
        method: "POST",
        token,
        body: subscription.toJSON(),
      });
      setActive(true);
      setNotice(
        "Уведомления включены на этом устройстве. Отправьте проверочное push, чтобы проверить доставку.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось включить уведомления.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function action(kind: "disable" | "test") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const registration =
        await navigator.serviceWorker.getRegistration("/admin");
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) {
        setActive(false);
        throw new Error(
          "Подписка браузера отсутствует. Включите уведомления заново.",
        );
      }
      await cmsRequest(
        kind === "disable" ? "/push/subscription" : "/push/test",
        {
          method: kind === "disable" ? "DELETE" : "POST",
          token,
          body: { endpoint: subscription.endpoint },
        },
      );
      if (kind === "disable") {
        setActive(false);
        await subscription.unsubscribe();
        setNotice("Новые уведомления на это устройство отправляться не будут.");
      } else
        setNotice(
          "Проверочное push поставлено в очередь. Доставка подтверждена, когда вы увидите системное уведомление.",
        );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось выполнить действие.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="cms-button cms-secondary cms-push-trigger"
        aria-label={`Уведомления${active ? ", включены" : ""}`}
        onClick={() => {
          dialog.current?.showModal();
          void inspect();
        }}
      >
        {active ? <BellRing size={17} /> : <Bell size={17} />}
        <span>Уведомления</span>
        {active && <i />}
      </button>
      <dialog
        ref={dialog}
        className="cms-push-dialog"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
      >
        <div className="cms-push-panel">
          <div className="cms-push-heading">
            <h2>Уведомления о заявках</h2>
            <button
              className="cms-icon-button"
              aria-label="Закрыть настройки уведомлений"
              onClick={() => dialog.current?.close()}
            >
              <X size={20} />
            </button>
          </div>
          <div className={`cms-push-symbol ${active ? "is-active" : ""}`}>
            <BellRing size={27} />
          </div>
          <h3>
            {active
              ? "На этом устройстве включены"
              : "Не пропускайте новые обращения"}
          </h3>
          <p>
            Получайте уведомление о новой заявке, даже когда вкладка CMS
            закрыта. Имя, телефон и текст обращения в уведомление не попадут.
          </p>
          {needsInstall ? (
            <div className="cms-notice">
              На iPhone или iPad (iOS 16.4 и новее) откройте эту страницу в
              Safari, выберите «Поделиться» → «На экран Домой». Запустите VIP
              Decor с новой иконки и включите уведомления здесь.
            </div>
          ) : !supported() ? (
            <div className="cms-notice">
              Для push нужен браузер с поддержкой уведомлений и защищённое
              соединение HTTPS.
            </div>
          ) : !config ? (
            <p>Проверяем настройки сервера…</p>
          ) : !config.enabled ? (
            <div className="cms-notice">
              Push ещё не настроены на сервере. Заявки по-прежнему доступны в
              CMS.
            </div>
          ) : (
            <>
              {permission === "denied" && (
                <div className="cms-notice">
                  Уведомления запрещены в браузере. Разрешите их для этого сайта
                  в настройках браузера, затем снова откройте это окно.
                </div>
              )}
              <div className="cms-push-actions">
                {active ? (
                  <>
                    <button
                      className="cms-button cms-primary"
                      disabled={busy}
                      onClick={() => void action("test")}
                    >
                      Проверить уведомление
                    </button>
                    <button
                      className="cms-button cms-secondary"
                      disabled={busy}
                      onClick={() => void action("disable")}
                    >
                      Выключить
                    </button>
                  </>
                ) : (
                  <button
                    className="cms-button cms-primary"
                    disabled={busy || permission === "denied"}
                    onClick={() => void enable()}
                  >
                    {busy ? "Подключаем…" : "Включить на этом устройстве"}
                  </button>
                )}
              </div>
              <p className="cms-push-hint">
                Настройка действует отдельно на каждом устройстве. Доставка
                зависит от сети и системных настроек уведомлений. Выход из CMS
                не отключает подписку.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="cms-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="cms-push-feedback">
              {notice}
            </p>
          )}
        </div>
      </dialog>
    </>
  );
}
