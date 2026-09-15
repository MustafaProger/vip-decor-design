import { photoCrops } from "../data/gallery-presentation";
import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Heart, ImageOff } from "lucide-react";
import { useStore } from "../lib/store";
import { parseSourcePrice } from "../lib/commerce";
import { money, productHref, type Product } from "../lib/content";
export function Picture({
  src,
  alt,
  className = "",
  eager = false,
  fit = "cover",
}: {
  src?: string;
  alt: string;
  className?: string;
  eager?: boolean;
  fit?: "cover" | "contain";
}) {
  const [brokenSrc, setBrokenSrc] = useState<string>();
  const cropId = useId();
  const crop = src ? photoCrops[src.split("/").pop() || ""] : undefined;
  if (src && src !== brokenSrc && crop)
    return (
      <svg
        className={"picture-crop " + className}
        viewBox={crop.view.join(" ")}
        width={crop.view[2]}
        height={crop.view[3]}
        preserveAspectRatio={
          fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"
        }
        role="img"
        aria-label={alt}
        data-image-src={src}
      >
        <defs>
          <clipPath id={cropId}>
            <rect
              x={crop.view[0]}
              y={crop.view[1]}
              width={crop.view[2]}
              height={crop.view[3]}
            />
          </clipPath>
        </defs>
        <image
          href={src}
          width={crop.size[0]}
          height={crop.size[1]}
          clipPath={`url(#${cropId})`}
          onError={() => setBrokenSrc(src)}
        />
      </svg>
    );
  return src && src !== brokenSrc ? (
    <img
      className={className}
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setBrokenSrc(src)}
    />
  ) : (
    <div
      className={"missing-image " + className}
      role="img"
      aria-label={alt + " — фотография недоступна"}
    >
      <ImageOff size={32} />
      <span>Фотография недоступна</span>
    </div>
  );
}
export function Breadcrumbs({
  items,
}: {
  items: { label: string; to?: string }[];
}) {
  return (
    <nav className="breadcrumbs" aria-label="Хлебные крошки">
      <Link to="/">Главная</Link>
      {items.map((item, i) => (
        <span key={i}>
          <span className="crumb-separator">/</span>
          {item.to ? (
            <Link to={item.to}>{item.label}</Link>
          ) : (
            <span aria-current="page">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
export function ArrowLink({
  to,
  children,
  className = "",
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link className={"text-link " + className} to={to}>
      {children}
      <ArrowUpRight size={18} />
    </Link>
  );
}
export function FavoriteButton({
  id,
  title,
  className = "",
}: {
  id: string;
  title: string;
  className?: string;
}) {
  const { favorites, toggleFavorite } = useStore();
  const active = favorites.includes(id);
  return (
    <button
      type="button"
      className={
        "icon-button favorite-button " +
        (active ? "is-active " : "") +
        className
      }
      onClick={() => toggleFavorite(id)}
      aria-label={(active ? "Убрать из избранного: " : "В избранное: ") + title}
      aria-pressed={active}
    >
      <Heart
        size={23}
        fill={active ? "currentColor" : "none"}
        strokeWidth={1.5}
      />
    </button>
  );
}
export function ProductCard({ product }: { product: Product }) {
  const oldPrice =
    parseSourcePrice(product.variants?.editions?.[0]?.priceold) ??
    parseSourcePrice(product.oldPrice);
  return (
    <article className="product-card">
      <div className="product-photo">
        <Link to={productHref(product)} tabIndex={-1} aria-hidden="true">
          <Picture src={product.image} alt={product.title} />
        </Link>
        <FavoriteButton id={product.id} title={product.title} />
      </div>
      <div className="product-card-info">
        <div>
          <p className="product-category">{product.category}</p>
          <h3>
            <Link to={productHref(product)}>{product.title}</Link>
          </h3>
        </div>
        <span className="product-price">
          {oldPrice !== null &&
            product.price !== null &&
            oldPrice > product.price && <del>{money(oldPrice)}</del>}
          {product.price !== null ? money(product.price) : "По запросу"}
        </span>
      </div>
      <Link to={productHref(product)} className="product-more">
        Подробнее <ArrowUpRight size={15} />
      </Link>
    </article>
  );
}
export function EmptyState({
  title,
  text,
  to = "/tkani",
  link = "Посмотреть ткани",
}: {
  title: string;
  text: string;
  to?: string;
  link?: string;
}) {
  return (
    <div className="empty-state">
      <p className="eyebrow">VIP DECOR DESIGN</p>
      <h2>{title}</h2>
      <p>{text}</p>
      <Link className="button" to={to}>
        {link}
        <ArrowUpRight size={18} />
      </Link>
    </div>
  );
}
