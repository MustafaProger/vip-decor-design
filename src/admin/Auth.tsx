import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { cmsRequest } from "./api";
import { Field } from "./Fields";
import type { Session } from "./types";

export default function Auth({
  setup,
  setupToken,
  onAuthenticated,
  expired = false,
}: {
  setup: boolean;
  setupToken: string;
  onAuthenticated: (session: Session) => void;
  expired?: boolean;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(setupToken);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const session = await cmsRequest<Session>(setup ? "/setup" : "/login", {
        method: "POST",
        body: { username, password, ...(setup ? { token } : {}) },
      });
      setPassword("");
      onAuthenticated(session);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось войти.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div
      className={`cms-auth ${expired ? "cms-auth-overlay" : ""}`}
      role={expired ? "dialog" : undefined}
      aria-modal={expired || undefined}
      aria-labelledby="cms-auth-title"
    >
      <section className="cms-auth-card">
        <div className="cms-brand cms-brand-dark">
          <span className="cms-brand-monogram">V.</span>
          <div>
            <strong>VIP DECOR DESIGN</strong>
            <small>УПРАВЛЕНИЕ САЙТОМ</small>
          </div>
        </div>
        <div className="cms-auth-icon">
          <LockKeyhole size={23} />
        </div>
        <h1 id="cms-auth-title">
          {setup
            ? "Настроим вашу CMS"
            : expired
              ? "Войдите ещё раз"
              : "Добро пожаловать"}
        </h1>
        <p>
          {setup
            ? "Создайте учётную запись администратора для управления сайтом."
            : expired
              ? "Сессия завершена. Ваши несохранённые правки остались в открытой форме."
              : "Статьи, товары и обращения клиентов — в одном месте."}
        </p>
        <form onSubmit={submit}>
          <fieldset disabled={pending}>
            {setup && (
              <Field
                label="Ключ первого запуска"
                hint="Используйте ссылку первого запуска, подготовленную администратором сервера."
              >
                <input
                  required
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                />
              </Field>
            )}
            <Field label="Логин">
              <input
                autoFocus={!setup}
                required
                minLength={3}
                maxLength={80}
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </Field>
            <Field
              label="Пароль"
              hint={setup ? "Не менее 12 символов." : undefined}
            >
              <input
                required
                type="password"
                minLength={setup ? 12 : 1}
                autoComplete={setup ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            {error && (
              <p role="alert" className="cms-error">
                {error}
              </p>
            )}
            <button
              className="cms-button cms-primary cms-full-width"
              type="submit"
            >
              {pending
                ? "Подождите…"
                : setup
                  ? "Создать администратора"
                  : "Войти"}
              <ArrowRight size={17} />
            </button>
          </fieldset>
        </form>
        <a href="/" className="cms-auth-back">
          ← На сайт
        </a>
      </section>
      <span className="cms-auth-footer">
        Пространство, в котором всё под контролем.
      </span>
    </div>
  );
}
