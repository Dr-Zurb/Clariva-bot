/**
 * Pediatric growth percentile helpers (objective-tab · obj-28).
 *
 * Pure functions over the bundled reference dataset — age-at-visit derivation,
 * percentile interpolation, and chart-row projection. No I/O, no PHI logging.
 */

import {
  GROWTH_REFERENCE_MAX_AGE_MONTHS,
  getGrowthReferenceCheckpoints,
  type GrowthMetricKey,
  type GrowthReferenceCheckpoint,
  type GrowthSex,
} from "@/lib/cockpit/growth-reference/who-iap-v1";
import type { VitalTrendPoint } from "@/lib/cockpit/vitals-trends";

export type GrowthPercentileBand = "p3" | "p50" | "p97";

export interface GrowthMeasurementPoint {
  ageMonths: number;
  value: number;
  at: string;
}

export interface GrowthChartRow {
  ageMonths: number;
  ageLabel: string;
  patient?: number;
  p3?: number;
  p50?: number;
  p97?: number;
  at?: string;
}

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4375;

/** Resolve patient gender to a growth-chart sex; null when absent/unsupported (P6-D3). */
export function resolveGrowthSex(gender: string | null | undefined): GrowthSex | null {
  const normalized = gender?.trim().toLowerCase();
  if (normalized === "male" || normalized === "m") return "male";
  if (normalized === "female" || normalized === "f") return "female";
  return null;
}

/** Age in fractional months at a visit timestamp; null when DOB/visit invalid. */
export function ageInMonthsAtDate(
  dateOfBirth: string,
  atIso: string,
): number | null {
  const birthMs = Date.parse(dateOfBirth);
  const visitMs = Date.parse(atIso);
  if (!Number.isFinite(birthMs) || !Number.isFinite(visitMs) || visitMs < birthMs) {
    return null;
  }
  return (visitMs - birthMs) / MS_PER_MONTH;
}

export function formatAgeMonthsLabel(ageMonths: number): string {
  if (ageMonths < 1) return "<1 mo";
  if (ageMonths < 24) return `${Math.round(ageMonths)} mo`;
  const years = Math.floor(ageMonths / 12);
  const months = Math.round(ageMonths % 12);
  return months > 0 ? `${years}y ${months}mo` : `${years}y`;
}

/** Whether growth charts can render (requires DOB + male/female sex). */
export function canShowGrowthChart(
  dateOfBirth: string | null | undefined,
  gender: string | null | undefined,
): boolean {
  if (!dateOfBirth?.trim()) return false;
  return resolveGrowthSex(gender) != null;
}

function interpolateCheckpointValue(
  checkpoints: GrowthReferenceCheckpoint[],
  ageMonths: number,
  band: GrowthPercentileBand,
): number | null {
  if (checkpoints.length === 0) return null;
  if (ageMonths < checkpoints[0].ageMonths) return checkpoints[0][band];
  if (ageMonths > checkpoints[checkpoints.length - 1].ageMonths) {
    return checkpoints[checkpoints.length - 1][band];
  }

  for (let i = 0; i < checkpoints.length - 1; i++) {
    const left = checkpoints[i];
    const right = checkpoints[i + 1];
    if (ageMonths >= left.ageMonths && ageMonths <= right.ageMonths) {
      if (left.ageMonths === right.ageMonths) return left[band];
      const t = (ageMonths - left.ageMonths) / (right.ageMonths - left.ageMonths);
      return left[band] + t * (right[band] - left[band]);
    }
  }
  return checkpoints[checkpoints.length - 1][band];
}

/** Percentile band values at a given age + sex for one metric. */
export function getGrowthPercentileBandsAtAge(
  metric: GrowthMetricKey,
  sex: GrowthSex,
  ageMonths: number,
): { p3: number; p50: number; p97: number } | null {
  const checkpoints = getGrowthReferenceCheckpoints(metric, sex);
  const p3 = interpolateCheckpointValue(checkpoints, ageMonths, "p3");
  const p50 = interpolateCheckpointValue(checkpoints, ageMonths, "p50");
  const p97 = interpolateCheckpointValue(checkpoints, ageMonths, "p97");
  if (p3 == null || p50 == null || p97 == null) return null;
  return { p3, p50, p97 };
}

/** Map obj-25 visit points to age-indexed measurements; drops out-of-range ages. */
export function projectMeasurementsByAge(
  dateOfBirth: string,
  points: VitalTrendPoint[],
): GrowthMeasurementPoint[] {
  const out: GrowthMeasurementPoint[] = [];
  for (const point of points) {
    const ageMonths = ageInMonthsAtDate(dateOfBirth, point.at);
    if (ageMonths == null || ageMonths > GROWTH_REFERENCE_MAX_AGE_MONTHS) continue;
    out.push({ ageMonths, value: point.value, at: point.at });
  }
  return out.sort((a, b) => a.ageMonths - b.ageMonths);
}

/**
 * Build chart rows for the growth overlay: patient measurements + interpolated
 * P3/P50/P97 curves across the visible age span.
 */
export function buildGrowthChartRows(
  metric: GrowthMetricKey,
  sex: GrowthSex,
  dateOfBirth: string,
  patientPoints: VitalTrendPoint[],
): GrowthChartRow[] {
  const measurements = projectMeasurementsByAge(dateOfBirth, patientPoints);
  const refCheckpoints = getGrowthReferenceCheckpoints(metric, sex);

  const ages = new Set<number>();
  for (const cp of refCheckpoints) ages.add(cp.ageMonths);
  for (const m of measurements) ages.add(Math.round(m.ageMonths * 10) / 10);

  const sortedAges = [...ages].sort((a, b) => a - b);
  if (sortedAges.length === 0) return [];

  const minAge = Math.min(sortedAges[0], measurements[0]?.ageMonths ?? sortedAges[0]);
  const maxAge = Math.max(
    sortedAges[sortedAges.length - 1],
    measurements[measurements.length - 1]?.ageMonths ?? sortedAges[sortedAges.length - 1],
  );

  const spanAges = new Set<number>(sortedAges);
  for (const cp of refCheckpoints) {
    if (cp.ageMonths >= minAge - 1 && cp.ageMonths <= maxAge + 1) spanAges.add(cp.ageMonths);
  }

  const rows: GrowthChartRow[] = [...spanAges]
    .sort((a, b) => a - b)
    .map((ageMonths) => {
      const bands = getGrowthPercentileBandsAtAge(metric, sex, ageMonths);
      return {
        ageMonths,
        ageLabel: formatAgeMonthsLabel(ageMonths),
        p3: bands?.p3,
        p50: bands?.p50,
        p97: bands?.p97,
      };
    });

  for (const m of measurements) {
    const key = Math.round(m.ageMonths * 10) / 10;
    let row = rows.find((r) => Math.abs(r.ageMonths - key) < 0.05);
    if (!row) {
      const bands = getGrowthPercentileBandsAtAge(metric, sex, m.ageMonths);
      row = {
        ageMonths: m.ageMonths,
        ageLabel: formatAgeMonthsLabel(m.ageMonths),
        p3: bands?.p3,
        p50: bands?.p50,
        p97: bands?.p97,
      };
      rows.push(row);
    }
    row.patient = m.value;
    row.at = m.at;
  }

  return rows.sort((a, b) => a.ageMonths - b.ageMonths);
}

export type { GrowthMetricKey, GrowthSex };
