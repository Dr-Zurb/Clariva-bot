/**
 * Diagnosis catalog frontend types (assessment-tab · asmt-06).
 * Mirrors the `diagnosis_catalog` ICD-11 (MMS) lookup table — NON-PHI.
 * @see backend/src/types/diagnosis-catalog.ts
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
