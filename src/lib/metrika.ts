export type LeadGoal =
  "lead_project" | "lead_selection" | "lead_calculator" | "lead_cart";

export type ContactGoal =
  | "click_phone"
  | "click_whatsapp"
  | "click_telegram"
  | "click_max"
  | "click_email";

type MetrikaArguments =
  | [counterId: number, method: "reachGoal", goal: LeadGoal | ContactGoal]
  | [counterId: number, method: "init", options: Record<string, unknown>];

type Metrika = ((...args: MetrikaArguments) => void) & {
  a?: MetrikaArguments[];
  l?: number;
};

declare global {
  interface Window {
    ym?: Metrika;
  }
}

// The recovered production site had no loader. Connect the owner's existing
// counter once; keep local previews and the admin entry point free of analytics.
export function initializeMetrika(): void {
  try {
    if (
      typeof window === "undefined" ||
      !["vip2d.ru", "www.vip2d.ru"].includes(window.location.hostname) ||
      /^\/admin(?:\/|$)/.test(window.location.pathname) ||
      window.ym
    )
      return;

    const queue: Metrika = (...args) => {
      (queue.a ||= []).push(args);
    };
    queue.l = Date.now();
    window.ym = queue;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://mc.yandex.ru/metrika/tag.js";
    document.head.appendChild(script);
    queue(67314823, "init", {});
  } catch {
    // A blocked loader must not interfere with the site.
  }
}

// Analytics must never interrupt a form or link.
export function reachGoal(goal: LeadGoal | ContactGoal): void {
  try {
    if (typeof window !== "undefined" && typeof window.ym === "function") {
      window.ym(67314823, "reachGoal", goal);
    }
  } catch {
    // The counter may be blocked or unavailable.
  }
}

const trackedInquiryIds = new Set<string>();

export function trackAcceptedInquiry(goal: LeadGoal, inquiryId: string): void {
  // Repeated saves/retries can return the same server ID, even across SPA routes.
  if (trackedInquiryIds.has(inquiryId)) return;
  trackedInquiryIds.add(inquiryId);
  reachGoal(goal);
}

export function contactGoal(href: string): ContactGoal | undefined {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return;
  }
  switch (url.protocol) {
    case "tel:":
      return "click_phone";
    case "mailto:":
      return "click_email";
    case "whatsapp:":
      return "click_whatsapp";
    case "tg:":
      return "click_telegram";
    case "max:":
      return "click_max";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return;
  const host = url.hostname.replace(/^www\./, "");
  if (
    ["wa.me", "whatsapp.com", "api.whatsapp.com", "web.whatsapp.com"].includes(
      host,
    )
  )
    return "click_whatsapp";
  if (["t.me", "telegram.me", "telegram.dog"].includes(host))
    return "click_telegram";
  if (host === "max.ru") return "click_max";
}

export function installContactTracking(): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.type === "click" ? event.button !== 0 : event.button !== 1)
      return;
    const target = event.target;
    const element =
      target instanceof Element
        ? target
        : target instanceof Node
          ? target.parentElement
          : null;
    const anchor = element?.closest<HTMLAnchorElement>("a[href]");
    if (!anchor) return;
    const goal = contactGoal(anchor.href);
    if (goal) reachGoal(goal);
  };
  // Capture also covers menus that close on click and links in portal dialogs.
  document.addEventListener("click", onClick, true);
  document.addEventListener("auxclick", onClick, true);
  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("auxclick", onClick, true);
  };
}
