"use client";

/**
 * ResultsTimelineSection (soap-data-placement P3 / sdp-06)
 *
 * Read-only "Investigations & Results" timeline for `<PatientChartPanel>`.
 * Consumes GET /api/v1/patients/:id/chart/results (sdp-05): per visit,
 * ordered investigations + resulted rows + objective report-scan count.
 *
 * Read-only in all modes — no add/edit (authoring stays in SOAP, SDP-D5).
 * The `mode` prop is accepted for prop-shape consistency with sibling sections
 * but has no behavioural effect.
 *
 * Desktop / in-call: pre-loads on mount.
 * Mobile: lazy-loads when first expanded (via optional `onExpand` callback).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { getPatientResultsTimeline } from "@/lib/api/patient-chart";
import { formatDate } from "@/lib/format-date";
import type { TestResultInterpretation, TestResultRow } from "@/types/prescription";
import type {
  PatientChartLayout,
  PatientChartMode,
  ResultsTimelineEntry,
} from "@/types/patient-chart";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const INTERPRETATION_LABELS: Record<TestResultInterpretation, string> = {
  normal: "Normal",
  high: "High",
  low: "Low",
  abnormal: "Abnormal",
};

/** Compact read-only line: name · value · unit · interpretation (P3-D2). */
export function formatResultDisplayLine(row: TestResultRow): string {
  const parts: string[] = [row.name.trim()];
  const measurement = [row.value?.trim(), row.unit?.trim()].filter(Boolean).join(" ");
  if (measurement) parts.push(measurement);
  if (row.interpretation) {
    parts.push(INTERPRETATION_LABELS[row.interpretation] ?? row.interpretation);
  }
  return parts.join(" · ");
}

function formatVisitDate(iso: string): string {
  return formatDate(iso, { day: "numeric", month: "short", year: "numeric" });
}

function mediaIndicatorLabel(count: number): string {
  return count === 1 ? "1 report scan" : `${count} report scans`;
}

// ─── Row components ──────────────────────────────────────────────────────────

function TimelineVisitRow({
  entry,
  compact,
}: {
  entry: ResultsTimelineEntry;
  compact: boolean;
}) {
  const dateLabelId = `results-timeline-date-label-${entry.prescriptionId}`;

  return (
    <li
      className="rounded border border-gray-100 bg-gray-50/50 px-2 py-2"
      data-testid={`results-timeline-visit-${entry.prescriptionId}`}
      aria-labelledby={dateLabelId}
    >
      <time
        id={dateLabelId}
        dateTime={entry.visitDate}
        className={`block font-medium text-gray-900 ${compact ? "text-xs" : "text-sm"}`}
        data-testid={`results-timeline-date-${entry.prescriptionId}`}
      >
        {formatVisitDate(entry.visitDate)}
      </time>

      {entry.ordered ? (
        <p className={`mt-1 text-gray-700 ${compact ? "text-[11px]" : "text-xs"}`}>
          <span className="font-medium text-gray-600">Ordered: </span>
          <span className="break-words">{entry.ordered}</span>
        </p>
      ) : null}

      {entry.resulted.length > 0 ? (
        <ul
          className={`mt-1 list-disc space-y-0.5 pl-4 ${compact ? "text-[11px]" : "text-xs"} text-gray-700`}
          aria-label="Resulted investigations"
        >
          {entry.resulted.map((row) => (
            <li key={row.id} className="break-words">
              {formatResultDisplayLine(row)}
            </li>
          ))}
        </ul>
      ) : null}

      {entry.mediaCount > 0 ? (
        <p
          className={`mt-1.5 flex items-center gap-1 text-gray-500 ${compact ? "text-[10px]" : "text-[11px]"}`}
          data-testid={`results-timeline-media-${entry.prescriptionId}`}
          aria-label={`${entry.mediaCount} report scans attached to this visit`}
        >
          <Paperclip aria-hidden="true" size={compact ? 10 : 12} className="shrink-0" />
          <span>{mediaIndicatorLabel(entry.mediaCount)}</span>
        </p>
      ) : null}
    </li>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface ResultsTimelineSectionProps {
  patientId: string;
  token: string;
  layout: PatientChartLayout;
  mode: PatientChartMode;
  /**
   * Optional: called by the parent SectionWrapper when the accordion expands
   * on mobile. Lazy-loads on first expansion when provided; pre-loads on mount
   * when undefined (desktop/in-call behaviour).
   */
  onExpand?: (load: () => void) => void;
  onCountChange?: (count: number) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ResultsTimelineSection({
  patientId,
  token,
  layout,
  mode: _mode,
  onExpand,
  onCountChange,
}: ResultsTimelineSectionProps) {
  const [entries, setEntries] = useState<ResultsTimelineEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    try {
      const res = await getPatientResultsTimeline(token, patientId);
      const data = res.data.results ?? [];
      setEntries(data);
      onCountChange?.(data.length);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to load investigations & results",
      );
      setEntries([]);
      onCountChange?.(0);
    }
  }, [token, patientId, onCountChange]);

  useEffect(() => {
    if (layout === "mobile" && onExpand) {
      onExpand(load);
    } else {
      load();
    }
  }, [layout, onExpand, load]);

  if (entries === null) {
    return (
      <p className="px-1 py-2 text-xs text-gray-400">Loading investigations & results…</p>
    );
  }

  if (loadError) {
    return (
      <p role="alert" className="px-1 py-2 text-xs text-red-600">
        {loadError}
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="px-1 py-2 text-xs text-gray-500" role="status">
        No investigations or results recorded.
      </p>
    );
  }

  const compact = layout === "in-call";

  return (
    <ol
      className="space-y-2 overflow-x-hidden"
      aria-label="Investigations and results timeline"
      data-testid="results-timeline-list"
    >
      {entries.map((entry) => (
        <TimelineVisitRow key={entry.prescriptionId} entry={entry} compact={compact} />
      ))}
    </ol>
  );
}
