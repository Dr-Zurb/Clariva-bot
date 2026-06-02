/**
 * Drug Interactions Types (EHR Sub-batch C / Task C.2 / T4.19)
 *
 * Mirrors the `drug_interactions` table row shape.
 * No PHI — generic drug-interaction reference data from BNF / Beers Criteria.
 */

/**
 * Four-value severity scale (Decision §20 LOCKED).
 * Displayed with colour coding by <InteractionChips> (C.3 / T4.20):
 *   minor          → yellow
 *   moderate       → orange
 *   major          → red
 *   contraindicated → dark red
 */
export type InteractionSeverity = 'minor' | 'moderate' | 'major' | 'contraindicated';

/** Full DB row shape returned by the check endpoint. */
export interface InteractionRow {
  id: string;
  drug_a_id: string;
  drug_b_id: string;
  severity: InteractionSeverity;
  /** Mechanism / interaction summary text. */
  description: string;
  /** Clinical action guidance. */
  recommendation: string;
  /** Source note / reference citation. */
  source: string;
  /** URL to primary source (BNF etc.). Nullable. */
  source_url: string | null;
}

/** Shape returned by GET /api/v1/drug-interactions/check */
export interface CheckInteractionsResponse {
  results: InteractionRow[];
}
