/**
 * Chart medication helpers (Medical history — patient_medications).
 *
 * Distinct from Rx Plan medicines. Reuses the shared line parser but maps
 * to the chart-med clinical model (Rx course duration is ignored; relative
 * on-drug start timing via started_ago_*; stop-timing when past).
 */

import type { AiParsedMedicine } from "@/lib/api/medicine-parse";
import type { ParsedMedicineLine } from "@/lib/cockpit/medicine-line-parse";
import { parseDosePattern } from "@/lib/cockpit/medicine-line-parse";
import { formatDoseLabel, getFrequencyLegacyLabel, getFoodTimingLabel, FOOD_TIMING_OPTIONS, DOSE_UNIT_OPTIONS, defaultDoseUnitForForm, isTopicalForm } from "@/lib/medicineCodes";
import type { DrugMasterRow } from "@/types/drug-master";
import type {
  CreatePatientMedicationPayload,
  MedicationStrengthComponent,
  PatientConditionAgoUnit,
  PatientConditionStatus,
  PatientMedication,
  PatientMedicationIntakePattern,
  PatientMedicationSource,
  PatientMedicationStatus,
  PatientMedicationStopReason,
} from "@/types/patient-chart";
import type { DoseUnit, FoodTiming, FrequencyCode, StrengthUnit } from "@/types/prescription";

/** Meal-time frequency chips (SOS maps to PRN). */
export const CHART_MED_MEAL_FREQUENCY_OPTIONS: ReadonlyArray<{
  code: FrequencyCode;
  label: string;
}> = [
  { code: "OD", label: "OD" },
  { code: "BID", label: "BID" },
  { code: "TID", label: "TID" },
  { code: "QID", label: "QID" },
  { code: "QHS", label: "HS" },
  { code: "PRN", label: "SOS" },
  { code: "STAT", label: "STAT" },
];

/** Interval / weekly frequency chips — no dose schedule row. */
export const CHART_MED_INTERVAL_FREQUENCY_OPTIONS: ReadonlyArray<{
  code: FrequencyCode;
  label: string;
}> = [
  { code: "Q4H", label: "Q4H" },
  { code: "Q6H", label: "Q6H" },
  { code: "Q8H", label: "Q8H" },
  { code: "Q12H", label: "Q12H" },
  { code: "Q24H", label: "Q24H" },
  { code: "QW", label: "QW" },
];

/** @deprecated Use CHART_MED_MEAL_FREQUENCY_OPTIONS — kept for tests. */
export const CHART_MED_FREQUENCY_OPTIONS = CHART_MED_MEAL_FREQUENCY_OPTIONS;

export const CHART_MED_INTERVAL_FREQUENCY_CODES = [
  "Q4H",
  "Q6H",
  "Q8H",
  "Q12H",
  "Q24H",
  "QW",
] as const satisfies readonly FrequencyCode[];

export const STRENGTH_UNIT_OPTIONS: ReadonlyArray<{
  unit: StrengthUnit;
  label: string;
}> = [
  { unit: "mg", label: "mg" },
  { unit: "g", label: "g" },
  { unit: "mcg", label: "mcg" },
  { unit: "iu", label: "IU" },
  { unit: "pct", label: "%" },
];

/** Top strength units shown as chips; rest in the More dropdown. */
export const CHART_MED_STRENGTH_UNIT_PRIMARY = ["mg", "mcg", "g"] as const satisfies readonly StrengthUnit[];

/** Top dose units shown as chips; rest in the More combobox. */
export const CHART_MED_DOSE_UNIT_PRIMARY = ["tab", "cap", "spoon"] as const satisfies readonly DoseUnit[];

export type ChartMedFrequencyUiMode = "meals" | "hours";

/** Four meal-linked slots — swapped with hour slots via UI toggle. */
export const CHART_MED_FREQUENCY_MEAL_SLOTS: ReadonlyArray<{
  code: FrequencyCode;
  label: string;
  tooltip: string;
}> = [
  { code: "OD", label: "OD", tooltip: "Once daily" },
  { code: "BID", label: "BID", tooltip: "Twice daily" },
  { code: "TID", label: "TID", tooltip: "Three times daily" },
  { code: "QID", label: "QID", tooltip: "Four times daily" },
];

/** Hour-linked slots — same positions as meal slots when toggle is on Hours. */
export const CHART_MED_FREQUENCY_HOUR_SLOTS: ReadonlyArray<{
  code: FrequencyCode;
  label: string;
  tooltip: string;
}> = [
  { code: "Q24H", label: "Q24H", tooltip: "Every 24 hours" },
  { code: "Q12H", label: "Q12H", tooltip: "Every 12 hours" },
  { code: "Q8H", label: "Q8H", tooltip: "Every 8 hours" },
  { code: "Q6H", label: "Q6H", tooltip: "Every 6 hours" },
];

export const MEAL_TO_HOUR_SLOT_MAP: Partial<Record<FrequencyCode, FrequencyCode>> = {
  OD: "Q24H",
  BID: "Q12H",
  TID: "Q8H",
  QID: "Q6H",
};

export const HOUR_TO_MEAL_SLOT_MAP: Partial<Record<FrequencyCode, FrequencyCode>> = {
  Q24H: "OD",
  Q12H: "BID",
  Q8H: "TID",
  Q6H: "QID",
};

/** Always visible after the 4 swap slots. */
export const CHART_MED_FREQUENCY_TAIL_OPTIONS: ReadonlyArray<{
  code: FrequencyCode;
  label: string;
  tooltip: string;
}> = [
  { code: "QHS", label: "HS", tooltip: "At bedtime" },
  { code: "PRN", label: "SOS", tooltip: "As needed" },
  { code: "STAT", label: "STAT", tooltip: "Once (immediately)" },
];

/** Typable More suggestions for frequency (Q4H, QW, or free-text → CUSTOM). */
export const CHART_MED_FREQUENCY_MORE_SUGGESTIONS: ReadonlyArray<{
  code: FrequencyCode;
  label: string;
  tooltip: string;
}> = [
  { code: "Q4H", label: "Q4H", tooltip: "Every 4 hours" },
  { code: "QW", label: "QW", tooltip: "Once weekly" },
];

/** @deprecated Use meal/hour slot groups — kept for older tests. */
export const CHART_MED_FREQUENCY_CHIP_OPTIONS: ReadonlyArray<{
  code: FrequencyCode;
  label: string;
  tooltip: string;
  dividerBefore?: boolean;
}> = [
  ...CHART_MED_FREQUENCY_MEAL_SLOTS,
  ...CHART_MED_FREQUENCY_HOUR_SLOTS.slice(1).map((o, i) => ({
    ...o,
    dividerBefore: i === 0,
  })),
  ...CHART_MED_FREQUENCY_TAIL_OPTIONS.map((o, i) => ({
    ...o,
    dividerBefore: i === 0,
  })),
];

/** @deprecated Use CHART_MED_FREQUENCY_MORE_SUGGESTIONS */
export const CHART_MED_FREQUENCY_MORE_OPTIONS = CHART_MED_FREQUENCY_MORE_SUGGESTIONS;

