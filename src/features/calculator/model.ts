/** Verified against https://vip2d.ru/#rec221002251 on 2026-09-12. */
export const FABRICS = [
  { value: 570, label: "Эконом" },
  { value: 1950, label: "Средний" },
  { value: 3750, label: "Премиум" },
] as const;

export const SEWING = [
  { value: 150, label: "Портьера" },
  { value: 120, label: "Тюль" },
] as const;

export const MOUNTS = [
  { value: 270, label: "Лента эконом" },
  { value: 390, label: "Лента средняя" },
  { value: 1080, label: "Люверс" },
  { value: 600, label: "Петли" },
  { value: 415, label: "Липучка" },
] as const;

export interface CalculatorInput {
  fabric: number;
  sewing: number;
  mount: number;
  width: number;
}

// The published range's invalid value="метр" resolves to 4 in the browser.
export const DEFAULT_INPUT: CalculatorInput = {
  fabric: 570,
  sewing: 150,
  mount: 270,
  width: 4,
};

export function calculateCurtains({
  fabric,
  sewing,
  mount,
  width,
}: CalculatorInput): number {
  if (
    !FABRICS.some((item) => item.value === fabric) ||
    !SEWING.some((item) => item.value === sewing) ||
    !MOUNTS.some((item) => item.value === mount) ||
    !Number.isInteger(width) ||
    width < 1 ||
    width > 6
  ) {
    throw new RangeError(
      "Выберите опубликованные тарифы и ширину от 1 до 6 метров.",
    );
  }
  // Tilda tcalc__calculate: Math.round(10 * result) / 10.
  return Math.round((fabric + sewing + mount) * width * 10) / 10;
}

export const formatPrice = (amount: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(amount);
