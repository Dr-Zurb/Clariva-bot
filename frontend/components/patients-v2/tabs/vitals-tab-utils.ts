import type { PatientVitalsReading } from "@/types/patient-chart";

export type VitalsRange = "7d" | "30d" | "6m" | "1y" | "all";

export const VITALS_RANGE_OPTIONS: { key: VitalsRange; label: string }[] = [
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "6m", label: "6m" },
  { key: "1y", label: "1y" },
  { key: "all", label: "All" },
];

export type VitalChartRow = {
  at: string;
  label: string;
  note?: string | null;
  [key: string]: string | number | null | undefined;
};

export function rangeCutoffMs(range: VitalsRange): number | null {
  if (range === "all") return null;
  const days: Record<Exclude<VitalsRange, "all">, number> = {
    "7d": 7,
    "30d": 30,
    "6m": 183,
    "1y": 365,
  };
  return Date.now() - days[range] * 24 * 60 * 60 * 1000;
}

export function filterByRange(
  readings: PatientVitalsReading[],
  range: VitalsRange,
): PatientVitalsReading[] {
  const cutoff = rangeCutoffMs(range);
  if (cutoff == null) return readings;
  return readings.filter((r) => new Date(r.recorded_at).getTime() >= cutoff);
}

export function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function rowsForField(
  readings: PatientVitalsReading[],
  field: keyof PatientVitalsReading,
  valueKey: string,
): VitalChartRow[] {
  return readings
    .filter((r) => typeof r[field] === "number")
    .map((r) => ({
      at: r.recorded_at,
      label: dateLabel(r.recorded_at),
      [valueKey]: r[field] as number,
      note: r.note,
    }))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export function mergeBpRows(readings: PatientVitalsReading[]): VitalChartRow[] {
  return readings
    .filter((r) => r.bp_systolic != null || r.bp_diastolic != null)
    .map((r) => ({
      at: r.recorded_at,
      label: dateLabel(r.recorded_at),
      ...(r.bp_systolic != null ? { sys: r.bp_systolic } : {}),
      ...(r.bp_diastolic != null ? { dia: r.bp_diastolic } : {}),
      note: r.note,
    }))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export function latestReading(
  readings: PatientVitalsReading[],
): PatientVitalsReading | null {
  if (readings.length === 0) return null;
  return [...readings].sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
  )[0]!;
}

export function computeBmi(weightKg: number, heightCm: number): number | null {
  if (heightCm <= 0) return null;
  const m = heightCm / 100;
  const bmi = weightKg / (m * m);
  return Number.isFinite(bmi) ? Math.round(bmi * 10) / 10 : null;
}

export type VitalBadge = "normal" | "warning" | "critical";

export function bpBadge(sys: number | null, dia: number | null): VitalBadge {
  if ((sys != null && sys > 140) || (dia != null && dia > 90)) return "critical";
  return "normal";
}

export function spo2Badge(v: number | null): VitalBadge {
  if (v != null && v < 95) return "critical";
  return "normal";
}

export function pulseBadge(v: number | null): VitalBadge {
  if (v != null && (v < 50 || v > 110)) return "warning";
  return "normal";
}

export function tempBadge(v: number | null): VitalBadge {
  if (v != null && v > 38) return "critical";
  return "normal";
}

export function bmiBadge(v: number | null): VitalBadge {
  if (v == null) return "normal";
  if (v < 18.5 || v > 30) return "warning";
  return "normal";
}