export function frequencyUiModeFromCode(
  code: FrequencyCode | null | undefined,
): ChartMedFrequencyUiMode {
  if (!code || code === "CUSTOM") return "meals";
  if (code === "QHS" || code === "PRN" || code === "STAT") return "meals";
  if (isIntervalFrequency(code)) return "hours";
  return "meals";
}

export function isFrequencyMoreOrCustom(code: FrequencyCode | null | undefined): boolean {
  if (!code) return false;
  if (code === "CUSTOM") return true;
  return CHART_MED_FREQUENCY_MORE_SUGGESTIONS.some((o) => o.code === code);
}

/** Resolve typable frequency More input → structured code or CUSTOM text. */
export function resolveFrequencyMoreInput(raw: string): {
  code: FrequencyCode;
  frequency: string;
} | null {
  const text = raw.trim();
  if (!text) return null;

  const lower = text.toLowerCase();
  const aliases: Record<string, FrequencyCode> = {
    q4h: "Q4H",
    "4h": "Q4H",
    qw: "QW",
    weekly: "QW",
    q24h: "Q24H",
    q12h: "Q12H",
    q8h: "Q8H",
    q6h: "Q6H",
  };

  const aliasHit = aliases[lower];
  if (aliasHit) {
    return { code: aliasHit, frequency: getChartFrequencyLabel(aliasHit) };
  }

  for (const opt of CHART_MED_FREQUENCY_MORE_SUGGESTIONS) {
    if (opt.code.toLowerCase() === lower || opt.label.toLowerCase() === lower) {
      return { code: opt.code, frequency: getChartFrequencyLabel(opt.code) };
    }
  }

  return { code: "CUSTOM", frequency: text };
}

export function resolveStrengthUnitInput(raw: string): StrengthUnit | "custom" | null {
  const text = raw.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const aliases: Record<string, StrengthUnit> = {
    mg: "mg",
    g: "g",
    gm: "g",
    mcg: "mcg",
    ug: "mcg",
    µg: "mcg",
    iu: "iu",
    "%": "pct",
    pct: "pct",
  };
  if (aliases[lower]) return aliases[lower];
  if (STRENGTH_UNIT_OPTIONS.some((o) => o.unit === lower || o.label.toLowerCase() === lower)) {
    return STRENGTH_UNIT_OPTIONS.find(
      (o) => o.unit === lower || o.label.toLowerCase() === lower,
    )!.unit;
  }
  return "custom";
}

export function resolveDoseUnitInput(raw: string): DoseUnit | "custom" | null {
  const text = raw.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const aliases: Record<string, DoseUnit> = {
    tab: "tab",
    tabs: "tab",
    cap: "cap",
    caps: "cap",
    spoon: "spoon",
    spoons: "spoon",
    ml: "ml",
    drop: "drops",
    drops: "drops",
    puff: "puff",
    puffs: "puff",
    sachet: "sachet",
    unit: "unit",
    units: "unit",
    application: "application",
  };
  if (aliases[lower]) return aliases[lower];
  const hit = DOSE_UNIT_OPTIONS.find(
    (o) => o.unit === lower || o.label.toLowerCase() === lower || o.plural.toLowerCase() === lower,
  );
  if (hit) return hit.unit;
  return "custom";
}

export function getChartFrequencyTooltip(code: FrequencyCode): string {
  const groups = [
    CHART_MED_FREQUENCY_MEAL_SLOTS,
    CHART_MED_FREQUENCY_HOUR_SLOTS,
    CHART_MED_FREQUENCY_TAIL_OPTIONS,
    CHART_MED_FREQUENCY_MORE_SUGGESTIONS,
  ];
  for (const group of groups) {
    const hit = group.find((o) => o.code === code);
    if (hit) return hit.tooltip;
  }
  return getChartFrequencyLabel(code);
}

/** True when dose uses a free-text unit in legacy `dose` (no enum unit). */
export function isCustomDoseUnit(med: Pick<PatientMedication, "dose_qty" | "dose_unit" | "dose">): boolean {
  return med.dose_qty != null && med.dose_unit == null && !!med.dose?.trim();
}

/** True when strength is free-text only (no structured value + unit). */
export function isCustomStrength(med: Pick<PatientMedication, "strength_value" | "strength_unit" | "strength">): boolean {
  return med.strength_value == null && med.strength_unit == null && !!med.strength?.trim();
}

/** Dose schedule chips shown after OD/BID/TID/QID/QHS is selected. */
export const DOSE_SCHEDULE_BY_FREQUENCY: Partial<
  Record<FrequencyCode, readonly string[]>
> = {
  OD: ["1-0-0", "0-1-0", "0-0-1"],
  BID: ["1-0-1", "1-1-0", "0-1-1"],
  TID: ["1-1-1"],
  QID: ["1-1-1-1"],
  QHS: ["0-0-1"],
};

const CHART_FREQUENCY_LABELS: Partial<Record<FrequencyCode, string>> = {
  Q4H: "Every 4 hours",
  Q6H: "Every 6 hours",
  Q8H: "Every 8 hours",
  Q12H: "Every 12 hours",
  Q24H: "Every 24 hours",
  QW: "Once weekly",
};

export function isIntervalFrequency(
  code: FrequencyCode | null | undefined,
): boolean {
  if (!code) return false;
  return (CHART_MED_INTERVAL_FREQUENCY_CODES as readonly string[]).includes(code);
}

export function doseScheduleOptionsForFrequency(
  code: FrequencyCode | null | undefined,
): readonly string[] {
  if (!code || isIntervalFrequency(code)) return [];
  return DOSE_SCHEDULE_BY_FREQUENCY[code] ?? [];
}

export function frequencySupportsDoseSchedule(
  code: FrequencyCode | null | undefined,
): boolean {
  return doseScheduleOptionsForFrequency(code).length > 0;
}

/** When a frequency has exactly one schedule pattern, return it (TID/QID/QHS). */
export function singleDoseScheduleForFrequency(
  code: FrequencyCode | null | undefined,
): string | null {
  const options = doseScheduleOptionsForFrequency(code);
  return options.length === 1 ? options[0]! : null;
}

/** Pick schedule when frequency changes — keep valid, auto-fill singleton, else clear. */
export function doseScheduleForFrequencyChange(
  code: FrequencyCode | null | undefined,
  currentSchedule: string | null | undefined,
): string | null {
  if (!code) return null;
  const options = doseScheduleOptionsForFrequency(code);
  if (options.length === 0) return null;
  if (currentSchedule && options.includes(currentSchedule)) return currentSchedule;
  if (options.length === 1) return options[0]!;
  return null;
}

export function getChartFrequencyLabel(
  code: FrequencyCode | null | undefined,
): string {
  if (!code) return "";
  if (code === "PRN") return "SOS";
  const meal = CHART_MED_MEAL_FREQUENCY_OPTIONS.find((o) => o.code === code);
  if (meal) return meal.label;
  const interval = CHART_MED_INTERVAL_FREQUENCY_OPTIONS.find((o) => o.code === code);
  if (interval) return interval.label;
  return CHART_FREQUENCY_LABELS[code] ?? getFrequencyLegacyLabel(code) ?? code;
}

