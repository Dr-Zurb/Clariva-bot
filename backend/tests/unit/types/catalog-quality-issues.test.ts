/**
 * Plan 02 / Task 07 — internal consistency tests for
 * `backend/src/types/catalog-quality-issues.ts`.
 *
 * These guard invariants the rest of the codebase relies on:
 *
 *   1. DETERMINISTIC_ISSUE_TYPES and LLM_ISSUE_TYPES partition QUALITY_ISSUE_TYPES
 *      (no overlap, union covers every declared type). If a new type is added
 *      without assigning it to either bucket, this test flips red and points at
 *      the source of the drift.
 *   2. DEFAULT_SEVERITIES, ISSUE_TYPE_IMPACT_WEIGHT, and ACTION_LABELS have an
 *      entry for every declared type/action respectively.
 *   3. sortQualityIssues orders by severity (error > warning > suggestion) first,
 *      then by type-impact weight, stable on service_key.
 *   4. withAutoFixFlag correctly toggles autoFixAvailable based on suggestions.
 *   5. qualityIssueSchema accepts the shape we return on the wire and rejects
 *      malformed inputs that would break the UI.
 *
 * Frontend parity: once `frontend/lib/catalog-quality-issues.ts` lands, this
 * file will also import + diff the frontend enums to catch drift at CI time.
 */

import { describe, expect, it } from '@jest/globals';

import {
  ACTION_LABELS,
  DEFAULT_SEVERITIES,
  DETERMINISTIC_ISSUE_TYPES,
  ISSUE_TYPE_IMPACT_WEIGHT,
  LLM_ISSUE_TYPES,
  QUALITY_ISSUE_ACTIONS,
  QUALITY_ISSUE_SEVERITIES,
  QUALITY_ISSUE_TYPES,
  qualityIssueSchema,
  resolveActionLabel,
  sortQualityIssues,
  withAutoFixFlag,
  type QualityIssue,
} from '../../../src/types/catalog-quality-issues';

describe('catalog-quality-issues — enum partitioning', () => {
  it('DETERMINISTIC_ISSUE_TYPES and LLM_ISSUE_TYPES do not overlap', () => {
    const det = new Set(DETERMINISTIC_ISSUE_TYPES);
    const overlap = LLM_ISSUE_TYPES.filter((t) => det.has(t));
    expect(overlap).toEqual([]);
  });

  it('DETERMINISTIC_ISSUE_TYPES ∪ LLM_ISSUE_TYPES covers every declared QUALITY_ISSUE_TYPES', () => {
    const covered = new Set([...DETERMINISTIC_ISSUE_TYPES, ...LLM_ISSUE_TYPES]);
    const missing = QUALITY_ISSUE_TYPES.filter((t) => !covered.has(t));
    expect(missing).toEqual([]);
  });

  it('every declared type has a default severity and impact weight', () => {
    for (const t of QUALITY_ISSUE_TYPES) {
      expect(DEFAULT_SEVERITIES[t]).toBeDefined();
      expect(QUALITY_ISSUE_SEVERITIES).toContain(DEFAULT_SEVERITIES[t]);
      expect(typeof ISSUE_TYPE_IMPACT_WEIGHT[t]).toBe('number');
    }
  });

  it('every declared action has a default label', () => {
    for (const a of QUALITY_ISSUE_ACTIONS) {
      expect(typeof ACTION_LABELS[a]).toBe('string');
      expect(ACTION_LABELS[a].length).toBeGreaterThan(0);
    }
  });
});

