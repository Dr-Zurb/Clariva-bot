"use client";

/**
 * VitalTrendModal (EHR Sub-batch D / T5.23 — D.2).
 *
 * Full vital-trend chart in a modal dialog. Opened when the doctor taps a
 * sparkline row in <VitalsSection>.
 *
 * Design:
 * - Pure SVG line chart — no external chart library (mirrors the VitalSparkline
 *   approach from D.1, scaled up to 560×180 viewBox with a time-based X axis).
 * - BP renders BOTH systolic (blue) and diastolic (green) as two lines on one
 *   chart (spec requirement). Other vitals: single line.
 * - Normal-range bands shaded behind the lines (Decision §27 fixed V1 ranges).
 * - Time-window pills: "90 days" (default) / "1 year" / "All time".
 * - Tap / click a data point → info bar below chart shows recorded date + note.
 * - Scrollable "Recent readings" list below the info bar.
 * - Close button (×) in header + Esc-to-close + backdrop click.
 * - Responsive: SVG is width="100%" (scales down to mobile widths).
 *
 * Fetch strategy: on open, requests the last MAX_FETCH readings via
 * listVitalsHistory (oldest → newest). Time-window filtering is client-side
 * so window-switching is instant with no extra API calls.
 *
 * @see frontend/components/ehr/sections/VitalsSection.tsx (consumer)
 * @see frontend/components/ehr/VitalSparkline.tsx (same SVG approach)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { listVitalsHistory } from "@/lib/api/patient-chart";
import {
  formatDate as formatDatePinned,
  formatTime as formatTimePinned,
} from "@/lib/format-date";
import type { PatientVitalsReading } from "@/types/patient-chart";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export type VitalKey =
  | "bp"
  | "hr"
  | "tempC"
  | "spo2"
  | "weight"
  | "height"
  | "bmi";

interface VitalTrendModalProps {
  /** Which vital to display. `null` = modal hidden. */
  vitalKey: VitalKey | null;
  patientId: string;
  /** Doctor auth JWT. */
  token: string;
  onClose: () => void;
}

type TimeWindow = "90d" | "1y" | "all";

interface ExtractedPoint {
  /** Unix ms — drives the time-axis X position. */
  ts: number;
  /** Primary (or systolic) value. */
  value: number;
  /** Diastolic value — only present for BP. */
  secondary?: number;
  /** Full reading row (for the info bar + readings list). */
  reading: PatientVitalsReading;
}

// ---------------------------------------------------------------------------
// Meta per vital
// ---------------------------------------------------------------------------

interface VitalMeta {
  label: string;
  unit: string;
  /** [lo, hi] band drawn behind the primary line. */
  normalRange?: [number, number];
  /** [lo, hi] band drawn behind the secondary (diastolic) line. */
  secondaryRange?: [number, number];
  stroke: string;
  secondaryStroke?: string;
  decimals?: number;
}

const VITAL_META: Record<VitalKey, VitalMeta> = {
  bp: {
    label: "Blood pressure",
    unit: "mmHg",
    normalRange: [90, 120],
    secondaryRange: [60, 80],
    stroke: "#3b82f6",
    secondaryStroke: "#10b981",
  },
  hr: {
    label: "Heart rate",
    unit: "bpm",
    normalRange: [60, 100],
    stroke: "#f97316",
  },
  tempC: {
    label: "Temperature",
    unit: "°C",
    normalRange: [36.5, 37.5],
    stroke: "#ef4444",
    decimals: 1,
  },
  spo2: {
    label: "SpO₂",
    unit: "%",
    normalRange: [95, 100],
    stroke: "#8b5cf6",
  },
  weight: { label: "Weight", unit: "kg", stroke: "#6b7280", decimals: 1 },
  height: { label: "Height", unit: "cm", stroke: "#6b7280", decimals: 1 },
  bmi: {
    label: "BMI",
    unit: "",
    normalRange: [18.5, 25],
    stroke: "#0ea5e9",
    decimals: 1,
  },
};

const WINDOW_OPTIONS: { key: TimeWindow; label: string; days: number }[] = [
  { key: "90d", label: "90 days", days: 90 },
  { key: "1y", label: "1 year", days: 365 },
  { key: "all", label: "All time", days: Infinity },
];

/** Fetch up to this many readings — enough to cover ~1 yr of daily measurements. */
const MAX_FETCH = 400;

// ---------------------------------------------------------------------------
// SVG chart constants
// ---------------------------------------------------------------------------

