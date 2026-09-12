import {
  useEffect,
  useState,
  Suspense,
  lazy,
  Component,
  type ReactNode,
} from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { StoreProvider } from "./lib/store";
import { localHref, type SiteContent } from "./lib/content";
import { Header, Footer } from "./components/SiteChrome";
import Modal from "./components/Modal";
import Home from "./pages/Home";
import Catalog, { Directions } from "./pages/Catalog";
import Projects, { ConceptProject } from "./pages/Projects";
import Information, {
  Studio,
  Curtains,
  Price,
  Contacts,
  Sitemap,
  NotFound,
} from "./pages/Information";
import Cart from "./pages/Cart";
import InquiryForm from "./features/inquiry/InquiryForm";
const Selection = lazy(() => import("./features/selection/Selection"));
const Calculator = lazy(() => import("./features/calculator/Calculator"));
const ProductPage = lazy(() => import("./pages/Product"));
const anchorRoutes: Record<string, string> = {
  "#rec207714887": "/projects",
  "#rec208301757": "/catalog",
  "#rec208300994": "/catalog",
  "#rec208194534": "/contacts",
  "#rec221002251": "/calculator",
  "#rec214496134": "/price",
  "#rec207714893": "/page13486315.html",
  "#rec217629625": "/page13486315.html",
  "#rec209177378": "/selection",
  "#rec214513799": "/curtains",
  "#rec207714883": "/catalog",
};
function RouteContent({
  data,
  discuss,
}: {
  data: SiteContent;
  discuss: (context?: string) => void;
}) {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (pathname === "/" && hash) {
      const target =
        anchorRoutes[hash] ||
        (data.pages
          .find((p) => p.path === "/")
          ?.blocks?.some((b) => "#" + b.id === hash)
          ? "/studio" + hash
          : null);
      if (target) {
        navigate(target, { replace: true });
        return;
      }
    }
    const frame = requestAnimationFrame(() => {
      if (hash)
        document
          .getElementById(decodeURIComponent(hash.slice(1)))
          ?.scrollIntoView();
      else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash, navigate, data]);
  const path = pathname.replace(/\/$/, "") || "/";
  const source = data.pages.find((p) => p.path === path);
  const product = path.startsWith("/product/")
    ? data.products.find((p) => p.id === decodeURIComponent(path.slice(9)))
    : data.products.find((p) => localHref(p.url).split("?")[0] === path);
  useEffect(() => {
    const names: Record<string, string> = {
      "/": "Текстиль, который создаёт дом",
      "/projects": "Галерея работ",
      "/selection": "Подбор штор",
      "/calculator": "Калькулятор стоимости",
      "/favorites": "Избранное",
      "/cart": "Корзина",
      "/studio": "О студии",
      "/contacts": "Контакты",
      "/catalog": "Все направления",
      "/shop": "Магазин",
    };
    document.title =
      (product?.title || source?.title || names[path] || "VIP DECOR DESIGN") +
      " — VIP DECOR DESIGN";
    const meta = document.querySelector('meta[name="description"]');
    meta?.setAttribute(
      "content",
      source?.description ||
        "Шторы и интерьерный текстиль. Индивидуальный пошив, подбор тканей и оформление окон — VIP DECOR DESIGN, Москва.",
    );
    let canonical = document.querySelector<HTMLLinkElement>(
      "link[rel=canonical]",
    );
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = product?.url || source?.url || "https://vip2d.ru" + path;
  }, [path, source, product]);
  if (path === "/") return <Home />;
  if (path === "/selection") return <Selection onDiscuss={discuss} />;
  if (path === "/calculator")
    return (
      <div className="container calculator-page">
        <Calculator onDiscuss={discuss} />
      </div>
    );
  if (path === "/fabrics") return <Navigate to="/tkani" replace />;
  if (path === "/privacy") return <Navigate to="/popd" replace />;
  if (path === "/projects/quiet-living-room") return <ConceptProject />;
  if (path === "/projects") return <Projects />;
  if (path === "/studio") return <Studio />;
  if (path === "/curtains") return <Curtains />;
  if (path === "/price") return <Price />;
  if (path === "/contacts") return <Contacts />;
  if (path === "/sitemap") return <Sitemap />;
  if (path === "/catalog") return <Directions />;
  if (path === "/shop") return <Catalog all />;
  if (path === "/favorites") return <Catalog favoritesOnly />;
  if (path === "/cart") return <Cart />;
  if (product) return <ProductPage key={product.id} product={product} />;
  if (
    data.categories.some((c) => c.path === path && c.sourceHasCatalog === true)
  )
    return <Catalog />;
  if (source) return <Information page={source} />;
  return <NotFound />;
}
export default function App() {
  const [data, setData] = useState<SiteContent | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [inquiry, setInquiry] = useState<{ open: boolean; context: string }>({
    open: false,
    context: "",
  });
  useEffect(() => {
    const ctrl = new AbortController();
    setError("");
    fetch("/data/site-content.json", { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Каталог временно недоступен.");
        return r.json();
      })
      .then((d) => {
        if (!Array.isArray(d.pages) || !Array.isArray(d.products))
          throw new Error("Не удалось прочитать каталог.");
        setData(d);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => ctrl.abort();
  }, [attempt]);
  const discuss = (context = "Обсудить проект") =>
    setInquiry({ open: true, context });
  if (!data)
    return (
      <div className="boot-screen">
        <div className="brand">
          <span>VIP</span>
          <small>DECOR DESIGN</small>
        </div>
        <p role="status">{error || "Готовим пространство для вдохновения…"}</p>
        {error && (
          <button className="button" onClick={() => setAttempt((x) => x + 1)}>
            Попробовать снова
          </button>
        )}
      </div>
    );
  return (
    <AppBoundary>
      <StoreProvider data={data} discuss={discuss}>
        <div id="top" />
        <Header />
        <main id="main-content" tabIndex={-1}>
          <Suspense
            fallback={
              <div className="page-loading" role="status">
                Загружаем…
              </div>
            }
          >
            <RouteContent data={data} discuss={discuss} />
          </Suspense>
        </main>
        <Footer />
        <Modal
          open={inquiry.open}
          onClose={() => setInquiry((v) => ({ ...v, open: false }))}
          title="Расскажите о вашем проекте"
          className="inquiry-dialog"
        >
          <p className="eyebrow">НАЧНЁМ ЗНАКОМСТВО</p>
          <h2>Расскажите о вашем проекте</h2>
          <InquiryForm context={inquiry.context} />
        </Modal>
      </StoreProvider>
    </AppBoundary>
  );
}
class AppBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="boot-screen">
        <h1>Не удалось открыть страницу</h1>
        <p>Ваши сохранённые подборки остаются в браузере.</p>
        <button className="button" onClick={() => window.location.reload()}>
          Загрузить снова
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
