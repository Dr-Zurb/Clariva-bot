/**
 * Diagnosis catalog types (assessment-tab · asmt-06).
 * Mirrors the `diagnosis_catalog` ICD-11 (MMS) lookup table — NON-PHI.
 */

export interface DiagnosisCatalogRow {
  id: string;
  /** ICD-11 MMS stem code (e.g. BA00). */
  code: string;
  /** WHO canonical ICD-11 title (e.g. Essential hypertension). */
  title: string;
  /** Alternate labels / vernacular searched by the autocomplete. */
  synonyms: string[];
  /** Optional display grouping label (not the WHO chapter number). */
  chapter: string | null;
  created_at: string;
  updated_at: string;
}

export type DiagnosisCatalogSearchResult = DiagnosisCatalogRow;

// ---------------------------------------------------------------------------
// AI ICD-11 resolver (assessment-tab · asmt-07) — gated, server-side,
// suggestion-only. Fires only on the free-text (no catalog match) path. The
// model normalizes messy/vernacular/typo diagnosis text into clinical terms;
// the server then resolves each term against `diagnosis_catalog` so EVERY
// surfaced code is a real catalog code (the model can never inject one).
// ---------------------------------------------------------------------------

/** Model tier (mirrors config `DiagnosisResolveModelTier`). */
export type DiagnosisResolveTier = 'default' | 'escalation';

export interface DiagnosisResolveRequest {
  /** Doctor's free-typed diagnosis text (PHI — redacted before the prompt). */
  text: string;
  /** `default` (mini) auto-gate, `escalation` (flagship) on explicit refine. */
  tier?: DiagnosisResolveTier;
}

/** One resolved suggestion — the `code`/`title` always come from the catalog. */
export interface DiagnosisResolveSuggestion {
  /** ICD-11 MMS code from `diagnosis_catalog` (never model-invented). */
  code: string;
  /** WHO canonical ICD-11 title from `diagnosis_catalog`. */
  title: string;
  /** Model confidence 0–1 (advisory only; may be absent). */
  confidence?: number;
}

export interface DiagnosisResolveResult {
  suggestions: DiagnosisResolveSuggestion[];
}
