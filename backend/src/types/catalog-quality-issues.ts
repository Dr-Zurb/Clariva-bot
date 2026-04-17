/**
 * Plan 02 / Task 07 — Catalog quality issues.
 *
 * Shared Zod schema + enums for the response shape of
 * `POST /api/v1/catalog/ai-suggest { mode: 'review' }`.
 *
 * Two layers of checks populate the `QualityIssue[]` that the endpoint returns:
 *
 *   1. Deterministic checks (run in {@link ../services/service-catalog-ai-suggest.ts#runDeterministicCatalogReview})
 *      — cheap, no LLM, walk the doctor's catalog and emit types listed in
 *      {@link DETERMINISTIC_ISSUE_TYPES}. These fire on every review call.
 *
 *   2. LLM checks (one call per review) — emit types listed in {@link LLM_ISSUE_TYPES}.
 *      The prompt explicitly tells the LLM NOT to re-emit deterministic kinds so
 *      we don't pay tokens for issues we already have locally.
 *
 * The frontend mirrors this schema in `frontend/lib/catalog-quality-issues.ts`.
 * Drift is guarded by `backend/tests/unit/types/catalog-quality-issues.test.ts`.
 */

import { z } from 'zod';
import {
  scopeModeSchema,
  serviceMatcherHintsV1Schema,
  serviceModalitiesSchema,
} from '../utils/service-catalog-schema';

// ----------------------------------------------------------------------------
// Enums
// ----------------------------------------------------------------------------

/**
 * Every issue surfaced by review carries one of these types. Copy + severity
 * rubric lives in `frontend/lib/catalog-quality-issues.ts` (UI copy) and in
 * {@link DEFAULT_SEVERITIES} (default severity when an issue is emitted).
 */
export const QUALITY_ISSUE_TYPES = [
  'strict_empty_hints',
  'strict_thin_keywords',
  'flexible_should_be_strict',
  'empty_hints',
  'missing_catchall',
  'pricing_anomaly',
  'overlap',
  'gap',
  'contradiction',
  'modality_mismatch',
  'service_suggestion',
] as const;
export type QualityIssueType = (typeof QUALITY_ISSUE_TYPES)[number];

export const QUALITY_ISSUE_SEVERITIES = ['error', 'warning', 'suggestion'] as const;
export type QualityIssueSeverity = (typeof QUALITY_ISSUE_SEVERITIES)[number];

/** The doctor-visible button actions the review panel knows how to dispatch. */
export const QUALITY_ISSUE_ACTIONS = [
  'fill_with_ai',
  'switch_to_strict',
  'switch_to_flexible',
  'switch_to_strict_and_fill',
  'apply_exclude_when_suggestion',
  'add_card',
  'enable_modality',
  'reprice',
] as const;
export type QualityIssueAction = (typeof QUALITY_ISSUE_ACTIONS)[number];

/** Types emitted by the deterministic pass (no LLM). */
export const DETERMINISTIC_ISSUE_TYPES: readonly QualityIssueType[] = [
  'strict_empty_hints',
  'strict_thin_keywords',
  'flexible_should_be_strict',
  'empty_hints',
  'missing_catchall',
  'pricing_anomaly',
] as const;

/** Types the LLM is responsible for emitting. */
export const LLM_ISSUE_TYPES: readonly QualityIssueType[] = [
  'overlap',
  'gap',
  'contradiction',
  'modality_mismatch',
  'service_suggestion',
] as const;

/**
 * Default severity when the check fires. Deterministic checks pick their own
 * severity per-case (e.g. `strict_empty_hints` is always `error`; `empty_hints`
 * on a flexible card is `suggestion`). This table is the LLM's reference: when
 * an LLM issue omits severity, we fall back to this.
 */
export const DEFAULT_SEVERITIES: Readonly<Record<QualityIssueType, QualityIssueSeverity>> = {
  strict_empty_hints: 'error',
  strict_thin_keywords: 'warning',
  flexible_should_be_strict: 'warning',
  empty_hints: 'suggestion',
  missing_catchall: 'error',
  pricing_anomaly: 'warning',
  overlap: 'warning',
  gap: 'suggestion',
  contradiction: 'warning',
  modality_mismatch: 'warning',
  service_suggestion: 'suggestion',
};

/**
 * Default UI button labels per action. Frontend re-exports the same table so
 * the review panel doesn't have to invent copy per issue.
 */
export const ACTION_LABELS: Readonly<Record<QualityIssueAction, string>> = {
  fill_with_ai: 'Fill with AI',
  switch_to_strict: 'Switch to strict',
  switch_to_flexible: 'Switch to flexible',
  switch_to_strict_and_fill: 'Switch to strict & fill with AI',
  apply_exclude_when_suggestion: 'Apply exclude_when fix',
  add_card: 'Add card',
  enable_modality: 'Enable modality',
  reprice: 'Apply suggested price',
};

