/**
 * ARM-07: Human-readable copy for service-match reason codes (structured only; no LLM).
 * Keep in sync with backend `SERVICE_CATALOG_MATCH_REASON_CODES` when adding codes.
 */

export type MatchReasonMeta = {
  /** Short chip text */
  label: string;
  /** Tooltip / expanded explanation */
  detail: string;
  /** One-line summary when this code is the primary signal */
  summaryLine: string;
};

/** Known matcher codes → staff-facing copy. Unknown codes still render with a safe fallback. */
export const MATCH_REASON_META: Record<string, MatchReasonMeta> = {
  catalog_allowlist_match: {
    label: "Allowlist",
    detail: "Matched an allowlisted mapping from patient context to a catalog row.",
    summaryLine: "Matched using a catalog allowlist rule.",
  },
  keyword_hint_match: {
    label: "Hints",
    detail: "Matched using keyword / matcher hints from your catalog for this service.",
    summaryLine: "Matched using catalog matcher hints.",
  },
  single_service_catalog: {
    label: "Single service",
    detail: "Practice catalog has only one bookable service, so selection is straightforward.",
    summaryLine: "Only one service exists in the catalog.",
  },
  ambiguous_complaint: {
    label: "Ambiguous",
    detail: "The visit description could reasonably map to more than one catalog service.",
    summaryLine: "Visit wording could fit multiple visit types.",
  },
  competing_visit_type_buckets: {
    label: "Competing types",
    detail:
      "The thread matched signals for different visit-type buckets (e.g. routine vs acute). Staff should pick the right catalog row.",
    summaryLine: "Different visit-type buckets both matched; needs a clear choice.",
  },
  competing_buckets_practice_preference: {
    label: "Practice preference",
    detail:
      "Conflicting visit-type signals were resolved using your catalog’s “ambiguous visit-type routing” preference (non–catch-all service).",
    summaryLine: "Conflicting visit types used your practice’s preferred service.",
  },
  clinical_led_visit_type_unclear: {
    label: "Clinical unclear",
    detail:
      "Clinical-style context did not narrow to one catalog row; staff should assign the correct visit type.",
    summaryLine: "Clinical context did not narrow to one catalog row.",
  },
  no_catalog_match: {
    label: "Weak match",
    detail: "No strong catalog match was found; the proposal may be a fallback or catch-all.",
    summaryLine: "No strong catalog match — verify the proposed visit type.",
  },
  matcher_error: {
    label: "Matcher error",
    detail: "The matcher reported an error; treat the proposal as unreliable until verified.",
    summaryLine: "Matcher error — verify the proposal carefully.",
  },
  service_match_llm: {
    label: "LLM",
    detail: "An LLM stage proposed this catalog service key (still validated against your catalog).",
    summaryLine: "LLM-assisted match to this catalog service.",
  },
  auto_finalized_high_confidence: {
    label: "Auto high",
    detail: "Previously finalized automatically at high confidence (historical row).",
    summaryLine: "Was auto-finalized at high confidence.",
  },
  staff_confirmed_proposal: {
    label: "Staff confirmed",
    detail: "Staff confirmed the proposed visit type (historical).",
    summaryLine: "Staff confirmed this proposal.",
  },
  staff_reassigned_service: {
    label: "Staff reassigned",
    detail: "Staff chose a different catalog service than originally proposed (historical).",
    summaryLine: "Staff reassigned to another visit type.",
  },
  staff_review_cancelled_by_staff: {
    label: "Review cancelled",
    detail: "Staff closed the review without confirming a visit type (historical).",
    summaryLine: "Staff cancelled the review.",
  },
  staff_review_timed_out: {
    label: "Timed out",
    detail: "Review hit the SLA timeout before staff action (historical).",
    summaryLine: "Review timed out before staff action.",
  },
};

/** Order for picking a single “headline” summary when multiple codes exist (most actionable first). */
const SUMMARY_PRIORITY: string[] = [
  "matcher_error",
  "no_catalog_match",
  "clinical_led_visit_type_unclear",
  "competing_buckets_practice_preference",
  "competing_visit_type_buckets",
  "ambiguous_complaint",
  "service_match_llm",
  "keyword_hint_match",
  "catalog_allowlist_match",
  "single_service_catalog",
  "auto_finalized_high_confidence",
  "staff_reassigned_service",
  "staff_confirmed_proposal",
  "staff_review_cancelled_by_staff",
  "staff_review_timed_out",
];

export function parseMatchReasonCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((c) => c.trim());
}

export type CandidateLabelRow = { service_key: string; label: string };

export function parseCandidateLabels(raw: unknown): CandidateLabelRow[] {
  if (!Array.isArray(raw)) return [];
  const out: CandidateLabelRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const sk = o.service_key;
    const lb = o.label;
    if (typeof sk === "string" && typeof lb === "string" && sk.trim() && lb.trim()) {
      out.push({ service_key: sk.trim(), label: lb.trim() });
    }
  }
  return out;
}

function metaForCode(code: string): MatchReasonMeta {
  const k = code.trim().toLowerCase();
  return (
    MATCH_REASON_META[k] ?? {
      label: code.length > 24 ? `${code.slice(0, 22)}…` : code,
      detail: "Matcher signal recorded by the system. If this looks unfamiliar, check for a recent product update.",
      summaryLine: "See match signals for details.",
    }
  );
}

export function matchReasonChipMeta(code: string): MatchReasonMeta {
  return metaForCode(code);
}

/**
 * Short plain-language line for the table cell (structured template; not LLM-generated).
 */
export function matchExplanationSummary(codes: string[], confidence: string): string {
  const norm = codes.map((c) => c.trim().toLowerCase());
  const set = new Set(norm);

  for (const key of SUMMARY_PRIORITY) {
    if (set.has(key)) {
      const m = MATCH_REASON_META[key];
      if (m?.summaryLine) return m.summaryLine;
    }
  }

  const c = confidence.trim().toLowerCase();
  if (c === "low") return "Low confidence — please verify the visit type.";
  if (c === "medium") return "Medium confidence — staff confirmation was requested.";
  if (norm.length === 0) return "No matcher signals were recorded for this request.";
  return "See match signals below.";
}

export function formatCandidateSummary(candidates: CandidateLabelRow[], maxShow = 4): string | null {
  if (!candidates.length) return null;
  const slice = candidates.slice(0, maxShow);
  const text = slice.map((c) => `${c.label} (${c.service_key})`).join(", ");
  if (candidates.length > maxShow) {
    return `${text} (+${candidates.length - maxShow} more)`;
  }
  return text;
}
