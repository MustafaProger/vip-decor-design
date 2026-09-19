import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Auth from "./Auth";
import { CMSApiError, cmsRequest } from "./api";
import { Badge } from "./Fields";
import { InquiryDetail } from "./InquiryDetail";
import { PostEditor } from "./PostEditor";
import { ProductEditor } from "./ProductEditor";
import {
  formatDate,
  inquiryLabels,
  publicationLabels,
  type CMSContent,
  type CMSInquiry,
  type CMSPost,
  type CMSProduct,
  type MediaResult,
  type Session,
} from "./types";
import "./admin.css";

type Tab = "overview" | "posts" | "products" | "inquiries";
type Editor =
  | { kind: "posts"; item: CMSPost }
  | { kind: "products"; item: CMSProduct }
  | { kind: "inquiries"; item: CMSInquiry };
const tabs = [
  { id: "overview", label: "Обзор", icon: LayoutDashboard },
  { id: "posts", label: "Статьи", icon: FileText },
  { id: "products", label: "Товары", icon: Package },
  { id: "inquiries", label: "Заявки", icon: MessageSquare },
] as const;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const formatMoney = (value: number | null) =>
  value === null
    ? "По запросу"
    : new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "RUB",
        maximumFractionDigits: 2,
      }).format(value);
const PAGE_SIZE = 24;

