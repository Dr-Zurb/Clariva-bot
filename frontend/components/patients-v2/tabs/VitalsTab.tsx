"use client";

import { useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  type DotProps,
  type LineProps,
} from "recharts";
import { usePatientVitalsQuery } from "@/hooks/queries/usePatientVitalsQuery";
import { formatDateTime } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PatientVitalsReading } from "@/types/patient-chart";
import { useTabOpenedTelemetry } from "./use-tab-opened-telemetry";
import {
  VITALS_RANGE_OPTIONS,
  bmiBadge,
  bpBadge,
  computeBmi,
  filterByRange,
  latestReading,
  mergeBpRows,
  pulseBadge,
  rowsForField,
  spo2Badge,
  tempBadge,
  type VitalBadge,
  type VitalChartRow,
  type VitalsRange,
} from "./vitals-tab-utils";

export interface VitalsTabProps {
  patientId: string;
  token: string;
}

const BADGE_CLASS: Record<VitalBadge, string> = {
  normal: "border-transparent bg-muted text-muted-foreground",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
};

function NoteDot(props: DotProps) {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  const row = (props as DotProps & { payload?: VitalChartRow }).payload;
  const hasNote = Boolean(row?.note?.trim());
  if (!hasNote) {
    return <circle cx={cx} cy={cy} r={2} fill="currentColor" />;
  }
  return <circle cx={cx} cy={cy} r={3.5} fill="#f59e0b" stroke="#fff" strokeWidth={1} />;
}

function VitalsTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; payload?: VitalChartRow }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const at = row?.at;
  return (
    <div className="max-w-xs rounded-md border bg-popover px-2 py-1.5 text-xs shadow-md">
      <p className="font-medium text-popover-foreground">{label}</p>
      {at ? (
        <p className="text-muted-foreground">{formatDateTime(at)}</p>
      ) : null}
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
      {row?.note?.trim() ? (
        <p className="mt-1 border-t pt-1 text-muted-foreground italic">{row.note}</p>
      ) : null}
    </div>
  );
}

interface VitalLineChartProps {
  title: string;
  data: VitalChartRow[];
  lines: { dataKey: string; stroke: string; name: string }[];
  reference?: [number, number];
}

