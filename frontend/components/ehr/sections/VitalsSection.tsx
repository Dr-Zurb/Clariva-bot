"use client";

/**
 * VitalsSection (EHR Sub-batch D / T5.22 — D.1).
 *
 * Replaces the Sub-batch A placeholder. Shows:
 *   - Top: latest reading row (e.g. "120/80 mmHg · 72 bpm · 37.0°C · 98% SpO₂
 *     · recorded 2 days ago").
 *   - Below: per-vital rows with `latest value | sparkline | reading count`.
 *     Sparklines render only when a vital has ≥2 non-null readings (Decision §24).
 *   - "+ Add reading" CTA at the bottom (and via the SectionWrapper header
 *     button) opens <VitalsCapture>.
 *
 * appointment_id propagation (master-batch decision §4):
 *   - In-call host passes the current appointment id ⇒ <VitalsCapture> threads
 *     it into the create call.
 *   - Chart-panel host (catch-up entry from appointment-detail page) passes
 *     null ⇒ row is patient-level. The host is responsible for picking
 *     the right value; this component is dumb about it.
 *
 * Sparkline rows are clickable (D.2): tapping opens <VitalTrendModal> for
 * the full time-series chart of that vital.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import VitalsCapture from "@/components/ehr/VitalsCapture";
import VitalSparkline from "@/components/ehr/VitalSparkline";
import VitalTrendModal, { type VitalKey } from "@/components/ehr/VitalTrendModal";
import { archivePatientVitals, listPatientVitals } from "@/lib/api/patient-chart";
import type {
  PatientChartLayout,
  PatientChartMode,
  PatientVitalsReading,
} from "@/types/patient-chart";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

interface VitalsSectionProps {
  patientId: string;
  token: string;
  layout: PatientChartLayout;
  mode: PatientChartMode;
  /** §4 — supplied by the in-call host so newly captured vitals carry the
   *  appointment id. Other surfaces leave it undefined ⇒ patient-level. */
  appointmentId?: string | null;
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
  /** History limit for the sparklines / per-vital rows. Defaults to 20
   *  (the most-recent 20 readings — the same window as the chart-panel
   *  hot path). The trend modal (D.2) will request more. */
  limit?: number;
}