export default function Admin() {
  const [setupToken] = useState(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const token = hash.get("setup") || "";
    return token;
  });
  useEffect(() => {
    if (new URLSearchParams(window.location.hash.slice(1)).has("setup"))
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
  }, []);
  const [session, setSession] = useState<Session | null>(null);
  const [reauth, setReauth] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [content, setContent] = useState<CMSContent | null>(null);
  const [inquiries, setInquiries] = useState<CMSInquiry[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [baseline, setBaseline] = useState("");
  const [invalidFields, setInvalidFields] = useState<Record<string, boolean>>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [mediaPending, setMediaPending] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const actionLock = useRef(false);
  const dirty =
    !!editor &&
    (JSON.stringify(editor.item) !== baseline ||
      Object.values(invalidFields).some(Boolean));

  const loadSession = useCallback(async () => {
    setSessionError("");
    try {
      setSession(await cmsRequest<Session>("/session"));
    } catch (error) {
      setSessionError(
        error instanceof Error ? error.message : "Не удалось открыть CMS.",
      );
    }
  }, []);
  useEffect(() => {
    void loadSession();
  }, [loadSession]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeMenu);
    return () => window.removeEventListener("keydown", closeMenu);
  }, [menuOpen]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const handleError = useCallback((cause: unknown) => {
    setError(
      cause instanceof Error ? cause.message : "Не удалось выполнить действие.",
    );
    setConflict(cause instanceof CMSApiError && cause.status === 409);
    if (cause instanceof CMSApiError && cause.status === 401) setReauth(true);
  }, []);
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    setConflict(false);
    try {
      const [data, inbox] = await Promise.all([
        cmsRequest<CMSContent>("/content"),
        cmsRequest<{ inquiries: CMSInquiry[] }>("/inquiries"),
      ]);
      setContent(data);
      setInquiries(inbox.inquiries);
      return { data, inquiries: inbox.inquiries };
    } catch (error) {
      handleError(error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [handleError]);
  useEffect(() => {
    if (session?.authenticated) void loadData();
  }, [session?.authenticated, loadData]);

  function canLeave() {
    return (
      !(pending || mediaPending) &&
      (!dirty ||
        window.confirm(
          "Есть несохранённые изменения. Покинуть форму и потерять их?",
        ))
    );
  }
  function switchTab(next: Tab) {
    if (!canLeave()) return;
    setTab(next);
    setEditor(null);
    setSearch("");
    setStatus("all");
    setCategory("all");
    setPage(1);
    setError("");
    setConflict(false);
    setMenuOpen(false);
    setInvalidFields({});
  }
  function openEditor(next: Editor) {
    if (!canLeave()) return;
    const value = copy(next);
    setEditor(value);
    setBaseline(JSON.stringify(value.item));
    setInvalidFields({});
    setError("");
    setConflict(false);
    setTab(next.kind);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function createItem(kind: "posts" | "products") {
    if (!content) return;
    const id = crypto.randomUUID();
    if (kind === "posts")
      openEditor({
        kind,
        item: {
          id,
          version: 0,
          status: "draft",
          slug: "",
          title: "",
          category: content.blogCategories[0]?.slug || "",
          seoTitle: "",
          description: "",
          excerpt: "",
          intro: "",
          image: {
            src: "",
            alt: "",
            caption: "",
            width: 1200,
            height: 675,
            variants: [],
          },
          sections: [],
          sources: [],
          related: [],
        },
      });
    else
      openEditor({
        kind,
        item: {
          id,
          version: 0,
          status: "draft",
          title: "",
          description: "",
          price: null,
          sku: "",
          oldPrice: "",
          image: "",
          images: [],
          url: `/product/${id}`,
          categoryOverride: true,
          category: content.categories[0]?.title || "",
          categoryPath: content.categories[0]?.path,
          categoryPaths: content.categories[0]
            ? [content.categories[0].path]
            : [],
          properties: [],
        },
      });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      !editor ||
      actionLock.current ||
      Object.values(invalidFields).some(Boolean)
    )
      return;
    actionLock.current = true;
    setPending(true);
    setError("");
    setConflict(false);
    try {
      const isNew = editor.item.version === 0;
      const { version, ...newItem } = editor.item;
      const body =
        editor.kind === "inquiries"
          ? {
              status: editor.item.status,
              note: editor.item.note || "",
              version,
            }
          : isNew
            ? newItem
            : editor.item;
      const path = `/${editor.kind}${isNew ? "" : `/${encodeURIComponent(editor.item.id)}`}`;
      const response = await cmsRequest<{
        item: CMSProduct | CMSPost | CMSInquiry;
      }>(path, {
        method: editor.kind === "inquiries" ? "PATCH" : isNew ? "POST" : "PUT",
        body,
        token: session?.csrfToken,
      });
      const item = response.item;
      if (editor.kind === "inquiries")
        setInquiries((current) =>
          current.map((entry) =>
            entry.id === item.id ? (item as CMSInquiry) : entry,
          ),
        );
      else
        setContent((current) =>
          current
            ? ({
                ...current,
                [editor.kind]: isNew
                  ? [item, ...current[editor.kind]]
                  : current[editor.kind].map((entry) =>
                      entry.id === item.id ? item : entry,
                    ),
              } as CMSContent)
            : current,
        );
      setEditor({ kind: editor.kind, item } as Editor);
      setBaseline(JSON.stringify(item));
      setNotice("Изменения сохранены");
    } catch (error) {
      handleError(error);
    } finally {
      actionLock.current = false;
      setPending(false);
    }
  }
  async function remove() {
    if (
      !editor ||
      editor.kind === "inquiries" ||
      actionLock.current ||
      !window.confirm(
        `Удалить «${editor.item.title}»? Запись исчезнет с сайта. Это действие нельзя отменить.`,
      )
    )
      return;
    actionLock.current = true;
    setPending(true);
    setError("");
    try {
      await cmsRequest(
        `/${editor.kind}/${encodeURIComponent(editor.item.id)}?version=${editor.item.version}`,
        { method: "DELETE", token: session?.csrfToken },
      );
      setContent((current) =>
        current
          ? {
              ...current,
              [editor.kind]: current[editor.kind].filter(
                (item) => item.id !== editor.item.id,
              ),
            }
          : current,
      );
      setEditor(null);
      setNotice("Запись удалена");
    } catch (error) {
      handleError(error);
    } finally {
      actionLock.current = false;
      setPending(false);
    }
  }
  async function reloadEditor() {
    if (
      !editor ||
      !window.confirm(
        "Загрузить последнюю сохранённую версию? Ваши несохранённые правки будут потеряны.",
      )
    )
      return;
    const fresh = await loadData();
    if (!fresh) return;
    const item =
      editor.kind === "inquiries"
        ? fresh.inquiries.find((entry) => entry.id === editor.item.id)
        : fresh.data[editor.kind].find((entry) => entry.id === editor.item.id);
    if (item) {
      setEditor({ kind: editor.kind, item: copy(item) } as Editor);
      setBaseline(JSON.stringify(item));
      setInvalidFields({});
    } else {
      setEditor(null);
      setNotice("Запись была удалена в другой вкладке.");
    }
  }
  async function upload(file: File) {
    setMediaPending(true);
    try {
      return await cmsRequest<MediaResult>("/media", {
        method: "POST",
        file,
        token: session?.csrfToken,
      });
    } catch (error) {
      handleError(error);
      throw error;
    } finally {
      setMediaPending(false);
    }
  }
  async function logout() {
    if (!canLeave()) return;
    setPending(true);
    try {
      await cmsRequest("/logout", {
        method: "POST",
        token: session?.csrfToken,
      });
      setSession({ authenticated: false, setupRequired: false });
      setEditor(null);
      setContent(null);
      setInquiries([]);
      setError("");
    } catch (error) {
      handleError(error);
    } finally {
      setPending(false);
    }
  }

  if (!session)
    return (
      <div className="cms-root">
        <div className="cms-initial">
          <div className="cms-brand-monogram">V.</div>
          <h1>VIP DECOR DESIGN</h1>
          {sessionError ? (
            <>
              <p role="alert" className="cms-error">
                {sessionError}
              </p>
              <button
                className="cms-button cms-primary"
                onClick={() => void loadSession()}
              >
                <RefreshCw size={16} />
                Повторить
              </button>
            </>
          ) : (
            <p className="cms-muted">Открываем пространство управления…</p>
          )}
        </div>
      </div>
    );
  if (!session.authenticated)
    return (
      <div className="cms-root">
        <Auth
          setup={session.setupRequired}
          setupToken={setupToken}
          onAuthenticated={setSession}
        />
      </div>
    );
  const newInquiries = inquiries.filter((item) => item.status === "new");
  const activeTab = tabs.find((entry) => entry.id === tab)!;
  const titles: Record<Tab, string> = {
    overview: "Всё важное — под рукой",
    posts: "Статьи",
    products: "Каталог товаров",
    inquiries: "Заявки клиентов",
  };
  const subtitles: Record<Tab, string> = {
    overview: "Свежие обращения и содержание вашего сайта.",
    posts: "Идеи, советы и истории для ваших читателей.",
    products: "Управляйте ассортиментом, фотографиями и ценами.",
    inquiries: "Обращения с сайта и история работы с клиентами.",
  };
  const query = search.trim().toLocaleLowerCase("ru");
  const filtered =
    tab === "inquiries"
      ? inquiries.filter(
          (item) =>
            (status === "all" || item.status === status) &&
            `${item.name || ""} ${item.phone || ""} ${item.email || ""} ${item.context || ""} ${item.comment || ""} ${item.id}`
              .toLocaleLowerCase("ru")
              .includes(query),
        )
      : tab === "posts" || tab === "products"
        ? (content?.[tab] || []).filter(
            (item) =>
              (status === "all" || item.status === status) &&
              (category === "all" ||
                (tab === "posts"
                  ? item.category === category
                  : (item as CMSProduct).categoryPaths?.includes(category) ||
                    (item as CMSProduct).categoryPath === category)) &&
              `${item.title} ${"sku" in item ? item.sku || "" : ""} ${item.id}`
                .toLocaleLowerCase("ru")
                .includes(query),
          )
        : [];
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const previewHref =
    editor?.kind === "posts"
      ? `/blog/${editor.item.slug}`
      : editor?.kind === "products"
        ? `/product/${encodeURIComponent(editor.item.id)}`
        : "";

  return (
    <div className="cms-root">
      <div className="cms-layout" inert={reauth || undefined}>
        <aside className={`cms-sidebar ${menuOpen ? "is-open" : ""}`}>
          <a href="/" target="_blank" rel="noreferrer" className="cms-brand">
            <span className="cms-brand-monogram">V.</span>
            <div>
              <strong>
                VIP DECOR
                <br />
                DESIGN
              </strong>
              <small>УПРАВЛЕНИЕ САЙТОМ</small>
            </div>
          </a>
          <span className="cms-nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</span>
          <nav aria-label="Разделы CMS">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`cms-nav-item ${tab === id ? "is-active" : ""}`}
                aria-label={label}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => switchTab(id)}
              >
                <Icon size={19} />
                <span>{label}</span>
                {id === "inquiries" && newInquiries.length > 0 && (
                  <b>{newInquiries.length}</b>
                )}
              </button>
            ))}
          </nav>
          <div className="cms-sidebar-bottom">
            <a href="/" target="_blank" rel="noreferrer">
              <ExternalLink size={17} />
              Открыть сайт
              <ArrowUpRight size={15} />
            </a>
            <div className="cms-account">
              <span>{session.username?.slice(0, 1).toUpperCase() || "A"}</span>
              <div>
                <strong>{session.username}</strong>
                <small>Администратор</small>
              </div>
              <button
                className="cms-icon-button"
                aria-label="Выйти"
                onClick={() => void logout()}
                disabled={pending || mediaPending}
              >
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </aside>
        {menuOpen && (
          <button
            className="cms-menu-backdrop"
            aria-label="Закрыть меню"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <div className="cms-workspace">
          <header className="cms-topbar">
            <div className="cms-inline">
              <button
                className="cms-icon-button cms-mobile-menu"
                ref={menuButtonRef}
                aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(!menuOpen)}
              >
                {menuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
              <span className="cms-breadcrumb">
                Управление сайтом <span>/</span>{" "}
                <strong>{activeTab.label}</strong>
              </span>
            </div>
            <span className="cms-topbar-site">
              <i />
              vip2d.ru
            </span>
          </header>
          <main className="cms-main">
            <div className="cms-page-heading">
              <div>
                {editor && (
                  <button
                    className="cms-back"
                    onClick={() => switchTab(editor.kind)}
                  >
                    <ArrowLeft size={15} />К списку
                  </button>
                )}
                <h1>
                  {editor
                    ? editor.kind === "inquiries"
                      ? "Заявка клиента"
                      : editor.item.version === 0
                        ? editor.kind === "posts"
                          ? "Новая статья"
                          : "Новый товар"
                        : editor.item.title
                    : titles[tab]}
                </h1>
                <p>
                  {editor
                    ? editor.kind === "inquiries"
                      ? `Обращение от ${formatDate(editor.item.createdAt || editor.item.receivedAt)}`
                      : dirty
                        ? "Есть несохранённые изменения"
                        : editor.item.version === 0
                          ? "Подготовьте материал и сохраните его, когда будет готово."
                          : "Все изменения сохранены"
                    : subtitles[tab]}
                </p>
              </div>
              <div className="cms-heading-actions">
                {editor ? (
                  <>
                    {previewHref &&
                      editor.item.status === "published" &&
                      editor.item.version > 0 && (
                        <a
                          className="cms-button cms-secondary"
                          href={previewHref}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink size={16} />
                          <span>На сайте</span>
                        </a>
                      )}
                    <button
                      className="cms-button cms-primary"
                      type="submit"
                      form="cms-editor-form"
                      disabled={
                        pending ||
                        mediaPending ||
                        Object.values(invalidFields).some(Boolean)
                      }
                    >
                      <Save size={17} />
                      {pending
                        ? "Сохраняем…"
                        : mediaPending
                          ? "Загружаем…"
                          : "Сохранить"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="cms-icon-button cms-refresh"
                      aria-label="Обновить данные"
                      disabled={loading}
                      onClick={() => void loadData()}
                    >
                      <RefreshCw
                        className={loading ? "cms-spin" : ""}
                        size={18}
                      />
                    </button>
                    {(tab === "posts" || tab === "products") && (
                      <button
                        className="cms-button cms-primary"
                        disabled={!content}
                        onClick={() => createItem(tab)}
                      >
                        <Plus size={17} />
                        {tab === "posts" ? "Новая статья" : "Добавить товар"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            {notice && (
              <div className="cms-toast" role="status">
                <Check size={17} />
                {notice}
                <button
                  className="cms-icon-button"
                  aria-label="Закрыть уведомление"
                  onClick={() => setNotice("")}
                >
                  <X size={15} />
                </button>
              </div>
            )}
            {error && (
              <div className="cms-alert" role="alert">
                <CircleAlert size={20} />
                <div>
                  <p>{error}</p>
                  {conflict && editor ? (
                    <button
                      className="cms-text-button"
                      onClick={() => void reloadEditor()}
                    >
                      Загрузить последнюю версию
                    </button>
                  ) : (
                    !editor && (
                      <button
                        className="cms-text-button"
                        onClick={() => void loadData()}
                      >
                        Повторить загрузку
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
            {Object.values(invalidFields).some(Boolean) && (
              <p className="cms-error" role="alert">
                Исправьте дополнительные данные: варианты должны быть объектом с
                массивом исполнений, таблица — объектом с массивами headers и
                rows. Сохранение станет доступно после исправления.
              </p>
            )}
            {loading && !content ? (
              <div className="cms-loading" role="status">
                <RefreshCw size={22} className="cms-spin" />
                <p>Загружаем материалы и заявки…</p>
              </div>
            ) : (
              content && (
                <>
                  {editor ? (
                    <form id="cms-editor-form" onSubmit={save}>
                      <fieldset disabled={pending || mediaPending}>
                        <div className="cms-editor-meta">
                          {editor.kind === "inquiries" ? (
                            <Badge status={editor.item.status}>
                              {inquiryLabels[editor.item.status]}
                            </Badge>
                          ) : (
                            <Badge status={editor.item.status}>
                              {publicationLabels[editor.item.status]}
                            </Badge>
                          )}
                          <span>
                            {editor.item.version > 0
                              ? `Версия ${editor.item.version}`
                              : "Новая запись"}
                          </span>
                        </div>
                        {editor.kind === "posts" ? (
                          <PostEditor
                            item={editor.item}
                            onChange={(item) =>
                              setEditor({ kind: "posts", item })
                            }
                            content={content}
                            upload={upload}
                            onInvalid={(key, invalid) =>
                              setInvalidFields((current) => ({
                                ...current,
                                [key]: invalid,
                              }))
                            }
                          />
                        ) : editor.kind === "products" ? (
                          <ProductEditor
                            item={editor.item}
                            onChange={(item) =>
                              setEditor({ kind: "products", item })
                            }
                            content={content}
                            upload={upload}
                            onInvalid={(key, invalid) =>
                              setInvalidFields((current) => ({
                                ...current,
                                [key]: invalid,
                              }))
                            }
                          />
                        ) : (
                          <InquiryDetail
                            item={editor.item}
                            onChange={(item) =>
                              setEditor({ kind: "inquiries", item })
                            }
                          />
                        )}
                        <div className="cms-editor-footer">
                          <button
                            type="button"
                            className="cms-button cms-secondary"
                            onClick={() => switchTab(editor.kind)}
                          >
                            Закрыть
                          </button>
                          {editor.kind !== "inquiries" &&
                            editor.item.version > 0 && (
                              <button
                                type="button"
                                className="cms-button cms-danger"
                                onClick={() => void remove()}
                              >
                                <Trash2 size={16} />
                                Удалить запись
                              </button>
                            )}
                          <button
                            className="cms-button cms-primary"
                            type="submit"
                            disabled={Object.values(invalidFields).some(
                              Boolean,
                            )}
                          >
                            <Save size={16} />
                            Сохранить изменения
                          </button>
                        </div>
                      </fieldset>
                    </form>
                  ) : tab === "overview" ? (
                    <>
                      <div className="cms-stats">
                        {[
                          {
                            label: "Новые заявки",
                            value: newInquiries.length,
                            icon: MessageSquare,
                            hint: "Ожидают вашего ответа",
                            tab: "inquiries",
                            tone: "green",
                          },
                          {
                            label: "Товары на сайте",
                            value: content.products.filter(
                              (item) => item.status === "published",
                            ).length,
                            icon: Package,
                            hint: `${content.products.filter((item) => item.status === "draft").length} в черновиках`,
                            tab: "products",
                            tone: "sand",
                          },
                          {
                            label: "Статьи в блоге",
                            value: content.posts.filter(
                              (item) => item.status === "published",
                            ).length,
                            icon: FileText,
                            hint: `${content.posts.filter((item) => item.status === "draft").length} в черновиках`,
                            tab: "posts",
                            tone: "cream",
                          },
                        ].map(
                          ({
                            label,
                            value,
                            icon: Icon,
                            hint,
                            tab: target,
                            tone,
                          }) => (
                            <button
                              key={target}
                              className={`cms-stat cms-stat-${tone}`}
                              onClick={() => switchTab(target as Tab)}
                            >
                              <span className="cms-stat-heading">
                                {label}
                                <Icon size={21} />
                              </span>
                              <strong>{value}</strong>
                              <span className="cms-stat-hint">
                                {hint}
                                <ArrowUpRight size={17} />
                              </span>
                            </button>
                          ),
                        )}
                      </div>
                      <div className="cms-dashboard-grid">
                        <section className="cms-card">
                          <div className="cms-card-heading">
                            <div>
                              <h2>Последние обращения</h2>
                              <p>Каждый новый проект начинается с разговора.</p>
                            </div>
                            <button
                              className="cms-text-button"
                              onClick={() => switchTab("inquiries")}
                            >
                              Все заявки
                              <ArrowRightIcon />
                            </button>
                          </div>
                          {inquiries.length ? (
                            <div className="cms-inquiry-preview-list">
                              {[...inquiries]
                                .sort((a, b) =>
                                  (b.createdAt || "").localeCompare(
                                    a.createdAt || "",
                                  ),
                                )
                                .slice(0, 6)
                                .map((item) => (
                                  <button
                                    key={item.id}
                                    onClick={() =>
                                      openEditor({ kind: "inquiries", item })
                                    }
                                  >
                                    <span className="cms-avatar">
                                      {item.name?.slice(0, 1).toUpperCase() ||
                                        "К"}
                                    </span>
                                    <span className="cms-inquiry-preview-copy">
                                      <strong>
                                        {item.name || "Без имени"}
                                      </strong>
                                      <small>
                                        {item.context ||
                                          item.phone ||
                                          "Обращение с сайта"}
                                      </small>
                                    </span>
                                    <span className="cms-inquiry-preview-state">
                                      <Badge status={item.status}>
                                        {inquiryLabels[item.status]}
                                      </Badge>
                                      <small>
                                        {formatDate(
                                          item.createdAt || item.receivedAt,
                                        )}
                                      </small>
                                    </span>
                                    <ChevronRight size={16} />
                                  </button>
                                ))}
                            </div>
                          ) : (
                            <div className="cms-empty">
                              <MessageSquare size={32} />
                              <h3>Пока нет обращений</h3>
                              <p>
                                Заявки с форм сайта появятся здесь
                                автоматически.
                              </p>
                            </div>
                          )}
                        </section>
                        <aside className="cms-dashboard-aside">
                          <section className="cms-card cms-quick-actions">
                            <h2>Создать новое</h2>
                            <button onClick={() => createItem("posts")}>
                              <span className="cms-quick-icon">
                                <FileText size={20} />
                              </span>
                              <span>
                                <strong>Статью в блог</strong>
                                <small>Поделитесь идеей или советом</small>
                              </span>
                              <Plus size={18} />
                            </button>
                            <button onClick={() => createItem("products")}>
                              <span className="cms-quick-icon">
                                <Package size={20} />
                              </span>
                              <span>
                                <strong>Товар в каталог</strong>
                                <small>Пополните вашу коллекцию</small>
                              </span>
                              <Plus size={18} />
                            </button>
                          </section>
                          <section className="cms-mail-note">
                            <span className="cms-eyebrow">
                              ВАЖНОЕ О ЗАЯВКАХ
                            </span>
                            <h2>
                              Все обращения
                              <br />
                              сохраняются здесь
                            </h2>
                            <p>
                              Проверяйте раздел «Заявки», чтобы не пропустить
                              новый проект. Почтовые уведомления подключим
                              позже.
                            </p>
                            <MessageSquare size={48} strokeWidth={1} />
                          </section>
                        </aside>
                      </div>
                    </>
                  ) : (
                    <section className="cms-card cms-list-card">
                      <div className="cms-toolbar">
                        <label className="cms-search">
                          <Search size={18} />
                          <input
                            aria-label="Поиск"
                            type="search"
                            value={search}
                            placeholder={
                              tab === "inquiries"
                                ? "Имя, телефон или текст заявки…"
                                : tab === "products"
                                  ? "Название или артикул…"
                                  : "Найти статью…"
                            }
                            onChange={(event) => {
                              setSearch(event.target.value);
                              setPage(1);
                            }}
                          />
                        </label>
                        <select
                          aria-label="Фильтр по статусу"
                          value={status}
                          onChange={(event) => {
                            setStatus(event.target.value);
                            setPage(1);
                          }}
                        >
                          <option value="all">Все статусы</option>
                          {Object.entries(
                            tab === "inquiries"
                              ? inquiryLabels
                              : publicationLabels,
                          ).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {tab !== "inquiries" && (
                          <select
                            aria-label="Фильтр по категории"
                            value={category}
                            onChange={(event) => {
                              setCategory(event.target.value);
                              setPage(1);
                            }}
                          >
                            <option value="all">
                              {tab === "posts"
                                ? "Все рубрики"
                                : "Все категории"}
                            </option>
                            {tab === "posts"
                              ? content.blogCategories.map((item) => (
                                  <option key={item.slug} value={item.slug}>
                                    {item.title}
                                  </option>
                                ))
                              : content.categories.map((item) => (
                                  <option key={item.path} value={item.path}>
                                    {item.title}
                                  </option>
                                ))}
                          </select>
                        )}
                      </div>
                      <div className="cms-results-count">
                        Найдено: {filtered.length}
                      </div>
                      {pageItems.length ? (
                        <div className="cms-table-scroll">
                          <table className="cms-table">
                            <thead>
                              <tr>
                                <th>
                                  {tab === "inquiries"
                                    ? "Клиент"
                                    : tab === "posts"
                                      ? "Статья"
                                      : "Товар"}
                                </th>
                                <th>
                                  {tab === "inquiries"
                                    ? "Интерес"
                                    : "Категория"}
                                </th>
                                <th>
                                  {tab === "products"
                                    ? "Цена"
                                    : tab === "posts"
                                      ? "Публикация"
                                      : "Получена"}
                                </th>
                                <th>Статус</th>
                                <th>
                                  <span className="cms-sr-only">Действия</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {pageItems.map((entry) => {
                                if (tab === "inquiries") {
                                  const item = entry as CMSInquiry;
                                  return (
                                    <tr key={item.id}>
                                      <td>
                                        <button
                                          className="cms-table-title"
                                          onClick={() =>
                                            openEditor({
                                              kind: "inquiries",
                                              item,
                                            })
                                          }
                                        >
                                          <span className="cms-avatar">
                                            {item.name
                                              ?.slice(0, 1)
                                              .toUpperCase() || "К"}
                                          </span>
                                          <span>
                                            <strong>
                                              {item.name || "Без имени"}
                                            </strong>
                                            <small>{item.phone}</small>
                                          </span>
                                        </button>
                                      </td>
                                      <td className="cms-table-context">
                                        {item.context || "Обращение с сайта"}
                                      </td>
                                      <td className="cms-table-date">
                                        {formatDate(
                                          item.createdAt || item.receivedAt,
                                        )}
                                      </td>
                                      <td>
                                        <Badge status={item.status}>
                                          {inquiryLabels[item.status]}
                                        </Badge>
                                      </td>
                                      <td>
                                        <button
                                          className="cms-icon-button"
                                          aria-label={`Открыть заявку ${item.name || item.id}`}
                                          onClick={() =>
                                            openEditor({
                                              kind: "inquiries",
                                              item,
                                            })
                                          }
                                        >
                                          <ChevronRight size={18} />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                }
                                const item = entry as CMSPost | CMSProduct;
                                const isPost = tab === "posts";
                                const src = isPost
                                  ? (item as CMSPost).image.src
                                  : (item as CMSProduct).image;
                                const categoryLabel = isPost
                                  ? content.blogCategories.find(
                                      (category) =>
                                        category.slug === item.category,
                                    )?.title || item.category
                                  : item.category;
                                return (
                                  <tr key={item.id}>
                                    <td>
                                      <button
                                        className="cms-table-title"
                                        onClick={() =>
                                          openEditor({
                                            kind: tab,
                                            item,
                                          } as Editor)
                                        }
                                      >
                                        {src ? (
                                          <img
                                            src={src}
                                            alt=""
                                            loading="lazy"
                                          />
                                        ) : (
                                          <span className="cms-table-image-empty">
                                            {isPost ? (
                                              <FileText size={20} />
                                            ) : (
                                              <Package size={20} />
                                            )}
                                          </span>
                                        )}
                                        <span>
                                          <strong>{item.title}</strong>
                                          <small>
                                            {isPost
                                              ? `/blog/${(item as CMSPost).slug}`
                                              : `Арт. ${(item as CMSProduct).sku || "—"}`}
                                          </small>
                                        </span>
                                      </button>
                                    </td>
                                    <td>{categoryLabel}</td>
                                    <td>
                                      {isPost
                                        ? formatDate(
                                            (item as CMSPost).datePublished,
                                          )
                                        : formatMoney(
                                            (item as CMSProduct).price,
                                          )}
                                    </td>
                                    <td>
                                      <Badge status={item.status}>
                                        {publicationLabels[item.status]}
                                      </Badge>
                                    </td>
                                    <td>
                                      <button
                                        className="cms-icon-button"
                                        aria-label={`Редактировать ${item.title}`}
                                        onClick={() =>
                                          openEditor({
                                            kind: tab,
                                            item,
                                          } as Editor)
                                        }
                                      >
                                        <ChevronRight size={18} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="cms-empty">
                          <Search size={30} />
                          <h3>
                            {search || status !== "all" || category !== "all"
                              ? "Ничего не найдено"
                              : tab === "inquiries"
                                ? "Пока нет заявок"
                                : "Здесь пока пусто"}
                          </h3>
                          <p>
                            {search || status !== "all" || category !== "all"
                              ? "Измените поисковый запрос или сбросьте фильтры."
                              : tab === "inquiries"
                                ? "Обращения с сайта появятся здесь."
                                : "Добавьте первую запись, чтобы начать."}
                          </p>
                          {(search ||
                            status !== "all" ||
                            category !== "all") && (
                            <button
                              className="cms-button cms-secondary"
                              onClick={() => {
                                setSearch("");
                                setStatus("all");
                                setCategory("all");
                                setPage(1);
                              }}
                            >
                              Сбросить фильтры
                            </button>
                          )}
                        </div>
                      )}
                      <div className="cms-pagination">
                        <span>
                          {filtered.length
                            ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} из ${filtered.length}`
                            : "0 записей"}
                        </span>
                        <div className="cms-inline">
                          <button
                            className="cms-icon-button"
                            aria-label="Предыдущая страница"
                            disabled={currentPage === 1}
                            onClick={() => setPage(currentPage - 1)}
                          >
                            <ChevronLeft size={18} />
                          </button>
                          <span>
                            {currentPage} / {totalPages}
                          </span>
                          <button
                            className="cms-icon-button"
                            aria-label="Следующая страница"
                            disabled={currentPage === totalPages}
                            onClick={() => setPage(currentPage + 1)}
                          >
                            <ChevronRight size={18} />
                          </button>
                        </div>
                      </div>
                    </section>
                  )}
                </>
              )
            )}
            <footer className="cms-workspace-footer">
              VIP DECOR DESIGN<span>Ваш сайт. Ваше пространство.</span>
            </footer>
          </main>
        </div>
      </div>
      {reauth && (
        <Auth
          setup={false}
          setupToken=""
          expired
          onAuthenticated={(next) => {
            setSession(next);
            setReauth(false);
            setError("");
            setNotice("Вы вошли в систему. Можно продолжить работу.");
          }}
        />
      )}
    </div>
  );
}

function ArrowRightIcon() {
  return <ArrowUpRight size={16} />;
}