function VitalLineChart({ title, data, lines, reference }: VitalLineChartProps) {
  if (data.length === 0) return null;
  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-2 p-4">
        <p className="text-sm font-medium">{title}</p>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {reference ? (
              <ReferenceArea
                y1={reference[0]}
                y2={reference[1]}
                strokeOpacity={0}
                fill="#3b82f6"
                fillOpacity={0.08}
              />
            ) : null}
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <Tooltip content={<VitalsTooltip />} />
            {lines.map((line) => (
              <Line
                key={line.dataKey}
                type="monotone"
                dataKey={line.dataKey}
                name={line.name}
                stroke={line.stroke}
                strokeWidth={1.5}
                dot={NoteDot as LineProps["dot"]}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function LatestMetric({
  label,
  value,
  sub,
  badge,
}: {
  label: string;
  value: string;
  sub?: string;
  badge: VitalBadge;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{value}</span>
        <Badge variant="outline" className={cn("text-xs", BADGE_CLASS[badge])}>
          {badge === "normal" ? "In range" : badge === "warning" ? "Review" : "Out of range"}
        </Badge>
      </div>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function VitalsTab({ patientId, token }: VitalsTabProps) {
  useTabOpenedTelemetry("vitals", patientId);

  const { data: allReadings = [], isLoading: loading } = usePatientVitalsQuery(
    token,
    patientId,
  );
  const [range, setRange] = useState<VitalsRange>("30d");

  const filtered = useMemo(
    () => filterByRange(allReadings, range),
    [allReadings, range],
  );

  const latest = useMemo(() => latestReading(allReadings), [allReadings]);

  const bmiLatest = useMemo(() => {
    if (!latest) return null;
    if (latest.bmi != null) return latest.bmi;
    if (latest.weight_kg != null && latest.height_cm != null) {
      return computeBmi(latest.weight_kg, latest.height_cm);
    }
    return null;
  }, [latest]);

  const bpData = useMemo(() => mergeBpRows(filtered), [filtered]);
  const heightRows = useMemo(
    () => rowsForField(filtered, "height_cm", "height"),
    [filtered],
  );

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (allReadings.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        No vitals recorded for this patient yet.
      </p>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Vital signs history</p>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Time range">
          {VITALS_RANGE_OPTIONS.map((opt) => (
            <Button
              key={opt.key}
              type="button"
              size="sm"
              variant={range === opt.key ? "default" : "outline"}
              onClick={() => setRange(opt.key)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {latest ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {(latest.bp_systolic != null || latest.bp_diastolic != null) && (
            <LatestMetric
              label="Blood pressure"
              value={`${latest.bp_systolic ?? "—"}/${latest.bp_diastolic ?? "—"} mmHg`}
              sub={formatDateTime(latest.recorded_at)}
              badge={bpBadge(latest.bp_systolic, latest.bp_diastolic)}
            />
          )}
          {latest.heart_rate != null && (
            <LatestMetric
              label="Pulse"
              value={`${latest.heart_rate} bpm`}
              sub={formatDateTime(latest.recorded_at)}
              badge={pulseBadge(latest.heart_rate)}
            />
          )}
          {latest.spo2 != null && (
            <LatestMetric
              label="SpO₂"
              value={`${latest.spo2}%`}
              sub={formatDateTime(latest.recorded_at)}
              badge={spo2Badge(latest.spo2)}
            />
          )}
          {latest.temperature_c != null && (
            <LatestMetric
              label="Temperature"
              value={`${latest.temperature_c}°C`}
              sub={formatDateTime(latest.recorded_at)}
              badge={tempBadge(latest.temperature_c)}
            />
          )}
          {latest.weight_kg != null && (
            <LatestMetric
              label="Weight"
              value={`${latest.weight_kg} kg`}
              sub={formatDateTime(latest.recorded_at)}
              badge="normal"
            />
          )}
          {bmiLatest != null && (
            <LatestMetric
              label="BMI"
              value={String(bmiLatest)}
              sub={formatDateTime(latest.recorded_at)}
              badge={bmiBadge(bmiLatest)}
            />
          )}
        </div>
      ) : null}

      <div className="space-y-3">
        <VitalLineChart
          title="Blood pressure (Systolic + Diastolic)"
          data={bpData}
          lines={[
            { dataKey: "sys", stroke: "#ef4444", name: "Systolic" },
            { dataKey: "dia", stroke: "#3b82f6", name: "Diastolic" },
          ]}
          reference={[90, 140]}
        />
        <VitalLineChart
          title="Pulse"
          data={rowsForField(filtered, "heart_rate", "hr")}
          lines={[{ dataKey: "hr", stroke: "#3b82f6", name: "BPM" }]}
          reference={[60, 100]}
        />
        <VitalLineChart
          title="SpO₂"
          data={rowsForField(filtered, "spo2", "spo2")}
          lines={[{ dataKey: "spo2", stroke: "#8b5cf6", name: "SpO₂ %" }]}
          reference={[95, 100]}
        />
        <VitalLineChart
          title="Temperature"
          data={rowsForField(filtered, "temperature_c", "temp")}
          lines={[{ dataKey: "temp", stroke: "#ef4444", name: "°C" }]}
        />
        <VitalLineChart
          title="Weight"
          data={rowsForField(filtered, "weight_kg", "weight")}
          lines={[{ dataKey: "weight", stroke: "#6b7280", name: "kg" }]}
        />
        {heightRows.length > 1 ? (
          <VitalLineChart
            title="Height"
            data={heightRows}
            lines={[{ dataKey: "height", stroke: "#6b7280", name: "cm" }]}
          />
        ) : null}
      </div>
    </div>
  );
}
