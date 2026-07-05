"use client";

/**
 * Consolidated "All trends" dialog (vitals-section · trend redesign).
 *
 * Single entry point folding the former bottom collapsibles — grouped per-vital
 * charts, categorical chip timelines, the combined weight/BMI chart, and
 * pediatric growth curves — into one read-only dialog behind a header button.
 */

import { useMemo, useState } from "react";
import { LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoricalVitalTimeline } from "@/components/cockpit/rx/objective/CategoricalVitalTimeline";
import { CustomVitalTrendChart, VitalTrendChart } from "@/components/cockpit/rx/objective/VitalTrendChart";
import { WeightBmiTrendChart } from "@/components/cockpit/rx/objective/WeightBmiTrendChart";
import { PediatricGrowthChartsSection } from "@/components/cockpit/rx/objective/PediatricGrowthChartsSection";
import type { CustomVitalTextTimeline, CustomVitalTrendSeries } from "@/lib/cockpit/custom-vitals-trends";
import {
  collectCustomNumericTrendItemsWithHistory,
  collectNumericTrendItemsWithHistory,
  countVitalsWithTrendHistory,
  groupTrendOverviewItems,
  vitalTrendsOverviewPreview,
} from "@/lib/cockpit/vital-trends-overview";
import type { CategoricalVitalTimeline as CategoricalVitalTimelineData } from "@/lib/cockpit/categorical-vitals-timeline";
import type { CategoricalVitalKey } from "@/lib/cockpit/categorical-vitals-schema";
import type { RangeContext } from "@/lib/cockpit/vitals-schema";
import type { VitalTrendMetricKey, VitalTrendSeries } from "@/lib/cockpit/vitals-trends";

export interface AllVitalTrendsDialogProps {
  byMetric: Readonly<Record<VitalTrendMetricKey, VitalTrendSeries>>;
  categoricalTimelines: readonly CategoricalVitalTimelineData[];
  customTrendSeries?: readonly CustomVitalTrendSeries[];
  customTextTimelines?: readonly CustomVitalTextTimeline[];
  rangeCtx?: RangeContext;
  isLoading?: boolean;
  token: string;
  patientId: string | null | undefined;
}

export function AllVitalTrendsDialog({
  byMetric,
  categoricalTimelines,
  customTrendSeries = [],
  customTextTimelines = [],
  rangeCtx = {},
  isLoading = false,
  token,
  patientId,
}: AllVitalTrendsDialogProps): JSX.Element | null {
  const [open, setOpen] = useState(false);

  const numericItems = useMemo(
    () => collectNumericTrendItemsWithHistory(byMetric),
    [byMetric],
  );
  const customNumericItems = useMemo(
    () => collectCustomNumericTrendItemsWithHistory(customTrendSeries),
    [customTrendSeries],
  );
  const historyCount = countVitalsWithTrendHistory(
    numericItems,
    categoricalTimelines,
    customNumericItems,
    customTextTimelines,
  );
  const groupedSections = useMemo(
    () =>
      groupTrendOverviewItems(
        numericItems,
        categoricalTimelines,
        customNumericItems,
        customTextTimelines,
      ),
    [numericItems, categoricalTimelines, customNumericItems, customTextTimelines],
  );

  const hasWeightBmiHistory =
    byMetric.vitalsWtKg.points.length > 0 || byMetric.bmi.points.length > 0;

  // Nothing to show and not loading — hide the affordance entirely.
  if (!isLoading && historyCount === 0) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 shrink-0 gap-1.5 text-xs"
        onClick={() => setOpen(true)}
        disabled={isLoading}
        data-testid="all-vital-trends-trigger"
      >
        <LineChart className="size-3.5" aria-hidden />
        All trends
        {!isLoading && historyCount > 0 ? (
          <span className="text-muted-foreground">({historyCount})</span>
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[85vh] max-w-2xl overflow-y-auto"
          data-testid="all-vital-trends-dialog"
        >
          <DialogHeader>
            <DialogTitle>Vital trends</DialogTitle>
            <DialogDescription>
              {vitalTrendsOverviewPreview(historyCount)} — read-only history across prior visits.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {hasWeightBmiHistory ? (
              <section aria-label="Weight and BMI trend" className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Weight &amp; BMI
                </h4>
                <WeightBmiTrendChart
                  weightSeries={byMetric.vitalsWtKg}
                  bmiSeries={byMetric.bmi}
                  isLoading={isLoading}
                />
              </section>
            ) : null}

            {groupedSections.map((section) => (
              <section
                key={section.group}
                aria-label={`${section.label} vital trends`}
                className="space-y-4"
              >
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </h4>
                <div className="space-y-4">
                  {section.numeric.map((item) => (
                    <VitalTrendChart
                      key={item.metric}
                      metric={item.metric}
                      series={item.series}
                      label={item.label}
                      rangeCtx={rangeCtx}
                    />
                  ))}
                  {section.customNumeric.map((item) => (
                    <CustomVitalTrendChart key={item.id} series={item.series} />
                  ))}
                  {section.categorical.map((timeline) => (
                    <CategoricalVitalTimeline key={timeline.key} timeline={timeline} />
                  ))}
                  {section.customText.map((timeline) => (
                    <CategoricalVitalTimeline
                      key={timeline.id}
                      timeline={{
                        key: timeline.id as CategoricalVitalKey,
                        label: timeline.label,
                        group: timeline.group,
                        points: timeline.points,
                      }}
                    />
                  ))}
                </div>
              </section>
            ))}

            <PediatricGrowthChartsSection
              token={token}
              patientId={patientId}
              trendsLoading={isLoading}
              series={{
                weight: byMetric.vitalsWtKg,
                height: byMetric.vitalsHtCm,
                headCircumference: byMetric.vitalsHeadCircumferenceCm,
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
