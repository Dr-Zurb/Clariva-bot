"use client";

/**
 * Plan 02 / Task 07 — Catalog-level review panel.
 *
 * Renders a grouped list of {@link QualityIssue}s (combined deterministic +
 * LLM) with one-tap action buttons. Action dispatch is delegated to the parent
 * page which owns the draft state — this component is presentational and
 * pure: `(issues, loading, error) -> UI + onApplyFix callback`.
 */

import { useMemo } from "react";
import type {
  QualityIssue,
  QualityIssueSeverity,
  QualityIssueSuggestion,
} from "@/lib/catalog-quality-issues";
import {
  ACTION_LABELS,
  ISSUE_TYPE_COPY,
  resolveActionLabel,
  sortQualityIssues,
} from "@/lib/catalog-quality-issues";

export type ApplyFixHandler = (
  issue: QualityIssue,
  suggestion: QualityIssueSuggestion
) => void | Promise<void>;

type Props = {
  open: boolean;
  onClose: () => void;
  /** Null before the server review has been requested; set to [] once run with no findings. */
  issues: readonly QualityIssue[] | null;
  loading: boolean;
  error: string | null;
  /** Triggers the manual "Review my catalog" run. */
  onRunReview: () => void | Promise<void>;
  /** Applies one suggestion from one issue to the draft list. */
  onApplyFix: ApplyFixHandler;
  /** Label → service_key map so we can render human labels on catalog-level issues. */
  labelByKey: Readonly<Record<string, string>>;
  /**
   * Optional: when true, panel auto-shows because a save attempt surfaced
   * error-severity issues. Lets the parent render copy like "Save blocked —
   * please review before trying again".
   */
  triggeredBySave?: boolean;
  /** "Save anyway" escape hatch when the parent can bypass error-severity checks. */
  onSaveAnyway?: () => void | Promise<void>;
  /** Per-fix in-flight flag from the parent. */
  fixInFlightKey?: string | null;
};

const SEVERITY_HEADER: Readonly<
  Record<QualityIssueSeverity, { label: string; className: string }>
