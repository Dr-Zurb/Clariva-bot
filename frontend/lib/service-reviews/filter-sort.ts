import { confidenceLevelOf } from "@/components/service-reviews/ConfidenceBadge";
import type { ServiceStaffReviewListItem } from "@/types/service-staff-review";

export type SortMode = "urgent" | "newest" | "oldest" | "confidence";
export type ConfidenceFilter = "all" | "high" | "medium" | "low";
export type ReviewDensity = "comfortable" | "compact";

export const REVIEW_DENSITY_STORAGE_KEY = "booking-review:density";

const CONFIDENCE_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  unknown: 3,
};

/** Phase 1 pending sort — soonest SLA deadline first; null deadlines by created_at. */
export function sortPendingByUrgency(rows: ServiceStaffReviewListItem[]): ServiceStaffReviewListItem[] {
  return [...rows].sort((a, b) => {
    const aDeadline = a.sla_deadline_at ? new Date(a.sla_deadline_at).getTime() : NaN;
    const bDeadline = b.sla_deadline_at ? new Date(b.sla_deadline_at).getTime() : NaN;
    const aHas = !Number.isNaN(aDeadline);
    const bHas = !Number.isNaN(bDeadline);
    if (aHas && bHas) return aDeadline - bDeadline;
    if (aHas) return -1;
    if (bHas) return 1;
    const aCreated = new Date(a.created_at).getTime();
    const bCreated = new Date(b.created_at).getTime();
    if (Number.isNaN(aCreated) && Number.isNaN(bCreated)) return 0;
    if (Number.isNaN(aCreated)) return 1;
    if (Number.isNaN(bCreated)) return -1;
    return aCreated - bCreated;
  });
}

export function filterReviews(
  rows: ServiceStaffReviewListItem[],
  opts: {
    query: string;
    confidence: ConfidenceFilter;
    labelForKey?: (key: string) => string | null;
  }
): ServiceStaffReviewListItem[] {
  const q = opts.query.trim().toLowerCase();

  return rows.filter((r) => {
    const level = confidenceLevelOf(r.match_confidence);
    const matchesConfidence = opts.confidence === "all" || level === opts.confidence;

    if (!q) return matchesConfidence;

    const name = r.patient_display_name?.trim().toLowerCase() ?? "";
    const key = r.proposed_catalog_service_key.trim().toLowerCase();
    const label = opts.labelForKey?.(r.proposed_catalog_service_key)?.trim().toLowerCase() ?? "";
    const matchesQuery = name.includes(q) || key.includes(q) || label.includes(q);

    return matchesQuery && matchesConfidence;
  });
}

export function sortReviews(
  rows: ServiceStaffReviewListItem[],
  mode: SortMode,
  _nowMs: number
): ServiceStaffReviewListItem[] {
  void _nowMs;
  if (mode === "urgent") return sortPendingByUrgency(rows);

  const sorted = [...rows];

  if (mode === "newest") {
    return sorted.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  if (mode === "oldest") {
    return sorted.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }

  return sorted.sort((a, b) => {
    const aRank = CONFIDENCE_RANK[confidenceLevelOf(a.match_confidence)] ?? 3;
    const bRank = CONFIDENCE_RANK[confidenceLevelOf(b.match_confidence)] ?? 3;
    if (aRank !== bRank) return aRank - bRank;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

export function hasActiveReviewFilters(query: string, confidence: ConfidenceFilter): boolean {
  return query.trim().length > 0 || confidence !== "all";
}
