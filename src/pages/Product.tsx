import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Expand,
  Minus,
  Plus,
  ShoppingBag,
} from "lucide-react";
import {
  Breadcrumbs,
  FavoriteButton,
  Picture,
  ProductCard,
} from "../components/Primitives";
import Modal from "../components/Modal";
import { money, plain, type Product as ProductData } from "../lib/content";
import {
  getDefaultSelection,
  getEditionAttributes,
  getPropertyGroups,
  productGallery,
  quoteProduct,
} from "../lib/commerce";
import { useStore } from "../lib/store";
import "./product.css";

export default function Product({ product }: { product: ProductData }) {
  return <ProductDetails key={product.id} product={product} />;
}

function ProductDetails({ product }: { product: ProductData }) {
  const { data, addToCart, cart, discuss } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const editionUid = searchParams.get("editionuid");
  const urlEditionIndex = getDefaultSelection(product, editionUid).editionIndex;
  const [selection, setSelection] = useState(() =>
    getDefaultSelection(product, editionUid),
  );
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(() =>
    Math.max(
      0,
      productGallery(product).indexOf(
        quoteProduct(product, getDefaultSelection(product, editionUid)).image,
      ),
    ),
  );
  const [zoomOpen, setZoomOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const [cartMessage, setCartMessage] = useState("");
  const groups = useMemo(() => getPropertyGroups(product), [product]);
  const gallery = useMemo(() => productGallery(product), [product]);
  const quote = quoteProduct(product, selection);
  const editions = product.variants?.editions || [];
  const maxQuantity = Math.max(
    1,
    Math.min(99, Math.floor(quote.availableQuantity ?? 99)),
  );
  const unavailable =
    quote.availableQuantity !== null && quote.availableQuantity < 1;
  const description = useMemo(
    () =>
      (product.descriptionHtml || product.description)
        .split(/<br\s*\/?\s*>/i)
        .map((text) => plain(text))
        .filter(Boolean),
    [product],
  );
  const categoryPath =
    (product.categoryPaths || []).find(
      (path) => !["/tkani", "/tyl", "/shop"].includes(path),
    ) || product.categoryPath;
  const related = useMemo(
    () =>
      data.products
        .filter(
          (item) =>
            item.id !== product.id &&
            (categoryPath
              ? (item.categoryPaths || [item.categoryPath]).includes(
                  categoryPath,
                )
              : item.category === product.category),
        )
        .slice(0, 3),
    [data, product, categoryPath],
  );
  const categoryTitle =
    data.categories.find((category) => category.path === categoryPath)?.title ||
    product.category;
  const itemTotal =
    quote.unitPrice === null
      ? null
      : Math.round(quote.unitPrice * quantity * 100) / 100;

  useEffect(() => {
    setSelection((current) => ({ ...current, editionIndex: urlEditionIndex }));
    const edition = product.variants?.editions?.[urlEditionIndex];
    const sourceQuantity =
      edition?.quantity === "" || edition?.quantity == null
        ? 99
        : Number(edition.quantity);
    setQuantity((current) =>
      Math.max(
        1,
        Math.min(
          current,
          Number.isFinite(sourceQuantity) ? Math.floor(sourceQuantity) : 99,
          99,
        ),
      ),
    );
    const sourceImageIndex =
      typeof edition?.img === "string" ? gallery.indexOf(edition.img) : -1;
    if (sourceImageIndex >= 0) setActiveImage(sourceImageIndex);
    setAdded(false);
    setCartMessage("");
  }, [urlEditionIndex, product, gallery]);

  function resetAdded() {
    setAdded(false);
    setCartMessage("");
  }
  function selectEdition(index: number) {
    const nextSelection = { ...selection, editionIndex: index };
    const nextQuote = quoteProduct(product, nextSelection);
    setSelection(nextSelection);
    const nextParams = new URLSearchParams(searchParams);
    const edition = editions[index];
    if (edition?.uid != null) nextParams.set("editionuid", String(edition.uid));
    else nextParams.delete("editionuid");
    setSearchParams(nextParams, { replace: true });
    setQuantity((current) =>
      Math.max(
        1,
        Math.min(current, Math.floor(nextQuote.availableQuantity ?? 99), 99),
      ),
    );
    const imageIndex = gallery.indexOf(nextQuote.image);
    if (imageIndex >= 0) setActiveImage(imageIndex);
    resetAdded();
  }
  function add() {
    const existingQuantity =
      cart.find(
        (item) =>
          item.productId === product.id && item.variantKey === quote.variantKey,
      )?.quantity || 0;
    if (unavailable || existingQuantity + quantity > maxQuantity) {
      setCartMessage(
        `В корзине уже ${existingQuantity} шт. Максимальное количество для этого варианта — ${maxQuantity}.`,
      );
      return;
    }
    addToCart(
      {
        productId: product.id,
        variantKey: quote.variantKey,
        variantLabel: quote.variantLabel,
        unitPrice: quote.unitPrice,
      },
      quantity,
    );
    setAdded(true);
    setCartMessage(`Добавлено в корзину: ${quantity} шт.`);
  }

  return (
    <div className="product-detail-page container">
      <Breadcrumbs
        items={[
          { label: "Каталог", to: "/catalog" },
          ...(categoryPath ? [{ label: categoryTitle, to: categoryPath }] : []),
          { label: product.title },
        ]}
      />
      <div className="pd-layout">
        <section
          className="pd-gallery"
          aria-label={`Фотографии ${product.title}`}
        >
          <div className="pd-main-image">
            <Picture
              key={gallery[activeImage] || "missing"}
              src={gallery[activeImage]}
              alt={`${product.title} — фотография ${activeImage + 1}`}
              eager
            />
            <FavoriteButton
              id={product.id}
              title={product.title}
              className="pd-favorite"
            />
            {gallery.length > 0 && (
              <button
                className="pd-zoom"
                type="button"
                onClick={() => setZoomOpen(true)}
                aria-label={`Увеличить фотографию ${product.title}`}
              >
                <Expand size={19} />
              </button>
            )}
            {gallery.length > 1 && (
              <span className="pd-image-count">
                {activeImage + 1} / {gallery.length}
              </span>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="pd-thumbnails" aria-label="Выбрать фотографию">
              {gallery.map((src, index) => (
                <button
                  className={`pd-thumbnail ${index === activeImage ? "pd-thumbnail-active" : ""}`}
                  key={src}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  aria-label={`Фотография ${index + 1} — ${product.title}`}
                  aria-pressed={index === activeImage}
                >
                  <Picture src={src} alt="" />
                </button>
              ))}
            </div>
          )}
        </section>
        <div className="pd-information">
          <p className="pd-eyebrow">
            {product.shortDescription || product.category}
          </p>
          <h1>{product.title}</h1>
          {quote.sku && (
            <p className="pd-sku">
              Артикул: <span>{quote.sku}</span>
            </p>
          )}
          <div className="pd-price">
            {quote.oldBasePrice !== null && (
              <del className="pd-old-price" title="Прежняя базовая цена">
                {money(quote.oldBasePrice)}
              </del>
            )}
            <strong>
              {quote.unitPrice === null
                ? "Цена по запросу"
                : money(quote.unitPrice)}
            </strong>
            <span>
              {groups.length ? "за выбранную комплектацию" : "за единицу"}
            </span>
          </div>
          {quote.oldBasePrice !== null &&
            quote.adjustment !== null &&
            quote.adjustment !== 0 && (
              <p className="pd-price-detail">
                Перечёркнута прежняя базовая цена без выбранных параметров.
              </p>
            )}
          {quote.adjustment !== null &&
            quote.adjustment !== 0 &&
            quote.basePrice !== null && (
              <p className="pd-price-detail">
                Базовая стоимость {money(quote.basePrice)} · выбранные параметры{" "}
                {quote.adjustment > 0 ? "+" : "−"}
                {money(Math.abs(quote.adjustment))}
              </p>
            )}
          <div className="pd-configuration">
            {editions.length > 1 ? (
              <label className="pd-option">
                <span>
                  {quote.attributes
                    .map((attribute) => attribute.title)
                    .join(" / ") || "Вариант"}
                </span>
                <select
                  value={selection.editionIndex}
                  onChange={(event) =>
                    selectEdition(Number(event.target.value))
                  }
                >
                  {editions.map((edition, index) => {
                    const attributes = getEditionAttributes(edition);
                    return (
                      <option key={String(edition.uid ?? index)} value={index}>
                        {attributes
                          .map((attribute) => attribute.value)
                          .join(" / ") || `Вариант ${index + 1}`}
                        {edition.sku ? ` · ${edition.sku}` : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : (
              quote.attributes.map((attribute) => (
                <div className="pd-fixed-option" key={attribute.title}>
                  <span>{attribute.title}</span>
                  <strong>{attribute.value}</strong>
                </div>
              ))
            )}
            {groups.map((group) => (
              <label className="pd-option" key={group.key}>
                <span>{group.title}</span>
                <select
                  value={selection.properties[group.key]}
                  onChange={(event) => {
                    setSelection((current) => ({
                      ...current,
                      properties: {
                        ...current.properties,
                        [group.key]: Number(event.target.value),
                      },
                    }));
                    resetAdded();
                  }}
                >
                  {group.choices.map((choice) => (
                    <option value={choice.index} key={choice.index}>
                      {choice.label}
                      {choice.adjustment !== null && choice.adjustment !== 0
                        ? ` (${choice.adjustment > 0 ? "+" : "−"}${money(Math.abs(choice.adjustment))})`
                        : choice.adjustment === null
                          ? " · стоимость уточняется"
                          : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="pd-buy-row">
            <div className="pd-quantity-control">
              <label className="sr-only" htmlFor="pd-quantity">
                Количество выбранных комплектов
              </label>
              <button
                type="button"
                aria-label="Уменьшить количество"
                onClick={() => {
                  setQuantity(Math.max(1, quantity - 1));
                  resetAdded();
                }}
                disabled={quantity <= 1}
              >
                <Minus size={16} />
              </button>
              <input
                type="number"
                id="pd-quantity"
                min="1"
                max={maxQuantity}
                step="1"
                value={quantity}
                onChange={(event) => {
                  setQuantity(
                    Math.min(
                      maxQuantity,
                      Math.max(1, Math.floor(Number(event.target.value) || 1)),
                    ),
                  );
                  resetAdded();
                }}
              />
              <button
                type="button"
                aria-label="Увеличить количество"
                onClick={() => {
                  setQuantity(Math.min(maxQuantity, quantity + 1));
                  resetAdded();
                }}
                disabled={quantity >= maxQuantity}
              >
                <Plus size={16} />
              </button>
            </div>
            <button
              className="pd-add-button"
              type="button"
              onClick={add}
              disabled={unavailable}
            >
              {added ? <Check size={19} /> : <ShoppingBag size={18} />}
              {unavailable
                ? "Нет в наличии"
                : added
                  ? "Добавлено"
                  : "В корзину"}
            </button>
          </div>
          {quantity > 1 && itemTotal !== null && (
            <p className="pd-line-total">
              Итого за {quantity} шт.: <strong>{money(itemTotal)}</strong>
            </p>
          )}
          {cartMessage && (
            <div className="pd-cart-message" role="status">
              <span>{cartMessage}</span>
              {added && (
                <Link to="/cart">
                  Перейти в корзину <ArrowRight size={15} />
                </Link>
              )}
            </div>
          )}
          <button
            className="pd-consultation"
            type="button"
            onClick={() =>
              discuss(
                `Товар «${product.title}». ${quote.variantLabel}. Количество ${quantity}. ${quote.unitPrice === null ? "Цена по запросу." : `Предварительная цена комплектации ${money(quote.unitPrice)}.`}`,
              )
            }
          >
            Помочь с выбором <ArrowUpRight size={17} />
          </button>
          <p className="pd-availability">
            Цена и наличие уточняются при согласовании заказа. Мы поможем с
            подбором ткани, пошивом и оформлением.
          </p>
          <div className="pd-service-links">
            <Link to="/page13486315.html">
              Доставка и оплата <ArrowUpRight size={15} />
            </Link>
            <Link to="/calculator">
              Рассчитать пошив <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      </div>
      <section className="pd-description-section">
        <div>
          <p className="pd-eyebrow">В деталях</p>
          <h2>
            О материале
            <br />и его характере.
          </h2>
        </div>
        <div className="pd-description-copy">
          {description.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          {(product.properties || []).length > 0 && (
            <dl className="pd-properties">
              {product.properties!.map((property, index) => (
                <div key={index}>
                  <dt>{property.name}</dt>
                  <dd>
                    {quote.attributes.find(
                      (attribute) => attribute.title === property.name,
                    )?.value || property.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>
      {related.length > 0 && (
        <section className="pd-related">
          <div className="pd-related-heading">
            <h2>В той же коллекции.</h2>
            {categoryPath && (
              <Link to={categoryPath}>
                Смотреть все <ArrowUpRight size={17} />
              </Link>
            )}
          </div>
          <div className="pd-related-grid">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
      <Modal
        open={zoomOpen}
        onClose={() => setZoomOpen(false)}
        title={`${product.title} — фотография ${activeImage + 1}`}
        className="pd-zoom-dialog"
      >
        <Picture
          key={gallery[activeImage]}
          src={gallery[activeImage]}
          alt={`${product.title} — увеличенная фотография ${activeImage + 1}`}
          eager
        />
      </Modal>
    </div>
  );
}