/** Per-dose qty inferred from a schedule pattern when all non-zero slots match. */
export function doseQtyFromSchedule(pattern: string): number | null {
  const parsed = parseDosePattern(pattern.replace(/[–]/g, "-"));
  return parsed?.qty ?? null;
}

/** Display label from structured strength fields. */
export function formatStrengthLabel(
  value: number | null | undefined,
  unit: StrengthUnit | null | undefined,
): string {
  if (value == null || value <= 0 || !unit) return "";
  if (unit === "pct") return `${value}%`;
  if (unit === "iu") return `${value} IU`;
  return `${value} ${unit}`;
}

/** Parse legacy strength text into structured fields. */
export function parseStrengthText(text: string | null | undefined): {
  strengthValue: number | null;
  strengthUnit: StrengthUnit | null;
  legacy: string | null;
} {
  const raw = text?.trim();
  if (!raw) {
    return { strengthValue: null, strengthUnit: null, legacy: null };
  }

  const pct = raw.match(/^([\d.]+)\s*%$/);
  if (pct) {
    const value = Number(pct[1]);
    if (!Number.isNaN(value) && value > 0) {
      return { strengthValue: value, strengthUnit: "pct", legacy: formatStrengthLabel(value, "pct") };
    }
  }

  const iu = raw.match(/^([\d.]+)\s*(?:iu|i\.?u\.?)$/i);
  if (iu) {
    const value = Number(iu[1]);
    if (!Number.isNaN(value) && value > 0) {
      return { strengthValue: value, strengthUnit: "iu", legacy: formatStrengthLabel(value, "iu") };
    }
  }

  const compound = raw.match(/^([\d.]+)\s*(mg|mcg|µg|ug|g|gm)\b/i);
  if (compound) {
    const value = Number(compound[1]);
    const unitToken = compound[2].toLowerCase();
    const unit: StrengthUnit =
      unitToken === "g" || unitToken === "gm" ? "g"
      : unitToken === "mcg" || unitToken === "µg" || unitToken === "ug" ? "mcg"
      : "mg";
    if (!Number.isNaN(value) && value > 0) {
      return {
        strengthValue: value,
        strengthUnit: unit,
        legacy: formatStrengthLabel(value, unit),
      };
    }
  }

  const glued = raw.match(/^([\d.]+)(mg|mcg|µg|ug|g)$/i);
  if (glued) {
    const value = Number(glued[1]);
    const unitToken = glued[2].toLowerCase();
    const unit: StrengthUnit =
      unitToken === "g" ? "g"
      : unitToken === "mcg" || unitToken === "µg" || unitToken === "ug" ? "mcg"
      : "mg";
    if (!Number.isNaN(value) && value > 0) {
      return {
        strengthValue: value,
        strengthUnit: unit,
        legacy: formatStrengthLabel(value, unit),
      };
    }
  }

  // Bare number, no unit ("500", "0.4", "7.5") → structured value with the unit
  // left for the doctor. Keeps unitless doses in the main strength field instead
  // of the unit-only "More" box (which would treat them as custom text).
  const bare = raw.match(/^\d*\.?\d+$/);
  if (bare) {
    const value = Number(raw);
    if (!Number.isNaN(value) && value > 0) {
      return { strengthValue: value, strengthUnit: null, legacy: String(value) };
    }
  }

  return { strengthValue: null, strengthUnit: null, legacy: raw };
}

export function syncStrengthLegacy(
  value: number | null | undefined,
  unit: StrengthUnit | null | undefined,
): string | null {
  const label = formatStrengthLabel(value, unit);
  return label || null;
}

// ---------------------------------------------------------------------------
// Combo / fixed-dose-combination strength (migration 138)
// ---------------------------------------------------------------------------

/** Strength-unit aliases the doctor / catalog may type inside a combo ratio. */
const STRENGTH_COMPONENT_UNIT_ALIASES: Record<string, StrengthUnit> = {
  mg: "mg",
  g: "g",
  gm: "g",
  mcg: "mcg",
  ug: "mcg",
  "µg": "mcg",
  iu: "iu",
  u: "iu",
  "%": "pct",
  pct: "pct",
  percent: "pct",
};

/**
 * Fold the "safe" combination separators onto the canonical "/". Doctors type
 * combos many ways ("500+125", "900-300", "900,300"); these are unambiguous
 * once we see them between two digits. The decimal "." is deliberately left
 * untouched — "900.300" must stay the number 900.3, never a combo.
 */
export function normalizeComboSeparators(text: string): string {
  return text
    .replace(/\s*\+\s*/g, "/")
    .replace(/(\d)\s*-\s*(\d)/g, "$1/$2")
    .replace(/(\d)\s*,\s*(\d)/g, "$1/$2");
}

/**
 * Parse a fixed-dose-combination strength like "600/300", "600/300 mg",
 * "500mg/125mg", "500+125", "900-300", or "75/150/400/275 mg" into one entry
 * per ingredient.
 *
 * Returns null for single-strength text ("500 mg", "0.05%") and for
 * concentration-style ratio units ("250 mg/5 ml") — those are handled by
 * `parseStrengthText`. A bare unit written once is shared across every value.
 */
export function parseStrengthComponents(
  text: string | null | undefined,
): MedicationStrengthComponent[] | null {
  const raw = normalizeComboSeparators(text?.trim() ?? "");
  if (!raw || !raw.includes("/")) return null;

  const parts = raw.split("/");
  if (parts.length < 2) return null;

  const components: MedicationStrengthComponent[] = [];
  let sharedUnit: StrengthUnit | null = null;

  for (const part of parts) {
    const m = part
      .trim()
      .match(/^([\d.]+)\s*(mg|mcg|µg|ug|gm|g|iu|u|%|pct|percent)?$/i);
    if (!m) return null;
    const value = Number(m[1]);
    if (Number.isNaN(value) || value <= 0) return null;
    let unit: StrengthUnit | null = null;
    if (m[2]) {
      const mapped = STRENGTH_COMPONENT_UNIT_ALIASES[m[2].toLowerCase()];
      unit = mapped ?? null;
      if (mapped) sharedUnit = mapped;
    }
    components.push({ value, unit });
  }

  if (components.length < 2) return null;
  // Back-fill the shared unit onto entries that omitted it ("600/300 mg").
  return components.map((c) => ({ value: c.value, unit: c.unit ?? sharedUnit }));
}

/** Render combo components into the canonical display string ("600/300 mg"). */
export function formatStrengthComponents(
  components: MedicationStrengthComponent[] | null | undefined,
): string {
  if (!components || components.length < 2) return "";
  const units = components.map((c) => c.unit ?? null);
  const allSameUnit = units.every((u) => u === units[0]);
  if (allSameUnit) {
    const unit = units[0];
    const values = components.map((c) => String(c.value)).join("/");
    if (!unit) return values;
    if (unit === "pct") return `${values}%`;
    if (unit === "iu") return `${values} IU`;
    return `${values} ${unit}`;
  }
  return components
    .map((c) => formatStrengthLabel(c.value, c.unit) || String(c.value))
    .join(" / ");
}

/** True when the medication carries a fixed-dose-combination strength. */
export function isComboStrength(
  med: Pick<PatientMedication, "strength_components">,
): boolean {
  return Array.isArray(med.strength_components) && med.strength_components.length >= 2;
}