describe('catalog-quality-issues — sortQualityIssues', () => {
  const mk = (type: QualityIssue['type'], severity: QualityIssue['severity'], svc?: string): QualityIssue =>
    withAutoFixFlag({
      type,
      severity,
      services: svc ? [svc] : [],
      message: `msg ${type}`,
    });

  it('orders error → warning → suggestion regardless of input order', () => {
    const out = sortQualityIssues([
      mk('gap', 'suggestion'),
      mk('strict_thin_keywords', 'warning'),
      mk('missing_catchall', 'error'),
    ]);
    expect(out.map((i) => i.severity)).toEqual(['error', 'warning', 'suggestion']);
  });

  it('within the same severity, sorts by ISSUE_TYPE_IMPACT_WEIGHT ascending', () => {
    // Both are 'warning' severity per DEFAULT_SEVERITIES; impact: contradiction=2 < pricing_anomaly=3 < overlap=4.
    const out = sortQualityIssues([
      mk('overlap', 'warning'),
      mk('contradiction', 'warning'),
      mk('pricing_anomaly', 'warning'),
    ]);
    expect(out.map((i) => i.type)).toEqual(['contradiction', 'pricing_anomaly', 'overlap']);
  });

  it('breaks final ties by first affected service_key for stable UI output', () => {
    const out = sortQualityIssues([
      mk('overlap', 'warning', 'zeta'),
      mk('overlap', 'warning', 'alpha'),
      mk('overlap', 'warning', 'mu'),
    ]);
    expect(out.map((i) => i.services[0])).toEqual(['alpha', 'mu', 'zeta']);
  });

  it('is pure (does not mutate the input array)', () => {
    const input = [mk('gap', 'suggestion'), mk('missing_catchall', 'error')];
    const snapshot = input.map((i) => i.type);
    sortQualityIssues(input);
    expect(input.map((i) => i.type)).toEqual(snapshot);
  });
});

describe('catalog-quality-issues — withAutoFixFlag', () => {
  it('sets autoFixAvailable=true when suggestions is non-empty', () => {
    const issue = withAutoFixFlag({
      type: 'strict_empty_hints',
      severity: 'error',
      services: ['s1'],
      message: 'needs hints',
      suggestions: [{ action: 'fill_with_ai' }],
    });
    expect(issue.autoFixAvailable).toBe(true);
  });

  it('sets autoFixAvailable=false when suggestions is missing or empty', () => {
    const empty = withAutoFixFlag({
      type: 'empty_hints',
      severity: 'suggestion',
      services: ['s1'],
      message: 'no hints',
    });
    expect(empty.autoFixAvailable).toBe(false);
    const emptyArr = withAutoFixFlag({
      type: 'empty_hints',
      severity: 'suggestion',
      services: ['s1'],
      message: 'no hints',
      suggestions: [],
    });
    expect(emptyArr.autoFixAvailable).toBe(false);
  });
});

describe('catalog-quality-issues — resolveActionLabel', () => {
  it('prefers per-issue override label when provided', () => {
    expect(resolveActionLabel({ action: 'fill_with_ai', label: 'Custom copy' })).toBe('Custom copy');
  });
  it('falls back to ACTION_LABELS default when no override', () => {
    expect(resolveActionLabel({ action: 'switch_to_strict' })).toBe(ACTION_LABELS.switch_to_strict);
  });
});

describe('catalog-quality-issues — qualityIssueSchema validation', () => {
  it('accepts a minimal well-formed issue', () => {
    const ok = qualityIssueSchema.safeParse({
      type: 'overlap',
      severity: 'warning',
      services: ['a', 'b'],
      message: 'keywords overlap',
      autoFixAvailable: false,
    });
    expect(ok.success).toBe(true);
  });

  it('rejects unknown types', () => {
    const res = qualityIssueSchema.safeParse({
      type: 'made_up',
      severity: 'warning',
      services: [],
      message: 'x',
      autoFixAvailable: false,
    });
    expect(res.success).toBe(false);
  });

  it('rejects empty message strings', () => {
    const res = qualityIssueSchema.safeParse({
      type: 'overlap',
      severity: 'warning',
      services: ['a'],
      message: '',
      autoFixAvailable: false,
    });
    expect(res.success).toBe(false);
  });

  it('accepts a gap issue with a suggestedCard', () => {
    const ok = qualityIssueSchema.safeParse({
      type: 'gap',
      severity: 'suggestion',
      services: [],
      message: 'Missing thyroid follow-up',
      suggestedCard: {
        service_key: 'thyroid_followup',
        label: 'Thyroid follow-up',
        scope_mode: 'strict',
      },
      suggestions: [{ action: 'add_card' }],
      autoFixAvailable: true,
    });
    expect(ok.success).toBe(true);
  });

  it('rejects unknown top-level fields (strict mode)', () => {
    const res = qualityIssueSchema.safeParse({
      type: 'overlap',
      severity: 'warning',
      services: [],
      message: 'x',
      autoFixAvailable: false,
      legacy_field: 'nope',
    });
    expect(res.success).toBe(false);
  });
});
