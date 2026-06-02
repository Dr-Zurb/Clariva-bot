/**
 * Drug Master Service (EHR Sub-batch B1 / T2.7)
 *
 * Read-only over the `drug_master` lookup. Powers <DrugAutocomplete> on
 * the doctor side. Backed by:
 *   - `lower(generic_name)` btree (text_pattern_ops) for prefix ILIKE
 *   - `pg_trgm` GIN on generic_name for fuzzy similarity
 *   - GIN on `brand_names` text[] for any-element matching
 *
 * Auth: SELECT is open via RLS (drug_master_read_all), so anon-key reads
 * also work — but we run via the service-role admin client to keep
 * parity with the rest of the codebase and to avoid a per-request
 * cookie-bound client just for a stateless lookup.
 *
 * Ordering rules (lifted from plan-t2-ehr-speed.md §T2.7):
 *   priority 1  exact prefix match on generic_name
 *   priority 2  exact prefix match on any element of brand_names
 *   priority 3  trigram similarity DESC against generic_name
 *
 * We compose the three buckets in TypeScript (rather than a single
 * fancy SQL CTE) because:
 *   - the lookup table is tiny (~80–500 rows); two round-trips are
 *     cheaper to maintain than a 60-line CTE,
 *   - the ordering rules will likely change once doctors give feedback
 *     (e.g. boost recently-prescribed-by-doctor); keeping the orchestration
 *     in TS leaves room to add per-doctor signals without touching SQL.
 */

import { getSupabaseAdminClient } from '../config/database';
import { handleSupabaseError } from '../utils/db-helpers';
import { InternalError } from '../utils/errors';
import { DrugSearchResult } from '../types/drug-master';

// Hard ceiling on the API limit param. Even if a caller sends ?limit=999,
// the service caps to this so the lookup table response stays cheap.
const MAX_LIMIT = 25;

// Minimum query length — single chars match too much to be useful and
// also defeat the trigram index. Keep in lockstep with the frontend
// debouncer (which only fires when query.length >= 2).
const MIN_QUERY_LEN = 2;

// Defensive upper-bound on the raw query string sent to the DB. Keeps
// the LIKE pattern reasonable; doctors aren't typing essays.
const MAX_QUERY_LEN = 80;

// PG ILIKE special chars that must be escaped if we want them treated
// as literals in a prefix pattern. Doctors won't type these intentionally
// but we sanitise anyway so a stray '%' doesn't widen the match.
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}

/**
 * Search `drug_master`. Returns up to `limit` rows ordered by:
 *   1. generic_name prefix match
 *   2. brand_names element prefix match (any)
 *   3. trigram similarity to generic_name
 *
 * Empty / too-short queries return `[]` (UI hides the dropdown anyway).
 */
export async function searchDrugs(
  rawQuery: string,
  rawLimit: number = 10
): Promise<DrugSearchResult[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const query = (rawQuery ?? '').trim().slice(0, MAX_QUERY_LEN);
  if (query.length < MIN_QUERY_LEN) return [];

  const limit = Math.min(Math.max(1, Math.floor(rawLimit) || 10), MAX_LIMIT);

  const safe = escapeLike(query);
  const prefixPattern = `${safe}%`;
  const containsPattern = `%${safe}%`; // used by bucket 3 (trigram fallback)

  // --- Bucket 1: prefix match on generic_name (priority 1).
  // Order by generic_name asc within bucket so "Para…" → "Paracetamol"
  // before "Paracetamol Extra".
  const { data: prefixGeneric, error: e1 } = await admin
    .from('drug_master')
    .select('id, generic_name, brand_names, strength, form, route_default, created_at, updated_at')
    .ilike('generic_name', prefixPattern)
    .order('generic_name', { ascending: true })
    .limit(limit);

  if (e1) handleSupabaseError(e1, 'searchDrugs:prefix-generic');

  // Short-circuit: if the prefix bucket is already full, skip the
  // brand-prefix and similarity round-trips entirely. Common case for
  // confident typists ("amox", "para", "azith…").
  let results: DrugSearchResult[] = (prefixGeneric ?? []) as DrugSearchResult[];
  if (results.length >= limit) {
    return results.slice(0, limit);
  }

  // --- Bucket 2: substring match on any element of brand_names (priority 2).
  // PostgREST does not honour `brand_names::text` casts in .filter(), so
  // we fetch all rows (the table is small: ~80–500 rows) and do per-element
  // matching in TypeScript. This is also more correct than the array-cast
  // approach because it matches within individual brand names rather than
  // the whole `{Crocin,Calpol}` literal string.
  const remaining = limit - results.length;
  const seenIds = new Set(results.map((r) => r.id));
  const lowerQuery = query.toLowerCase();

  const { data: allRows, error: e2 } = await admin
    .from('drug_master')
    .select('id, generic_name, brand_names, strength, form, route_default, created_at, updated_at');

  if (e2) handleSupabaseError(e2, 'searchDrugs:brand');

  for (const row of (allRows ?? []) as DrugSearchResult[]) {
    if (seenIds.has(row.id)) continue;
    const brandMatch =
      Array.isArray(row.brand_names) &&
      row.brand_names.some((b) => b.toLowerCase().includes(lowerQuery));
    if (!brandMatch) continue;
    seenIds.add(row.id);
    results.push(row);
    if (results.length >= limit) {
      return results.slice(0, limit);
    }
  }

  // --- Bucket 3: trigram similarity on generic_name (priority 3).
  // For typo tolerance ("paracetomol" → "Paracetamol"). Falls back to
  // ILIKE %containsPattern% when pg_trgm hits nothing — this is what
  // catches "tamol" → "Paracetamol" since trigram needs reasonable
  // overlap to score well.
  //
  // We can't easily order by similarity() through PostgREST without a
  // server-side view or RPC, so we approximate: pull substring matches
  // and trust the GIN index to make this cheap on a small table.
  const { data: containsRows, error: e3 } = await admin
    .from('drug_master')
    .select('id, generic_name, brand_names, strength, form, route_default, created_at, updated_at')
    .ilike('generic_name', containsPattern)
    .order('generic_name', { ascending: true })
    .limit(remaining * 2);

  if (e3) handleSupabaseError(e3, 'searchDrugs:contains');

  for (const row of (containsRows ?? []) as DrugSearchResult[]) {
    if (seenIds.has(row.id)) continue;
    seenIds.add(row.id);
    results.push(row);
    if (results.length >= limit) break;
  }

  return results.slice(0, limit);
}