/**
 * Resolve free-text strength into the right representation: a combo array when
 * a ratio is detected (scalar nulled), otherwise the structured scalar. Used by
 * every capture path so combos round-trip identically to single strengths.
 */
export function resolveStrengthFields(text: string | null | undefined): {
  strength: string | null;
  strengthValue: number | null;
  strengthUnit: StrengthUnit | null;
  strengthComponents: MedicationStrengthComponent[] | null;
} {
  const components = parseStrengthComponents(text);
  if (components) {
    return {
      strength: formatStrengthComponents(components) || null,
      strengthValue: null,
      strengthUnit: null,
      strengthComponents: components,
    };
  }
  const single = parseStrengthText(text);
  return {
    strength: single.legacy,
    strengthValue: single.strengthValue,
    strengthUnit: single.strengthUnit,
    strengthComponents: null,
  };
}

export const CHART_MED_FORM_PRIMARY = ["tablet", "capsule", "syrup"] as const;

/** Pharmaceutical form chips — canonical values match parser + drug_master. */
export const CHART_MED_FORM_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "tablet", label: "Tab" },
  { value: "capsule", label: "Cap" },
  { value: "syrup", label: "Syrup" },
  { value: "ointment", label: "Oint" },
  { value: "cream", label: "Cream" },
  { value: "drops", label: "Drops" },
  { value: "injection", label: "Inj" },
  { value: "inhaler", label: "Inhaler" },
  { value: "suspension", label: "Susp" },
  { value: "gel", label: "Gel" },
  { value: "powder", label: "Powder" },
  { value: "patch", label: "Patch" },
];

export function formatChartMedFormLabel(form: string | null | undefined): string {
  if (!form?.trim()) return "";
  const hit = CHART_MED_FORM_OPTIONS.find(
    (o) => o.value === form.trim().toLowerCase(),
  );
  if (hit) return hit.label;
  return form.trim().charAt(0).toUpperCase() + form.trim().slice(1);
}

/** Combobox suggestions for the header form field. */
export const CHART_MED_FORM_COMBOBOX_OPTIONS = CHART_MED_FORM_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}));

const FORM_INPUT_ALIASES: Record<string, string> = {
  tab: "tablet",
  tabs: "tablet",
  tablet: "tablet",
  tablets: "tablet",
  cap: "capsule",
  caps: "capsule",
  capsule: "capsule",
  capsules: "capsule",
  syp: "syrup",
  syr: "syrup",
  syrup: "syrup",
  susp: "suspension",
  suspension: "suspension",
  oint: "ointment",
  ointment: "ointment",
  cream: "cream",
  gel: "gel",
  drop: "drops",
  drops: "drops",
  inj: "injection",
  injection: "injection",
  inhaler: "inhaler",
  mdi: "inhaler",
  neb: "nebuliser",
  nebuliser: "nebuliser",
  sachet: "sachet",
  powder: "powder",
  patch: "patch",
  sol: "solution",
  solution: "solution",
};

/**
 * Resolve typed/selected form text to a canonical catalog value, custom free
 * text, or null when empty.
 */
export function resolveFormInput(raw: string): string | "custom" | null {
  const text = raw.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (FORM_INPUT_ALIASES[lower]) return FORM_INPUT_ALIASES[lower];
  const hit = CHART_MED_FORM_OPTIONS.find(
    (o) => o.value === lower || o.label.toLowerCase() === lower,
  );
  if (hit) return hit.value;
  return "custom";
}

/** True when `form` matches the known catalog (not a free-text custom form). */
export function isKnownChartMedForm(form: string | null | undefined): boolean {
  if (!form?.trim()) return false;
  return resolveFormInput(form) !== "custom";
}

/** Dose unit is driven by a known form and has not been manually overridden. */
export function chartMedFormLocksDoseUnit(
  med: Pick<PatientMedication, "form" | "dose_unit" | "dose_qty" | "dose" | "strength">,
): boolean {
  if (isCustomDoseUnit(med)) {
    const doseText = med.dose?.trim() ?? "";
    const strengthText = med.strength?.trim() ?? "";
    if (doseText !== strengthText) return false;
  }
  const canonical = resolveFormInput(med.form ?? "");
  if (!canonical || canonical === "custom") return false;
  const expected = defaultDoseUnitForForm(canonical);
  if (!expected) return false;
  return med.dose_unit == null || med.dose_unit === expected;
}

/** Label for the dose-unit suffix when form locks the unit (e.g. "tab"). */
export function chartMedLockedDoseUnitLabel(
  med: Pick<PatientMedication, "form" | "dose_unit">,
): string {
  if (chartMedUsesApplyDose(med)) return "Apply";
  const canonical = resolveFormInput(med.form ?? "");
  const unit =
    med.dose_unit ??
    (canonical && canonical !== "custom" ? defaultDoseUnitForForm(canonical) : null);
  if (!unit) return "";
  const hit = DOSE_UNIT_OPTIONS.find((o) => o.unit === unit);
  return hit?.label ?? unit;
}

/**
 * Topical forms (gel, ointment, …) use verb-style dosing — no countable
 * qty/unit in the UI unless the doctor overrides via Change (e.g. ml).
 */
export function chartMedUsesApplyDose(
  med: Pick<PatientMedication, "form" | "dose_unit" | "dose_qty" | "dose" | "strength">,
): boolean {
  if (!isTopicalForm(med.form)) return false;
  if (med.dose_unit != null && med.dose_unit !== "application") return false;
  if (isCustomDoseUnit(med)) {
    const doseText = med.dose?.trim() ?? "";
    const strengthText = med.strength?.trim() ?? "";
    if (doseText !== strengthText) return false;
  }
  return true;
}

/** Patch fields to apply when the header form combobox commits. */
export function chartMedPatchFromFormInput(raw: string): ChartMedicationPatch {
  const trimmed = raw.trim();
  if (!trimmed) return { form: null };
  const resolved = resolveFormInput(trimmed);
  if (resolved === "custom") {
    return { form: trimmed.toLowerCase() };
  }
  const unit = defaultDoseUnitForForm(resolved);
  return {
    form: resolved,
    ...(unit ? { doseUnit: unit } : {}),
    ...(unit === "application" ? { doseQty: null } : {}),
  };
}

/** Compact relative start summary — mirrors condition ago display. */
export function formatStartedAgoSummary(
  value: number | null | undefined,
  unit: PatientConditionAgoUnit | null | undefined,
): string {
  if (value == null || value <= 0 || !unit) return "";
  const singular = value === 1 ? unit.replace(/s$/, "") : unit;
  return `~${value} ${singular}`;
}

/** Case-insensitive drug-name key for duplicate detection within a med list. */
export function normalizeMedicationDrugKey(name: string): string {
  return name.trim().toLowerCase();
}

