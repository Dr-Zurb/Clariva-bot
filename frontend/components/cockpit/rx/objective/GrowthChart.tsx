"use client";

/**
 * Pediatric growth percentile charts (objective-tab · obj-28).
 *
 * Plots weight / height / head circumference by age-at-visit against bundled
 * WHO/IAP reference percentile curves (P3/P50/P97). Hidden when DOB or sex is
 * absent (P6-D3). Read-only; reuses obj-27 {@link TrendChart}.
 */

import {
  TrendChart,
  type TrendChartLine,
  type TrendChartRow,
} from "@/components/cockpit/rx/objective/TrendChart";
import {
  buildGrowthChartRows,
  canShowGrowthChart,
  resolveGrowthSex,
  type GrowthMetricKey,
} from "@/lib/cockpit/growth-percentiles";
import { GROWTH_REFERENCE_PROVENANCE } from "@/lib/cockpit/growth-reference/who-iap-v1";
import type { VitalTrendSeries } from "@/lib/cockpit/vitals-trends";

const PERCENTILE_LINES: TrendChartLine[] = [
  {
    dataKey: "p3",
    name: "3rd percentile",
    unit: "",
    stroke: "hsl(var(--muted-foreground))",
    strokeDasharray: "4 3",
    showDots: false,
  },
  {
    dataKey: "p50",
    name: "50th percentile",
    unit: "",
    stroke: "hsl(var(--muted-foreground))",
    strokeDasharray: "2 2",
    showDots: false,
  },
  {
    dataKey: "p97",
    name: "97th percentile",
    unit: "",
    stroke: "hsl(var(--muted-foreground))",
    strokeDasharray: "4 3",
    showDots: false,
  },
];

const METRIC_CONFIG: Record<
  GrowthMetricKey,
  { title: string; unit: string; seriesKey: keyof PediatricGrowthChartsProps["series"] }
> = {
  weight_kg: { title: "Weight for age", unit: "kg", seriesKey: "weight" },
  height_cm: { title: "Height for age", unit: "cm", seriesKey: "height" },
  head_circumference_cm: {
    title: "Head circumference for age",
    unit: "cm",
    seriesKey: "headCircumference",
  },
};

function toTrendRows(rows: ReturnType<typeof buildGrowthChartRows>): TrendChartRow[] {
  return rows.map((row) => ({
    label: row.ageLabel,
    ageLabel: row.ageLabel,
    at: row.at ?? String(row.ageMonths),
    patient: row.patient,
    p3: row.p3,
    p50: row.p50,
    p97: row.p97,
  }));
}

function GrowthMetricChart({
  metric,
  sex,
  dateOfBirth,
  points,
}: {
  metric: GrowthMetricKey;
  sex: "male" | "female";
  dateOfBirth: string;
  points: VitalTrendSeries["points"];
}): JSX.Element {
  const config = METRIC_CONFIG[metric];
  const growthRows = buildGrowthChartRows(metric, sex, dateOfBirth, points);
  const patientCount = growthRows.filter((r) => r.patient != null).length;

  if (patientCount === 0) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{config.title}</p>
        <p className="py-4 text-center text-xs text-muted-foreground">No prior readings</p>
      </div>
    );
  }

  const lines: TrendChartLine[] = [
    ...PERCENTILE_LINES,
    {
      dataKey: "patient",
      name: "Patient",
      unit: config.unit,
      stroke: "#2563eb",
    },
  ];

  const ariaDescription = `${config.title} growth chart by age. ${patientCount} measurement${
    patientCount === 1 ? "" : "s"
  } plotted against ${GROWTH_REFERENCE_PROVENANCE.version} reference percentiles.`;

  return (
    <TrendChart
      title={config.title}
      ariaDescription={ariaDescription}
      data={toTrendRows(growthRows)}
      lines={lines}
      xDataKey="ageLabel"
      height={160}
    />
  );
}

export interface PediatricGrowthChartsProps {
  dateOfBirth: string;
  sex: "male" | "female";
  series: {
    weight: VitalTrendSeries;
    height: VitalTrendSeries;
    headCircumference: VitalTrendSeries;
  };
}

/**
 * Growth charts panel — caller must verify DOB + sex before mounting.
 */
export function PediatricGrowthCharts({
  dateOfBirth,
  sex,
  series,
}: PediatricGrowthChartsProps): JSX.Element {
  return (
    <div className="space-y-4">
      <p className="text-[10px] text-muted-foreground">
        Reference: {GROWTH_REFERENCE_PROVENANCE.version} ({GROWTH_REFERENCE_PROVENANCE.regionDefault})
      </p>
      <GrowthMetricChart
        metric="weight_kg"
        sex={sex}
        dateOfBirth={dateOfBirth}
        points={series.weight.points}
      />
      <GrowthMetricChart
        metric="height_cm"
        sex={sex}
        dateOfBirth={dateOfBirth}
        points={series.height.points}
      />
      <GrowthMetricChart
        metric="head_circumference_cm"
        sex={sex}
        dateOfBirth={dateOfBirth}
        points={series.headCircumference.points}
      />
    </div>
  );
}

/** Preview for collapsed expand affordance. */
export function pediatricGrowthPreview(
  dateOfBirth: string | null | undefined,
  gender: string | null | undefined,
  measurementCount: number,
): string | undefined {
  if (!canShowGrowthChart(dateOfBirth, gender)) return undefined;
  if (measurementCount === 0) return "No pediatric readings";
  if (measurementCount === 1) return "1 reading plotted";
  return `${measurementCount} readings plotted`;
}

/** Whether the growth-chart expand section should mount at all. */
export function shouldOfferGrowthCharts(
  dateOfBirth: string | null | undefined,
  gender: string | null | undefined,
): boolean {
  return canShowGrowthChart(dateOfBirth, gender);
}