/** Reference ranges per master-batch decision §27 (LOCKED V1). */
const NORMAL_RANGE = {
  bpSys: [90, 120] as [number, number],
  bpDia: [60, 80] as [number, number],
  hr: [60, 100] as [number, number],
  tempC: [36.5, 37.5] as [number, number],
  spo2: [95, 100] as [number, number],
  bmi: [18.5, 25] as [number, number],
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

interface VitalRowSeries {
  /** Chronological non-null values (oldest → newest). */
  values: number[];
  /** Number of non-null readings — drives the "n readings" badge. */
  count: number;
  /** Most recent non-null value (or null when count === 0). */
  latest: number | null;
}

function seriesFor(
  rows: PatientVitalsReading[],
  pick: (r: PatientVitalsReading) => number | null,
): VitalRowSeries {
  // `rows` is newest-first (server order). Iterate newest → oldest, push
  // values into a chronological array via unshift (small lists, ok).
  const values: number[] = [];
  for (const r of rows) {
    const v = pick(r);
    if (v !== null && Number.isFinite(v)) values.unshift(v);
  }
  return {
    values,
    count: values.length,
    latest: values.length > 0 ? values[values.length - 1] : null,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VitalsSection({
  patientId,
  token,
  layout: _layout,
  mode,
  appointmentId,
  addOpen,
  onAddOpenChange,
  limit = 20,
}: VitalsSectionProps) {
  const [rows, setRows] = useState<PatientVitalsReading[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /** D.2 — which vital trend modal is open. null = closed. */
  const [trendKey, setTrendKey] = useState<VitalKey | null>(null);

  const readonly = mode === "readonly";

  // -------- load --------
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await listPatientVitals(token, patientId, { limit });
        if (cancelled) return;
        setRows(res.data.vitals ?? []);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load vitals",
        );
        setRows([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, limit]);

  // -------- handlers --------

  const handleSaved = useCallback((created: PatientVitalsReading) => {
    setRows((prev) => [created, ...(prev ?? [])].slice(0, limit));
  }, [limit]);

  const handleArchive = async (row: PatientVitalsReading) => {
    if (busy) return;
    setActionError(null);
    setBusy(true);
    const snapshot = rows ?? [];
    setRows((prev) => (prev ? prev.filter((r) => r.id !== row.id) : prev));
    try {
      await archivePatientVitals(token, patientId, row.id);
    } catch (err) {
      setRows(snapshot);
      setActionError(
        err instanceof Error ? err.message : "Failed to remove reading",
      );
    } finally {
      setBusy(false);
    }
  };

  // -------- derived series --------

  const series = useMemo(() => {
    const rs = rows ?? [];
    return {
      bpSys: seriesFor(rs, (r) => r.bp_systolic),
      bpDia: seriesFor(rs, (r) => r.bp_diastolic),
      hr: seriesFor(rs, (r) => r.heart_rate),
      tempC: seriesFor(rs, (r) =>
        r.temperature_c !== null ? Number(r.temperature_c) : null,
      ),
      spo2: seriesFor(rs, (r) => r.spo2),
      weightKg: seriesFor(rs, (r) =>
        r.weight_kg !== null ? Number(r.weight_kg) : null,
      ),
      heightCm: seriesFor(rs, (r) =>
        r.height_cm !== null ? Number(r.height_cm) : null,
      ),
      bmi: seriesFor(rs, (r) => (r.bmi !== null ? Number(r.bmi) : null)),
    };
  }, [rows]);

  // -------- render --------

  if (rows === null) {
    return <p className="px-1 py-2 text-xs text-gray-400">Loading vitals…</p>;
  }
  if (loadError) {
    return (
      <p role="alert" className="px-1 py-2 text-xs text-red-600">
        {loadError}
      </p>
    );
  }

  const mostRecent = rows[0] ?? null;

  return (
    <div className="space-y-3">
      {/* Top latest-reading summary --------------------------------------- */}
      {mostRecent ? (
        <LatestSummary row={mostRecent} />
      ) : (
        <div className="px-1 py-2 text-xs text-gray-500">
          No vitals recorded —{" "}
          {!readonly ? (
            <button
              type="button"
              onClick={() => onAddOpenChange(true)}
              className="font-medium text-blue-600 hover:text-blue-700"
            >
              Add reading
            </button>
          ) : (
            <span className="italic">no data</span>
          )}
          .
        </div>
      )}

      {/* Per-vital rows ---------------------------------------------------- */}
      {mostRecent && (
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-100">
          <PairedBpRow
            series={{ sys: series.bpSys, dia: series.bpDia }}
            onTrendClick={series.bpSys.count >= 2 ? () => setTrendKey("bp") : undefined}
          />
          <VitalRow
            label="Heart rate"
            unit="bpm"
            series={series.hr}
            range={NORMAL_RANGE.hr}
            onTrendClick={series.hr.count >= 2 ? () => setTrendKey("hr") : undefined}
          />
          <VitalRow
            label="Temperature"
            unit="°C"
            series={series.tempC}
            range={NORMAL_RANGE.tempC}
            decimals={1}
            onTrendClick={series.tempC.count >= 2 ? () => setTrendKey("tempC") : undefined}
          />
          <VitalRow
            label="SpO₂"
            unit="%"
            series={series.spo2}
            range={NORMAL_RANGE.spo2}
            onTrendClick={series.spo2.count >= 2 ? () => setTrendKey("spo2") : undefined}
          />
          {(series.weightKg.count > 0 || series.heightCm.count > 0) && (
            <>
              <VitalRow
                label="Weight"
                unit="kg"
                series={series.weightKg}
                decimals={1}
                onTrendClick={series.weightKg.count >= 2 ? () => setTrendKey("weight") : undefined}
              />
              <VitalRow
                label="Height"
                unit="cm"
                series={series.heightCm}
                decimals={1}
                onTrendClick={series.heightCm.count >= 2 ? () => setTrendKey("height") : undefined}
              />
            </>
          )}
          {series.bmi.count > 0 && (
            <VitalRow
              label="BMI"
              unit=""
              series={series.bmi}
              range={NORMAL_RANGE.bmi}
              decimals={1}
              onTrendClick={series.bmi.count >= 2 ? () => setTrendKey("bmi") : undefined}
            />
          )}
        </ul>
      )}

      {/* Action error ------------------------------------------------------ */}
      {actionError && (
        <p role="alert" className="px-1 text-xs text-red-600">
          {actionError}
        </p>
      )}

      {/* Bottom CTA + remove-most-recent --------------------------------- */}
      {!readonly && mostRecent && (
        <div className="flex items-center justify-between px-1 pt-1">
          <button
            type="button"
            onClick={() => onAddOpenChange(true)}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            + Add reading
          </button>
          <button
            type="button"
            onClick={() => handleArchive(mostRecent)}
            disabled={busy}
            className="text-[11px] text-gray-400 hover:text-red-600 disabled:opacity-50"
          >
            Remove latest
          </button>
        </div>
      )}

      {/* Capture modal ------------------------------------------------- */}
      {!readonly && (
        <VitalsCapture
          open={addOpen}
          onClose={() => onAddOpenChange(false)}
          token={token}
          patientId={patientId}
          appointmentId={appointmentId ?? null}
          onSaved={handleSaved}
        />
      )}

      {/* Trend modal (D.2) — available in readonly mode too ------------- */}
      <VitalTrendModal
        vitalKey={trendKey}
        patientId={patientId}
        token={token}
        onClose={() => setTrendKey(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function LatestSummary({ row }: { row: PatientVitalsReading }) {
  const parts: string[] = [];
  if (row.bp_systolic !== null && row.bp_diastolic !== null) {
    parts.push(`${row.bp_systolic}/${row.bp_diastolic} mmHg`);
  }
  if (row.heart_rate !== null) parts.push(`${row.heart_rate} bpm`);
  if (row.temperature_c !== null) parts.push(`${row.temperature_c}°C`);
  if (row.spo2 !== null) parts.push(`${row.spo2}% SpO₂`);
  if (row.weight_kg !== null) parts.push(`${row.weight_kg} kg`);
  if (row.bmi !== null) parts.push(`BMI ${row.bmi}`);

  return (
    <div className="rounded-md bg-blue-50/60 px-2 py-1.5 text-xs text-gray-700">
      <p className="text-[10px] uppercase tracking-wide text-blue-700/70">
        Latest reading · {timeAgo(row.recorded_at)}
      </p>
      <p className="mt-0.5 font-medium text-gray-900">
        {parts.length > 0 ? parts.join(" · ") : "(no values)"}
      </p>
    </div>
  );
}

interface VitalRowProps {
  label: string;
  unit: string;
  series: VitalRowSeries;
  range?: [number, number];
  decimals?: number;
  /** D.2 — when provided, the sparkline area becomes a tappable button. */
  onTrendClick?: () => void;
}

function VitalRow({ label, unit, series, range, decimals = 0, onTrendClick }: VitalRowProps) {
  const { latest, count, values } = series;
  const canTrend = values.length >= 2 && !!onTrendClick;
  return (
    <li className="flex items-center justify-between gap-2 px-2 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-gray-700">{label}</p>
        <p className="text-[11px] text-gray-500">
          {count === 0
            ? "—"
            : count === 1
              ? "(1 reading)"
              : `${count} readings`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {canTrend ? (
          <button
            type="button"
            onClick={onTrendClick}
            className="rounded focus-visible:outline-2 focus-visible:outline-blue-500"
            aria-label={`View ${label} trend`}
            title="View full trend"
          >
            <VitalSparkline
              values={values}
              normalRange={range}
              ariaLabel={`${label} trend (tap to expand)`}
            />
          </button>
        ) : values.length >= 2 ? (
          <VitalSparkline
            values={values}
            normalRange={range}
            ariaLabel={`${label} trend`}
          />
        ) : (
          <span className="text-[11px] text-gray-300">—</span>
        )}
        <span className="min-w-[48px] text-right text-sm font-medium tabular-nums text-gray-900">
          {latest !== null
            ? `${latest.toFixed(decimals)}${unit ? ` ${unit}` : ""}`
            : "—"}
        </span>
      </div>
    </li>
  );
}

/** BP row collapses systolic + diastolic into one row ("120/80"). */
function PairedBpRow({
  series,
  onTrendClick,
}: {
  series: { sys: VitalRowSeries; dia: VitalRowSeries };
  onTrendClick?: () => void;
}) {
  const { sys, dia } = series;
  // Sparkline shows systolic only (dominant signal). Two-line chart is in the modal (D.2).
  const count = Math.min(sys.count, dia.count);
  const latest =
    sys.latest !== null && dia.latest !== null
      ? `${sys.latest}/${dia.latest} mmHg`
      : "—";
  const canTrend = sys.values.length >= 2 && !!onTrendClick;
  return (
    <li className="flex items-center justify-between gap-2 px-2 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-gray-700">
          Blood pressure
        </p>
        <p className="text-[11px] text-gray-500">
          {count === 0
            ? "—"
            : count === 1
              ? "(1 reading)"
              : `${count} readings`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {canTrend ? (
          <button
            type="button"
            onClick={onTrendClick}
            className="rounded focus-visible:outline-2 focus-visible:outline-blue-500"
            aria-label="View blood pressure trend"
            title="View full trend"
          >
            <VitalSparkline
              values={sys.values}
              normalRange={NORMAL_RANGE.bpSys}
              ariaLabel="Systolic trend (tap to expand)"
            />
          </button>
        ) : sys.values.length >= 2 ? (
          <VitalSparkline
            values={sys.values}
            normalRange={NORMAL_RANGE.bpSys}
            ariaLabel="Systolic trend"
          />
        ) : (
          <span className="text-[11px] text-gray-300">—</span>
        )}
        <span className="min-w-[88px] text-right text-sm font-medium tabular-nums text-gray-900">
          {latest}
        </span>
      </div>
    </li>
  );
}
