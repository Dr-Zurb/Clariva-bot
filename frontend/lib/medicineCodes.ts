/**
 * Structured medicine-code metadata (EHR Sub-batch B1 / T2.10).
 *
 * Single source of truth for the human-readable labels that pair with
 * the `frequency_code` / `duration_unit` / `route_code` enums shipped
 * in migration 090. Used by:
 *
 *   - `<MedicineRow>`            — picker labels + legacy-text mirroring
 *   - `<TemplatePicker>`         — preview rendering (B1.7)
 *   - "Copy from last visit"     — converts a stored Rx back into a
 *                                  pickable form (B1.8)
 *   - PDF render layer           — when T3 ships, renders the structured
 *                                  values consistently
 *
 * The `legacyLabel` is what gets written to the existing free-text
 * columns (`frequency`, `duration`, `route`) for backward compatibility
 * per Decision T2-D4 — old viewers (e.g. SMS template, current PDF)
 * never see "BID", they always see "Twice daily".
 */

import type {
  DoseUnit,
  DurationUnit,
  FoodTiming,
  FrequencyCode,
  RouteCode,
} from "@/types/prescription";

// ---------------------------------------------------------------------------
// Frequency
// ---------------------------------------------------------------------------

export interface FrequencyOption {
  code: FrequencyCode;
  /** Long form shown in the dropdown */
  label: string;
  /** Mirror written to the legacy `frequency` column (T2-D4) */
  legacyLabel: string;
}

export const FREQUENCY_OPTIONS: readonly FrequencyOption[] = [
  { code: "OD",     label: "Once daily (OD)",         legacyLabel: "Once daily" },
  { code: "BID",    label: "Twice daily (BID)",       legacyLabel: "Twice daily" },
  { code: "TID",    label: "Three times daily (TID)", legacyLabel: "Three times daily" },
  { code: "QID",    label: "Four times daily (QID)",  legacyLabel: "Four times daily" },
  { code: "QHS",    label: "At bedtime (QHS)",        legacyLabel: "At bedtime" },
  { code: "PRN",    label: "As needed (PRN)",         legacyLabel: "As needed" },
  { code: "STAT",   label: "Once (STAT)",             legacyLabel: "Once (immediately)" },
  { code: "CUSTOM", label: "Custom\u2026",            legacyLabel: "" },
];

const FREQUENCY_INDEX: Partial<Record<FrequencyCode, FrequencyOption>> =
  FREQUENCY_OPTIONS.reduce(
    (acc, opt) => {
      acc[opt.code] = opt;
      return acc;
    },
    {} as Partial<Record<FrequencyCode, FrequencyOption>>,
  );

export function getFrequencyLegacyLabel(code: FrequencyCode | null | undefined): string {
  if (!code) return "";
  return FREQUENCY_INDEX[code]?.legacyLabel ?? "";
}

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

export interface DurationUnitOption {
  unit: DurationUnit;
  label: string;
  /** True when the unit pairs with a numeric value (false → 'until-finished'/'continue') */
  takesValue: boolean;
}

export const DURATION_UNIT_OPTIONS: readonly DurationUnitOption[] = [
  { unit: "days",            label: "days",            takesValue: true },
  { unit: "weeks",           label: "weeks",           takesValue: true },
  { unit: "months",          label: "months",          takesValue: true },
  { unit: "until-finished",  label: "until finished",  takesValue: false },
  { unit: "continue",        label: "continue",        takesValue: false },
];

const DURATION_UNIT_INDEX: Record<DurationUnit, DurationUnitOption> =
  DURATION_UNIT_OPTIONS.reduce(
    (acc, opt) => {
      acc[opt.unit] = opt;
      return acc;
    },
    {} as Record<DurationUnit, DurationUnitOption>,
  );

export function durationUnitTakesValue(unit: DurationUnit | null | undefined): boolean {
  if (!unit) return false;
  return DURATION_UNIT_INDEX[unit]?.takesValue ?? false;
}

/**
 * Build the legacy `duration` text from structured (value, unit). Returns
 * empty string when either piece is missing. Examples:
 *   (5, 'days')           → "5 days"
 *   (1, 'weeks')          → "1 week"     (singularised)
 *   (null, 'continue')    → "Continue"
 *   (null, 'until-finished') → "Until finished"
 */
