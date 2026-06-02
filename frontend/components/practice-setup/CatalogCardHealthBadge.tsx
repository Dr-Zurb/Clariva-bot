"use client";

/**
 * Plan 02 / Task 07 — Per-card health pill for the service catalog editor.
 *
 * Renders a tiny colored pill on each card row summarizing the worst
 * deterministic issue for that card (strict-with-empty-hints, pricing anomaly,
 * flexible-should-be-strict, etc.). Uses `runLocalCatalogChecks` output — no
 * server call. The LLM-only issue types (`overlap`, `gap`, `contradiction`, …)
 * show up in the {@link CatalogReviewPanel} separately.
 *
 * Four states:
 *   - `error` (red)   : will almost certainly fail matching or block save
 *   - `warning` (amber): likely misconfiguration (thin keywords, anomaly, …)
 *   - `suggestion` (sky): nice-to-have improvement
 *   - `none` (no badge): card passed all local checks
 */

import type { QualityIssue, QualityIssueSeverity } from "@/lib/catalog-quality-issues";
import { ISSUE_TYPE_COPY, worstSeverity } from "@/lib/catalog-quality-issues";

type Props = {
  issues: readonly QualityIssue[];
  scopeMode: "strict" | "flexible";
};

const BASE_CLASS =
  "shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0 text-[10px] font-medium";

const STYLE_BY_SEVERITY: Readonly<Record<QualityIssueSeverity, string>> = {
  error: "bg-red-100 text-red-800",
  warning: "bg-amber-100 text-amber-900",
  suggestion: "bg-sky-100 text-sky-900",
};

const LABEL_BY_SEVERITY: Readonly<Record<QualityIssueSeverity, string>> = {
  error: "Fix before saving",
  warning: "Check this",
  suggestion: "Nudge",
};

export function CatalogCardHealthBadge({ issues, scopeMode }: Props) {
  const worst = worstSeverity(issues);
  if (worst === null) return null;

  // Scope-aware tooltip: strict-mode issues read as "will not match", flexible
  // ones as "may under-match" — matches the copy in task-07.
  const topIssue = issues[0];
  const typeCopy = topIssue ? ISSUE_TYPE_COPY[topIssue.type] : null;
  const baseTitle = typeCopy?.title ?? LABEL_BY_SEVERITY[worst];
  const scopeHint =
    worst === "error"
      ? scopeMode === "strict"
        ? "Strict card with no matcher hints will route nothing. Fix or switch to flexible."
        : "Fix required before saving."
      : scopeMode === "strict"
        ? "Strict matching may miss phrases patients actually type."
        : "Flexible matching may absorb complaints that belong elsewhere.";
  const extra = issues.length > 1 ? ` (+${issues.length - 1} more)` : "";
  const title = `${baseTitle}. ${scopeHint}${extra}`;

  return (
    <span
      className={`${BASE_CLASS} ${STYLE_BY_SEVERITY[worst]}`}
      title={title}
      aria-label={`Card health: ${LABEL_BY_SEVERITY[worst]}`}
      data-testid="catalog-card-health-badge"
      data-severity={worst}
    >
      <span aria-hidden>
        {worst === "error" ? "⚠" : worst === "warning" ? "!" : "i"}
      </span>
      <span>{LABEL_BY_SEVERITY[worst]}</span>
      {issues.length > 1 && (
        <span className="rounded bg-white/60 px-1 text-[9px] font-semibold">
          {issues.length}
        </span>
      )}
    </span>
  );
}
