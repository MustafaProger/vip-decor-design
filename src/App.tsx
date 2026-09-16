import {
  useEffect,
  useLayoutEffect,
  useState,
  Suspense,
  lazy,
  Component,
  type ReactNode,
} from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { PageEntrance } from "./components/Motion";
import { StoreProvider } from "./lib/store";
import { localHref, type SiteContent } from "./lib/content";
import Blog from "./blog/Blog";
import blogChrome from "./data/blog-chrome.json";
import { blogMetadata, blogSchema } from "./blog/content";
import { pageMetadata } from "./lib/metadata";
import { Header, Footer } from "./components/SiteChrome";
import Modal from "./components/Modal";
import Home from "./pages/Home";
import Catalog from "./pages/Catalog";
const Projects = lazy(() => import("./pages/Projects"));
import Information, { Company, Sitemap, NotFound } from "./pages/Information";
import Cart from "./pages/Cart";
const Contacts = lazy(() =>
  import("./pages/EditorialPages").then((m) => ({ default: m.Contacts })),
);
const Price = lazy(() =>
  import("./pages/EditorialPages").then((m) => ({ default: m.Price })),
);
const FabricGuide = lazy(() =>
  import("./pages/EditorialPages").then((m) => ({ default: m.FabricGuide })),
);
const Delivery = lazy(() =>
  import("./pages/ReadingPages").then((m) => ({ default: m.Delivery })),
);
const Privacy = lazy(() =>
  import("./pages/ReadingPages").then((m) => ({ default: m.Privacy })),
);
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
  "#rec214513799": "/catalog",
  "#rec207850634": "/company#service-terms",
  "#rec224459428": "/company",
  "#rec207714883": "/catalog",
};
function RouteContent({
  data,
  discuss,
}: {
  data: SiteContent;
  discuss: (context?: string) => void;
}) {
  const { pathname, hash, search } = useLocation();
  const navigate = useNavigate();
  useLayoutEffect(() => {
    if (pathname === "/" && hash) {
      const target =
        anchorRoutes[hash] ||
        (data.pages
          .find((p) => p.path === "/")
          ?.blocks?.some((b) => "#" + b.id === hash)
          ? "/company" + hash
          : null);
      if (target) {
        navigate(target, { replace: true });
        return;
      }
    }
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      return;
    }
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(decodeURIComponent(hash.slice(1)))
        ?.scrollIntoView();
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash, navigate, data]);
  const path = pathname.replace(/\/$/, "") || "/";
  const source = data.pages.find((p) => p.path === path);
  const product = path.startsWith("/product/")
    ? data.products.find((p) => p.id === decodeURIComponent(path.slice(9)))
    : data.products.find((p) => localHref(p.url).split("?")[0] === path);
  useEffect(() => {
    const metadata = pageMetadata(path, source, product);
    document.querySelectorAll("[data-blog-meta]").forEach((el) => el.remove());
    if (path === "/blog" || path.startsWith("/blog/")) {
      const blog = blogMetadata(path);
      for (const [property, content] of Object.entries({
        "og:title": blog.title,
        "og:description": blog.description,
        "og:url": blog.canonical,
        "og:image": blog.image,
        "og:type":
          path.startsWith("/blog/category/") || path === "/blog"
            ? "website"
            : "article",
        "og:locale": "ru_RU",
      })) {
        const tag = document.createElement("meta");
        tag.setAttribute("property", property);
        tag.content = content;
        tag.dataset.blogMeta = "";
        document.head.appendChild(tag);
      }
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.blogMeta = "";
      script.textContent = JSON.stringify(blogSchema(path));
      document.head.appendChild(script);
    }
    document.title = metadata.title;
    for (const [name, content] of [
      ["description", metadata.description],
      ["robots", metadata.robots],
    ]) {
      let meta = document.querySelector<HTMLMetaElement>(
        `meta[name="${name}"]`,
      );
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = name;
        document.head.appendChild(meta);
      }
      meta.content = content;
    }
    let canonical = document.querySelector<HTMLLinkElement>(
      "link[rel=canonical]",
    );
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = metadata.canonical;
  }, [path, source, product]);
  if (path === "/blog" || path.startsWith("/blog/"))
    return <Blog path={path} />;
  if (path === "/") return <Home />;
  if (path === "/selection") return <Selection onDiscuss={discuss} />;
  if (path === "/calculator")
    return (
      <div className="container calculator-page">
        <Calculator onDiscuss={discuss} />
      </div>
    );
  if (path === "/fabrics")
    return <Navigate to={"/tkani" + search + hash} replace />;
  if (path === "/furnitura")
    return <Navigate to={"/fyrnityra" + search + hash} replace />;
  if (path === "/privacy")
    return <Navigate to={"/popd" + search + hash} replace />;
  if (path === "/projects/quiet-living-room")
    return <Navigate to="/projects" replace />;
  if (path === "/projects") return <Projects />;
  if (path === "/studio")
    return <Navigate to={"/company" + search + hash} replace />;
  if (path === "/company") return <Company />;
  if (path === "/curtains")
    return <Navigate to={"/" + search + hash} replace />;
  if (path === "/price") return <Price />;
  if (path === "/contacts") return <Contacts />;
  if (path === "/kakpodobrat") return <FabricGuide />;
  if (source && path === "/popd") return <Privacy page={source} />;
  if (source && ["/dostavka", "/page13486315.html"].includes(path))
    return <Delivery page={source} />;
  if (path === "/sitemap") return <Sitemap />;
  if (path === "/catalog") return <Catalog all />;
  if (path === "/derzhateli-dlya-shtor") return <Catalog />;
  if (path === "/shop")
    return <Navigate to={"/catalog" + search + hash} replace />;
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
  const location = useLocation();
  const [data, setData] = useState<SiteContent | null>(() =>
    location.pathname === "/blog" || location.pathname.startsWith("/blog/")
      ? blogChrome
      : null,
  );
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
        <p role="status">{error || "Загружаем каталог…"}</p>
        {error && (
          <button className="button" onClick={() => setAttempt((x) => x + 1)}>
            Попробовать снова
          </button>
        )}
      </div>
    );
  return (
    <AppBoundary>
      <MotionConfig reducedMotion="user">
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
              <PageEntrance
                key={location.pathname}
                immediate={
                  location.pathname === "/blog" ||
                  location.pathname.startsWith("/blog/")
                }
              >
                <RouteContent data={data} discuss={discuss} />
              </PageEntrance>
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
      </MotionConfig>
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
