export interface BmiResult {
  value: number; // rounded to 1 decimal
  category: "underweight" | "normal" | "overweight" | "obese";
  /** WHO classification label, e.g. "Normal (18.5–24.9)" */
  label: string;
}

/**
 * BMI = weight(kg) / (height(m))^2. Returns null when inputs missing or invalid.
 * Categories follow WHO adult classification.
 */
export function computeBmi(
  heightCm: number | null | undefined,
  weightKg: number | null | undefined,
): BmiResult | null {
  if (heightCm == null || weightKg == null) return null;
  if (heightCm <= 0 || weightKg <= 0) return null;
  const heightM = heightCm / 100;
  const value = Math.round((weightKg / (heightM * heightM)) * 10) / 10;
  if (!Number.isFinite(value)) return null;
  // Advisory guard — absurd inputs (e.g. Wt 500 Ht 30) should not show a badge.
  if (value < 5 || value > 100) return null;

  let category: BmiResult["category"];
  let label: string;
  if (value < 18.5) {
    category = "underweight";
    label = "Underweight (< 18.5)";
  } else if (value < 25) {
    category = "normal";
    label = "Normal (18.5–24.9)";
  } else if (value < 30) {
    category = "overweight";
    label = "Overweight (25–29.9)";
  } else {
    category = "obese";
    label = "Obese (≥ 30)";
  }

  return { value, category, label };
}
