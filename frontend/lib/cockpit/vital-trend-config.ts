/**
 * Metric → trend-chart spec (vitals-section · trend redesign).
 *
 * Pure config that maps a primary vital metric to the lines, companion metrics,
 * and advisory bands its trend popup should render. Feeds the shared
 * {@link TrendChart} shell so BP shows systolic+diastolic, weight shows
 * weight+BMI (dual axis), and everything else falls back to a single line.
 */

import { BMI_REFERENCE_BAND } from "@/lib/cockpit/bmi";
import { resolveVital, type RangeContext } from "@/lib/cockpit/vitals-schema";
import type { VitalTrendMetricKey } from "@/lib/cockpit/vitals-trends";

const PRIMARY_STROKE = "#3b82f6";
const SECONDARY_STROKE = "#16a34a";
const DIASTOLIC_STROKE = "#8b5cf6";
const MAP_STROKE = "#f59e0b";

export type TrendAxisId = "left" | "right";

export interface VitalTrendLineSpec {
  /** Series key pulled from the indexed trend map. */
  metric: VitalTrendMetricKey;
  name: string;
  stroke: string;
  yAxisId?: TrendAxisId;
  /** Hide connecting dots (percentile-style reference curves). */
  showDots?: boolean;
}

export interface VitalTrendBandSpec {
  y1: number;
  y2: number;
  yAxisId?: TrendAxisId;
  label?: string;
}

export interface VitalTrendChartConfig {
  /** Chart title — also the popup header. */
  title: string;
  /** Lines to draw (first is the card's own metric). */
  lines: VitalTrendLineSpec[];
  /** Advisory shaded bands (age/sex-aware via ctx). */
  bands: (ctx: RangeContext) => VitalTrendBandSpec[];
}

const NO_BANDS = (): VitalTrendBandSpec[] => [];

function registryBand(metric: VitalTrendMetricKey, ctx: RangeContext): VitalTrendBandSpec[] {
  if (metric === "bmi" || metric === "map" || metric === "bsa") return [];
  const band = resolveVital(metric).range(ctx);
  return band ? [{ y1: band.low, y2: band.high, label: "Reference range" }] : [];
}

/** Shared blood-pressure config — systolic + diastolic (+ MAP) on one chart. */
const BP_CONFIG: VitalTrendChartConfig = {
  title: "Blood pressure",
  lines: [
    { metric: "vitalsBpSystolic", name: "Systolic", stroke: PRIMARY_STROKE },
    { metric: "vitalsBpDiastolic", name: "Diastolic", stroke: DIASTOLIC_STROKE },
    { metric: "map", name: "MAP", stroke: MAP_STROKE },
  ],
  bands: NO_BANDS,
};

const WEIGHT_CONFIG: VitalTrendChartConfig = {
  title: "Weight & BMI",
  lines: [
    { metric: "vitalsWtKg", name: "Weight", stroke: PRIMARY_STROKE, yAxisId: "left" },
    { metric: "bmi", name: "BMI", stroke: SECONDARY_STROKE, yAxisId: "right" },
  ],
  bands: () => [
    {
      y1: BMI_REFERENCE_BAND[0],
      y2: BMI_REFERENCE_BAND[1],
      yAxisId: "right",
      label: "Normal BMI",
    },
  ],
};

const BMI_CONFIG: VitalTrendChartConfig = {
  title: "BMI",
  lines: [{ metric: "bmi", name: "BMI", stroke: SECONDARY_STROKE }],
  bands: () => [
    { y1: BMI_REFERENCE_BAND[0], y2: BMI_REFERENCE_BAND[1], label: "Normal BMI" },
  ],
};

/** Metrics that share one chart — used to collapse BP sys/dia into a single button. */
const EXPLICIT_CONFIGS: Partial<Record<VitalTrendMetricKey, VitalTrendChartConfig>> = {
  vitalsBpSystolic: BP_CONFIG,
  vitalsBpDiastolic: BP_CONFIG,
  map: BP_CONFIG,
  vitalsWtKg: WEIGHT_CONFIG,
  bmi: BMI_CONFIG,
};

function derivedTitle(metric: VitalTrendMetricKey, fallbackLabel: string): string {
  if (metric === "map") return "Mean arterial pressure";
  if (metric === "bsa") return "Body surface area";
  if (metric === "bmi") return "BMI";
  return fallbackLabel;
}

/**
 * Resolve the chart spec for a card. `label` is the card's display label, used
 * for single-metric titles. Explicit configs (BP, weight, BMI) win.
 */
export function resolveVitalTrendConfig(
  metric: VitalTrendMetricKey,
  label: string,
): VitalTrendChartConfig {
  const explicit = EXPLICIT_CONFIGS[metric];
  if (explicit) return explicit;

  return {
    title: derivedTitle(metric, label),
    lines: [{ metric, name: derivedTitle(metric, label), stroke: PRIMARY_STROKE }],
    bands: (ctx) => registryBand(metric, ctx),
  };
}
