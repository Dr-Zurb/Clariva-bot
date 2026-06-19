/**
 * Fever temperature ⇄ grade binding (fever schema refinement).
 * Mirrors the pain-score / severity pattern: exact number + unit linked to
 * Mild / Moderate / High / Very high bands.
 */

export type TemperatureUnit = "F" | "C";

export type FeverGrade = "mild" | "moderate" | "high" | "very_high";

const FEVER_GRADE_LABELS: Record<FeverGrade, string> = {
  mild: "Mild",
  moderate: "Moderate",
  high: "High",
  very_high: "Very high",
};

/** Inclusive °F thresholds (clinical: fever from 100.4°F / 38.0°C). */
const FEVER_GRADE_RANGE_F: Record<FeverGrade, [number, number]> = {
  mild: [99.0, 100.3],
  moderate: [100.4, 102.1],
  high: [102.2, 103.9],
  very_high: [104.0, 115],
};

/** Representative reading when a grade chip is tapped (not already in-band). */
const FEVER_GRADE_TEMP_F: Record<FeverGrade, number> = {
  mild: 100,
  moderate: 101,
  high: 103,
  very_high: 105,
};

const FEVER_GRADE_TEMP_C: Record<FeverGrade, number> = {
  mild: 37.5,
  moderate: 38.5,
  high: 39.5,
  very_high: 40.5,
};

export function formatFeverGradeLabel(grade: FeverGrade | null | undefined): string | null {
  if (!grade) return null;
  return FEVER_GRADE_LABELS[grade] ?? null;
}

export function toFahrenheit(value: number, unit: TemperatureUnit): number {
  if (unit === "F") return value;
  return (value * 9) / 5 + 32;
}

export function fromFahrenheit(f: number, unit: TemperatureUnit): number {
  if (unit === "F") return roundTemp(f);
  return roundTemp(((f - 32) * 5) / 9);
}

function roundTemp(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Map an exact reading onto its fever grade (< 99°F → null). */
export function temperatureToFeverGrade(
  value: number,
  unit: TemperatureUnit,
): FeverGrade | null {
  const f = toFahrenheit(value, unit);
  if (f < 99) return null;
  if (f <= 100.3) return "mild";
  if (f <= 102.1) return "moderate";
  if (f <= 103.9) return "high";
  return "very_high";
}

/** Representative temperature for a grade in the chosen unit. */
export function feverGradeToTemperature(
  grade: FeverGrade,
  unit: TemperatureUnit,
): number {
  return unit === "F" ? FEVER_GRADE_TEMP_F[grade] : FEVER_GRADE_TEMP_C[grade];
}

/** Whether the reading already sits inside the grade's band. */
export function isTemperatureInFeverGrade(
  value: number | null | undefined,
  unit: TemperatureUnit | null | undefined,
  grade: FeverGrade | null | undefined,
): boolean {
  if (typeof value !== "number" || !unit || !grade) return false;
  const f = toFahrenheit(value, unit);
  const range = FEVER_GRADE_RANGE_F[grade];
  return f >= range[0] && f <= range[1];
}

export function formatTemperatureDisplay(
  value: number | null | undefined,
  unit: TemperatureUnit | null | undefined,
): string | null {
  if (typeof value !== "number" || !unit) return null;
  const rounded = roundTemp(value);
  const suffix = unit === "F" ? "°F" : "°C";
  return `${rounded}${suffix}`;
}

/** Collapsed-card / HOPI lead: "101°F (High)" or grade-only when no number. */
export function formatFeverTemperatureSummary(
  temperature: number | null | undefined,
  temperatureUnit: TemperatureUnit | null | undefined,
  feverGrade: FeverGrade | null | undefined,
): string | null {
  const tempLabel = formatTemperatureDisplay(temperature, temperatureUnit);
  const gradeLabel = formatFeverGradeLabel(feverGrade);
  if (tempLabel && gradeLabel) return `${tempLabel} (${gradeLabel})`;
  if (tempLabel) return tempLabel;
  if (gradeLabel) return gradeLabel;
  return null;
}

export function isFeltOnlyMeasured(measuredBy: string | null | undefined): boolean {
  return measuredBy?.trim() === "Felt only";
}

export type FeverReportedBy = "Patient" | "Attendant" | "Clinician";

const FEVER_REPORTED_BY_LABELS: Record<FeverReportedBy, string> = {
  Patient: "Patient",
  Attendant: "Attendant",
  Clinician: "Clinician",
};

export function formatFeverReportedByLabel(
  reportedBy: string | null | undefined,
): string | null {
  if (!reportedBy?.trim()) return null;
  const key = reportedBy.trim() as FeverReportedBy;
  return FEVER_REPORTED_BY_LABELS[key] ?? reportedBy.trim();
}

/** Card / HOPI summary — grade-only when subjective (no exact reading). */
export function formatFeverDisplaySummary(
  temperature: number | null | undefined,
  temperatureUnit: TemperatureUnit | null | undefined,
  feverGrade: FeverGrade | null | undefined,
  measuredBy?: string | null,
  reportedBy?: string | null,
): string | null {
  if (isFeltOnlyMeasured(measuredBy)) {
    const gradeLabel = formatFeverGradeLabel(feverGrade);
    const reporterLabel = formatFeverReportedByLabel(reportedBy);
    if (gradeLabel && reporterLabel) return `${gradeLabel} · ${reporterLabel}`;
    if (gradeLabel) return gradeLabel;
    if (reporterLabel) return reporterLabel;
    return null;
  }
  return formatFeverTemperatureSummary(temperature, temperatureUnit, feverGrade);
}

/** Convert a reading to the other unit (1 decimal). */
export function convertTemperatureUnit(
  value: number,
  from: TemperatureUnit,
  to: TemperatureUnit,
): number {
  if (from === to) return roundTemp(value);
  return fromFahrenheit(toFahrenheit(value, from), to);
}