/** True when `payload` matches an existing row by drug_master_id or drug name. */
export function findDuplicateMedication(
  rows: ReadonlyArray<Pick<PatientMedication, "drug_name" | "drug_master_id" | "id">>,
  payload: Pick<CreatePatientMedicationPayload, "drugName" | "drugMasterId">,
): Pick<PatientMedication, "id" | "drug_name"> | null {
  const nameKey = normalizeMedicationDrugKey(payload.drugName);
  for (const row of rows) {
    if (payload.drugMasterId && row.drug_master_id === payload.drugMasterId) {
      return { id: row.id, drug_name: row.drug_name };
    }
    if (normalizeMedicationDrugKey(row.drug_name) === nameKey) {
      return { id: row.id, drug_name: row.drug_name };
    }
  }
  return null;
}

/** True when `payload` matches an existing row by drug_master_id or drug name. */
export function medicationListHasDuplicate(
  rows: ReadonlyArray<Pick<PatientMedication, "drug_name" | "drug_master_id" | "id">>,
  payload: Pick<CreatePatientMedicationPayload, "drugName" | "drugMasterId">,
): boolean {
  return findDuplicateMedication(rows, payload) != null;
}

/** Doctor-facing copy when a duplicate med add is blocked. */
export function duplicateMedicationNoticeText(drugName: string): string {
  const label = drugName.trim() || "This medication";
  return `${label} is already on this list.`;
}

export const CHART_MED_SOURCE_OPTIONS = [
  { value: "prescribed" as const, label: "Prescribed" },
  { value: "self_started" as const, label: "Self-started" },
] as const;

export type ChartMedSourceUi = (typeof CHART_MED_SOURCE_OPTIONS)[number]["value"];

export const STOP_REASON_OPTIONS: ReadonlyArray<{
  value: PatientMedicationStopReason;
  label: string;
}> = [
  { value: "resolved", label: "Condition resolved" },
  { value: "side_effects", label: "Side effects" },
  { value: "cost", label: "Cost / access" },
  { value: "patient_choice", label: "Patient choice" },
  { value: "other", label: "Other" },
];

/** Top stop-reason chips — remainder live in the typable More combobox. */
export const CHART_MED_STOP_REASON_PRIMARY = [
  "side_effects",
  "cost",
  "patient_choice",
  "resolved",
] as const satisfies readonly PatientMedicationStopReason[];

export const STOP_REASON_CHIP_OPTIONS = STOP_REASON_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}));

/** Match typed stop-reason text to a canonical enum value. */
export function resolveStopReasonInput(raw: string): PatientMedicationStopReason | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  const hit = STOP_REASON_OPTIONS.find(
    (o) => o.value.toLowerCase() === q || o.label.toLowerCase() === q,
  );
  return hit?.value ?? null;
}

/** Top food-timing chips — remainder in the typable More combobox. */
export const CHART_MED_FOOD_TIMING_PRIMARY = [
  "with_food",
  "empty_stomach",
  "before_food",
] as const satisfies readonly FoodTiming[];

export const FOOD_TIMING_CHIP_OPTIONS = FOOD_TIMING_OPTIONS.map((o) => ({
  value: o.code,
  label: o.label,
}));

/** Match typed food-timing text to a canonical enum value. */
export function resolveFoodTimingInput(raw: string): FoodTiming | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  const hit = FOOD_TIMING_OPTIONS.find(
    (o) => o.code.toLowerCase() === q || o.label.toLowerCase() === q,
  );
  return hit?.code ?? null;
}

export interface ChartMedicationPatch {
  drugName?: string;
  strength?: string | null;
  strengthValue?: number | null;
  strengthUnit?: StrengthUnit | null;
  /** Combo strength components (migration 138); null clears a prior combo. */
  strengthComponents?: MedicationStrengthComponent[] | null;
  doseQty?: number | null;
  doseUnit?: DoseUnit | null;
  frequencyCode?: FrequencyCode | null;
  frequency?: string | null;
  form?: string | null;
  drugMasterId?: string | null;
  status?: PatientMedication["status"];
  intakePattern?: PatientMedication["intake_pattern"];
  source?: PatientMedicationSource | null;
  startedAgoValue?: number | null;
  startedAgoUnit?: PatientConditionAgoUnit | null;
  stoppedAgoValue?: number | null;
  stoppedAgoUnit?: PatientConditionAgoUnit | null;
  stopReason?: PatientMedicationStopReason | null;
  note?: string | null;
  doseSchedule?: string | null;
  foodTiming?: FoodTiming | null;
  /** Legacy mirror — strength for backward compat. */
  dose?: string | null;
}

/** UI source → DB source (Self-started → self; otc legacy reads as self-started). */
export function chartMedSourceToDb(ui: ChartMedSourceUi): PatientMedicationSource {
  return ui === "prescribed" ? "prescribed" : "self";
}

export function chartMedSourceFromDb(
  source: PatientMedicationSource | null | undefined,
): ChartMedSourceUi | null {
  if (source === "prescribed") return "prescribed";
  if (source === "self" || source === "otc") return "self_started";
  return null;
}

export function chartMedSourceLabel(
  source: PatientMedicationSource | null | undefined,
): string {
  if (source === "prescribed") return "Prescribed";
  if (source === "self" || source === "otc") return "Self-started";
  return "";
}

/**
 * Adherence label for the collapsed sig. `prn` is intentionally omitted — an
 * SOS/PRN frequency already conveys it, so surfacing it again is noise.
 */
export function chartMedIntakePatternLabel(
  pattern: PatientMedication["intake_pattern"],
): string {
  if (pattern === "regular") return "Regular";
  if (pattern === "irregular") return "Irregular";
  return "";
}

/** Compact sig for collapsed chart med row. */
export function formatChartMedicationSig(med: PatientMedication): string {
  const segments: string[] = [];

  const strength =
    formatStrengthComponents(med.strength_components) ||
    formatStrengthLabel(med.strength_value, med.strength_unit) ||
    med.strength?.trim() ||
    (med.dose?.trim() && !isCustomDoseUnit(med) ? med.dose.trim() : "");
  let doseLabel = formatDoseLabel(med.dose_qty, med.dose_unit);
  if (!doseLabel && med.dose_qty != null && med.dose?.trim() && !med.dose_unit) {
    doseLabel = `${med.dose_qty} ${med.dose.trim()}`;
  }
  const topicalApply = chartMedUsesApplyDose(med);
  if (strength) segments.push(strength);
  if (topicalApply) {
    segments.push("Apply");
  } else if (doseLabel) {
    segments.push(doseLabel);
  }

  if (med.frequency_code && med.frequency_code !== "CUSTOM") {
    segments.push(getChartFrequencyLabel(med.frequency_code));
  } else if (med.frequency?.trim()) {
    segments.push(med.frequency.trim());
  }

  if (med.dose_schedule?.trim()) {
    segments.push(med.dose_schedule.trim());
  }

  const food = getFoodTimingLabel(med.food_timing);
  if (food) segments.push(food);

  const formLabel = formatChartMedFormLabel(med.form);
  if (formLabel) segments.push(formLabel);

  const since = formatStartedAgoSummary(med.started_ago_value, med.started_ago_unit);
  if (since) segments.push(since);

  const pattern = chartMedIntakePatternLabel(med.intake_pattern);
  if (pattern) segments.push(pattern);

  const src = chartMedSourceLabel(med.source);
  if (src) segments.push(src);

  if (med.note?.trim()) segments.push(med.note.trim());

  return segments.join(" · ");
}

