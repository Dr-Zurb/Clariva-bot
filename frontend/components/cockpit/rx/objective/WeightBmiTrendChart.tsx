"use client";

/**
 * Weight + derived BMI detail trend chart (objective-tab · obj-27).
 *
 * Thin instance over {@link TrendChart} — dual-axis kg (left) and BMI (right)
 * with a shaded normal-BMI band. Read-only; consumes obj-25 series.
 */

import {
  mergeTrendSeriesToRows,
  TrendChart,
  type TrendChartLine,
} from "@/components/cockpit/rx/objective/TrendChart";
import type { VitalTrendSeries } from "@/lib/cockpit/vitals-trends";

const WEIGHT_BMI_LINES: TrendChartLine[] = [
  { dataKey: "weight", name: "Weight", unit: "kg", stroke: "#3b82f6", yAxisId: "left" },
  { dataKey: "bmi", name: "BMI", unit: "kg/m²", stroke: "#16a34a", yAxisId: "right" },
];

export interface WeightBmiTrendChartProps {
  weightSeries: VitalTrendSeries;
  bmiSeries: VitalTrendSeries;
  isLoading?: boolean;
}

export function WeightBmiTrendChart({
  weightSeries,
  bmiSeries,
  isLoading = false,
}: WeightBmiTrendChartProps): JSX.Element {
  if (isLoading) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground" aria-live="polite">
        Loading trend history…
      </p>
    );
  }

  const data = mergeTrendSeriesToRows([
    { dataKey: "weight", points: weightSeries.points },
    { dataKey: "bmi", points: bmiSeries.points },
  ]);

  const visitCount = data.length;
  const ariaDescription =
    visitCount === 0
      ? "Weight and BMI trend chart. No prior readings."
      : `Weight and BMI trend chart across ${visitCount} visit${visitCount === 1 ? "" : "s"}. Weight in kilograms and derived BMI.`;

  return (
    <TrendChart
      title="Weight & BMI over visits"
      ariaDescription={ariaDescription}
      data={data}
      lines={WEIGHT_BMI_LINES}
      height={180}
      referenceBands={[{ y1: 18.5, y2: 24.9, yAxisId: "right", label: "Normal BMI" }]}
    />
  );
}

/** Preview text for the collapsed expand affordance. */
export function weightBmiTrendPreview(
  weightSeries: VitalTrendSeries,
  bmiSeries: VitalTrendSeries,
): string | undefined {
  const visits = mergeTrendSeriesToRows([
    { dataKey: "weight", points: weightSeries.points },
    { dataKey: "bmi", points: bmiSeries.points },
  ]).length;
  if (visits === 0) return "No prior readings";
  if (visits === 1) return "1 prior visit";
  return `${visits} prior visits`;
}
