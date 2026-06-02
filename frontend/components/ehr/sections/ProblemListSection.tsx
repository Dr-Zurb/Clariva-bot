"use client";

/**
 * ProblemListSection (EHR Sub-batch D / T5.25)
 *
 * Renders the patient's unified problem list sourced from
 * `patient_problem_list_v` via GET /api/v1/patients/:id/chart/problems.
 *
 * Three problem types:
 *   🩺  chronic   — non-archived chronic conditions (since date if known)
 *   📋  recurring — same diagnosis ≥2× in last 6 months (occurrence count)
 *   🔄  episode   — active care episodes (follow-up counters)
 *
 * Read-only in all modes; no add/edit CTA (the view is derived from other
 * tables that have their own sections). The `mode` prop is accepted for
 * prop-shape consistency with sibling sections but has no behavioural effect.
 *
 * Desktop: pre-loads on mount.
 * Mobile:  lazy-loads when first expanded (triggered by parent SectionWrapper
 *          via the `onExpand` prop — optional; pre-loads if not provided).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { listPatientProblems } from "@/lib/api/patient-chart";
import { formatDate } from "@/lib/format-date";
import type {
  PatientChartLayout,
  PatientChartMode,
  ProblemListItem,
  ProblemSource,
} from "@/types/patient-chart";

// ─── Icon map ────────────────────────────────────────────────────────────────

const SOURCE_ICON: Record<ProblemSource, string> = {
  chronic: "🩺",
  recurring: "📋",
  episode: "🔄",
};

const SOURCE_LABEL: Record<ProblemSource, string> = {
  chronic: "Chronic condition",
  recurring: "Recurring diagnosis",
  episode: "Active episode",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMonthYear(dateStr: string | null): string | null {
  if (!dateStr) return null;
  return formatDate(dateStr + "T00:00:00", {
    year: "numeric",
    month: "short",
  });
}

function ProblemRow({ item }: { item: ProblemListItem }) {
  const icon = SOURCE_ICON[item.source];
  const srLabel = SOURCE_LABEL[item.source];

  let meta: string | null = null;
  if (item.source === "chronic" && item.since_date) {
    const formatted = formatMonthYear(item.since_date);
    if (formatted) meta = `since ${formatted}`;
  } else if (item.source === "episode") {
    const parts: string[] = [];
    if (item.episode_status) parts.push(item.episode_status);
    if (item.followups_used != null && item.max_followups != null) {
      parts.push(`${item.followups_used}/${item.max_followups} follow-ups used`);
    }
    meta = parts.join(" · ") || null;
  } else if (item.source === "recurring" && item.occurrence_count != null) {
    meta = `diagnosed ${item.occurrence_count}× in last 6mo`;
  }

  // Capitalise the label for display (the view lowercases recurring labels).
  const display =
    item.source === "recurring"
      ? item.label.charAt(0).toUpperCase() + item.label.slice(1)
      : item.label;

  return (
    <li className="flex min-w-0 items-start gap-2 break-words rounded px-1 py-1.5">
      <span role="img" aria-label={srLabel} className="mt-0.5 shrink-0 text-sm">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-gray-900">
          {display}
          {item.source === "recurring" && (
            <span className="ml-1 text-xs font-normal text-gray-500">
              (recurring)
            </span>
          )}
        </p>
        {meta && (
          <p className="text-xs text-gray-500">{meta}</p>
        )}
      </div>
    </li>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface ProblemListSectionProps {
  patientId: string;
  token: string;
  layout: PatientChartLayout;
  mode: PatientChartMode;
  /**
   * Optional: called by the parent SectionWrapper when the accordion expands
   * on mobile. The section lazy-loads on first expansion when this is provided;
   * pre-loads on mount when undefined (desktop/in-call behaviour).
   */
  onExpand?: (load: () => void) => void;
  onCountChange?: (count: number) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProblemListSection({
  patientId,
  token,
  layout,
  mode: _mode,
  onExpand,
  onCountChange,
}: ProblemListSectionProps) {
  const [rows, setRows] = useState<ProblemListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    try {
      const res = await listPatientProblems(token, patientId);
      const data = res.data.problems ?? [];
      setRows(data);
      onCountChange?.(data.length);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to load problem list",
      );
      setRows([]);
    }
  }, [token, patientId, onCountChange]);

  useEffect(() => {
    if (layout === "mobile" && onExpand) {
      // Lazy: parent calls the callback when the accordion expands.
      onExpand(load);
    } else {
      // Desktop / in-call: pre-load immediately.
      load();
    }
  }, [layout, onExpand, load]);

  if (rows === null) {
    return (
      <p className="px-1 py-2 text-xs text-gray-400">Loading problem list…</p>
    );
  }
  if (loadError) {
    return (
      <p role="alert" className="px-1 py-2 text-xs text-red-600">
        {loadError}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="px-1 py-2 text-xs text-gray-500">
        No active problems recorded.
      </p>
    );
  }

  return (
    <ul className="space-y-0.5 overflow-x-hidden" aria-label="Problem list">
      {rows.map((item, idx) => (
        // The view has no surrogate key; composite key is sufficient.
        <ProblemRow key={`${item.source}-${item.label}-${idx}`} item={item} />
      ))}
    </ul>
  );
}
