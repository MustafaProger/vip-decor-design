import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

type Visit = { y?: number; shown?: number };
const prefix = "vip-navigation-v2:";
const memory = new Map<string, Visit>();

export function readVisit(key: string): Visit {
  if (memory.has(key)) return memory.get(key)!;
  try {
    const value = JSON.parse(sessionStorage.getItem(prefix + key) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function saveVisit(key: string, change: Visit) {
  const value = { ...readVisit(key), ...change };
  memory.set(key, value);
  try {
    sessionStorage.setItem(prefix + key, JSON.stringify(value));
  } catch {
    /* memory fallback */
  }
}

export function visitKey(location: ReturnType<typeof useLocation>) {
  return location.key + ":" + location.pathname + location.search;
}

export function restoredVisitKey(
  location: ReturnType<typeof useLocation>,
  navigation: string,
) {
  const current = visitKey(location);
  if (navigation === "POP") {
    const saved = readVisit(current);
    if (typeof saved.y === "number" || typeof saved.shown === "number")
      return current;
  }
  const requested = location.state?.restoreVisit;
  return typeof requested === "string"
    ? requested
    : navigation === "POP"
      ? current
      : null;
}

/** Mounted with the route content, after asynchronous content is ready. */
export function useScrollMemory() {
  const location = useLocation();
  const navigation = useNavigationType();
  useLayoutEffect(() => {
    window.history.scrollRestoration = "manual";
    const key = restoredVisitKey(location, navigation);
    const saved = key ? readVisit(key).y : undefined;
    let lastY = window.scrollY;
    let restoring = typeof saved === "number" && Number.isFinite(saved);
    const restore = () => {
      if (!restoring) return;
      window.scrollTo({
        top: Math.max(0, saved!),
        left: 0,
        behavior: "instant",
      });
      lastY = window.scrollY;
    };
    const stop = () => {
      restoring = false;
    };
    const record = () => {
      lastY = window.scrollY;
      saveVisit(visitKey(location), { y: lastY });
    };
    const observer = new ResizeObserver(restore);
    if (restoring) {
      restore();
      observer.observe(document.body);
    } else if (!location.hash) {
      // REPLACE updates to filters/variants should not reset the page.
      if (navigation !== "REPLACE")
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      lastY = window.scrollY;
    }
    window.addEventListener("scroll", record, { passive: true });
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("pointerdown", stop, { passive: true });
    window.addEventListener("keydown", stop);
    const timer = window.setTimeout(stop, 1500);
    return () => {
      saveVisit(visitKey(location), { y: lastY });
      observer.disconnect();
      clearTimeout(timer);
      window.removeEventListener("scroll", record);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [location.key]);
}
