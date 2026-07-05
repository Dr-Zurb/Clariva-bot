/**
 * Read-only per-vital time-series projection (objective-tab · obj-25).
 *
 * Pure transform over the doctor-scoped per-patient prescription list — no I/O,
 * no writes, no chart UI. Each visit contributes zero or more points per metric;
 * null/absent values are skipped per metric so sparse rows keep other metrics'
 * history intact (P6-D4/P6-D6).
 *
 * Stored vitals use canonical units from `vitals-schema.ts`. Derived metrics
 * reuse P2 helpers: BMI (`bmi.ts`), MAP/BSA (`vitals-derive.ts`).
 */

import { computeBmi } from "@/lib/cockpit/bmi";
import { computeBsa, computeMap } from "@/lib/cockpit/vitals-derive";
import {
  resolveVital,
  VITALS_REGISTRY,
  type ColumnVitalKey,
  type VitalDefinition,
  type VitalKey,
} from "@/lib/cockpit/vitals-schema";
import type { PrescriptionWithRelations, VitalsJson } from "@/types/prescription";

/** Stored numeric vitals plus visit-derived computed metrics. */
export type VitalTrendMetricKey = VitalKey | "bmi" | "map" | "bsa";

/** One measured or derived value at a visit timestamp. */
export interface VitalTrendPoint {
  value: number;
  /** ISO timestamp — `prescriptions.created_at` for the source visit. */
  at: string;
}

/** Per-metric time series sorted oldest → newest. */
export interface VitalTrendSeries {
  metric: VitalTrendMetricKey;
  /** Canonical unit symbol for the metric (e.g. `mmHg`, `kg/m²`). */
  unit: string;
  points: VitalTrendPoint[];
}

/** Maps each column-backed vital key to its prescription column. */
const PRESCRIPTION_VITAL_COLUMN: Record<ColumnVitalKey, keyof PrescriptionWithRelations> = {
  vitalsBpSystolic: "vitals_bp_systolic",
  vitalsBpDiastolic: "vitals_bp_diastolic",
  vitalsHr: "vitals_hr",
  vitalsRr: "vitals_rr",
  vitalsTempC: "vitals_temp_c",
  vitalsSpo2: "vitals_spo2",
  vitalsWtKg: "vitals_wt_kg",
  vitalsHtCm: "vitals_ht_cm",
  vitalsPainScore: "vitals_pain_score",
  vitalsGlucoseMgDl: "vitals_glucose_mg_dl",
  vitalsGcsTotal: "vitals_gcs_total",
  vitalsHeadCircumferenceCm: "vitals_head_circumference_cm",
  vitalsMuacCm: "vitals_muac_cm",
  vitalsWaistCm: "vitals_waist_cm",
};

const DERIVED_METRIC_UNITS: Record<"bmi" | "map" | "bsa", string> = {
  bmi: "kg/m²",
  map: "mmHg",
  bsa: "m²",
};

const NUMERIC_VITAL_KEYS: readonly VitalKey[] = VITALS_REGISTRY.map((v) => v.key);

const ALL_METRICS: readonly VitalTrendMetricKey[] = [
  ...NUMERIC_VITAL_KEYS,
  "bmi",
  "map",
  "bsa",
];

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sortPointsAsc(points: VitalTrendPoint[]): VitalTrendPoint[] {
  return [...points].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}

/** Read one stored vital from its column or `vitals_json` per the registry. */
function readStoredVitalValue(
  rx: PrescriptionWithRelations,
  def: VitalDefinition,
): number | null {
  if (def.storage === "column") {
    const raw = rx[PRESCRIPTION_VITAL_COLUMN[def.key as ColumnVitalKey]];
    return finiteNumber(raw);
  }
  const json = rx.vitals_json;
  if (!json || typeof json !== "object") return null;
  const raw = json[def.key as keyof VitalsJson];
  return finiteNumber(raw);
}

function emptySeries(metric: VitalTrendMetricKey): VitalTrendSeries {
  const unit =
    metric === "bmi" || metric === "map" || metric === "bsa"
      ? DERIVED_METRIC_UNITS[metric]
      : resolveVital(metric).canonicalUnit;
  return { metric, unit, points: [] };
}

/**
 * Project per-patient prescription history into typed per-vital time series.
 * Never throws — empty input yields all metrics with empty `points`.
 */
export function buildVitalsTrendSeries(
  prescriptions: PrescriptionWithRelations[] | null | undefined,
): VitalTrendSeries[] {
  const buckets = new Map<VitalTrendMetricKey, VitalTrendPoint[]>(
    ALL_METRICS.map((metric) => [metric, []]),
  );

  if (Array.isArray(prescriptions)) {
    for (const rx of prescriptions) {
      const at = rx.created_at;
      if (typeof at !== "string" || !at) continue;

      for (const def of VITALS_REGISTRY) {
        const value = readStoredVitalValue(rx, def);
        if (value == null) continue;
        buckets.get(def.key)!.push({ value, at });
      }

      const bmi = computeBmi(rx.vitals_ht_cm, rx.vitals_wt_kg);
      if (bmi) buckets.get("bmi")!.push({ value: bmi.value, at });

      const map = computeMap(rx.vitals_bp_systolic, rx.vitals_bp_diastolic);
      if (map != null) buckets.get("map")!.push({ value: map, at });

      const bsa = computeBsa(rx.vitals_ht_cm, rx.vitals_wt_kg);
      if (bsa != null) buckets.get("bsa")!.push({ value: bsa, at });
    }
  }

  return ALL_METRICS.map((metric) => {
    const series = emptySeries(metric);
    series.points = sortPointsAsc(buckets.get(metric) ?? []);
    return series;
  });
}

/** Lookup table keyed by metric — stable shape for sparkline/chart consumers. */
export function indexVitalsTrendSeries(
  series: VitalTrendSeries[],
): Readonly<Record<VitalTrendMetricKey, VitalTrendSeries>> {
  const out = {} as Record<VitalTrendMetricKey, VitalTrendSeries>;
  for (const metric of ALL_METRICS) {
    out[metric] = series.find((s) => s.metric === metric) ?? emptySeries(metric);
  }
  return out;
}

/** Return one metric's series; empty series when missing or unknown. */
export function getVitalTrendSeries(
  series: VitalTrendSeries[],
  metric: VitalTrendMetricKey,
): VitalTrendSeries {
  return series.find((s) => s.metric === metric) ?? emptySeries(metric);
}