export function formatStoppedAgoSummary(
  value: number | null | undefined,
  unit: PatientConditionAgoUnit | null | undefined,
): string {
  if (value == null || value <= 0 || !unit) return "";
  const singular = value === 1 ? unit.replace(/s$/, "") : unit;
  return `~${value} ${singular}`;
}

/** Label for the stop-timing row — depends on linked condition status. */
export function stoppedSinceLabel(conditionStatus: PatientConditionStatus): string {
  return conditionStatus === "resolved"
    ? "Stopped — condition resolved"
    : "Not taking — for";
}

/** Nullable structured fields for optimistic chart-med rows. */
export const CHART_MED_STRUCTURED_DEFAULTS = {
  strength: null,
  strength_value: null,
  strength_unit: null,
  strength_components: null,
  dose_qty: null,
  dose_unit: null,
  frequency_code: null,
  form: null,
  drug_master_id: null,
  stopped_ago_value: null,
  stopped_ago_unit: null,
  started_ago_value: null,
  started_ago_unit: null,
  stop_reason: null,
  dose_schedule: null,
  food_timing: null,
} as const satisfies Partial<PatientMedication>;

/** Empty row for inline draft add (single card — no separate capture bar). */
export const CHART_MED_DRAFT: PatientMedication = {
  id: "draft-med",
  doctor_id: "",
  patient_id: "",
  drug_name: "",
  dose: null,
  frequency: null,
  status: "active",
  intake_pattern: null,
  source: null,
  started_on: null,
  stopped_on: null,
  note: null,
  archived_at: null,
  created_at: "",
  updated_at: "",
  strength: null,
  strength_value: null,
  strength_unit: null,
  dose_qty: null,
  dose_unit: null,
  frequency_code: null,
  form: null,
  drug_master_id: null,
  stopped_ago_value: null,
  stopped_ago_unit: null,
  started_ago_value: null,
  started_ago_unit: null,
  stop_reason: null,
  dose_schedule: null,
  strength_components: null,
  food_timing: null,
};

/**
 * Resolve the chart-med "on drug since" value from a parsed line. Medical
 * history has no Rx treatment course, so a parsed course duration ("for 30
 * days", "2 months") is read as how long the patient has been on the drug —
 * unless explicit started-ago timing was already extracted. "until-finished" /
 * "continue" carry no length and are ignored.
 */
export function chartMedStartedAgoFromParsed(parsed: ParsedMedicineLine): {
  value: number | null;
  unit: PatientConditionAgoUnit | null;
} {
  if (parsed.startedAgoValue != null && parsed.startedAgoUnit) {
    return { value: parsed.startedAgoValue, unit: parsed.startedAgoUnit };
  }
  if (
    parsed.durationValue != null &&
    (parsed.durationUnit === "days" ||
      parsed.durationUnit === "weeks" ||
      parsed.durationUnit === "months")
  ) {
    return { value: parsed.durationValue, unit: parsed.durationUnit };
  }
  return { value: null, unit: null };
}

/** Map parser output → chart-med patch (card editor / capture bar). */
export function chartMedPatchFromParsed(parsed: ParsedMedicineLine): ChartMedicationPatch {
  const qtyFromSchedule = parsed.doseSchedule
    ? doseQtyFromSchedule(parsed.doseSchedule)
    : null;
  const strengthFields = resolveStrengthFields(parsed.dosage);
  const doseSchedule = isIntervalFrequency(parsed.frequencyCode)
    ? null
    : parsed.doseSchedule ?? singleDoseScheduleForFrequency(parsed.frequencyCode);
  const startedAgo = chartMedStartedAgoFromParsed(parsed);

  const patch: ChartMedicationPatch = {
    drugName: parsed.medicineName,
    strength: strengthFields.strength,
    dose: strengthFields.strength,
    strengthValue: strengthFields.strengthValue,
    strengthUnit: strengthFields.strengthUnit,
    strengthComponents: strengthFields.strengthComponents,
    doseQty: parsed.doseQty ?? qtyFromSchedule,
    doseUnit: parsed.doseUnit,
    frequencyCode: parsed.frequencyCode,
    frequency:
      parsed.frequencyCode === "PRN"
        ? "SOS"
        : parsed.frequency ||
          (parsed.frequencyCode ? getChartFrequencyLabel(parsed.frequencyCode) : null),
    doseSchedule,
    form: parsed.form,
    startedAgoValue: startedAgo.value,
    startedAgoUnit: startedAgo.unit,
    note: parsed.instructions || null,
  };
  if (parsed.foodTiming) patch.foodTiming = parsed.foodTiming;
  if (parsed.frequencyCode === "PRN") {
    patch.intakePattern = "prn";
  } else if (parsed.intakePattern) {
    patch.intakePattern = parsed.intakePattern;
  }
  // Only set source when parsed — never clobber an existing value with null.
  if (parsed.source) patch.source = parsed.source;
  // Only flip to past when the line stated it; an absent status leaves the
  // current value (draft default "active", or condition inheritance at commit).
  if (parsed.status === "past") {
    patch.status = "past";
    if (parsed.stoppedAgoValue != null && parsed.stoppedAgoUnit) {
      patch.stoppedAgoValue = parsed.stoppedAgoValue;
      patch.stoppedAgoUnit = parsed.stoppedAgoUnit;
    }
    if (parsed.stopReason) patch.stopReason = parsed.stopReason;
  }
  return patch;
}

/** Build create payload from parser output + optional drug-master row. */
export function chartMedPayloadFromParsed(
  parsed: ParsedMedicineLine,
  extras?: {
    drugMasterId?: string | null;
    conditionIds?: string[];
    /** Status of the condition this med is being added under, for inheritance. */
    conditionStatus?: PatientConditionStatus | null;
  },
): CreatePatientMedicationPayload {
  const patch = chartMedPatchFromParsed(parsed);
  // Priority: explicit parsed status → inherit a resolved condition → active.
  const inheritedPast = extras?.conditionStatus === "resolved";
  const status: PatientMedicationStatus =
    parsed.status ?? (inheritedPast ? "past" : "active");
  // A med inherited as past from a resolved condition gets the "resolved" reason
  // unless the line stated its own reason.
  const stopReason =
    patch.stopReason ?? (status === "past" && inheritedPast ? "resolved" : null);
  return {
    ...patch,
    drugName: parsed.medicineName,
    drugMasterId: extras?.drugMasterId ?? null,
    status,
    stopReason,
    conditionIds: extras?.conditionIds,
  };
}

/** Snapshot in-card draft editor state → create payload. */
export function chartMedPayloadFromDraftRow(
  draft: PatientMedication,
  drugName: string,
): CreatePatientMedicationPayload {
  return {
    drugName,
    status: draft.status,
    dose: draft.dose,
    frequency: draft.frequency,
    strength: draft.strength,
    strengthValue: draft.strength_value,
    strengthUnit: draft.strength_unit,
    strengthComponents: draft.strength_components,
    doseQty: draft.dose_qty,
    doseUnit: draft.dose_unit,
    frequencyCode: draft.frequency_code,
    form: draft.form,
    drugMasterId: draft.drug_master_id,
    intakePattern: draft.intake_pattern,
    source: draft.source,
    note: draft.note?.trim() || null,
    startedAgoValue: draft.started_ago_value,
    startedAgoUnit: draft.started_ago_unit,
    doseSchedule: draft.dose_schedule,
    foodTiming: draft.food_timing,
  };
}

