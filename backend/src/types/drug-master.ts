/**
 * Drug Master Types (EHR Sub-batch B1 / T2.7)
 *
 * Lookup table; not PHI. Snake_case mirrors the DB row shape returned by
 * Supabase / PostgREST.
 */

export interface DrugMasterRow {
  id: string;
  generic_name: string;
  brand_names: string[];
  strength: string | null;
  form: string | null;
  route_default: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Search result row — the API returns a subset of the columns plus the id.
 * For now we ship the full row (cheap; ~6 columns). Kept as an alias so
 * the search-result shape can diverge from the storage shape later (e.g.
 * adding `match_kind: 'prefix' | 'fuzzy'`) without changing storage.
 */
export type DrugSearchResult = DrugMasterRow;
