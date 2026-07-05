/**
 * Read-only categorical vital value-timelines (vitals-section · vit-12).
 *
 * Pure projection over the doctor-scoped per-patient prescription list — one
 * labelled chip per visit per categorical vital. Never throws on sparse/legacy
 * rows; omits vitals with no readings (P6-D4/P6-D6).
 */

import {
  CATEGORICAL_VITALS_REGISTRY,
  type CategoricalVitalKey,
} from "@/lib/cockpit/categorical-vitals-schema";
import { normalizeVitalsJson } from "@/lib/cockpit/vitals-json";
import type { VitalGroup } from "@/lib/cockpit/vitals-schema";
import type { PrescriptionWithRelations } from "@/types/prescription";

/** One categorical reading at a visit — display label, not the stored enum. */
export interface CategoricalVitalTimelinePoint {
  value: string;
  label: string;
  /** ISO timestamp — `prescriptions.created_at`. */
  at: string;
  visitLabel: string;
}

/** Per-categorical-vital chip timeline sorted oldest → newest. */
export interface CategoricalVitalTimeline {
  key: CategoricalVitalKey;
  label: string;
  group: VitalGroup;
  points: CategoricalVitalTimelinePoint[];
}

export function formatCategoricalVisitLabel(at: string): string {
  return new Date(at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function sortPointsAsc(
  points: CategoricalVitalTimelinePoint[],
): CategoricalVitalTimelinePoint[] {
  return [...points].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}

/**
 * Project categorical vitals from `vitals_json` into per-key chip timelines.
 * Returns only vitals with ≥1 reading; never throws.
 */
export function buildCategoricalVitalTimelines(
  prescriptions: PrescriptionWithRelations[] | null | undefined,
): CategoricalVitalTimeline[] {
  const buckets = new Map<CategoricalVitalKey, CategoricalVitalTimelinePoint[]>(
    CATEGORICAL_VITALS_REGISTRY.map((def) => [def.key, []]),
  );

  if (Array.isArray(prescriptions)) {
    for (const rx of prescriptions) {
      const at = rx.created_at;
      if (typeof at !== "string" || !at) continue;

      const json = normalizeVitalsJson(rx.vitals_json);
      for (const def of CATEGORICAL_VITALS_REGISTRY) {
        const raw = json[def.key];
        if (typeof raw !== "string") continue;
        const option = def.options.find((o) => o.value === raw);
        if (!option) continue;
        buckets.get(def.key)!.push({
          value: raw,
          label: option.label,
          at,
          visitLabel: formatCategoricalVisitLabel(at),
        });
      }
    }
  }

  return CATEGORICAL_VITALS_REGISTRY.map((def) => ({
    key: def.key,
    label: def.label,
    group: def.group,
    points: sortPointsAsc(buckets.get(def.key) ?? []),
  })).filter((timeline) => timeline.points.length > 0);
}
