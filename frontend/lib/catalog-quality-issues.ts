/**
 * Plan 02 / Task 07 — Frontend mirror of `backend/src/types/catalog-quality-issues.ts`.
 *
 * This file intentionally duplicates the enum values from the backend so the
 * frontend can:
 *   1. narrow `QualityIssue["type"]` in UI code without pulling the backend
 *      package in, and
 *   2. render consistent action labels and severity copy in
 *      `CatalogReviewPanel` and `CatalogCardHealthBadge`.
 *
 * Any change here MUST be reflected in the backend file of the same name. A
 * parity test (`backend/tests/unit/types/catalog-quality-issues.test.ts`) fails
 * if the backend enums drift. When you add a new issue type:
 *
 *   1. Add it to both {@link QUALITY_ISSUE_TYPES} arrays.
 *   2. Put it in either {@link DETERMINISTIC_ISSUE_TYPES} or {@link LLM_ISSUE_TYPES}.
 *   3. Add an entry to {@link DEFAULT_SEVERITIES} and {@link ISSUE_TYPE_IMPACT_WEIGHT}.
 *   4. Add UI copy in {@link ISSUE_TYPE_COPY} (title + body templates).
 */

export const QUALITY_ISSUE_TYPES = [
  "strict_empty_hints",
  "strict_thin_keywords",
  "flexible_should_be_strict",
  "empty_hints",
  "missing_catchall",
  "pricing_anomaly",
  "overlap",
  "gap",
  "contradiction",
  "modality_mismatch",
  "service_suggestion",
] as const;
export type QualityIssueType = (typeof QUALITY_ISSUE_TYPES)[number];

export const QUALITY_ISSUE_SEVERITIES = ["error", "warning", "suggestion"] as const;
export type QualityIssueSeverity = (typeof QUALITY_ISSUE_SEVERITIES)[number];

export const QUALITY_ISSUE_ACTIONS = [
  "fill_with_ai",
  "switch_to_strict",
  "switch_to_flexible",
  "switch_to_strict_and_fill",
  "apply_exclude_when_suggestion",
  "add_card",
  "enable_modality",
  "reprice",
] as const;
export type QualityIssueAction = (typeof QUALITY_ISSUE_ACTIONS)[number];

export const DETERMINISTIC_ISSUE_TYPES: readonly QualityIssueType[] = [
  "strict_empty_hints",
  "strict_thin_keywords",
  "flexible_should_be_strict",
  "empty_hints",
  "missing_catchall",
  "pricing_anomaly",
];

export const LLM_ISSUE_TYPES: readonly QualityIssueType[] = [
  "overlap",
  "gap",
  "contradiction",
  "modality_mismatch",
  "service_suggestion",
];

export const DEFAULT_SEVERITIES: Readonly<Record<QualityIssueType, QualityIssueSeverity>> = {
  strict_empty_hints: "error",
  strict_thin_keywords: "warning",
  flexible_should_be_strict: "warning",
  empty_hints: "suggestion",
  missing_catchall: "error",
  pricing_anomaly: "warning",
  overlap: "warning",
  gap: "suggestion",
  contradiction: "warning",
  modality_mismatch: "warning",
  service_suggestion: "suggestion",
};

/** Default UI button labels per action. Per-issue `label` overrides win. */
export const ACTION_LABELS: Readonly<Record<QualityIssueAction, string>> = {
  fill_with_ai: "Fill with AI",
  switch_to_strict: "Switch to strict",
  switch_to_flexible: "Switch to flexible",
  switch_to_strict_and_fill: "Switch to strict & fill with AI",
  apply_exclude_when_suggestion: "Apply exclude_when fix",
  add_card: "Add card",
  enable_modality: "Enable modality",
  reprice: "Apply suggested price",
};

export const ISSUE_TYPE_IMPACT_WEIGHT: Readonly<Record<QualityIssueType, number>> = {
  missing_catchall: 0,
  strict_empty_hints: 1,
  contradiction: 2,
  pricing_anomaly: 3,
  overlap: 4,
  modality_mismatch: 5,
  flexible_should_be_strict: 6,
  strict_thin_keywords: 7,
  empty_hints: 8,
  gap: 9,
  service_suggestion: 10,
};

/** Short titles the review panel renders as group headers. */
export const ISSUE_TYPE_COPY: Readonly<
  Record<QualityIssueType, { title: string; helpText: string }>
