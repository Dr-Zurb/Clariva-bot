/**
 * Diagnosis Catalog Service (assessment-tab · asmt-06)
 *
 * Read-only search over `diagnosis_catalog` (ICD-11 MMS lookup, NON-PHI),
 * ranked for doctor + patient phrasing exactly like the complaint autocomplete
 * — doctors type "sugar", "BP high", "loose motion", or a misspelling, not the
 * canonical WHO title. We reuse the SAME normalization + trigram-similarity
 * primitives as `complaint-master-service` (single source for the tokeniser)
 * and rank in TypeScript over the small lookup, combining:
 *
 *   1. exact normalized equality                       (score 1.0)
 *   2. normalized prefix match                          (0.9)
 *   3. every query token matches a candidate token       (0.8 exact / 0.6 fuzzy)
 *
 * Candidates are the canonical `title` plus every `synonym`. Matching a synonym
 * still returns the canonical row (title + code), so the card captures the ICD
 * code. A doctor may also type the code itself ("BA00") — a code prefix match
 * is scored high so the row surfaces.
 *
 * At ~18k rows (full ICD-11 MMS import, migration 163) we can no longer read
 * the whole table on every keystroke (PostgREST caps a read at 1000 rows). The
 * `search_diagnosis_catalog` SQL function (migration 164) narrows the table to
 * a small ranked CANDIDATE set using the trigram / prefix / synonym indexes;
 * we then refine the ranking here in TypeScript over that candidate set.
 */

import { getSupabaseAdminClient } from '../config/database';
import { handleSupabaseError } from '../utils/db-helpers';
import { InternalError } from '../utils/errors';
import {
  normalizeString,
  trigramSimilarity,
} from './complaint-master-service';
import type { DiagnosisCatalogSearchResult } from '../types/diagnosis-catalog';

const MAX_LIMIT = 25;
const MIN_QUERY_LEN = 2;
const MAX_QUERY_LEN = 80;

/** A query token "matches" a candidate token at/above this trigram similarity. */
const TOKEN_FUZZY_THRESHOLD = 0.55;

/** Minimum overall score for a diagnosis to be surfaced. */
const MATCH_THRESHOLD = 0.5;

/** Score awarded when the query is a prefix of the ICD code (e.g. "ba" → BA00). */
const CODE_PREFIX_SCORE = 0.85;

/**
 * How many DB-side candidates to pull before the TS re-ranking. Wide enough
 * that the best matches are never cut off for a normal (>=2 char) query, small
 * enough to stay cheap over the full MMS catalog.
 */
const CANDIDATE_LIMIT = 200;

/** Does a query token find a home in the candidate tokens (exact, prefix, or fuzzy)? */
function tokenMatches(
  queryToken: string,
  candTokens: string[],
): { matched: boolean; exact: boolean } {
  let fuzzy = false;
  for (const candToken of candTokens) {
    if (candToken === queryToken) return { matched: true, exact: true };
    if (
      queryToken.length >= 3 &&
      (candToken.startsWith(queryToken) || queryToken.startsWith(candToken))
    ) {
      fuzzy = true;
    } else if (trigramSimilarity(queryToken, candToken) >= TOKEN_FUZZY_THRESHOLD) {
      fuzzy = true;
    }
  }
  return { matched: fuzzy, exact: false };
}

/** Best score across the ICD code, canonical title, and every synonym. */
function scoreDiagnosis(
  row: DiagnosisCatalogSearchResult,
  rawQuery: string,
  queryNorm: string,
  queryTokens: string[],
): number {
  // Direct ICD-code lookup — doctor typed (part of) a code like "BA00".
  const codeLower = row.code.toLowerCase();
  const rawLower = rawQuery.trim().toLowerCase();
  if (rawLower.length >= 2 && codeLower.startsWith(rawLower)) {
    return codeLower === rawLower ? 1 : CODE_PREFIX_SCORE;
  }

  const candidates = [row.title, ...(Array.isArray(row.synonyms) ? row.synonyms : [])];
  let best = 0;

  for (const candidate of candidates) {
    const candNorm = normalizeString(candidate);
    if (!candNorm) continue;
    const candTokens = candNorm.split(' ');

    let score = 0;
    if (candNorm === queryNorm) {
      score = 1;
    } else if (candNorm.startsWith(queryNorm)) {
      score = 0.9;
    } else if (queryTokens.length > 0) {
      // Every query token must find a home in this candidate (word-order free).
      let allMatched = true;
      let allExact = true;
      for (const token of queryTokens) {
        const { matched, exact } = tokenMatches(token, candTokens);
        if (!matched) {
          allMatched = false;
          break;
        }
        if (!exact) allExact = false;
      }
      if (allMatched) score = allExact ? 0.8 : 0.6;
    }

    if (score > best) best = score;
    if (best >= 1) break;
  }

  return best;
}

export async function searchDiagnosisCatalog(
  rawQuery: string,
  rawLimit: number = 10,
): Promise<DiagnosisCatalogSearchResult[]> {
  const query = (rawQuery ?? '').trim().slice(0, MAX_QUERY_LEN);
  if (query.length < MIN_QUERY_LEN) return [];

  const queryNorm = normalizeString(query);
  const queryTokens = queryNorm ? queryNorm.split(' ') : [];

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const limit = Math.min(Math.max(1, Math.floor(rawLimit) || 10), MAX_LIMIT);

  const { data, error } = await admin.rpc('search_diagnosis_catalog', {
    search_query: query,
    candidate_limit: CANDIDATE_LIMIT,
  });

  if (error) handleSupabaseError(error, 'searchDiagnosisCatalog');

  const rows = (data ?? []) as DiagnosisCatalogSearchResult[];

  return rows
    .map((row) => ({ row, score: scoreDiagnosis(row, query, queryNorm, queryTokens) }))
    .filter((entry) => entry.score >= MATCH_THRESHOLD)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-break: shorter canonical title first (more "central"), then alpha.
      const lengthDelta = a.row.title.length - b.row.title.length;
      if (lengthDelta !== 0) return lengthDelta;
      return a.row.title.localeCompare(b.row.title);
    })
    .slice(0, limit)
    .map((entry) => entry.row);
}
