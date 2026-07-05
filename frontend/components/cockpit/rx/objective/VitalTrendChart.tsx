"use client";

/**
 * Reusable per-vital trend chart + demographics/band helpers.
 *
 * The single-metric chart shared by the all-trends dialog and any other
 * read-only trend surface. Registry-driven advisory bands; reuses the obj-27
 * {@link SingleMetricTrendChart} shell.
 */

import { SingleMetricTrendChart } from "@/components/cockpit/rx/objective/TrendChart";
import { ageInMonthsAtDate } from "@/lib/cockpit/growth-percentiles";
import { BMI_REFERENCE_BAND } from "@/lib/cockpit/bmi";
import {
  resolveVital,
  type RangeContext,
  type VitalKey,
} from "@/lib/cockpit/vitals-schema";
import type { VitalTrendMetricKey, VitalTrendSeries } from "@/lib/cockpit/vitals-trends";
import type { CustomVitalTrendSeries } from "@/lib/cockpit/custom-vitals-trends";

const TREND_LINE_STROKE = "#3b82f6";

/** Map patient demographics to the registry's advisory-band context. */
export function patientDemographicsToRangeContext(
  dateOfBirth: string | null | undefined,
  gender: string | null | undefined,
  at = new Date().toISOString(),
): RangeContext {
  let ageYears: number | null = null;
  if (dateOfBirth?.trim()) {
    const ageMonths = ageInMonthsAtDate(dateOfBirth, at);
    if (ageMonths != null) ageYears = ageMonths / 12;
  }
  const sex =
    gender === "female" ? "female" : gender === "male" ? "male" : null;
  return { ageYears, sex };
}

function isStoredVitalKey(metric: VitalTrendMetricKey): metric is VitalKey {
  return metric !== "bmi" && metric !== "map" && metric !== "bsa";
}

/** Resolve the shaded reference band for a trend metric (registry-driven). */
export function resolveTrendReferenceBand(
  metric: VitalTrendMetricKey,
  ctx: RangeContext = {},
): [number, number] | undefined {
  if (metric === "bmi") return BMI_REFERENCE_BAND;
  if (!isStoredVitalKey(metric)) return undefined;
  const band = resolveVital(metric).range(ctx);
  return band ? [band.low, band.high] : undefined;
}

export function resolveTrendChartTitle(metric: VitalTrendMetricKey, label: string): string {
  if (metric === "bmi") return "BMI";
  if (metric === "map") return "Mean arterial pressure";
  if (metric === "bsa") return "Body surface area";
  return label;
}

export interface VitalTrendChartProps {
  metric: VitalTrendMetricKey;
  series: VitalTrendSeries;
  /** Accessible vital label, e.g. "Heart rate". */
  label: string;
  rangeCtx?: RangeContext;
}

/** Full per-vital trend chart — reused by the all-trends dialog. */
export function VitalTrendChart({
  metric,
  series,
  label,
  rangeCtx = {},
}: VitalTrendChartProps): JSX.Element | null {
  if (series.points.length === 0) return null;

  const chartTitle = resolveTrendChartTitle(metric, label);
  const referenceBand = resolveTrendReferenceBand(metric, rangeCtx);
  const visitCount = series.points.length;
  const ariaDescription =
    visitCount === 1
      ? `${chartTitle} trend across 1 visit.`
      : `${chartTitle} trend across ${visitCount} visits.`;

  return (
    <SingleMetricTrendChart
      title={chartTitle}
      unit={series.unit}
      stroke={TREND_LINE_STROKE}
      points={series.points}
      referenceBand={referenceBand}
      ariaDescription={ariaDescription}
    />
  );
}

/** Full trend chart for a doctor-authored numeric custom vital. */
export function CustomVitalTrendChart({
  series,
}: {
  series: CustomVitalTrendSeries;
}): JSX.Element | null {
  if (series.points.length === 0) return null;

  const visitCount = series.points.length;
  const ariaDescription =
    visitCount === 1
      ? `${series.label} trend across 1 visit.`
      : `${series.label} trend across ${visitCount} visits.`;

  return (
    <SingleMetricTrendChart
      title={series.label}
      unit={series.unit}
      stroke={TREND_LINE_STROKE}
      points={series.points}
      ariaDescription={ariaDescription}
    />
  );
}
