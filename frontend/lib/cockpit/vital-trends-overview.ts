/**
 * Helpers for the all-vitals trends overview panel (vitals-section · vit-12).
 *
 * Pure transforms over vit-10 series + vit-12 categorical timelines — grouping,
 * preview text, and history counts. No React, no I/O.
 */

import type { CategoricalVitalTimeline } from "@/lib/cockpit/categorical-vitals-timeline";
import type {
  CustomVitalTextTimeline,
  CustomVitalTrendSeries,
} from "@/lib/cockpit/custom-vitals-trends";
import {
  VITALS_REGISTRY,
  type VitalGroup,
  type VitalKey,
} from "@/lib/cockpit/vitals-schema";
import type { VitalTrendMetricKey, VitalTrendSeries } from "@/lib/cockpit/vitals-trends";

export const VITAL_TREND_GROUP_ORDER: readonly VitalGroup[] = [
  "core",
  "respiratory",
  "metabolic",
  "neuro",
  "paediatric",
  "obstetric",
];

export const VITAL_TREND_GROUP_LABELS: Record<VitalGroup, string> = {
  core: "Core",
  respiratory: "Respiratory",
  metabolic: "Metabolic",
  neuro: "Neuro",
  paediatric: "Paediatric",
  obstetric: "Obstetric",
};

const DERIVED_TREND_META: Record<
  "bmi" | "map" | "bsa",
  { label: string; group: VitalGroup }
> = {
  bmi: { label: "BMI", group: "metabolic" },
  map: { label: "Mean arterial pressure", group: "core" },
  bsa: { label: "Body surface area", group: "core" },
};

export interface NumericTrendOverviewItem {
  metric: VitalTrendMetricKey;
  label: string;
  group: VitalGroup;
  series: VitalTrendSeries;
}

export interface CustomNumericTrendOverviewItem {
  id: string;
  label: string;
  group: VitalGroup;
  series: CustomVitalTrendSeries;
}

/** Numeric vitals (incl. derived) that have ≥1 prior reading. */
export function collectNumericTrendItemsWithHistory(
  byMetric: Readonly<Record<VitalTrendMetricKey, VitalTrendSeries>>,
): NumericTrendOverviewItem[] {
  const items: NumericTrendOverviewItem[] = [];

  for (const def of VITALS_REGISTRY) {
    const series = byMetric[def.key as VitalKey];
    if (series?.points.length) {
      items.push({
        metric: def.key,
        label: def.label,
        group: def.group,
        series,
      });
    }
  }

  for (const metric of ["bmi", "map", "bsa"] as const) {
    const series = byMetric[metric];
    if (series?.points.length) {
      items.push({
        metric,
        label: DERIVED_TREND_META[metric].label,
        group: DERIVED_TREND_META[metric].group,
        series,
      });
    }
  }

  return items;
}

/** Doctor-authored numeric custom vitals with ≥1 prior reading. */
export function collectCustomNumericTrendItemsWithHistory(
  customSeries: readonly CustomVitalTrendSeries[],
): CustomNumericTrendOverviewItem[] {
  return customSeries
    .filter((series) => series.points.length > 0)
    .map((series) => ({
      id: series.id,
      label: series.label,
      group: series.group,
      series,
    }));
}

/** Collapsed preview for the overview expander. */
export function vitalTrendsOverviewPreview(historyCount: number): string {
  if (historyCount <= 0) return "No prior readings";
  if (historyCount === 1) return "1 vital with history";
  return `${historyCount} vitals with history`;
}

/** Count shipped + custom vitals that have ≥1 reading. */
export function countVitalsWithTrendHistory(
  numericItems: readonly NumericTrendOverviewItem[],
  categoricalTimelines: readonly CategoricalVitalTimeline[],
  customNumericItems: readonly CustomNumericTrendOverviewItem[] = [],
  customTextTimelines: readonly CustomVitalTextTimeline[] = [],
): number {
  return (
    numericItems.length +
    categoricalTimelines.length +
    customNumericItems.length +
    customTextTimelines.length
  );
}

export interface GroupedTrendOverview {
  group: VitalGroup;
  label: string;
  numeric: NumericTrendOverviewItem[];
  categorical: CategoricalVitalTimeline[];
  customNumeric: CustomNumericTrendOverviewItem[];
  customText: CustomVitalTextTimeline[];
}

/** Group numeric charts and categorical timelines by clinical group (stable order). */
export function groupTrendOverviewItems(
  numericItems: readonly NumericTrendOverviewItem[],
  categoricalTimelines: readonly CategoricalVitalTimeline[],
  customNumericItems: readonly CustomNumericTrendOverviewItem[] = [],
  customTextTimelines: readonly CustomVitalTextTimeline[] = [],
): GroupedTrendOverview[] {
  return VITAL_TREND_GROUP_ORDER.map((group) => ({
    group,
    label: VITAL_TREND_GROUP_LABELS[group],
    numeric: numericItems.filter((item) => item.group === group),
    categorical: categoricalTimelines.filter((timeline) => timeline.group === group),
    customNumeric: customNumericItems.filter((item) => item.group === group),
    customText: customTextTimelines.filter((timeline) => timeline.group === group),
  })).filter(
    (section) =>
      section.numeric.length > 0 ||
      section.categorical.length > 0 ||
      section.customNumeric.length > 0 ||
      section.customText.length > 0,
  );
}
