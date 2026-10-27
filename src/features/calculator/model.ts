/** Rates confirmed by the owner on 2026-10-12. */
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
  { value: "eyelet", price: 280, label: "Люверс с установкой" },
  { value: "loops", price: 600, label: "Петли" },
  { value: "velcro", price: 350, label: "Липучка" },
] as const;

export interface CalculatorInput {
  fabric: number;
  sewing: number;
  mount: string;
  width: number;
  sewingLength: number;
  eyeletCount: number;
}

// Owner example: 6 × 950 + 6 × 150 + 15 × 220 = 9 900 ₽.
export const DEFAULT_INPUT: CalculatorInput = {
  fabric: 950,
  sewing: 220,
  mount: "narrow-tape",
  width: 6,
  sewingLength: 15,
  eyeletCount: 1,
};

export function calculateCurtains({
  fabric,
  sewing,
  mount,
  width,
  sewingLength,
  eyeletCount,
}: CalculatorInput): number {
  if (
    !FABRICS.some((item) => item.value === fabric) ||
    !SEWING.some((item) => item.value === sewing) ||
    !MOUNTS.some((item) => item.value === mount) ||
    !Number.isInteger(width) ||
    width < 1 ||
    width > 6 ||
    !Number.isFinite(sewingLength) || sewingLength <= 0 ||
    !Number.isSafeInteger(eyeletCount) || eyeletCount < 1
  ) {
    throw new RangeError(
      "Выберите тарифы, метраж ткани от 1 до 6 м, положительную длину строчки и целое количество люверсов.",
    );
  }
  const mounting = MOUNTS.find((item) => item.value === mount)!;
  const mountQuantity = mount === "eyelet" ? eyeletCount : width;
  return Math.round((fabric * width + sewing * sewingLength + mounting.price * mountQuantity) * 100) / 100;
}

export const formatPrice = (amount: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(amount);

export function calculateCurtainsRange(input: CalculatorInput) {
  const min = calculateCurtains(input);
  const fabric = FABRICS.find((item) => item.value === input.fabric)!;
  const max = "max" in fabric ? min + (fabric.max - fabric.value) * input.width : min;
  return { min, max };
}
