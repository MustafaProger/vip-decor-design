import { Reveal } from "../components/Motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigationType,
  useSearchParams,
} from "react-router-dom";
import {
  Search,
  SlidersHorizontal,
  X,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useStore } from "../lib/store";
import { Breadcrumbs, ProductCard, EmptyState } from "../components/Primitives";
import Modal from "../components/Modal";
import type { Product } from "../lib/content";
import { OriginalContent } from "./Information";
import { translateLegacyFilters } from "../lib/legacyFilters";
import {
  categoryLabel,
  catalogCategories,
  getCategoryCounts,
  catalogFamilies,
  catalogFilterGroups,
  categoryFamily,
  compareCatalogProducts,
  matchesCatalogTypes,
  productCategoryPaths,
} from "../lib/catalog";
import "./catalog.css";
const productColors = (p: Product) =>
  (p.properties || [])
    .filter((x) => x.name.trim().toLowerCase() === "цвет")
    .flatMap((x) =>
      x.value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    );
export default function Catalog({
  favoritesOnly = false,
  all = false,
}: {
  favoritesOnly?: boolean;
  all?: boolean;
}) {
  const { data, favorites } = useStore();
  const { pathname, key: locationKey } = useLocation();
  const navigationType = useNavigationType();
  const [params, setParams] = useSearchParams();
  // Input feedback is immediate; router transitions can commit a frame later.
  const [filters, setFilters] = useState(params);
  const latestFilters = useRef(params);
  const requestedSearch = useRef<string | null>(null);
  useEffect(() => {
    if (
      requestedSearch.current !== null &&
      navigationType === "REPLACE" &&
      params.toString() !== requestedSearch.current
    )
      return;
    latestFilters.current = params;
    requestedSearch.current = null;
    setFilters(params);
  }, [params, locationKey, navigationType]);
  const commitFilters = (next: URLSearchParams) => {
    latestFilters.current = next;
    requestedSearch.current = next.toString();
    setFilters(next);
    setParams(next, { replace: true });
  };
  useEffect(() => {
    const next = translateLegacyFilters(params);
    if (next.toString() !== params.toString())
      setParams(next, { replace: true });
  }, [params, setParams]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [shown, setShown] = useState(24);
  const categoryCounts = useMemo(
    () => getCategoryCounts(data.products),
    [data.products],
  );
  const availableCategories = useMemo(
    () => catalogCategories(data.categories),
    [data.categories],
  );
  const categories = useMemo(
    () => catalogFamilies(availableCategories, categoryCounts),
    [availableCategories, categoryCounts],
  );
  const requestedCategory = filters.get("category") || "";
  const categoryPath = all
    ? (categoryCounts.get(requestedCategory) || 0) > 0
      ? requestedCategory
      : ""
    : favoritesOnly
      ? ""
      : pathname;
  const activeFamily = categoryFamily(categoryPath);
  const cat = availableCategories.find((c) => c.path === categoryPath);
  const family = availableCategories.find((c) => c.path === activeFamily);
  const categoryPage = data.pages.find((p) => p.path === categoryPath);
  const hasDescription = categoryPage?.paragraphs.some(
    (paragraph) =>
      paragraph.trim().length > 80 &&
      paragraph.trim().toLocaleLowerCase("ru") !==
        cat?.title.toLocaleLowerCase("ru"),
  );
  const categoryRail = useRef<HTMLDivElement>(null);
  const categoriesBar = useRef<HTMLElement>(null);
  const catalogLayout = useRef<HTMLDivElement>(null);
  const previousCategory = useRef(categoryPath);
  const [railEdges, setRailEdges] = useState({ start: true, end: false });
  const readRailEdges = () => {
    const rail = categoryRail.current;
    if (rail)
      setRailEdges({
        start: rail.scrollLeft <= 2,
        end: rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2,
      });
  };
  useEffect(() => {
    const rail = categoryRail.current;
    if (!rail) return;
    const active = rail.querySelector<HTMLElement>("[aria-current='page']");
    if (active)
      rail.scrollTo({
        left:
          active.offsetLeft -
          rail.offsetLeft -
          (rail.clientWidth - active.offsetWidth) / 2,
        behavior: "instant",
      });
    readRailEdges();
    const observer = new ResizeObserver(readRailEdges);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [categoryPath, favoritesOnly]);
  useEffect(() => {
    if (previousCategory.current === categoryPath) return;
    previousCategory.current = categoryPath;
    setShown(24);
    setFilterOpen(false);
    const layout = catalogLayout.current;
    const bar = categoriesBar.current;
    if (!layout || !bar) return;
    const headerBottom =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--site-header-bottom",
        ),
      ) || 104;
    const target =
      window.scrollY +
      layout.getBoundingClientRect().top -
      headerBottom -
      bar.offsetHeight -
      24;
    if (window.scrollY > target)
      window.scrollTo({ top: Math.max(0, target), behavior: "instant" });
  }, [categoryPath]);
  const scrollCategories = (direction: number) => {
    const rail = categoryRail.current;
    if (rail)
      rail.scrollBy({
        left: direction * rail.clientWidth * 0.75,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  };
  const categoryHref = (path: string) =>
    path ? `/catalog?${new URLSearchParams({ category: path })}` : "/catalog";
  const q = filters.get("q") || "";
  const selectedTypes = filters.getAll("type");
  const selectedColors = filters.getAll("color");
  const sort = filters.get("sort") || "default";
  const minPrice = filters.get("minPrice") || "";
  const maxPrice = filters.get("maxPrice") || "";
  const source = useMemo(
    () =>
      data.products.filter((p) =>
        favoritesOnly
          ? favorites.includes(p.id)
          : !categoryPath
            ? true
            : productCategoryPaths(p).has(categoryPath),
      ),
    [data, categoryPath, favoritesOnly, favorites],
  );
  const typeGroups = catalogFilterGroups(
    availableCategories,
    source,
    selectedTypes,
  );
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
        matchesCatalogTypes(p, selectedTypes) &&
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
            : compareCatalogProducts(a, b),
    );
  }, [source, q, selectedTypes, selectedColors, sort, minPrice, maxPrice]);
  const update = (key: string, value: string, multi = false) => {
    const next = new URLSearchParams(latestFilters.current);
    if (multi) {
      const values = next.getAll(key);
      next.delete(key);
      (values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value]
      ).forEach((v) => next.append(key, v));
    } else if (value) next.set(key, value);
    else next.delete(key);
    commitFilters(next);
    setShown(24);
  };
  const filterControls = (
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
      {typeGroups.map((group) => (
        <fieldset className="filter-group category-filter" key={group.id}>
          <legend>{group.title}</legend>
          {group.options.map((option) => (
            <label key={option.path}>
              <input
                type="checkbox"
                checked={selectedTypes.includes(option.path)}
                onChange={() => update("type", option.path, true)}
              />
              <span>{categoryLabel(option)}</span>
              <span className="filter-option-count" aria-hidden="true">
                {option.count}
              </span>
            </label>
          ))}
        </fieldset>
      ))}
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
          commitFilters(
            new URLSearchParams(
              all && categoryPath ? { category: categoryPath } : undefined,
            ),
          );
          setShown(24);
        }}
      >
        Сбросить всё
        <X size={15} />
      </button>
    </>
  );
  const title = favoritesOnly
    ? "Избранное"
    : all
      ? "Каталог"
      : pathname === "/tkani"
        ? "Ткани для штор"
        : cat?.title || "Коллекция";
  return (
    <div className="container catalog-page">
      <Breadcrumbs
        items={[
          {
            label: favoritesOnly
              ? "Избранное"
              : all
                ? "Каталог"
                : cat?.title || "Каталог",
          },
        ]}
      />
      <Reveal className="catalog-heading">
        <div>
          <h1>{title}</h1>
          <p>
            {favoritesOnly
              ? "Сохранённые товары для вашего проекта."
              : all
                ? "Ткани для штор, тюль, карнизы и декор для вашего интерьера."
                : "Выберите материал, цвет и подходящую цену."}
          </p>
        </div>
        <Link className="text-link" to="/selection">
          Помочь с выбором
          <ArrowUpRight size={18} />
        </Link>
      </Reveal>
      <nav
        className="category-tabs catalog-categories"
        aria-label="Категории каталога"
        ref={categoriesBar}
      >
        <button
          className="category-scroll"
          type="button"
          onClick={() => scrollCategories(-1)}
          disabled={railEdges.start}
          aria-label="Предыдущие категории"
        >
          <ChevronLeft size={18} />
        </button>
        <div
          className="category-rail"
          ref={categoryRail}
          onScroll={readRailEdges}
        >
          <Link
            to="/catalog"
            className={all && !categoryPath ? "active" : ""}
            aria-current={all && !categoryPath ? "page" : undefined}
          >
            Все товары
          </Link>
          {categories.map((category) => (
            <Link
              to={categoryHref(category.path)}
              className={activeFamily === category.path ? "active" : ""}
              aria-current={activeFamily === category.path ? "page" : undefined}
              key={category.path}
            >
              {categoryLabel(category)}
            </Link>
          ))}
        </div>
        <button
          className="category-scroll"
          type="button"
          onClick={() => scrollCategories(1)}
          disabled={railEdges.end}
          aria-label="Следующие категории"
        >
          <ChevronRight size={18} />
        </button>
      </nav>
      <div className="catalog-layout" ref={catalogLayout}>
        <aside className="filters-sidebar">
          <h2>Фильтры</h2>
          {filterControls}
        </aside>
        <div className="catalog-results">
          <h2 className="sr-only">Товары</h2>
          {cat && activeFamily !== categoryPath && family && (
            <div className="catalog-collection-context">
              <span>
                Коллекция: <strong>{categoryLabel(cat)}</strong>
              </span>
              <Link to={categoryHref(activeFamily)}>
                Весь раздел «{categoryLabel(family)}»
                <ArrowUpRight size={16} />
              </Link>
            </div>
          )}
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
                aria-label="Сортировка"
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
                <button
                  key={t}
                  onClick={() => update("type", t, true)}
                  aria-label={`Убрать фильтр: ${availableCategories.find((c) => c.path === t)?.title || t}`}
                >
                  {availableCategories.find((c) => c.path === t)?.title || t}
                  <X size={14} />
                </button>
              ))}
              {selectedColors.map((c) => (
                <button
                  key={c}
                  onClick={() => update("color", c, true)}
                  aria-label={`Убрать цвет: ${c}`}
                >
                  {c}
                  <X size={14} />
                </button>
              ))}
            </div>
          </div>
          {products.length > 0 ? (
            <>
              <div className="product-grid">
                {products.slice(0, shown).map((p, index) => (
                  <ProductCard key={p.id} product={p} index={index} />
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
              to="/catalog"
              link="Посмотреть каталог"
              title={
                favoritesOnly && !favorites.length
                  ? "В избранном пока нет товаров"
                  : "Пока ничего не найдено."
              }
              text={
                favoritesOnly
                  ? "Нажмите на сердечко у понравившегося товара — он появится здесь."
                  : source.length
                    ? "Попробуйте другое название или сбросьте выбранные фильтры."
                    : "В этой категории исходный каталог пока не содержит товаров. Поможем подобрать решение в нашей компании."
              }
            />
          )}
        </div>
      </div>
      {categoryPage && hasDescription && (
        <section className="catalog-description collection-note">
          <h2>О категории «{cat?.title}»</h2>
          <OriginalContent page={categoryPage} />
        </section>
      )}
      <Modal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Фильтры"
        className="filters-dialog"
      >
        <h2>Фильтры</h2>
        {filterControls}
        <button className="button" onClick={() => setFilterOpen(false)}>
          Показать результаты · {products.length}
        </button>
      </Modal>
    </div>
  );
}
