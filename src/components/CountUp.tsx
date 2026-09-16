import { useEffect, useRef } from "react";
import { useInView, useReducedMotion } from "framer-motion";

/** Count once on entry, keeping the final value available to screen readers. */
export function CountUp({
  value,
  decimals = 0,
  suffix = "",
}: {
  value: number;
  decimals?: number;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, { once: true, amount: 0.5 });
  const reduced = useReducedMotion();
  const format = (number: number) =>
    number.toLocaleString("ru-RU", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) + suffix;
  const final = format(value);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const formatFrame = (number: number) =>
      number.toLocaleString("ru-RU", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }) + suffix;
    if (reduced) {
      element.textContent = final;
      return;
    }
    element.textContent = formatFrame(0);
    if (!visible) return;
    let frame = 0;
    let start: number | undefined;
    const tick = (time: number) => {
      start ??= time;
      const progress = Math.min((time - start) / 500, 1);
      const current = value * (1 - (1 - progress) ** 3);
      element.textContent =
        progress === 1
          ? final
          : formatFrame(decimals ? current : Math.floor(current));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, reduced, value, decimals, suffix, final]);

  return (
    <span
      aria-label={final}
      style={{ display: "inline-grid", fontVariantNumeric: "tabular-nums" }}
    >
      <span
        aria-hidden="true"
        style={{ gridArea: "1 / 1", visibility: "hidden" }}
      >
        {final}
      </span>
      <span
        ref={ref}
        aria-hidden="true"
        data-count-up
        style={{ gridArea: "1 / 1" }}
      >
        {reduced ? final : format(0)}
      </span>
    </span>
  );
}
