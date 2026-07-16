/**
 * Investigation order resolver types (plan-investigations-library · inv-lib-04).
 *
 * Gated, server-side, suggestion-only AI safety net behind the deterministic
 * frontend catalog autocomplete + local fuzzy suggest. It fires only on the
 * free-text (no local match) path: the model NORMALIZES messy / vernacular /
 * mis-spelled order text (e.g. "liver ka test", "sugar wala") into clean lab /
 * imaging order TERMS in English.
 *
 * Unlike the diagnosis resolver, the order catalog lives in the FRONTEND static
 * lab library, not the DB — so the backend is a pure normalizer. It returns
 * candidate TERMS only (never catalog ids); the frontend re-resolves each term
 * against its static catalog, keeping the catalog single-sourced and the model
 * unable to inject an order the catalog does not know.
 */

/** Model tier (mirrors config `InvestigationResolveModelTier`). */
export type InvestigationResolveTier = 'default' | 'escalation';

export interface InvestigationResolveRequest {
  /** Doctor's free-typed order text (PHI — redacted before the prompt). */
  text: string;
  /** `default` (mini) auto-gate, `escalation` (flagship) on explicit refine. */
  tier?: InvestigationResolveTier;
}

/** One normalized order-term candidate. The frontend maps this to the catalog. */
export interface InvestigationResolveCandidate {
  /** Clean lab / imaging order name in English (e.g. "Liver function test"). */
  term: string;
  /** Model confidence 0–1 (advisory only; may be absent). */
  confidence?: number;
}

export interface InvestigationResolveResult {
  candidates: InvestigationResolveCandidate[];
}