/**
 * Intra-severity ordering weight — lower comes first. Severity is the primary
 * sort key; this breaks ties so the most-impactful issues land on top. Keep
 * this list aligned with the severity rubric in Plan 02.
 */
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

// ----------------------------------------------------------------------------
// Zod
// ----------------------------------------------------------------------------

export const qualityIssueTypeSchema = z.enum(QUALITY_ISSUE_TYPES);
export const qualityIssueSeveritySchema = z.enum(QUALITY_ISSUE_SEVERITIES);
export const qualityIssueActionSchema = z.enum(QUALITY_ISSUE_ACTIONS);

export const qualityIssueSuggestionSchema = z.object({
  action: qualityIssueActionSchema,
  /** Overrides {@link ACTION_LABELS} for this specific issue when present. */
  label: z.string().min(1).max(120).optional(),
});
export type QualityIssueSuggestion = z.infer<typeof qualityIssueSuggestionSchema>;

/**
 * A partial `ServiceOfferingV1` we attach to `gap` issues so `[Add card]` can
 * drop it straight into the draft list. Accepts just label + modalities +
 * hints + scope_mode. The server always generates `service_id` fresh on paste.
 */
export const qualityIssueSuggestedCardSchema = z
  .object({
    service_key: z.string().min(1).max(64),
    label: z.string().min(1).max(200),
    description: z.string().max(500).optional(),
    scope_mode: scopeModeSchema.optional(),
    matcher_hints: serviceMatcherHintsV1Schema.optional(),
    modalities: serviceModalitiesSchema.optional(),
  })
  .strict();
export type QualityIssueSuggestedCard = z.infer<typeof qualityIssueSuggestedCardSchema>;

export const qualityIssueSchema = z
  .object({
    type: qualityIssueTypeSchema,
    severity: qualityIssueSeveritySchema,
    /** Zero or more affected service_keys; empty = catalog-wide (e.g. missing_catchall, gap). */
    services: z.array(z.string().min(1).max(64)).max(50),
    /** Doctor-facing one-liner; never PHI; max 400 chars. */
    message: z.string().min(1).max(400),
    /** Optional longer suggestion text (rendered under the actions row). */
    suggestion: z.string().max(800).optional(),
    /** One or more one-tap actions the UI can dispatch. */
    suggestions: z.array(qualityIssueSuggestionSchema).max(6).optional(),
    /** Set on `gap` issues so the UI can drop the card straight into drafts. */
    suggestedCard: qualityIssueSuggestedCardSchema.optional(),
    /** Computed: true iff at least one `suggestions` entry is present. */
    autoFixAvailable: z.boolean(),
  })
  .strict();
export type QualityIssue = z.infer<typeof qualityIssueSchema>;

export const qualityIssuesArraySchema = z.array(qualityIssueSchema).max(100);

// ----------------------------------------------------------------------------
// Sort + helpers
// ----------------------------------------------------------------------------

const SEVERITY_WEIGHT: Readonly<Record<QualityIssueSeverity, number>> = {
  error: 0,
  warning: 1,
  suggestion: 2,
};

/**
 * Deterministic (stable) sort: primary by severity, secondary by type-impact
 * weight, tertiary by first affected service_key (for reproducible ordering in
 * tests and UI).
 */
export function sortQualityIssues(issues: QualityIssue[]): QualityIssue[] {
  return [...issues].sort((a, b) => {
    const sa = SEVERITY_WEIGHT[a.severity];
    const sb = SEVERITY_WEIGHT[b.severity];
    if (sa !== sb) return sa - sb;
    const ia = ISSUE_TYPE_IMPACT_WEIGHT[a.type];
    const ib = ISSUE_TYPE_IMPACT_WEIGHT[b.type];
    if (ia !== ib) return ia - ib;
    const ka = a.services[0] ?? '';
    const kb = b.services[0] ?? '';
    return ka.localeCompare(kb);
  });
}

/** Resolve a button label: prefer the per-issue `label` override, else default. */
export function resolveActionLabel(s: QualityIssueSuggestion): string {
  return s.label ?? ACTION_LABELS[s.action];
}

/** Convenience: set `autoFixAvailable` based on `suggestions?.length`. */
export function withAutoFixFlag(
  input: Omit<QualityIssue, 'autoFixAvailable'>
): QualityIssue {
  return {
    ...input,
    autoFixAvailable: (input.suggestions?.length ?? 0) > 0,
  };
}