const CHART_VIEW_W = 560;
const CHART_VIEW_H = 180;
const PAD_X = 12;
const PAD_Y = 12;
const INNER_W = CHART_VIEW_W - PAD_X * 2;
const INNER_H = CHART_VIEW_H - PAD_Y * 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractPoints(
  readings: PatientVitalsReading[],
  key: VitalKey,
): ExtractedPoint[] {
  const points: ExtractedPoint[] = [];
  for (const r of readings) {
    const ts = new Date(r.recorded_at).getTime();
    if (Number.isNaN(ts)) continue;

    if (key === "bp") {
      if (r.bp_systolic !== null && r.bp_diastolic !== null) {
        points.push({ ts, value: r.bp_systolic, secondary: r.bp_diastolic, reading: r });
      }
    } else if (key === "hr") {
      if (r.heart_rate !== null) points.push({ ts, value: r.heart_rate, reading: r });
    } else if (key === "tempC") {
      if (r.temperature_c !== null) points.push({ ts, value: Number(r.temperature_c), reading: r });
    } else if (key === "spo2") {
      if (r.spo2 !== null) points.push({ ts, value: r.spo2, reading: r });
    } else if (key === "weight") {
      if (r.weight_kg !== null) points.push({ ts, value: Number(r.weight_kg), reading: r });
    } else if (key === "height") {
      if (r.height_cm !== null) points.push({ ts, value: Number(r.height_cm), reading: r });
    } else if (key === "bmi") {
      if (r.bmi !== null) points.push({ ts, value: Number(r.bmi), reading: r });
    }
  }
  return points;
}

function filterByWindow(
  points: ExtractedPoint[],
  window: TimeWindow,
): ExtractedPoint[] {
  const windowDef = WINDOW_OPTIONS.find((w) => w.key === window);
  if (!windowDef || windowDef.days === Infinity) return points;
  const cutoff = Date.now() - windowDef.days * 24 * 60 * 60 * 1000;
  return points.filter((p) => p.ts >= cutoff);
}

function toSvgX(ts: number, tMin: number, tMax: number): number {
  if (tMax === tMin) return PAD_X + INNER_W / 2;
  return PAD_X + ((ts - tMin) / (tMax - tMin)) * INNER_W;
}

function toSvgY(v: number, min: number, max: number): number {
  const span = max - min || 1;
  return PAD_Y + INNER_H - ((v - min) / span) * INNER_H;
}

