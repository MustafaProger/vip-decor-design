/** Rates confirmed by the owner on 2026-10-11. */
export const FABRICS = [
  { value: 950, label: "Эконом" },
  { value: 2950, label: "Средний" },
  { value: 9500, max: 55000, label: "Премиум" },
] as const;

export const SEWING = [
  { value: 250, label: "Портьера" },
  { value: 220, label: "Тюль" },
] as const;

export const MOUNTS = [
  { value: "tape", price: 250, label: "Лента" },
  { value: "narrow-tape", price: 150, label: "Узкая лента" },
  { value: "eyelet-tape", price: 250, label: "Лента люверсная" },
  { value: "eyelet", price: 1080, label: "Люверс" },
  { value: "loops", price: 600, label: "Петли" },
  { value: "velcro", price: 350, label: "Липучка" },
] as const;

export interface CalculatorInput {
  fabric: number;
  sewing: number;
  mount: string;
  width: number;
}

// The published range's invalid value="метр" resolves to 4 in the browser.
export const DEFAULT_INPUT: CalculatorInput = {
  fabric: 950,
  sewing: 250,
  mount: "tape",
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
  const mounting = MOUNTS.find((item) => item.value === mount)!;
  return Math.round((fabric + sewing + mounting.price) * width * 10) / 10;
}

export const formatPrice = (amount: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(amount);

export function calculateCurtainsRange(input: CalculatorInput) {
  const min = calculateCurtains(input);
  const fabric = FABRICS.find((item) => item.value === input.fabric)!;
  const max = "max" in fabric ? min + (fabric.max - fabric.value) * input.width : min;
  return { min, max };
}