/** Parsed / drug-master fields win; card-only edits (notes, origin, pattern) overlay. */
export function chartMedPayloadMergeDraft(
  payload: CreatePatientMedicationPayload,
  draft: PatientMedication,
): CreatePatientMedicationPayload {
  const fromCard = chartMedPayloadFromDraftRow(draft, payload.drugName);
  return {
    ...fromCard,
    ...payload,
    drugName: payload.drugName,
    note: draft.note?.trim() || payload.note || null,
    source: draft.source ?? payload.source ?? null,
    intakePattern: draft.intake_pattern ?? payload.intakePattern ?? null,
    startedAgoValue: draft.started_ago_value ?? payload.startedAgoValue ?? null,
    startedAgoUnit: draft.started_ago_unit ?? payload.startedAgoUnit ?? null,
    foodTiming: draft.food_timing ?? payload.foodTiming ?? null,
    // An explicit "past" from the parsed/AI line wins; otherwise the card's own
    // (manually toggled) status is preserved.
    status: payload.status === "past" ? "past" : draft.status,
    stoppedAgoValue:
      payload.status === "past" ? (payload.stoppedAgoValue ?? draft.stopped_ago_value) : null,
    stoppedAgoUnit:
      payload.status === "past" ? (payload.stoppedAgoUnit ?? draft.stopped_ago_unit) : null,
    stopReason: payload.status === "past" ? (payload.stopReason ?? draft.stop_reason) : null,
  };
}

/**
 * Map an AI-parsed medicine (server-bounded) → chart-med create payload. Mirrors
 * `chartMedPatchFromParsed`: applies the same legacy-strength sync, interval-vs-
 * schedule logic, and PRN→SOS intake handling so AI and deterministic suggestions
 * commit identically. Enum strings are already validated server-side.
 */
export function chartMedPayloadFromAiMedicine(
  aiMed: AiParsedMedicine,
  options?: {
    status?: PatientMedicationStatus;
    conditionIds?: string[];
    conditionStatus?: PatientConditionStatus | null;
  },
): CreatePatientMedicationPayload {
  const aiComponents =
    aiMed.strengthComponents && aiMed.strengthComponents.length >= 2
      ? aiMed.strengthComponents.map((c) => ({
          value: c.value,
          unit: (c.unit as StrengthUnit | null) ?? null,
        }))
      : null;
  // Combo wins over the scalar (a single number can't hold "600/300").
  const strengthValue = aiComponents ? null : (aiMed.strengthValue ?? null);
  const strengthUnit = aiComponents
    ? null
    : ((aiMed.strengthUnit as StrengthUnit | null) ?? null);
  const legacy = aiComponents
    ? formatStrengthComponents(aiComponents) || null
    : syncStrengthLegacy(strengthValue, strengthUnit);
  const frequencyCode = (aiMed.frequencyCode as FrequencyCode | null) ?? null;
  const intakePattern: PatientMedicationIntakePattern | null =
    frequencyCode === "PRN"
      ? "prn"
      : ((aiMed.intakePattern as PatientMedicationIntakePattern | null) ?? null);
  const doseSchedule = isIntervalFrequency(frequencyCode)
    ? null
    : aiMed.doseSchedule ?? singleDoseScheduleForFrequency(frequencyCode);
  const doseQty =
    aiMed.doseQty ?? (doseSchedule ? doseQtyFromSchedule(doseSchedule) : null);
  const doseUnit = (aiMed.doseUnit as DoseUnit | null) ?? null;
  let form = aiMed.form ?? null;
  if (!form && doseUnit) {
    form = inferFormFromDoseUnit(doseUnit);
  }

  // Status priority: AI-detected past → explicit option → resolved-condition
  // inheritance → active.
  const inheritedPast = options?.conditionStatus === "resolved";
  const status: PatientMedicationStatus =
    (aiMed.status as PatientMedicationStatus | undefined) ??
    options?.status ??
    (inheritedPast ? "past" : "active");
  const stoppedAgoValue = status === "past" ? (aiMed.stoppedAgoValue ?? null) : null;
  const stoppedAgoUnit =
    status === "past"
      ? ((aiMed.stoppedAgoUnit as PatientConditionAgoUnit | null) ?? null)
      : null;
  const stopReason: PatientMedicationStopReason | null =
    status === "past"
      ? ((aiMed.stopReason as PatientMedicationStopReason | null) ??
        (inheritedPast ? "resolved" : null))
      : null;

  return {
    drugName: aiMed.name,
    strength: legacy,
    dose: legacy,
    strengthValue,
    strengthUnit,
    strengthComponents: aiComponents,
    doseQty,
    doseUnit,
    frequencyCode,
    frequency:
      frequencyCode === "PRN"
        ? "SOS"
        : frequencyCode
          ? getChartFrequencyLabel(frequencyCode)
          : null,
    doseSchedule,
    form,
    intakePattern,
    source: (aiMed.source as PatientMedicationSource | null) ?? null,
    startedAgoValue: aiMed.startedAgoValue ?? null,
    startedAgoUnit: (aiMed.startedAgoUnit as PatientConditionAgoUnit | null) ?? null,
    foodTiming: (aiMed.foodTiming as FoodTiming | null) ?? null,
    note: aiMed.instructions ?? null,
    status,
    stoppedAgoValue,
    stoppedAgoUnit,
    stopReason,
    conditionIds: options?.conditionIds,
  };
}

/** Infer canonical form from dose unit (tab → tablet, etc.). */
export function inferFormFromDoseUnit(doseUnit: DoseUnit): string | null {
  const map: Record<DoseUnit, string> = {
    tab: "tablet",
    cap: "capsule",
    spoon: "syrup",
    ml: "solution",
    drops: "drops",
    puff: "inhaler",
    sachet: "sachet",
    unit: "injection",
    application: "ointment",
  };
  return map[doseUnit] ?? null;
}

export function chartMedPayloadFromDrugMaster(
  drug: DrugMasterRow,
  conditionIds?: string[],
): CreatePatientMedicationPayload {
  const strengthFields = resolveStrengthFields(drug.strength);
  const form = drug.form ?? null;
  const doseUnit = form ? defaultDoseUnitForForm(form) : null;
  return {
    drugName: drug.generic_name,
    strength: strengthFields.strength,
    dose: strengthFields.strength,
    strengthValue: strengthFields.strengthValue,
    strengthUnit: strengthFields.strengthUnit,
    strengthComponents: strengthFields.strengthComponents,
    drugMasterId: drug.id,
    form,
    ...(doseUnit ? { doseUnit } : {}),
    status: "active",
    conditionIds,
  };
}

/**
 * Longest name we treat as a possible short form. Real generics commit
 * instantly as typed ("metformin", "amlodipine", "aspirin"); abbreviations
 * ("amlo", "telma", "met", "atorva") are short, so only those earn a catalog
 * round-trip on commit.
 */
const CATALOG_LOOKUP_MAX_NAME_LEN = 6;