function formatDate(iso: string): string {
  return formatDatePinned(iso, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string): string {
  return formatTimePinned(iso);
}

function fmtValue(v: number, decimals = 0): string {
  return v.toFixed(decimals);
}

// ---------------------------------------------------------------------------
// Subcomponent: pure SVG chart
// ---------------------------------------------------------------------------

interface TrendChartProps {
  points: ExtractedPoint[];
  meta: VitalMeta;
  selectedIdx: number | null;
  onSelectPoint: (idx: number) => void;
}

function TrendChart({ points, meta, selectedIdx, onSelectPoint }: TrendChartProps) {
  if (points.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-400">
        No readings in this time window
      </div>
    );
  }

  const tMin = points[0].ts;
  const tMax = points[points.length - 1].ts;

  // Build value range: include all values + normal ranges to keep bands visible.
  const allValues: number[] = [];
  for (const p of points) {
    allValues.push(p.value);
    if (p.secondary !== undefined) allValues.push(p.secondary);
  }
  if (meta.normalRange) allValues.push(...meta.normalRange);
  if (meta.secondaryRange) allValues.push(...meta.secondaryRange);
  const valMin = Math.min(...allValues);
  const valMax = Math.max(...allValues);

  // Compute SVG coords for each point.
  const coords = points.map((p) => ({
    x: toSvgX(p.ts, tMin, tMax),
    y: toSvgY(p.value, valMin, valMax),
    sy: p.secondary !== undefined ? toSvgY(p.secondary, valMin, valMax) : undefined,
  }));

  const primaryPoly = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const secondaryPoly =
    meta.secondaryStroke && coords.some((c) => c.sy !== undefined)
      ? coords
          .filter((c) => c.sy !== undefined)
          .map((c) => `${c.x.toFixed(1)},${c.sy!.toFixed(1)}`)
          .join(" ")
      : null;

  // Normal range bands.
  let primaryBand: { y: number; h: number } | null = null;
  if (meta.normalRange) {
    const [lo, hi] = meta.normalRange;
    const yHi = toSvgY(hi, valMin, valMax);
    const yLo = toSvgY(lo, valMin, valMax);
    primaryBand = { y: Math.min(yHi, yLo), h: Math.abs(yLo - yHi) };
  }

  let secondaryBand: { y: number; h: number } | null = null;
  if (meta.secondaryRange) {
    const [lo, hi] = meta.secondaryRange;
    const yHi = toSvgY(hi, valMin, valMax);
    const yLo = toSvgY(lo, valMin, valMax);
    secondaryBand = { y: Math.min(yHi, yLo), h: Math.abs(yLo - yHi) };
  }

  return (
    <svg
      viewBox={`0 0 ${CHART_VIEW_W} ${CHART_VIEW_H}`}
      width="100%"
      aria-label={`${meta.label} trend chart`}
      role="img"
      className="overflow-visible"
    >
      {/* Normal range bands */}
      {primaryBand && primaryBand.h > 0 && (
        <rect
          x={PAD_X}
          y={primaryBand.y}
          width={INNER_W}
          height={primaryBand.h}
          fill={meta.stroke}
          opacity={0.08}
        />
      )}
      {secondaryBand && secondaryBand.h > 0 && meta.secondaryStroke && (
        <rect
          x={PAD_X}
          y={secondaryBand.y}
          width={INNER_W}
          height={secondaryBand.h}
          fill={meta.secondaryStroke}
          opacity={0.08}
        />
      )}

      {/* Primary line */}
      {coords.length >= 2 && (
        <polyline
          fill="none"
          stroke={meta.stroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={primaryPoly}
        />
      )}

      {/* Secondary line (BP diastolic) */}
      {secondaryPoly && (
        <polyline
          fill="none"
          stroke={meta.secondaryStroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={secondaryPoly}
        />
      )}

      {/* Data points */}
      {coords.map((c, i) => {
        const isSelected = selectedIdx === i;
        return (
          <g key={i}>
            {/* Primary point */}
            <circle
              cx={c.x}
              cy={c.y}
              r={isSelected ? 6 : 4}
              fill={isSelected ? meta.stroke : "white"}
              stroke={meta.stroke}
              strokeWidth={isSelected ? 0 : 2}
            />
            {/* Secondary (diastolic) point */}
            {c.sy !== undefined && meta.secondaryStroke && (
              <circle
                cx={c.x}
                cy={c.sy}
                r={isSelected ? 6 : 4}
                fill={isSelected ? meta.secondaryStroke : "white"}
                stroke={meta.secondaryStroke}
                strokeWidth={isSelected ? 0 : 2}
              />
            )}
            {/* Invisible hit target (larger, for touch) */}
            <circle
              cx={c.x}
              cy={(c.sy !== undefined ? (c.y + c.sy) / 2 : c.y)}
              r={14}
              fill="transparent"
              className="cursor-pointer"
              onClick={() => onSelectPoint(i)}
              aria-label={`Reading at ${formatDate(points[i].reading.recorded_at)}`}
            />
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Legend for BP two-line chart
// ---------------------------------------------------------------------------

function BpLegend({ meta }: { meta: VitalMeta }) {
  return (
    <div className="mb-1 flex items-center gap-4 text-[11px]">
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-0.5 w-5 rounded"
          style={{ background: meta.stroke }}
        />
        <span className="text-gray-600">Systolic</span>
      </span>
      {meta.secondaryStroke && (
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-0.5 w-5 rounded"
            style={{ background: meta.secondaryStroke }}
          />
          <span className="text-gray-600">Diastolic</span>
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Readings list row
// ---------------------------------------------------------------------------

function ReadingRow({
  point,
  meta,
  isSelected,
  onClick,
}: {
  point: ExtractedPoint;
  meta: VitalMeta;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { value, secondary, reading } = point;
  const decimals = meta.decimals ?? 0;
  const valueStr =
    secondary !== undefined
      ? `${fmtValue(value, decimals)}/${fmtValue(secondary, decimals)} ${meta.unit}`
      : `${fmtValue(value, decimals)}${meta.unit ? ` ${meta.unit}` : ""}`;

  return (
    <li
      className={`flex cursor-pointer items-start gap-3 rounded px-2 py-1.5 text-xs transition-colors ${
        isSelected ? "bg-blue-50" : "hover:bg-gray-50"
      }`}
      onClick={onClick}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium tabular-nums text-gray-900">{valueStr}</p>
        {reading.note && (
          <p className="mt-0.5 truncate text-gray-500 italic">{reading.note}</p>
        )}
      </div>
      <div className="shrink-0 text-right text-gray-400">
        <p>{formatDate(reading.recorded_at)}</p>
        <p>{formatTime(reading.recorded_at)}</p>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function VitalTrendModal({
  vitalKey,
  patientId,
  token,
  onClose,
}: VitalTrendModalProps) {
  const [allReadings, setAllReadings] = useState<PatientVitalsReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("90d");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const isOpen = vitalKey !== null;

  // -------- fetch on open --------
  useEffect(() => {
    if (!isOpen || !vitalKey) return;
    let cancelled = false;

    setLoading(true);
    setLoadError(null);
    setSelectedIdx(null);
    setTimeWindow("90d");

    listVitalsHistory(token, patientId, MAX_FETCH)
      .then((rows) => {
        if (!cancelled) {
          setAllReadings(rows);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load vitals");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, vitalKey, token, patientId]);

  // -------- Esc to close --------
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // -------- derived data --------
  const meta = vitalKey ? VITAL_META[vitalKey] : null;

  const filteredPoints = useMemo(() => {
    if (!vitalKey || allReadings.length === 0) return [];
    const extracted = extractPoints(allReadings, vitalKey);
    return filterByWindow(extracted, timeWindow);
  }, [allReadings, vitalKey, timeWindow]);

  // "Recent readings" list is newest-first.
  const listPoints = useMemo(() => [...filteredPoints].reverse(), [filteredPoints]);

  const handleSelectPoint = useCallback(
    (idx: number) => {
      // `idx` is an index into filteredPoints (chronological order in chart).
      // The info bar and the list both need this, but the list is reversed.
      setSelectedIdx((prev) => (prev === idx ? null : idx));
    },
    [],
  );

  const selectedPoint = selectedIdx !== null ? filteredPoints[selectedIdx] : null;

  if (!isOpen || !meta) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      {/* Dialog */}
      <div
        className="relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">{meta.label} trend</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close trend modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Time window pills */}
          <div className="mb-3 flex gap-1.5" role="group" aria-label="Time window">
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setTimeWindow(opt.key);
                  setSelectedIdx(null);
                }}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                  timeWindow === opt.key
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* BP legend */}
          {vitalKey === "bp" && <BpLegend meta={meta} />}

          {/* Chart */}
          {loading && (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">
              Loading…
            </div>
          )}
          {loadError && (
            <div className="flex h-40 items-center justify-center text-sm text-red-600">
              {loadError}
            </div>
          )}
          {!loading && !loadError && (
            <div className="relative">
              <TrendChart
                points={filteredPoints}
                meta={meta}
                selectedIdx={selectedIdx}
                onSelectPoint={handleSelectPoint}
              />
            </div>
          )}

          {/* Selected point info bar */}
          {selectedPoint && (
            <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs">
              <p className="font-medium text-blue-900">
                {formatDate(selectedPoint.reading.recorded_at)}{" "}
                <span className="font-normal text-blue-700">
                  {formatTime(selectedPoint.reading.recorded_at)}
                </span>
              </p>
              <p className="mt-0.5 text-blue-800">
                {vitalKey === "bp" && selectedPoint.secondary !== undefined
                  ? `${fmtValue(selectedPoint.value)}/${fmtValue(selectedPoint.secondary)} ${meta.unit}`
                  : `${fmtValue(selectedPoint.value, meta.decimals ?? 0)}${meta.unit ? ` ${meta.unit}` : ""}`}
              </p>
              {selectedPoint.reading.note && (
                <p className="mt-0.5 text-blue-600 italic">{selectedPoint.reading.note}</p>
              )}
            </div>
          )}

          {/* Recent readings list */}
          {!loading && !loadError && filteredPoints.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Recent readings ({filteredPoints.length})
              </p>
              <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100 rounded-md border border-gray-100">
                {listPoints.map((p, listIdx) => {
                  // Map list index back to chronological index for highlight.
                  const chronoIdx = filteredPoints.length - 1 - listIdx;
                  return (
                    <ReadingRow
                      key={p.reading.id}
                      point={p}
                      meta={meta}
                      isSelected={selectedIdx === chronoIdx}
                      onClick={() => handleSelectPoint(chronoIdx)}
                    />
                  );
                })}
              </ul>
            </div>
          )}

          {/* Empty state */}
          {!loading && !loadError && filteredPoints.length === 0 && allReadings.length > 0 && (
            <p className="mt-2 text-center text-xs text-gray-400">
              No {meta.label.toLowerCase()} readings in this time window.{" "}
              <button
                type="button"
                className="font-medium text-blue-600 hover:underline"
                onClick={() => setTimeWindow("all")}
              >
                View all time
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
