"use client";

/**
 * Reusable read-only trend chart shell (objective-tab · obj-27).
 *
 * Full-range detail chart over obj-25 series — labelled axes, units, tooltip,
 * and accessible description. Metric-specific instances (weight/BMI, BP, HR, …)
 * stay thin wrappers over this shell.
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type LineProps,
} from "recharts";
import type { VitalTrendPoint } from "@/lib/cockpit/vitals-trends";

export type TrendChartRow = {
  at: string;
  label: string;
  [key: string]: string | number | undefined;
};

export type TrendChartYAxisId = "left" | "right";

export interface TrendChartLine {
  dataKey: string;
  name: string;
  unit: string;
  stroke: string;
  yAxisId?: TrendChartYAxisId;
  strokeDasharray?: string;
  /** When false, suppress dots (percentile reference curves). Default true. */
  showDots?: boolean;
}

export interface TrendChartReferenceBand {
  y1: number;
  y2: number;
  yAxisId?: TrendChartYAxisId;
  label?: string;
}

export interface TrendChartProps {
  /** Visible chart title (also used in the a11y description when `ariaDescription` omitted). */
  title: string;
  /** Full accessible description for screen readers. */
  ariaDescription?: string;
  data: TrendChartRow[];
  lines: TrendChartLine[];
  height?: number;
  referenceBands?: TrendChartReferenceBand[];
  /** X-axis data key (default `label`). Growth charts use `ageLabel`. */
  xDataKey?: string;
}

export function formatTrendDateLabel(at: string): string {
  return new Date(at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/** Merge multiple per-metric point arrays into chart rows keyed by visit timestamp. */
export function mergeTrendSeriesToRows(
  specs: { dataKey: string; points: VitalTrendPoint[] }[],
): TrendChartRow[] {
  const byAt = new Map<string, TrendChartRow>();

  for (const { dataKey, points } of specs) {
    for (const point of points) {
      const existing = byAt.get(point.at);
      if (existing) {
        existing[dataKey] = point.value;
      } else {
        byAt.set(point.at, {
          at: point.at,
          label: formatTrendDateLabel(point.at),
          [dataKey]: point.value,
        });
      }
    }
  }

  return Array.from(byAt.values()).sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}

function unitForLine(lines: TrendChartLine[], dataKey: string): string {
  return lines.find((l) => l.dataKey === dataKey)?.unit ?? "";
}

function TrendChartTooltip({
  active,
  payload,
  label,
  lines,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
  lines: TrendChartLine[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2 py-1.5 text-xs shadow-md">
      <p className="font-medium text-popover-foreground">{label}</p>
      {payload.map((entry) => {
        const unit = unitForLine(lines, entry.dataKey ?? "");
        return (
          <p key={entry.dataKey ?? entry.name} style={{ color: entry.color }}>
            {entry.name}: {entry.value}
            {unit ? ` ${unit}` : ""}
          </p>
        );
      })}
    </div>
  );
}

function yAxisLabel(lines: TrendChartLine[], axisId: TrendChartYAxisId): string {
  const units = Array.from(
    new Set(lines.filter((l) => (l.yAxisId ?? "left") === axisId).map((l) => l.unit)),
  );
  return units.join(" · ");
}

export function TrendChart({
  title,
  ariaDescription,
  data,
  lines,
  height = 160,
  referenceBands = [],
  xDataKey = "label",
}: TrendChartProps): JSX.Element {
  const description =
    ariaDescription ??
    `${title}. ${data.length === 0 ? "No prior readings." : `${data.length} visit readings.`}`;

  if (data.length === 0) {
    return (
      <figure aria-label={description}>
        <figcaption className="sr-only">{description}</figcaption>
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <p className="flex items-center justify-center py-8 text-xs text-muted-foreground">
          No prior readings to chart
        </p>
      </figure>
    );
  }

  const showConnectingLines = data.length >= 2;
  const usesRightAxis = lines.some((l) => l.yAxisId === "right");
  const leftLabel = yAxisLabel(lines, "left");
  const rightLabel = yAxisLabel(lines, "right");

  return (
    <figure role="img" aria-label={description}>
      <figcaption className="sr-only">{description}</figcaption>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: usesRightAxis ? 16 : 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
          <XAxis
            dataKey={xDataKey}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            interval="preserveStartEnd"
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            orientation="left"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            width={36}
            axisLine={false}
            tickLine={false}
            label={
              leftLabel
                ? {
                    value: leftLabel,
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
                  }
                : undefined
            }
          />
          {usesRightAxis ? (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              width={36}
              axisLine={false}
              tickLine={false}
              label={
                rightLabel
                  ? {
                      value: rightLabel,
                      angle: 90,
                      position: "insideRight",
                      style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
                    }
                  : undefined
              }
            />
          ) : null}
          {referenceBands.map((band, index) => (
            <ReferenceArea
              key={`${band.yAxisId ?? "left"}-${band.y1}-${band.y2}-${index}`}
              yAxisId={band.yAxisId ?? "left"}
              y1={band.y1}
              y2={band.y2}
              strokeOpacity={0}
              fill="#16a34a"
              fillOpacity={0.08}
              ifOverflow="extendDomain"
            />
          ))}
          <Tooltip content={<TrendChartTooltip lines={lines} />} />
          {lines.map((line) => {
            const showDots = line.showDots !== false;
            return (
            <Line
              key={line.dataKey}
              yAxisId={line.yAxisId ?? "left"}
              type="monotone"
              dataKey={line.dataKey}
              name={line.name}
              stroke={line.stroke}
              strokeWidth={1.5}
              strokeDasharray={line.strokeDasharray}
              strokeOpacity={showConnectingLines || !showDots ? 1 : 0}
              connectNulls
              dot={
                showDots
                  ? { r: data.length === 1 ? 3 : 2, fill: line.stroke }
                  : false
              }
              activeDot={showDots ? { r: 4 } : false}
              isAnimationActive={false}
            />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
      {data.length === 1 ? (
        <p className="mt-1 text-[10px] text-muted-foreground">Single prior reading — no trend line shown.</p>
      ) : null}
    </figure>
  );
}

/** Thin single-metric instance — BP, HR, SpO₂, glucose, etc. */
export function SingleMetricTrendChart({
  title,
  unit,
  stroke,
  points,
  referenceBand,
  ariaDescription,
}: {
  title: string;
  unit: string;
  stroke: string;
  points: VitalTrendPoint[];
  referenceBand?: [number, number];
  ariaDescription?: string;
}): JSX.Element {
  const dataKey = "value";
  const data = mergeTrendSeriesToRows([{ dataKey, points }]);
  return (
    <TrendChart
      title={title}
      ariaDescription={ariaDescription}
      data={data}
      lines={[{ dataKey, name: title, unit, stroke }]}
      referenceBands={
        referenceBand
          ? [{ y1: referenceBand[0], y2: referenceBand[1], label: "Reference range" }]
          : undefined
      }
    />
  );
}

export type { LineProps };