> = {
  strict_empty_hints: {
    title: "Strict card with no matching hints",
    helpText:
      "A card set to strict matching with no keywords or include_when will never match any conversation.",
  },
  strict_thin_keywords: {
    title: "Strict card with very few keywords",
    helpText:
      "Strict matching works best with several synonyms. A single keyword will cause the bot to miss obvious phrases patients actually type.",
  },
  flexible_should_be_strict: {
    title: "Flexible card that reads like a specific condition",
    helpText:
      "This card names a clinical condition but is set to flexible, so it may absorb complaints that belong to other cards.",
  },
  empty_hints: {
    title: "No routing hints set",
    helpText: "Without any keywords or include_when, the bot cannot reliably match patients to this card.",
  },
  missing_catchall: {
    title: "Missing catch-all card",
    helpText:
      "The matcher needs a flexible catch-all (usually labeled \"Other / not listed\") so complaints that don't fit any named service still land somewhere.",
  },
  pricing_anomaly: {
    title: "Pricing looks off",
    helpText: "Text price should be lowest, voice in the middle, video highest. Follow-up prices should not exceed initial visit prices.",
  },
  overlap: {
    title: "Keywords overlap between cards",
    helpText: "Two cards share many of the same keywords — the matcher may pick either one at random.",
  },
  gap: {
    title: "Common complaint not covered",
    helpText: "A complaint pattern common for your specialty is missing a dedicated card.",
  },
  contradiction: {
    title: "Include/exclude rules contradict each other",
    helpText: "This card's include_when and exclude_when say opposite things about the same patient phrases.",
  },
  modality_mismatch: {
    title: "Modality doesn't fit the service",
    helpText: "This service is enabled on a consultation channel that usually isn't appropriate (e.g. skin check on text-only).",
  },
  service_suggestion: {
    title: "Consider adding this service",
    helpText: "A service common for your specialty and country is worth considering.",
  },
};

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface QualityIssueSuggestion {
  action: QualityIssueAction;
  label?: string;
}

export interface QualityIssueSuggestedCard {
  service_key: string;
  label: string;
  description?: string;
  scope_mode?: "strict" | "flexible";
  matcher_hints?: {
    keywords?: string;
    include_when?: string;
    exclude_when?: string;
  };
  modalities?: {
    text?: { enabled: boolean; price_minor: number };
    voice?: { enabled: boolean; price_minor: number };
    video?: { enabled: boolean; price_minor: number };
  };
}

export interface QualityIssue {
  type: QualityIssueType;
  severity: QualityIssueSeverity;
  services: string[];
  message: string;
  suggestion?: string;
  suggestions?: QualityIssueSuggestion[];
  suggestedCard?: QualityIssueSuggestedCard;
  autoFixAvailable: boolean;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const SEVERITY_WEIGHT: Readonly<Record<QualityIssueSeverity, number>> = {
  error: 0,
  warning: 1,
  suggestion: 2,
};

/** Deterministic sort matching the backend `sortQualityIssues`. */
export function sortQualityIssues(issues: QualityIssue[]): QualityIssue[] {
  return [...issues].sort((a, b) => {
    const sa = SEVERITY_WEIGHT[a.severity];
    const sb = SEVERITY_WEIGHT[b.severity];
    if (sa !== sb) return sa - sb;
    const ia = ISSUE_TYPE_IMPACT_WEIGHT[a.type];
    const ib = ISSUE_TYPE_IMPACT_WEIGHT[b.type];
    if (ia !== ib) return ia - ib;
    const ka = a.services[0] ?? "";
    const kb = b.services[0] ?? "";
    return ka.localeCompare(kb);
  });
}

export function resolveActionLabel(s: QualityIssueSuggestion): string {
  return s.label ?? ACTION_LABELS[s.action];
}

export function isDeterministicIssueType(t: QualityIssueType): boolean {
  return DETERMINISTIC_ISSUE_TYPES.includes(t);
}

/**
 * Pick issues that affect a specific card so the per-card health badge knows
 * what to surface. Catalog-level issues (`services === []`) are excluded — they
 * belong in the review panel, not on a single card.
 */
export function issuesForServiceKey(
  all: readonly QualityIssue[],
  service_key: string
): QualityIssue[] {
  return all.filter((i) => i.services.includes(service_key));
}

/**
 * Collapse a list of issues for one card to a single worst severity, or null
 * when there are no issues. Used to color the {@link CatalogCardHealthBadge}.
 */
export function worstSeverity(issues: readonly QualityIssue[]): QualityIssueSeverity | null {
  if (issues.length === 0) return null;
  let worst: QualityIssueSeverity = "suggestion";
  for (const i of issues) {
    if (SEVERITY_WEIGHT[i.severity] < SEVERITY_WEIGHT[worst]) worst = i.severity;
    if (worst === "error") break;
  }
  return worst;
}
