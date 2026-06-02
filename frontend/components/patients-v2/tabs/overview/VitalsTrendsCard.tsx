"use client";

import {
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  type DotProps,
  type LineProps,
} from "recharts";
import type { PatientVitalsTrendPoint, PatientVitalsTrends } from "@/types/patient";
import { OverviewCardFrame } from "./OverviewCardFrame";

interface VitalsTrendsCardProps {
  trends: PatientVitalsTrends | undefined;
}

type ChartRow = { at: string; label: string; [key: string]: string | number };

function pointsToRows(points: PatientVitalsTrendPoint[], valueKey: string): ChartRow[] {
  return [...points]
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
    .map((p) => ({
      at: p.recorded_at,
      label: new Date(p.recorded_at).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      }),
      [valueKey]: p.value,
    }));
}

function mergeBpRows(
  systolic: PatientVitalsTrendPoint[],
  diastolic: PatientVitalsTrendPoint[],
): ChartRow[] {
  const byAt = new Map<string, ChartRow>();
  for (const p of systolic) {
    byAt.set(p.recorded_at, {
      at: p.recorded_at,
      label: new Date(p.recorded_at).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      }),
      sys: p.value,
    });
  }
  for (const p of diastolic) {
    const existing = byAt.get(p.recorded_at);
    if (existing) {
      existing.dia = p.value;
    } else {
      byAt.set(p.recorded_at, {
        at: p.recorded_at,
        label: new Date(p.recorded_at).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
        }),
        dia: p.value,
      });
    }
  }
  return Array.from(byAt.values()).sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2 py-1 text-xs shadow-md">
      <p className="font-medium text-popover-foreground">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

function Spo2Dot(props: DotProps) {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  const row = (props as DotProps & { payload?: ChartRow }).payload;
  const value = typeof row?.spo2 === "number" ? row.spo2 : undefined;
  const fill = value != null && value < 92 ? "#dc2626" : "#3b82f6";
  return <circle cx={cx} cy={cy} r={2.5} fill={fill} />;
}

interface MiniChartProps {
  title: string;
  data: ChartRow[];
  lines: { dataKey: string; stroke: string; name: string }[];
  reference?: [number, number];
  customDot?: (props: DotProps) => JSX.Element | null;
}

function MiniChart({ title, data, lines, reference, customDot }: MiniChartProps) {
  if (data.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <p className="flex h-20 items-center justify-center text-xs text-muted-foreground">
          No data
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          {reference ? (
            <ReferenceArea
              y1={reference[0]}
              y2={reference[1]}
              strokeOpacity={0}
              fill="#3b82f6"
              fillOpacity={0.08}
            />
          ) : null}
          <Tooltip content={<ChartTooltip />} />
          {lines.map((line) => (
            <Line
              key={line.dataKey}
              type="monotone"
              dataKey={line.dataKey}
              name={line.name}
              stroke={line.stroke}
              strokeWidth={1.5}
              dot={(customDot ?? { r: 2 }) as LineProps["dot"]}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VitalsTrendsCard({ trends }: VitalsTrendsCardProps) {
  const t = trends ?? {
    bp_systolic: [],
    bp_diastolic: [],
    heart_rate: [],
    spo2: [],
    weight_kg: [],
    bmi: [],
  };

  const bpData = mergeBpRows(t.bp_systolic, t.bp_diastolic);
  const bpLines: MiniChartProps["lines"] = [];
  if (t.bp_systolic.length > 0) {
    bpLines.push({ dataKey: "sys", stroke: "#ef4444", name: "Systolic" });
  }
  if (t.bp_diastolic.length > 0) {
    bpLines.push({ dataKey: "dia", stroke: "#3b82f6", name: "Diastolic" });
  }

  return (
    <OverviewCardFrame title="Vitals trends">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MiniChart
          title="Blood pressure"
          data={bpData}
          lines={bpLines}
          reference={[90, 140]}
        />
        <MiniChart
          title="Heart rate"
          data={pointsToRows(t.heart_rate, "hr")}
          lines={[{ dataKey: "hr", stroke: "#3b82f6", name: "BPM" }]}
          reference={[60, 100]}
        />
        <MiniChart
          title="SpO₂"
          data={pointsToRows(t.spo2, "spo2")}
          lines={[{ dataKey: "spo2", stroke: "#3b82f6", name: "SpO₂ %" }]}
          reference={[95, 100]}
          customDot={Spo2Dot}
        />
        <MiniChart
          title="Weight"
          data={pointsToRows(t.weight_kg, "weight")}
          lines={[{ dataKey: "weight", stroke: "#3b82f6", name: "kg" }]}
        />
        <MiniChart
          title="BMI"
          data={pointsToRows(t.bmi, "bmi")}
          lines={[{ dataKey: "bmi", stroke: "#3b82f6", name: "BMI" }]}
          reference={[18.5, 25]}
        />
      </div>
    </OverviewCardFrame>
  );
}