> = {
  error: {
    label: "Fix before saving",
    className: "border-red-200 bg-red-50 text-red-900",
  },
  warning: {
    label: "Check these",
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
  suggestion: {
    label: "Nice to have",
    className: "border-sky-200 bg-sky-50 text-sky-900",
  },
};

const SEVERITY_ICON: Readonly<Record<QualityIssueSeverity, string>> = {
  error: "⚠",
  warning: "!",
  suggestion: "i",
};

/**
 * Counts issues per severity so the header can show "3 errors, 2 warnings".
 * Returns nothing fancy — callers always render the full panel body anyway.
 */
function countBySeverity(
  issues: readonly QualityIssue[]
): Record<QualityIssueSeverity, number> {
  const out: Record<QualityIssueSeverity, number> = {
    error: 0,
    warning: 0,
    suggestion: 0,
  };
  for (const i of issues) out[i.severity] += 1;
  return out;
}

/** Shows labels instead of raw keys when possible. */
function renderServices(keys: readonly string[], labelByKey: Props["labelByKey"]): string {
  if (keys.length === 0) return "Whole catalog";
  const labels = keys.map((k) => labelByKey[k] ?? k);
  if (labels.length <= 3) return labels.join(", ");
  return `${labels.slice(0, 3).join(", ")} +${labels.length - 3} more`;
}

function fixKey(issue: QualityIssue, suggestion: QualityIssueSuggestion): string {
  return `${issue.type}::${issue.services.join(",")}::${suggestion.action}`;
}

export function CatalogReviewPanel({
  open,
  onClose,
  issues,
  loading,
  error,
  onRunReview,
  onApplyFix,
  labelByKey,
  triggeredBySave = false,
  onSaveAnyway,
  fixInFlightKey = null,
}: Props) {
  const sortedIssues = useMemo<QualityIssue[]>(
    () => (issues ? sortQualityIssues([...issues]) : []),
    [issues]
  );
  const counts = useMemo(() => countBySeverity(sortedIssues), [sortedIssues]);
  const hasErrors = counts.error > 0;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-gray-900/40 px-4 py-8 sm:py-16"
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-review-title"
    >
      <div className="w-full max-w-2xl rounded-lg border border-gray-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div>
            <h3 id="catalog-review-title" className="text-base font-semibold text-gray-900">
              Review my catalog
            </h3>
            <p className="mt-0.5 text-xs text-gray-600">
              {triggeredBySave
                ? "We caught a few things before saving. Fix the errors or save anyway."
                : "Catches overlaps, gaps, modality mismatches, and missing hints the matcher needs."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close review panel"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs">
          <button
            type="button"
            onClick={onRunReview}
            disabled={loading}
            className="rounded-md border border-blue-200 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          >
            {loading ? "Reviewing…" : issues == null ? "Run review" : "Run review again"}
          </button>
          {sortedIssues.length > 0 && (
            <span className="text-gray-700">
              {counts.error > 0 && (
                <span className="mr-2 font-medium text-red-800">
                  {counts.error} error{counts.error === 1 ? "" : "s"}
                </span>
              )}
              {counts.warning > 0 && (
                <span className="mr-2 font-medium text-amber-900">
                  {counts.warning} warning{counts.warning === 1 ? "" : "s"}
                </span>
              )}
              {counts.suggestion > 0 && (
                <span className="font-medium text-sky-900">
                  {counts.suggestion} suggestion{counts.suggestion === 1 ? "" : "s"}
                </span>
              )}
            </span>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
          {error && (
            <div
              className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"
              role="alert"
            >
              {error}
            </div>
          )}

          {!error && issues == null && !loading && (
            <p className="text-sm text-gray-600">
              Click <strong>Run review</strong> to scan your catalog for common matching and pricing
              mistakes. This uses one AI call on your behalf.
            </p>
          )}

          {!error && issues != null && sortedIssues.length === 0 && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              Your catalog looks healthy — no issues found.
            </div>
          )}

          {sortedIssues.length > 0 && (
            <ul className="space-y-2">
              {sortedIssues.map((issue, idx) => {
                const copy = ISSUE_TYPE_COPY[issue.type];
                const header = SEVERITY_HEADER[issue.severity];
                return (
                  <li
                    key={`${issue.type}-${idx}`}
                    className={`rounded-md border p-3 ${header.className}`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        aria-hidden
                        className="mt-0.5 shrink-0 rounded-full bg-white/70 px-1.5 text-xs font-bold"
                      >
                        {SEVERITY_ICON[issue.severity]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-xs font-semibold uppercase tracking-wide">
                            {header.label}
                          </span>
                          <span className="text-xs font-medium text-gray-700">
                            {copy.title}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-900">{issue.message}</p>
                        {issue.suggestion && (
                          <p className="mt-1 text-xs text-gray-700">💡 {issue.suggestion}</p>
                        )}
                        <p className="mt-1 text-[11px] text-gray-600">
                          Affects: {renderServices(issue.services, labelByKey)}
                        </p>

                        {issue.suggestedCard && (
                          <div className="mt-2 rounded-md border border-gray-300 bg-white/60 p-2 text-xs text-gray-800">
                            <p className="font-medium">
                              Suggested card: {issue.suggestedCard.label}
                            </p>
                            {issue.suggestedCard.description && (
                              <p className="mt-0.5 text-[11px] text-gray-700">
                                {issue.suggestedCard.description}
                              </p>
                            )}
                          </div>
                        )}

                        {issue.suggestions && issue.suggestions.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {issue.suggestions.map((sg, j) => {
                              const k = fixKey(issue, sg);
                              const inFlight = fixInFlightKey === k;
                              return (
                                <button
                                  key={j}
                                  type="button"
                                  onClick={() => onApplyFix(issue, sg)}
                                  disabled={inFlight}
                                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                                >
                                  {inFlight
                                    ? "Applying…"
                                    : (sg.label ?? resolveActionLabel(sg) ?? ACTION_LABELS[sg.action])}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
          {triggeredBySave && onSaveAnyway && hasErrors && (
            <button
              type="button"
              onClick={onSaveAnyway}
              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              Save anyway
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