export function formatDurationLegacyLabel(
  value: number | null | undefined,
  unit: DurationUnit | null | undefined,
): string {
  if (!unit) return "";
  const meta = DURATION_UNIT_INDEX[unit];
  if (!meta) return "";

  if (!meta.takesValue) {
    return meta.label.charAt(0).toUpperCase() + meta.label.slice(1);
  }

  if (value === null || value === undefined || value <= 0) return "";

  // Trim trailing 's' for singular values: "1 days" → "1 day"
  const singular = value === 1 ? meta.label.replace(/s$/, "") : meta.label;
  return `${value} ${singular}`;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export interface RouteOption {
  code: RouteCode;
  /** Long form shown in the dropdown */
  label: string;
  /** Mirror written to the legacy `route` column (T2-D4) */
  legacyLabel: string;
}

export const ROUTE_OPTIONS: readonly RouteOption[] = [
  { code: "oral",        label: "Oral",        legacyLabel: "Oral" },
  { code: "IV",          label: "Intravenous (IV)",   legacyLabel: "IV" },
  { code: "IM",          label: "Intramuscular (IM)", legacyLabel: "IM" },
  { code: "SC",          label: "Subcutaneous (SC)",  legacyLabel: "SC" },
  { code: "topical",     label: "Topical",     legacyLabel: "Topical" },
  { code: "inhaled",     label: "Inhaled",     legacyLabel: "Inhaled" },
  { code: "rectal",      label: "Rectal",      legacyLabel: "Rectal" },
  { code: "nasal",       label: "Nasal",       legacyLabel: "Nasal" },
  { code: "sublingual",  label: "Sublingual",  legacyLabel: "Sublingual" },
  { code: "other",       label: "Other\u2026", legacyLabel: "" },
];

const ROUTE_INDEX: Record<RouteCode, RouteOption> = ROUTE_OPTIONS.reduce(
  (acc, opt) => {
    acc[opt.code] = opt;
    return acc;
  },
  {} as Record<RouteCode, RouteOption>,
);

export function getRouteLegacyLabel(code: RouteCode | null | undefined): string {
  if (!code) return "";
  return ROUTE_INDEX[code]?.legacyLabel ?? "";
}

/**
 * Best-effort coercion from arbitrary text (e.g. `drug_master.route_default`,
 * an old free-text `route` value, a template field) into a structured
 * `RouteCode`. Returns null when the input doesn't match any enum slot
 * (so we never silently drop the doctor into the wrong canonical bucket).
 *
 * Used by:
 *   - <PrescriptionForm>'s `handleMedicineSelect` to pre-fill the
 *     structured route picker when the picked drug has a known
 *     `route_default`.
 *   - "Copy from last visit" (B1.8) when the legacy free-text route
 *     happens to match a known enum.
 */
export function coerceRouteCode(input: string | null | undefined): RouteCode | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Direct enum match (case-sensitive — IV/IM/SC are uppercase tokens).
  if ((ROUTE_INDEX as Record<string, RouteOption | undefined>)[trimmed]) {
    return trimmed as RouteCode;
  }
  // Case-insensitive fallback for `oral`/`Oral`/etc.
  const lower = trimmed.toLowerCase();
  for (const opt of ROUTE_OPTIONS) {
    if (opt.code.toLowerCase() === lower) return opt.code;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dose (qty + unit) — migration 133 / medicine card redesign
// ---------------------------------------------------------------------------

export interface DoseUnitOption {
  unit: DoseUnit;
  /** Singular display label ("tab", "spoon") */
  label: string;
  /** Plural display label ("tabs", "spoons") — "ml" stays "ml" */
  plural: string;
}

export const DOSE_UNIT_OPTIONS: readonly DoseUnitOption[] = [
  { unit: "tab",         label: "tab",         plural: "tabs" },
  { unit: "cap",         label: "cap",         plural: "caps" },
  { unit: "ml",          label: "ml",          plural: "ml" },
  { unit: "spoon",       label: "spoon",       plural: "spoons" },
  { unit: "drops",       label: "drop",        plural: "drops" },
  { unit: "puff",        label: "puff",        plural: "puffs" },
  { unit: "sachet",      label: "sachet",      plural: "sachets" },
  { unit: "unit",        label: "unit",        plural: "units" },
  { unit: "application", label: "application", plural: "applications" },
];

const DOSE_UNIT_INDEX: Record<DoseUnit, DoseUnitOption> =
  DOSE_UNIT_OPTIONS.reduce(
    (acc, opt) => {
      acc[opt.unit] = opt;
      return acc;
    },
    {} as Record<DoseUnit, DoseUnitOption>,
  );

/** "2 tabs", "1 spoon", "10 ml" — empty string when either piece missing. */
export function formatDoseLabel(
  qty: number | null | undefined,
  unit: DoseUnit | null | undefined,
): string {
  if (qty == null || qty <= 0 || !unit) return "";
  if (unit === "application") return "";
  const meta = DOSE_UNIT_INDEX[unit];
  if (!meta) return "";
  return `${qty} ${qty === 1 ? meta.label : meta.plural}`;
}

/** Topical forms where dose is "apply", not a countable unit. */
export function isTopicalForm(form: string | null | undefined): boolean {
  if (!form?.trim()) return false;
  return /oint|cream|gel|lotion|paste/.test(form.trim().toLowerCase());
}

/** Typical per-dose unit for a pharmaceutical form ("syrup" → spoon). */
export function defaultDoseUnitForForm(
  form: string | null | undefined,
): DoseUnit | null {
  if (!form) return null;
  const f = form.trim().toLowerCase();
  if (!f) return null;
  if (/tab/.test(f)) return "tab";
  if (/cap/.test(f)) return "cap";
  if (/syr|susp|solution|liquid|elixir/.test(f)) return "spoon";
  if (/drop/.test(f)) return "drops";
  if (/inhaler|puff|aerosol|mdi/.test(f)) return "puff";
  if (/sachet|powder|granule/.test(f)) return "sachet";
  if (/inj|vial|ampoule|pen|insulin/.test(f)) return "unit";
  if (/oint|cream|gel|lotion|paste/.test(f)) return "application";
  return null;
}

// ---------------------------------------------------------------------------
// Food / timing instruction — migration 133
// ---------------------------------------------------------------------------

export interface FoodTimingOption {
  code: FoodTiming;
  /** Chip / sig-line label */
  label: string;
}

export const FOOD_TIMING_OPTIONS: readonly FoodTimingOption[] = [
  { code: "before_food",   label: "Before food" },
  { code: "after_food",    label: "After food" },
  { code: "with_food",     label: "With food" },
  { code: "empty_stomach", label: "Empty stomach" },
  { code: "bedtime",       label: "At bedtime" },
];

const FOOD_TIMING_INDEX: Record<FoodTiming, FoodTimingOption> =
  FOOD_TIMING_OPTIONS.reduce(
    (acc, opt) => {
      acc[opt.code] = opt;
      return acc;
    },
    {} as Record<FoodTiming, FoodTimingOption>,
  );

export function getFoodTimingLabel(code: FoodTiming | null | undefined): string {
  if (!code) return "";
  return FOOD_TIMING_INDEX[code]?.label ?? "";
}

// ---------------------------------------------------------------------------
// Sig line — "2 tabs · OD · 30 days · After food"
// ---------------------------------------------------------------------------

export interface MedicineSigParts {
  dosage?: string | null;
  doseQty?: number | null;
  doseUnit?: DoseUnit | null;
  frequency?: string | null;
  frequencyCode?: FrequencyCode | null;
  duration?: string | null;
  durationValue?: number | null;
  durationUnit?: DurationUnit | null;
  foodTiming?: FoodTiming | null;
  instructions?: string | null;
}

/**
 * Compact one-line sig from structured fields, falling back to the
 * legacy free-text mirrors. Used by the collapsed medicine card and
 * by anything else that needs a human recap ("2 tabs · BID · 5 days ·
 * After food · avoid driving").
 */
export function formatMedicineSigLine(parts: MedicineSigParts): string {
  const segments: string[] = [];

  const dose = formatDoseLabel(parts.doseQty, parts.doseUnit);
  if (dose) segments.push(dose);
  else if (parts.dosage?.trim()) segments.push(parts.dosage.trim());

  if (parts.frequencyCode && parts.frequencyCode !== "CUSTOM") {
    segments.push(parts.frequencyCode);
  } else if (parts.frequency?.trim()) {
    segments.push(parts.frequency.trim());
  }

  const duration =
    parts.durationUnit != null
      ? formatDurationLegacyLabel(parts.durationValue, parts.durationUnit)
      : "";
  if (duration) segments.push(duration);
  else if (parts.duration?.trim()) segments.push(parts.duration.trim());

  const food = getFoodTimingLabel(parts.foodTiming);
  if (food) segments.push(food);

  if (parts.instructions?.trim()) segments.push(parts.instructions.trim());

  return segments.join(" \u00b7 ");
}
