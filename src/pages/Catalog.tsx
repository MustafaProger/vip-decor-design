import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, X, ArrowUpRight } from "lucide-react";
import { useStore } from "../lib/store";
import {
  Breadcrumbs,
  ProductCard,
  EmptyState,
  Picture,
} from "../components/Primitives";
import Modal from "../components/Modal";
import type { Product } from "../lib/content";
import { OriginalContent } from "./Information";
import { translateLegacyFilters } from "../lib/legacyFilters";
const productColors = (p: Product) =>
  (p.properties || [])
    .filter((x) => x.name.trim().toLowerCase() === "цвет")
    .flatMap((x) =>
      x.value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    );
const fabricTabs = [
  ["/tkani", "Все ткани"],
  ["/lnanaiatkan", "Лён"],
  ["/barxat", "Бархат"],
  ["/blekayt", "Блэкаут"],
  ["/zhakkard", "Жаккард"],
  ["/tyl", "Тюль"],
];
export default function Catalog({
  favoritesOnly = false,
  all = false,
}: {
  favoritesOnly?: boolean;
  all?: boolean;
}) {
  const { data, favorites } = useStore();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const next = translateLegacyFilters(params);
    if (next.toString() !== params.toString())
      setParams(next, { replace: true });
  }, [params, setParams]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [shown, setShown] = useState(24);
  const cat = data.categories.find((c) => c.path === pathname);
  const q = params.get("q") || "";
  const selectedTypes = params.getAll("type");
  const selectedColors = params.getAll("color");
  const sort = params.get("sort") || "default";
  const minPrice = params.get("minPrice") || "";
  const maxPrice = params.get("maxPrice") || "";
  const source = useMemo(
    () =>
      data.products.filter((p) =>
        favoritesOnly
          ? favorites.includes(p.id)
          : all
            ? true
            : (p.categoryPaths || [p.categoryPath]).includes(pathname),
      ),
    [data, pathname, all, favoritesOnly, favorites],
  );
  const types = data.categories
    .filter(
      (c) =>
        c.path !== pathname && source.some((p) => p.categoryPath === c.path),
    )
    .sort((a, b) => a.title.localeCompare(b.title, "ru"));
  const colors = Array.from(new Set(source.flatMap(productColors))).sort(
    (a, b) => a.localeCompare(b, "ru"),
  );
  const products = useMemo(() => {
    const filtered = source.filter(
      (p) =>
        (!q ||
          [p.title, p.sku, p.category, p.description]
            .join(" ")
            .toLowerCase()
            .includes(q.toLowerCase())) &&
        (!minPrice || (p.price !== null && p.price >= Number(minPrice))) &&
        (!maxPrice || (p.price !== null && p.price <= Number(maxPrice))) &&
        (!selectedTypes.length ||
          selectedTypes.some((t) =>
            (p.categoryPaths || [p.categoryPath]).includes(t),
          )) &&
        (!selectedColors.length ||
          productColors(p).some((color) => selectedColors.includes(color))),
    );
    return filtered.sort((a: Product, b: Product) =>
      sort === "name"
        ? a.title.localeCompare(b.title, "ru")
        : sort === "price-asc"
          ? (a.price ?? Infinity) - (b.price ?? Infinity)
          : sort === "price-desc"
            ? (b.price ?? -1) - (a.price ?? -1)
            : 0,
    );
  }, [source, q, selectedTypes, selectedColors, sort, minPrice, maxPrice]);
  const update = (key: string, value: string, multi = false) => {
    const next = new URLSearchParams(params);
    if (multi) {
      const values = next.getAll(key);
      next.delete(key);
      (values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value]
      ).forEach((v) => next.append(key, v));
    } else if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setShown(24);
  };
  const filters = (
    <>
      <fieldset className="filter-group price-filter">
        <legend>Цена, ₽</legend>
        <div>
          <label>
            <span>От</span>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              value={minPrice}
              onChange={(e) => update("minPrice", e.target.value)}
              aria-label="Минимальная цена"
              placeholder="0"
            />
          </label>
          <label>
            <span>До</span>
            <input
              type="number"
              min="0"
              inputMode="decimal"
              value={maxPrice}
              onChange={(e) => update("maxPrice", e.target.value)}
              aria-label="Максимальная цена"
              placeholder="Любая"
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="filter-group">
        <legend>Тип материала / изделия</legend>
        {types.map((t) => (
          <label key={t.path}>
            <input
              type="checkbox"
              checked={selectedTypes.includes(t.path)}
              onChange={() => update("type", t.path, true)}
            />
            <span>{t.title}</span>
          </label>
        ))}
      </fieldset>
      {colors.length > 0 && (
        <fieldset className="filter-group">
          <legend>Цвет</legend>
          <div className="color-filters">
            {colors.map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  checked={selectedColors.includes(c)}
                  onChange={() => update("color", c, true)}
                />
                <span>{c}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <button
        className="text-link reset-filters"
        onClick={() => {
          setParams({});
          setShown(24);
        }}
      >
        Сбросить всё
        <X size={15} />
      </button>
    </>
  );
  const title = favoritesOnly
    ? "То, что вам близко."
    : all
      ? "Детали вашего интерьера."
      : pathname === "/tkani"
        ? "Ткани, которые хочется трогать."
        : cat?.title || "Коллекция";
  return (
    <div className="container catalog-page">
      <Breadcrumbs
        items={[
          {
            label: favoritesOnly
              ? "Избранное"
              : all
                ? "Магазин"
                : cat?.title || "Каталог",
          },
        ]}
      />
      <div className="catalog-heading">
        <div>
          <p className="eyebrow">
            {favoritesOnly ? "ВАША ЛИЧНАЯ КОЛЛЕКЦИЯ" : "МАТЕРИАЛЫ И НАСТРОЕНИЯ"}
          </p>
          <h1>{title}</h1>
          <p>
            {favoritesOnly
              ? "Сохранённые ткани и детали — чтобы вернуться к ним вместе с дизайнером."
              : "Найдите свою фактуру, оттенок и настроение."}
          </p>
        </div>
        <Link className="text-link" to="/selection">
          Помочь с выбором
          <ArrowUpRight size={18} />
        </Link>
      </div>
      <nav className="category-tabs" aria-label="Категории тканей">
        {fabricTabs.map(([to, label]) => (
          <Link to={to} className={pathname === to ? "active" : ""} key={to}>
            {label}
          </Link>
        ))}
        <Link to="/catalog">
          Все направления
          <ArrowUpRight size={15} />
        </Link>
      </nav>
      <div className="catalog-layout">
        <aside className="filters-sidebar">
          <h2>Фильтры</h2>
          {filters}
        </aside>
        <div className="catalog-results">
          <h2 className="sr-only">Товары</h2>
          <div className="catalog-toolbar">
            <label className="search-field">
              <Search size={20} />
              <span className="sr-only">Поиск по названию или артикулу</span>
              <input
                type="search"
                value={q}
                onChange={(e) => update("q", e.target.value)}
                placeholder="Поиск по названию или артикулу"
              />
            </label>
            <button
              className="filter-toggle button secondary"
              onClick={() => setFilterOpen(true)}
            >
              <SlidersHorizontal size={18} />
              Фильтры
            </button>
            <label className="sort-field">
              <span className="sr-only">Сортировка</span>
              <select
                value={sort}
                onChange={(e) => update("sort", e.target.value)}
              >
                <option value="default">По умолчанию</option>
                <option value="name">По названию</option>
                <option value="price-asc">Сначала дешевле</option>
                <option value="price-desc">Сначала дороже</option>
              </select>
            </label>
          </div>
          <div className="results-meta">
            <span role="status" aria-live="polite">
              Найдено: {products.length}
            </span>
            <div className="filter-chips">
              {minPrice && (
                <button onClick={() => update("minPrice", "")}>
                  От {minPrice} ₽<X size={14} />
                </button>
              )}
              {maxPrice && (
                <button onClick={() => update("maxPrice", "")}>
                  До {maxPrice} ₽<X size={14} />
                </button>
              )}
              {selectedTypes.map((t) => (
                <button key={t} onClick={() => update("type", t, true)}>
                  {data.categories.find((c) => c.path === t)?.title || t}
                  <X size={14} />
                </button>
              ))}
              {selectedColors.map((c) => (
                <button key={c} onClick={() => update("color", c, true)}>
                  {c}
                  <X size={14} />
                </button>
              ))}
            </div>
          </div>
          {products.length > 0 ? (
            <>
              <div className="product-grid">
                {products.slice(0, shown).map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              {shown < products.length && (
                <div className="load-more">
                  <button
                    className="button secondary"
                    onClick={() => setShown((n) => n + 24)}
                  >
                    Показать ещё {Math.min(24, products.length - shown)}
                  </button>
                  <span>
                    {Math.min(shown, products.length)} из {products.length}
                  </span>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              title={
                favoritesOnly && !favorites.length
                  ? "Сохраните то, что откликнулось."
                  : "Пока ничего не найдено."
              }
              text={
                favoritesOnly
                  ? "Нажмите на сердечко у понравившейся ткани — она появится здесь."
                  : source.length
                    ? "Попробуйте другое название или сбросьте выбранные фильтры."
                    : "В этой категории исходный каталог пока не содержит товаров. Поможем подобрать решение в нашей компании."
              }
            />
          )}
        </div>
      </div>
      {data.pages.find((p) => p.path === pathname) && (
        <section className="catalog-description">
          <OriginalContent
            page={data.pages.find((p) => p.path === pathname)!}
          />
          <div className="article-gallery">
            {data.pages
              .find((p) => p.path === pathname)!
              .images.map((im, i) => (
                <Picture
                  key={im.src + i}
                  src={im.src}
                  alt={im.alt || cat?.title || "Коллекция"}
                />
              ))}
          </div>
        </section>
      )}
      <Modal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Фильтры"
        className="filters-dialog"
      >
        <h2>Фильтры</h2>
        {filters}
        <button className="button" onClick={() => setFilterOpen(false)}>
          Показать результаты · {products.length}
        </button>
      </Modal>
    </div>
  );
}
export function Directions() {
  const { data } = useStore();
  return (
    <div className="container directions-page">
      <Breadcrumbs items={[{ label: "Все направления" }]} />
      <p className="eyebrow">КОЛЛЕКЦИЯ РЕШЕНИЙ</p>
      <h1>
        У каждой детали
        <br />
        своё место.
      </h1>
      <p className="page-intro">
        Ткани, шторы и предметы, которые делают пространство вашим.
      </p>
      <div className="all-directions">
        {data.categories.map((c) => (
          <Link className="direction-list-item" key={c.path} to={c.path}>
            <Picture src={c.image} alt={c.title} />
            <div>
              <h2>{c.title}</h2>
              <span>
                {c.count !== undefined ? c.count + " позиций" : "Узнать больше"}
              </span>
            </div>
            <ArrowUpRight size={24} />
          </Link>
        ))}
      </div>
      <Link className="button" to="/shop">
        Все товары
        <ArrowUpRight size={19} />
      </Link>
    </div>
  );
}
