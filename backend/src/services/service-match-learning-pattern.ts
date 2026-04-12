/**
 * learn-03: Deterministic pattern key for structured service-match learning.
 * Formula is stable across ingest (learn-02) and shadow (learn-03).
 *
 * Doc: docs/Reference/SERVICE_MATCH_PATTERN_KEY.md
 */

import { createHash } from 'crypto';

export const SERVICE_MATCH_PATTERN_KEY_VERSION = 1 as const;

export type PatternKeyInputs = {
  /** Sorted internally — pass raw codes from matcher / review row. */
  matchReasonCodes: string[];
  /** Catalog candidate service_key values only; sorted internally. */
  candidateServiceKeys: string[];
  proposedCatalogServiceKey: string;
};

export function normalizeMatchReasonCodes(codes: unknown): string[] {
  if (!Array.isArray(codes)) return [];
  return [...new Set(codes.map((c) => String(c).trim()).filter(Boolean))].sort();
}

export function extractCandidateServiceKeysFromLabels(labels: unknown): string[] {
  if (!Array.isArray(labels)) return [];
  const keys: string[] = [];
  for (const item of labels) {
    if (item && typeof item === 'object' && 'service_key' in item) {
      const sk = (item as { service_key?: string }).service_key;
      if (typeof sk === 'string' && sk.trim()) keys.push(sk.trim().toLowerCase());
    }
  }
  return [...new Set(keys)].sort();
}

/**
 * Canonical JSON (sorted keys in payload) → sha256 hex.
 * Same inputs always yield the same pattern_key.
 */
export function buildPatternKeyFromInputs(inputs: PatternKeyInputs): {
  canonical: string;
  patternKey: string;
} {
  const reason_codes = [...inputs.matchReasonCodes].map((c) => String(c).trim()).filter(Boolean).sort();
  const candidate_service_keys = [...inputs.candidateServiceKeys]
    .map((k) => String(k).trim().toLowerCase())
    .filter(Boolean)
    .sort();
  const proposed_catalog_service_key = inputs.proposedCatalogServiceKey.trim().toLowerCase();
  const canonical = JSON.stringify({
    v: SERVICE_MATCH_PATTERN_KEY_VERSION,
    candidate_service_keys,
    proposed_catalog_service_key,
    reason_codes,
  });
  const patternKey = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return { canonical, patternKey };
}
