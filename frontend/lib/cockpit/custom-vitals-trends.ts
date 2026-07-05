/**
 * Read-only trend projections for doctor-authored custom vitals (vit-14).
 *
 * Numeric customs → line-chart series; text customs → chip timelines (same
 * affordance as categorical vitals). Pure transform over the per-patient
 * prescription list — values live in `vitals_json.vitalsCustom`.
 */

import {
  formatCategoricalVisitLabel,
  type CategoricalVitalTimelinePoint,
} from "@/lib/cockpit/categorical-vitals-timeline";
import {
  normalizeVitalsCustomEntries,
  type CustomVitalDef,
} from "@/lib/cockpit/vitals-custom";
import type { VitalGroup } from "@/lib/cockpit/vitals-schema";
import type { VitalTrendPoint } from "@/lib/cockpit/vitals-trends";
import type { PrescriptionWithRelations } from "@/types/prescription";

export interface CustomVitalTrendSeries {
  id: string;
  label: string;
  unit: string;
  /** Resolved from doctor defs when available; otherwise `"core"`. */
  group: VitalGroup;
  points: VitalTrendPoint[];
}

export interface CustomVitalTextTimeline {
  id: string;
  label: string;
  group: VitalGroup;
  points: CategoricalVitalTimelinePoint[];
}

function sortTrendPointsAsc(points: VitalTrendPoint[]): VitalTrendPoint[] {
  return [...points].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}

function sortTextPointsAsc(
  points: CategoricalVitalTimelinePoint[],
): CategoricalVitalTimelinePoint[] {
  return [...points].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}

function resolveCustomVitalGroup(
  id: string,
  defs?: readonly CustomVitalDef[],
): VitalGroup {
  return defs?.find((def) => def.id === id)?.group ?? "core";
}

function finiteNumeric(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function sortPrescriptionsChronologically(
  prescriptions: PrescriptionWithRelations[],
): PrescriptionWithRelations[] {
  return [...prescriptions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

/**
 * Project numeric custom vitals into per-id time series. Label/unit come from
 * the latest visit snapshot (self-describing entries). Never throws.
 */
export function buildCustomVitalTrendSeries(
  prescriptions: PrescriptionWithRelations[] | null | undefined,
  defs?: readonly CustomVitalDef[],
): CustomVitalTrendSeries[] {
  const buckets = new Map<
    string,
    { label: string; unit: string; points: VitalTrendPoint[] }
  >();

  if (Array.isArray(prescriptions)) {
    for (const rx of sortPrescriptionsChronologically(prescriptions)) {
      const at = rx.created_at;
      if (typeof at !== "string" || !at) continue;

      for (const entry of normalizeVitalsCustomEntries(rx.vitals_json?.vitalsCustom)) {
        if (entry.kind !== "numeric") continue;
        const value = finiteNumeric(entry.value);
        if (value == null) continue;

        let bucket = buckets.get(entry.id);
        if (!bucket) {
          bucket = { label: entry.label, unit: entry.unit ?? "", points: [] };
          buckets.set(entry.id, bucket);
        }
        bucket.label = entry.label;
        bucket.unit = entry.unit ?? "";
        bucket.points.push({ value, at });
      }
    }
  }

  return Array.from(buckets.entries()).map(([id, bucket]) => ({
    id,
    label: bucket.label,
    unit: bucket.unit,
    group: resolveCustomVitalGroup(id, defs),
    points: sortTrendPointsAsc(bucket.points),
  }));
}

/** Project text custom vitals into per-id chip timelines. Never throws. */
export function buildCustomVitalTextTimelines(
  prescriptions: PrescriptionWithRelations[] | null | undefined,
  defs?: readonly CustomVitalDef[],
): CustomVitalTextTimeline[] {
  const buckets = new Map<
    string,
    { label: string; points: CategoricalVitalTimelinePoint[] }
  >();

  if (Array.isArray(prescriptions)) {
    for (const rx of sortPrescriptionsChronologically(prescriptions)) {
      const at = rx.created_at;
      if (typeof at !== "string" || !at) continue;

      for (const entry of normalizeVitalsCustomEntries(rx.vitals_json?.vitalsCustom)) {
        if (entry.kind !== "text") continue;
        const text =
          typeof entry.value === "string" ? entry.value.trim() : String(entry.value ?? "").trim();
        if (!text) continue;

        let bucket = buckets.get(entry.id);
        if (!bucket) {
          bucket = { label: entry.label, points: [] };
          buckets.set(entry.id, bucket);
        }
        bucket.label = entry.label;
        bucket.points.push({
          value: text,
          label: text,
          at,
          visitLabel: formatCategoricalVisitLabel(at),
        });
      }
    }
  }

  return Array.from(buckets.entries()).map(([id, bucket]) => ({
    id,
    label: bucket.label,
    group: resolveCustomVitalGroup(id, defs),
    points: sortTextPointsAsc(bucket.points),
  }));
}

/** Lookup table keyed by custom vital id. */
export function indexCustomVitalTrendSeries(
  series: CustomVitalTrendSeries[],
): Readonly<Record<string, CustomVitalTrendSeries>> {
  const out: Record<string, CustomVitalTrendSeries> = {};
  for (const item of series) {
    out[item.id] = item;
  }
  return out;
}

/** Apply doctor definition groups to trend series built from prescriptions alone. */
export function enrichCustomVitalTrendGroups(
  series: readonly CustomVitalTrendSeries[],
  defs: readonly CustomVitalDef[],
): CustomVitalTrendSeries[] {
  return series.map((item) => ({
    ...item,
    group: resolveCustomVitalGroup(item.id, defs),
  }));
}

/** Apply doctor definition groups to text timelines built from prescriptions alone. */
export function enrichCustomVitalTextTimelineGroups(
  timelines: readonly CustomVitalTextTimeline[],
  defs: readonly CustomVitalDef[],
): CustomVitalTextTimeline[] {
  return timelines.map((item) => ({
    ...item,
    group: resolveCustomVitalGroup(item.id, defs),
  }));
}

/** Custom numeric + text vitals that have ≥1 prior reading. */
export function countCustomVitalsWithTrendHistory(
  numericSeries: readonly CustomVitalTrendSeries[],
  textTimelines: readonly CustomVitalTextTimeline[],
): number {
  return (
    numericSeries.filter((s) => s.points.length > 0).length +
    textTimelines.filter((t) => t.points.length > 0).length
  );
}
