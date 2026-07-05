"use client";

/**
 * Per-card vital trend trigger (vitals-section · trend redesign).
 *
 * Icon button beside the vital label — mirrors the `?` range-help affordance.
 * Opens a metric-aware popover chart (BP shows sys+dia+MAP, weight shows
 * weight+BMI) with a "View full history" link to a larger dialog + value table.
 * Read-only; reuses the shared {@link TrendChart} shell and trend series.
 */

import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  mergeTrendSeriesToRows,
  TrendChart,
  formatTrendDateLabel,
  type TrendChartLine,
  type TrendChartReferenceBand,
  type TrendChartRow,
} from "@/components/cockpit/rx/objective/TrendChart";
import {
  resolveVitalTrendConfig,
  type VitalTrendChartConfig,
} from "@/lib/cockpit/vital-trend-config";
import type {
  CustomVitalTrendSeries,
} from "@/lib/cockpit/custom-vitals-trends";
import type { RangeContext } from "@/lib/cockpit/vitals-schema";
import type {
  VitalTrendMetricKey,
  VitalTrendSeries,
} from "@/lib/cockpit/vitals-trends";
import { cn } from "@/lib/utils";

const PRIMARY_STROKE = "#3b82f6";

export interface VitalTrendButtonProps {
  /** Card's own metric — drives the explicit config lookup (BP, weight, …). */
  metric?: VitalTrendMetricKey;
  /** Indexed trend series for all shipped metrics. */
  byMetric?: Readonly<Record<VitalTrendMetricKey, VitalTrendSeries>>;
  /** Direct series for doctor-authored numeric custom vitals. */
  customSeries?: CustomVitalTrendSeries;
  /** Accessible card label, e.g. "Pulse Rate (PR)". */
  label: string;
  rangeCtx?: RangeContext;
  isLoading?: boolean;
  variant?: "inline" | "title";
}

interface ResolvedTrend {
  config: VitalTrendChartConfig;
  /** Lines present in the data (companion metrics with no history dropped). */
  lines: TrendChartLine[];
  data: TrendChartRow[];
  bands: TrendChartReferenceBand[];
  pointCount: number;
}

function resolveTrend(
  metric: VitalTrendMetricKey,
  byMetric: Readonly<Record<VitalTrendMetricKey, VitalTrendSeries>>,
  label: string,
  rangeCtx: RangeContext,
): ResolvedTrend {
  const config = resolveVitalTrendConfig(metric, label);

  const presentSpecs = config.lines.filter(
    (spec) => (byMetric[spec.metric]?.points.length ?? 0) > 0,
  );

  const lines: TrendChartLine[] = presentSpecs.map((spec) => ({
    dataKey: spec.metric,
    name: spec.name,
    unit: byMetric[spec.metric]?.unit ?? "",
    stroke: spec.stroke,
    yAxisId: spec.yAxisId,
    showDots: spec.showDots,
  }));

  const data = mergeTrendSeriesToRows(
    presentSpecs.map((spec) => ({
      dataKey: spec.metric,
      points: byMetric[spec.metric]?.points ?? [],
    })),
  );

  const bands: TrendChartReferenceBand[] = config
    .bands(rangeCtx)
    .map((band) => ({
      y1: band.y1,
      y2: band.y2,
      yAxisId: band.yAxisId,
      label: band.label,
    }));

  const pointCount = data.length;
  return { config, lines, data, bands, pointCount };
}

function resolveCustomTrend(series: CustomVitalTrendSeries, label: string): ResolvedTrend {
  const dataKey = "value";
  const data = mergeTrendSeriesToRows([{ dataKey, points: series.points }]);
  const lines: TrendChartLine[] = [
    {
      dataKey,
      name: label,
      unit: series.unit,
      stroke: PRIMARY_STROKE,
    },
  ];
  return {
    config: { title: label, lines: [], bands: () => [] },
    lines,
    data,
    bands: [],
    pointCount: data.length,
  };
}

function TrendValueTable({
  lines,
  data,
}: {
  lines: TrendChartLine[];
  data: TrendChartRow[];
}): JSX.Element {
  const recent = data.slice(-8).reverse();
  return (
    <table className="w-full border-collapse text-xs" data-testid="vital-trend-value-table">
      <thead>
        <tr className="border-b border-border/60 text-left text-muted-foreground">
          <th className="py-1 pr-2 font-medium">Visit</th>
          {lines.map((line) => (
            <th key={line.dataKey} className="py-1 pr-2 text-right font-medium">
              {line.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {recent.map((row) => (
          <tr key={row.at} className="border-b border-border/30 last:border-0">
            <td className="py-1 pr-2 text-muted-foreground">{formatTrendDateLabel(row.at)}</td>
            {lines.map((line) => {
              const value = row[line.dataKey];
              return (
                <td key={line.dataKey} className="py-1 pr-2 text-right tabular-nums text-foreground">
                  {typeof value === "number" ? `${value}${line.unit ? ` ${line.unit}` : ""}` : "—"}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ariaDescriptionFor(title: string, pointCount: number): string {
  if (pointCount === 1) return `${title} trend across 1 visit.`;
  return `${title} trend across ${pointCount} visits.`;
}

export function VitalTrendButton({
  metric,
  byMetric,
  customSeries,
  label,
  rangeCtx = {},
  isLoading = false,
  variant = "title",
}: VitalTrendButtonProps): JSX.Element | null {
  const [dialogOpen, setDialogOpen] = useState(false);

  const resolved = useMemo(() => {
    if (customSeries) return resolveCustomTrend(customSeries, label);
    if (metric && byMetric) return resolveTrend(metric, byMetric, label, rangeCtx);
    return null;
  }, [customSeries, metric, byMetric, label, rangeCtx]);

  if (isLoading) return null;
  if (!resolved || resolved.pointCount === 0) return null;

  const { config, lines, data, bands, pointCount } = resolved;
  const isInline = variant === "inline";
  const ariaDescription = ariaDescriptionFor(config.title, pointCount);
  const trendKey = customSeries?.id ?? metric ?? "unknown";

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              isInline ? "size-4" : "size-5",
            )}
            aria-label={`${config.title} trend`}
            data-testid={`vital-trend-button-${trendKey}`}
          >
            <TrendingUp className={cn(isInline ? "size-3" : "size-3.5")} aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          className="w-[26rem] max-w-[calc(100vw-2rem)] space-y-2 p-3"
          data-testid={`vital-trend-popover-${trendKey}`}
        >
          <TrendChart
            title={config.title}
            ariaDescription={ariaDescription}
            data={data}
            lines={lines}
            referenceBands={bands}
            height={150}
          />
          <button
            type="button"
            className="text-[11px] font-medium text-primary hover:underline"
            onClick={() => setDialogOpen(true)}
            data-testid={`vital-trend-expand-${trendKey}`}
          >
            View full history →
          </button>
        </PopoverContent>
      </Popover>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-w-2xl"
          data-testid={`vital-trend-dialog-${trendKey}`}
        >
          <DialogHeader>
            <DialogTitle>{config.title} — history</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <TrendChart
              title={config.title}
              ariaDescription={ariaDescription}
              data={data}
              lines={lines}
              referenceBands={bands}
              height={260}
            />
            <TrendValueTable lines={lines} data={data} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
