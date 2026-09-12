import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Trash2, ArrowUpRight, Minus, Plus } from "lucide-react";
import { cartKey, useStore } from "../lib/store";
import { money, productHref } from "../lib/content";
import {
  submitInquiry,
  validateInquiry,
  type InquiryValues,
  type InquiryResult,
  type InquiryErrors,
} from "../lib/inquiry";
import { Breadcrumbs, Picture, EmptyState } from "../components/Primitives";
export default function Cart() {
  const { cart, data, setQuantity, removeFromCart } = useStore();
  const [checkout, setCheckout] = useState(false);
  const [delivery, setDelivery] = useState("Самовывоз");
  const [payment, setPayment] = useState("Наличными при получении");
  const [promo, setPromo] = useState("");
  const [promoInfo, setPromoInfo] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [values, setValues] = useState<InquiryValues>({
    name: "",
    phone: "",
    comment: "",
    consent: false,
  });
  const [errors, setErrors] = useState<
    InquiryErrors & { email?: string; address?: string }
  >({});
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<InquiryResult | null>(null);
  const [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const lastSnapshot = useRef("");
  const lock = useRef(false);
  const entries = cart.map((item) => ({
    item,
    product: data.products.find((p) => p.id === item.productId),
  }));
  const total = entries.reduce(
    (sum, { item }) => sum + (item.unitPrice || 0) * item.quantity,
    0,
  );
  const hasUnknown = entries.some(
    ({ item, product }) => !product || item.unitPrice === null,
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    const issues: typeof errors = validateInquiry(values);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      issues.email = "Укажите корректный email.";
    if (delivery === "Курьер" && address.trim().length < 5)
      issues.address = "Укажите адрес доставки.";
    setErrors(issues);
    if (Object.keys(issues).length) {
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    lock.current = true;
    setPending(true);
    setError("");
    try {
      const context = [
        "Запрос по корзине",
        ...entries.map(
          ({ item, product }) =>
            (product?.title || item.productId) +
            "; " +
            item.variantLabel +
            "; количество: " +
            item.quantity +
            "; сумма: " +
            (item.unitPrice === null
              ? "по запросу"
              : money(item.unitPrice * item.quantity)),
        ),
        "Доставка: " + delivery + (address ? ", " + address : ""),
        "Оплата: " + payment,
        promo ? "Промокод (не проверен): " + promo : "",
      ]
        .filter(Boolean)
        .join("\n");
      const snapshot = JSON.stringify({ ...values, email, context });
      if (lastSnapshot.current !== snapshot) {
        requestId.current = crypto.randomUUID();
        lastSnapshot.current = snapshot;
      }
      const saved = await submitInquiry({
        ...values,
        email,
        context,
        requestId: requestId.current,
      });
      setResult(saved);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось сохранить запрос. Попробуйте ещё раз.",
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <div className="container cart-page">
      <Breadcrumbs items={[{ label: "Корзина" }]} />
      <p className="eyebrow">ВАШ ВЫБОР</p>
      <h1>Всё складывается.</h1>
      {cart.length === 0 ? (
        <EmptyState
          title="Ваша корзина пока пуста."
          text="Посмотрите коллекции и добавьте нужные материалы. Понравившиеся идеи можно отдельно сохранить в избранное."
        />
      ) : (
        <div className="cart-layout">
          <div>
            <div className="cart-items">
              {entries.map(({ item, product }) => (
                <article className="cart-item" key={cartKey(item)}>
                  <Link to={product ? productHref(product) : "/shop"}>
                    <Picture
                      src={product?.image}
                      alt={product?.title || "Товар"}
                    />
                  </Link>
                  <div>
                    <p className="product-category">{product?.category}</p>
                    <h2>
                      <Link to={product ? productHref(product) : "/shop"}>
                        {product?.title || "Товар недоступен"}
                      </Link>
                    </h2>
                    <p className="cart-variant">{item.variantLabel}</p>
                    <div className="cart-item-controls">
                      <div className="quantity-control">
                        <button
                          className="icon-button"
                          onClick={() =>
                            setQuantity(cartKey(item), item.quantity - 1)
                          }
                          aria-label={"Уменьшить количество " + product?.title}
                          disabled={item.quantity <= 1}
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          aria-label={"Количество " + product?.title}
                          type="number"
                          min="1"
                          max="99"
                          value={item.quantity}
                          onChange={(e) =>
                            setQuantity(cartKey(item), Number(e.target.value))
                          }
                        />
                        <button
                          className="icon-button"
                          onClick={() =>
                            setQuantity(cartKey(item), item.quantity + 1)
                          }
                          disabled={item.quantity >= 99}
                          aria-label={"Увеличить количество " + product?.title}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      <button
                        className="icon-button"
                        onClick={() => removeFromCart(cartKey(item))}
                        aria-label={"Удалить " + product?.title}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <strong className="cart-line-total">
                    {item.unitPrice === null
                      ? "По запросу"
                      : money(item.unitPrice * item.quantity)}
                  </strong>
                </article>
              ))}
            </div>
            {checkout && (
              <section className="checkout-panel">
                <h2>Детали вашего запроса</h2>
                <p className="checkout-notice">
                  Заявка будет сохранена в локальной версии. Отправка в студию,
                  подтверждение наличия и оплата ещё не подключены.
                </p>
                {result ? (
                  <div role="status" className="form-notice">
                    <h3>Запрос сохранён</h3>
                    <p>{result.message}</p>
                    <p>
                      Заказ и оплата не созданы. Ваш выбор остался в корзине.
                    </p>
                  </div>
                ) : (
                  <form noValidate onSubmit={submit}>
                    <div className="checkout-fields">
                      {[
                        ["name", "Ваше имя"],
                        ["phone", "Телефон"],
                      ].map(([key, title]) => (
                        <label key={key}>
                          {title}
                          <input
                            autoComplete={key === "name" ? "name" : "tel"}
                            type={key === "phone" ? "tel" : "text"}
                            value={values[key as "name" | "phone"]}
                            aria-invalid={!!errors[key as "name" | "phone"]}
                            aria-describedby={
                              errors[key as "name" | "phone"]
                                ? "cart-" + key + "-error"
                                : undefined
                            }
                            onChange={(e) =>
                              setValues({ ...values, [key]: e.target.value })
                            }
                          />
                          {errors[key as "name" | "phone"] && (
                            <span
                              className="field-error"
                              id={"cart-" + key + "-error"}
                            >
                              {errors[key as "name" | "phone"]}
                            </span>
                          )}
                        </label>
                      ))}
                      <label>
                        Email
                        <input
                          type="email"
                          value={email}
                          autoComplete="email"
                          onChange={(e) => setEmail(e.target.value)}
                          aria-invalid={!!errors.email}
                          aria-describedby={
                            errors.email ? "cart-email-error" : undefined
                          }
                        />
                        {errors.email && (
                          <span id="cart-email-error" className="field-error">
                            {errors.email}
                          </span>
                        )}
                      </label>
                    </div>
                    <fieldset className="checkout-options">
                      <legend>Способ получения</legend>
                      {["Самовывоз", "Курьер", "Согласовать с менеджером"].map(
                        (x) => (
                          <label key={x}>
                            <input
                              type="radio"
                              name="delivery"
                              value={x}
                              checked={delivery === x}
                              onChange={() => setDelivery(x)}
                            />
                            {x}
                          </label>
                        ),
                      )}
                    </fieldset>
                    {delivery === "Курьер" && (
                      <label>
                        Адрес доставки
                        <input
                          autoComplete="street-address"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          aria-invalid={!!errors.address}
                        />
                        {errors.address && (
                          <span className="field-error">{errors.address}</span>
                        )}
                        <span className="fine-print">
                          В опубликованных условиях доставка — от 400 ₽. Точная
                          стоимость согласовывается со студией и не включена в
                          сумму.
                        </span>
                      </label>
                    )}
                    <fieldset className="checkout-options">
                      <legend>Предпочтительный способ оплаты</legend>
                      {["Наличными при получении", "Безналичная оплата"].map(
                        (x) => (
                          <label key={x}>
                            <input
                              type="radio"
                              name="payment"
                              checked={payment === x}
                              onChange={() => setPayment(x)}
                            />
                            {x}
                          </label>
                        ),
                      )}
                    </fieldset>
                    <label>
                      Промокод
                      <div className="promo-field">
                        <input
                          value={promo}
                          onChange={(e) => {
                            setPromo(e.target.value);
                            setPromoInfo("");
                          }}
                        />
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() =>
                            setPromoInfo(
                              promo
                                ? "Проверка промокодов будет доступна после подключения магазина. Скидка не применена."
                                : "Введите промокод.",
                            )
                          }
                        >
                          Проверить
                        </button>
                      </div>
                    </label>
                    {promoInfo && (
                      <p className="fine-print" role="status">
                        {promoInfo}
                      </p>
                    )}
                    <label>
                      Комментарий
                      <textarea
                        value={values.comment}
                        onChange={(e) =>
                          setValues({ ...values, comment: e.target.value })
                        }
                      />
                    </label>
                    <label className="consent-label">
                      <input
                        type="checkbox"
                        checked={values.consent}
                        onChange={(e) =>
                          setValues({ ...values, consent: e.target.checked })
                        }
                        aria-invalid={!!errors.consent}
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
                      <p className="field-error">{errors.consent}</p>
                    )}
                    {error && (
                      <p role="alert" className="field-error">
                        {error}
                      </p>
                    )}
                    <button type="submit" className="button" disabled={pending}>
                      {pending ? "Сохраняем…" : "Сохранить запрос по корзине"}
                      <ArrowUpRight size={19} />
                    </button>
                  </form>
                )}
              </section>
            )}
          </div>
          <aside className="cart-summary">
            <p className="eyebrow">ВАШ ПРОЕКТ</p>
            <h2>Предварительная сумма</h2>
            <p className="cart-total">{money(total)}</p>
            {hasUnknown && <p>Некоторые позиции требуют уточнения цены.</p>}
            <p>
              Стоимость указана по сохранённым данным каталога. Наличие, цена и
              условия заказа уточняются в студии.
            </p>
            <button
              className="button"
              onClick={() => {
                setCheckout(true);
                setTimeout(
                  () =>
                    document
                      .querySelector(".checkout-panel")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                  30,
                );
              }}
            >
              Перейти к оформлению
              <ArrowUpRight size={19} />
            </button>
            <Link className="text-link" to="/shop">
              Продолжить выбор
              <ArrowUpRight size={17} />
            </Link>
            <Link className="fine-print" to="/page13486315.html">
              Доставка и оплата
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