/**
 * Whether a parsed drug name is short-form-ish enough to be worth confirming
 * against `drug_master` before committing. Multi-word and longer names skip
 * the lookup and commit straight through (autocomplete already links names the
 * doctor picked from the catalog).
 */
export function nameWorthCatalogLookup(name: string): boolean {
  const n = name.trim();
  if (!n || /\s/.test(n)) return false;
  return n.length <= CATALOG_LOOKUP_MAX_NAME_LEN;
}

/**
 * Pick a *single unambiguous* catalog drug for a typed/parsed name so short
 * forms ("amlo") can be expanded deterministically. Confidence rules:
 *   - exactly one exact generic-name match wins; or
 *   - exactly one generic name that the typed text is a prefix of wins.
 * Anything ambiguous (≥2 candidates) or unmatched returns null — those route
 * to AI rather than guessing the wrong drug.
 */
export function pickUnambiguousCatalogDrug(
  typedName: string,
  results: readonly DrugMasterRow[],
): DrugMasterRow | null {
  const q = typedName.trim().toLowerCase();
  if (!q || results.length === 0) return null;

  const exact = results.filter((r) => r.generic_name.trim().toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const prefix = results.filter((r) =>
    r.generic_name.trim().toLowerCase().startsWith(q),
  );
  if (prefix.length === 1) return prefix[0];
  return null;
}

/**
 * Overlay a catalog drug onto a parse-derived payload: the canonical name and
 * `drugMasterId` always win, but strength/form/dose defaults only fill fields
 * the doctor did not already type (never clobber explicit input).
 */
export function mergeCatalogDrugIntoPayload(
  base: CreatePatientMedicationPayload,
  drug: DrugMasterRow,
): CreatePatientMedicationPayload {
  const fromCatalog = chartMedPayloadFromDrugMaster(drug, base.conditionIds);
  const isBlank = (v: unknown) => v === null || v === undefined || v === "";
  const hasStrength =
    !isBlank(base.strength) ||
    base.strengthValue != null ||
    (base.strengthComponents?.length ?? 0) > 0;

  return {
    ...base,
    drugName: drug.generic_name,
    drugMasterId: drug.id,
    strength: hasStrength ? base.strength : fromCatalog.strength,
    dose: hasStrength ? base.dose : fromCatalog.dose,
    strengthValue: hasStrength ? base.strengthValue : fromCatalog.strengthValue,
    strengthUnit: hasStrength ? base.strengthUnit : fromCatalog.strengthUnit,
    strengthComponents: hasStrength
      ? base.strengthComponents
      : fromCatalog.strengthComponents,
    form: isBlank(base.form) ? fromCatalog.form : base.form,
    doseUnit: base.doseUnit ?? fromCatalog.doseUnit,
  };
}

/** Merge patch into API update payload with legacy mirrors. */
export function chartMedPatchToApiPayload(
  patch: ChartMedicationPatch,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.drugName !== undefined) out.drugName = patch.drugName;
  if (patch.strengthValue !== undefined) out.strengthValue = patch.strengthValue;
  if (patch.strengthUnit !== undefined) out.strengthUnit = patch.strengthUnit;
  if (patch.strengthComponents !== undefined) out.strengthComponents = patch.strengthComponents;
  if (patch.strength !== undefined) {
    out.strength = patch.strength;
    out.dose = patch.strength;
  }
  if (patch.dose !== undefined && patch.strength === undefined) out.dose = patch.dose;
  if (patch.doseQty !== undefined) out.doseQty = patch.doseQty;
  if (patch.doseUnit !== undefined) out.doseUnit = patch.doseUnit;
  if (patch.frequencyCode !== undefined) out.frequencyCode = patch.frequencyCode;
  if (patch.frequency !== undefined) out.frequency = patch.frequency;
  if (patch.form !== undefined) out.form = patch.form;
  if (patch.drugMasterId !== undefined) out.drugMasterId = patch.drugMasterId;
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.intakePattern !== undefined) out.intakePattern = patch.intakePattern;
  if (patch.source !== undefined) out.source = patch.source;
  if (patch.startedAgoValue !== undefined) out.startedAgoValue = patch.startedAgoValue;
  if (patch.startedAgoUnit !== undefined) out.startedAgoUnit = patch.startedAgoUnit;
  if (patch.stoppedAgoValue !== undefined) out.stoppedAgoValue = patch.stoppedAgoValue;
  if (patch.stoppedAgoUnit !== undefined) out.stoppedAgoUnit = patch.stoppedAgoUnit;
  if (patch.stopReason !== undefined) out.stopReason = patch.stopReason;
  if (patch.note !== undefined) out.note = patch.note;
  if (patch.doseSchedule !== undefined) out.doseSchedule = patch.doseSchedule;
  if (patch.foodTiming !== undefined) out.foodTiming = patch.foodTiming;
  return out;
}

export function chartMedPatchToLocalPatch(
  patch: ChartMedicationPatch,
): Partial<PatientMedication> {
  return {
    ...(patch.drugName !== undefined ? { drug_name: patch.drugName } : {}),
    ...(patch.strengthValue !== undefined ? { strength_value: patch.strengthValue } : {}),
    ...(patch.strengthUnit !== undefined ? { strength_unit: patch.strengthUnit } : {}),
    ...(patch.strengthComponents !== undefined
      ? { strength_components: patch.strengthComponents }
      : {}),
    ...(patch.strength !== undefined
      ? { strength: patch.strength, dose: patch.strength ?? patch.dose ?? null }
      : {}),
    ...(patch.dose !== undefined && patch.strength === undefined
      ? { dose: patch.dose }
      : {}),
    ...(patch.doseQty !== undefined ? { dose_qty: patch.doseQty } : {}),
    ...(patch.doseUnit !== undefined ? { dose_unit: patch.doseUnit } : {}),
    ...(patch.frequencyCode !== undefined ? { frequency_code: patch.frequencyCode } : {}),
    ...(patch.frequency !== undefined ? { frequency: patch.frequency } : {}),
    ...(patch.form !== undefined ? { form: patch.form } : {}),
    ...(patch.drugMasterId !== undefined ? { drug_master_id: patch.drugMasterId } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.intakePattern !== undefined ? { intake_pattern: patch.intakePattern } : {}),
    ...(patch.source !== undefined ? { source: patch.source } : {}),
    ...(patch.startedAgoValue !== undefined
      ? { started_ago_value: patch.startedAgoValue }
      : {}),
    ...(patch.startedAgoUnit !== undefined
      ? { started_ago_unit: patch.startedAgoUnit }
      : {}),
    ...(patch.stoppedAgoValue !== undefined
      ? { stopped_ago_value: patch.stoppedAgoValue }
      : {}),
    ...(patch.stoppedAgoUnit !== undefined ? { stopped_ago_unit: patch.stoppedAgoUnit } : {}),
    ...(patch.stopReason !== undefined ? { stop_reason: patch.stopReason } : {}),
    ...(patch.note !== undefined ? { note: patch.note } : {}),
    ...(patch.doseSchedule !== undefined ? { dose_schedule: patch.doseSchedule } : {}),
    ...(patch.foodTiming !== undefined ? { food_timing: patch.foodTiming } : {}),
  };
}
