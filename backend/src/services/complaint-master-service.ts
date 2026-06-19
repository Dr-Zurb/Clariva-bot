/**
 * Complaint Master Service (subjective-tab · subj-06)
 *
 * Read-only search over `complaint_master`, ranked for PATIENT phrasing.
 *
 * Doctors and patients rarely type the canonical label verbatim — they say
 * "pain in chest", "chest paining", "loose motion", "headeche". A plain
 * prefix/substring ILIKE misses all of these and the complaint falls through
 * to a free-text "custom" entry. So we rank entirely in TypeScript over the
 * full (tiny, ~180-row) lookup, combining:
 *
 *   1. exact normalized equality                       (score 1.0)
 *   2. normalized prefix match                          (0.9)
 *   3. every query token matches a candidate token       (0.8 exact / 0.6 fuzzy)
 *      — word-order independent and typo tolerant:
 *        "pain in chest"  → Chest pain   (both tokens present)
 *        "chst pain"      → Chest pain   (one token fuzzy)
 *        "headeche"       → Headache     (single token fuzzy)
 *
 * Matching is per-token rather than whole-string, so "pain in chest" does NOT
 * surface "Back pain" — every query token ("pain", "chest") must find a home
 * in the candidate, and "chest" has none in "Back pain".
 *
 * Normalization lowercases, strips stopwords ("in", "of", "my", …), applies
 * light stemming (paining→pain, stools→stool) and tokenizes. The SAME
 * normalization runs on the query and on every candidate (name + synonyms),
 * so consistency matters more than linguistic correctness. Matching against a
 * synonym still returns the canonical row, so the doctor picks the patient
 * label and the card captures its `category`.
 */

import { getSupabaseAdminClient } from '../config/database';
import { handleSupabaseError } from '../utils/db-helpers';
import { InternalError } from '../utils/errors';
import type { ComplaintSearchResult } from '../types/complaint-master';

const MAX_LIMIT = 25;
const MIN_QUERY_LEN = 2;
const MAX_QUERY_LEN = 80;

/** A query token "matches" a candidate token at/above this trigram similarity. */
const TOKEN_FUZZY_THRESHOLD = 0.55;

/** Minimum overall score for a complaint to be surfaced. */
const MATCH_THRESHOLD = 0.5;

/** Words that carry no clinical signal — dropped before token matching. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'my', 'of', 'in', 'on', 'at', 'to', 'and', 'with', '&',
  'i', 'is', 'am', 'are', 'have', 'having', 'has', 'feel', 'feeling', 'felt',
  'get', 'getting', 'got', 'since', 'for', 'from', 'it', 'its', 'some',
  'little', 'bit', 'there', 'been',
]);

/** Light, consistent stemmer — applied identically to query and candidates. */
export function normalizeToken(token: string): string {
  let t = token.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (t.length > 4 && t.endsWith('ing')) {
    t = t.slice(0, -3); // paining→pain, swelling→swell, coughing→cough
  } else if (t.length > 3 && t.endsWith('s')) {
    t = t.slice(0, -1); // stools→stool, motions→motion, cramps→cramp
  }
  return t;
}

/** Split into significant, stemmed tokens (stopwords + sub-2-char dropped). */
export function tokenize(input: string): string[] {
  return (input ?? '')
    .toLowerCase()
    .split(/[^a-z0-9&]+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w))
    .map(normalizeToken)
    .filter((w) => w.length >= 2);
}

/** Canonical normalized form: stemmed tokens joined by single spaces. */
export function normalizeString(input: string): string {
  return tokenize(input).join(' ');
}

function trigrams(value: string): Set<string> {
  const grams = new Set<string>();
  const padded = `  ${value} `;
  for (let i = 0; i < padded.length - 2; i += 1) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/** Dice-coefficient trigram similarity in [0, 1]. */
export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ga = trigrams(a);
  const gb = trigrams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let intersection = 0;
  for (const gram of ga) {
    if (gb.has(gram)) intersection += 1;
  }
  return (2 * intersection) / (ga.size + gb.size);
}

/** Does a query token find a home in the candidate tokens (exact, prefix, or fuzzy)? */
function tokenMatches(queryToken: string, candTokens: string[]): { matched: boolean; exact: boolean } {
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

/** Best score across the canonical name and every synonym of a complaint. */
function scoreComplaint(
  row: ComplaintSearchResult,
  queryNorm: string,
  queryTokens: string[],
): number {
  const candidates = [row.name, ...(Array.isArray(row.synonyms) ? row.synonyms : [])];
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

export async function searchComplaints(
  rawQuery: string,
  rawLimit: number = 10,
): Promise<ComplaintSearchResult[]> {
  const query = (rawQuery ?? '').trim().slice(0, MAX_QUERY_LEN);
  if (query.length < MIN_QUERY_LEN) return [];

  const queryNorm = normalizeString(query);
  // All-stopword / punctuation-only queries normalize to empty — nothing to rank.
  if (!queryNorm) return [];
  const queryTokens = queryNorm.split(' ');

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const limit = Math.min(Math.max(1, Math.floor(rawLimit) || 10), MAX_LIMIT);

  const { data, error } = await admin
    .from('complaint_master')
    .select('id, name, synonyms, category, created_at, updated_at');

  if (error) handleSupabaseError(error, 'searchComplaints');

  const rows = (data ?? []) as ComplaintSearchResult[];

  return rows
    .map((row) => ({ row, score: scoreComplaint(row, queryNorm, queryTokens) }))
    .filter((entry) => entry.score >= MATCH_THRESHOLD)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-break: shorter canonical name first (more "central"), then alpha.
      const lengthDelta = a.row.name.length - b.row.name.length;
      if (lengthDelta !== 0) return lengthDelta;
      return a.row.name.localeCompare(b.row.name);
    })
    .slice(0, limit)
    .map((entry) => entry.row);
}
