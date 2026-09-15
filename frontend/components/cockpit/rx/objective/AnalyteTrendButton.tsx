"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { SingleMetricTrendChart } from "@/components/cockpit/rx/objective/TrendChart";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getPatientResultsTimeline } from "@/lib/api/patient-chart";
import {
  buildAnalyteTrendByKey,
  mergeResultsDateGroups,
  resultsTimelineToDateGroups,
  type AnalyteTrendSeries,
  type ResultsDateGroup,
} from "@/lib/cockpit/results-flowsheet";
import { cn } from "@/lib/utils";

const TREND_STROKE = "#3b82f6";

export interface AnalyteTrendButtonProps {
  series: AnalyteTrendSeries;
  currentGroups: readonly ResultsDateGroup[];
}

function referenceBand(series: AnalyteTrendSeries): [number, number] | undefined {
  if (series.refLow == null || series.refHigh == null) return undefined;
  if (series.refLow === series.refHigh) return undefined;
  return [series.refLow, series.refHigh];
}

export function AnalyteTrendButton({
  series,
  currentGroups,
}: AnalyteTrendButtonProps) {
  const { patientId, token } = useRxForm();
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState<AnalyteTrendSeries>(series);
  const [loading, setLoading] = useState(false);

  async function loadPrior() {
    if (!patientId || !token) {
      setResolved(series);
      return;
    }
    setLoading(true);
    try {
      const res = await getPatientResultsTimeline(token, patientId);
      const prior = resultsTimelineToDateGroups(res.data.results ?? []);
      const merged = buildAnalyteTrendByKey(
        mergeResultsDateGroups(currentGroups, prior),
      );
      setResolved(merged.get(series.key) ?? series);
    } catch {
      setResolved(series);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void loadPrior();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          aria-label={`${series.name} trend`}
          data-testid={`analyte-trend-button-${series.key}`}
        >
          <TrendingUp className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-[26rem] max-w-[calc(100vw-2rem)] space-y-2 p-3"
        data-testid={`analyte-trend-popover-${series.key}`}
      >
        {loading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Loading trend…</p>
        ) : (
          <SingleMetricTrendChart
            title={resolved.name}
            unit={resolved.unit}
            stroke={TREND_STROKE}
            points={resolved.points}
            referenceBand={referenceBand(resolved)}
            ariaDescription={`${resolved.name} trend across ${resolved.points.length} result dates.`}
          />
        )}
        <p className={cn("text-[10px] text-muted-foreground")}>
          Numeric values only. Method changes can shift the line.
        </p>
      </PopoverContent>
    </Popover>
  );
}
