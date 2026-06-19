/**
 * Duration helpers for complaint cards (subj — duration as numeric value + unit).
 *
 * Stored canonically as a free string on `Complaint.duration` (e.g. "3 days") so
 * no schema/backend change is required. The composite control parses the string
 * back into {value, unit} when possible, and serialises edits to the canonical form.
 */

export type DurationUnit = "hour" | "day" | "week" | "month" | "year";

export const DURATION_UNITS: readonly DurationUnit[] = [
  "hour",
  "day",
  "week",
  "month",
  "year",
];

/** Inline combobox unit order (hours last — Eka-style). */
export const INLINE_DURATION_UNITS: readonly DurationUnit[] = [
  "day",
  "week",
  "month",
  "year",
  "hour",
];

export interface ParsedDuration {
  value: number;
  unit: DurationUnit;
}

/** Map of accepted unit tokens (abbreviations + words) to the canonical unit. */
const UNIT_TOKEN_MAP: Record<string, DurationUnit> = {
  h: "hour",
  hr: "hour",
  hrs: "hour",
  hour: "hour",
  hours: "hour",
  d: "day",
  day: "day",
  days: "day",
  w: "week",
  wk: "week",
  wks: "week",
  week: "week",
  weeks: "week",
  mo: "month",
  mos: "month",
  month: "month",
  months: "month",
  y: "year",
  yr: "year",
  yrs: "year",
  year: "year",
  years: "year",
};

/** Canonical label, e.g. (1,"day") -> "1 day", (3,"day") -> "3 days". */
export function serializeDuration(value: number, unit: DurationUnit): string {
  const safe = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  if (safe <= 0) return "";
  return `${safe} ${unit}${safe === 1 ? "" : "s"}`;
}

/**
 * Parse a duration string into {value, unit} when it cleanly matches
 * `<number> <unit>` (allowing common abbreviations). Returns null otherwise
 * (e.g. "Today", ">1mo", "since childhood") so the caller can keep the raw text.
 */
export function parseDuration(raw: string | null | undefined): ParsedDuration | null {
  if (!raw) return null;
  const match = raw
    .trim()
    .toLowerCase()
    .match(/^(\d{1,4})\s*([a-z]+)$/);
  if (!match) return null;
  const value = Number.parseInt(match[1]!, 10);
  const unit = UNIT_TOKEN_MAP[match[2]!];
  if (!unit || !Number.isFinite(value) || value <= 0) return null;
  return { value, unit };
}

/** Quick-fill presets surfaced as chips above the numeric builder. */
export const DURATION_PRESET_CHIPS = ["Today", "2d", "1wk", ">1mo"] as const;

/** Display label for combobox rows, e.g. (4, "day") → "4 Days". */
export function formatDurationOptionLabel(value: number, unit: DurationUnit): string {
  const raw = serializeDuration(value, unit);
  return raw.replace(/(\d+)\s+(\w+)/, (_, num, word) => {
    return `${num} ${word.charAt(0).toUpperCase()}${word.slice(1)}`;
  });
}

export function buildInlineDurationOptions(value: number): Array<{
  unit: DurationUnit;
  serialized: string;
  label: string;
}> {
  if (!Number.isFinite(value) || value <= 0) return [];
  return INLINE_DURATION_UNITS.map((unit) => ({
    unit,
    serialized: serializeDuration(value, unit),
    label: formatDurationOptionLabel(value, unit),
  }));
}
