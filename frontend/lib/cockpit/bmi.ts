export interface BmiResult {
  value: number; // rounded to 1 decimal
  category: "underweight" | "normal" | "overweight" | "obese";
  /** WHO classification label, e.g. "Normal (18.5–24.9)" */
  label: string;
}

/** Human-readable BMI formula (UI tooltips + help popover). */
export const BMI_FORMULA = "weight (kg) ÷ height (m)²";

/** Display labels — full name with abbreviation in brackets. */
export const BMI_DISPLAY_LABEL = "Body Mass Index (BMI)";
export const BSA_DISPLAY_LABEL = "Body Surface Area (BSA)";
export const DERIVED_VITALS_CARD_LABEL = `${BMI_DISPLAY_LABEL} · ${BSA_DISPLAY_LABEL}`;

/** Shaded normal band on BMI trend charts (obj-27 / vit-11). */
export const BMI_REFERENCE_BAND: [number, number] = [18.5, 24.9];

/** WHO adult BMI classification bands — single source for help UI + docs. */
export const BMI_WHO_ADULT_RANGES = [
  { category: "underweight" as const, label: "Underweight", range: "< 18.5" },
  { category: "normal" as const, label: "Normal", range: "18.5–24.9" },
  { category: "overweight" as const, label: "Overweight", range: "25–29.9" },
  { category: "obese" as const, label: "Obese", range: "≥ 30" },
] as const;

/** Mosteller BSA formula (matches `computeBsa` in vitals-derive.ts). */
export const BSA_MOSTELLER_FORMULA =
  "Mosteller — √(height cm × weight kg ÷ 3600) → m²";

export const BSA_CLINICAL_NOTE =
  "Used for dosing and clinical calculations; no single universal normal range.";

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
