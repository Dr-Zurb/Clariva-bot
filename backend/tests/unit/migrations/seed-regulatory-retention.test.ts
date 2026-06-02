/**
 * Migration 058 — regulatory_retention_policy seed (Plan 02 · Task 34).
 *
 * No DB harness exists in this workspace, so this test verifies the seed
 * migration two ways:
 *
 *   1. **Structure mirror** — parses the INSERT statement and asserts that
 *      the four expected seed rows land with the expected shape:
 *        - ('IN', '*')          with retention_years = 3
 *        - ('IN', 'pediatrics') with retention_until_age = 21
 *        - ('IN', 'gynecology') with retention_years = 7
 *        - ('*', '*')           with retention_years = 7
 *      Every row MUST set patient_self_serve_days = 90 (Decision 4 LOCKED).
 *
 *   2. **Idempotency guard** — asserts the INSERT terminates with
 *      `ON CONFLICT (country_code, specialty, effective_from) DO NOTHING`.
 *      A seed migration that hard-fails on re-run would block re-deploys.
 *
 * The SQL is the source of truth; this test exists so a future edit of
 * the seed values (retention_years change, new specialty added) is
 * caught here and surfaced in PR review rather than silently landing.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SEED_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'migrations',
  '058_regulatory_retention_policy_seed.sql',
);

const sqlRaw = readFileSync(SEED_PATH, 'utf8');

/**
 * Strip SQL line comments (`-- …` through end-of-line) before parsing,
 * so words like "values" that appear in prose comments do not trip up
 * the tuple extractor. Preserves newlines so line numbers in error
 * output stay roughly aligned.
 */
const sql = sqlRaw.replace(/--[^\n]*/g, '');

// ---------------------------------------------------------------------------
// 1. Idempotency guard
// ---------------------------------------------------------------------------

describe('058_regulatory_retention_policy_seed — idempotency', () => {
  it('terminates the INSERT with ON CONFLICT DO NOTHING', () => {
    // Normalise whitespace to make the regex robust to line-break choices.
    const normalised = sql.replace(/\s+/g, ' ');
    expect(normalised).toMatch(
      /ON CONFLICT \(country_code, specialty, effective_from\) DO NOTHING/i,
    );
  });

  it('inserts into regulatory_retention_policy exactly once (no duplicate INSERT blocks)', () => {
    const inserts = sql.match(/INSERT\s+INTO\s+regulatory_retention_policy/gi) ?? [];
    expect(inserts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Structure mirror — parse the VALUES block
// ---------------------------------------------------------------------------

interface SeedRow {
  country: string;
  specialty: string;
  retentionYears: number;
  retentionUntilAge: number | null;
  patientSelfServeDays: number;
  source: string;
  effectiveFrom: string;
}

/**
 * Extract the tuple list between `VALUES` and `ON CONFLICT`. Parses each
 * top-level tuple (handling nested string literals that may contain
 * commas). Not a full SQL parser — intentionally tightly coupled to the
 * seed shape in 058.
 */
function parseSeedRows(sql: string): SeedRow[] {
  const start = sql.search(/VALUES\s*/i);
  const end = sql.search(/ON\s+CONFLICT/i);
  if (start < 0 || end < 0 || end <= start) return [];
  const body = sql.slice(start, end).replace(/^VALUES\s*/i, '').trim();

  const tuples: string[] = [];
  let depth = 0;
  let current = '';
  let inString = false;
  for (const ch of body) {
    if (ch === "'" ) {
      inString = !inString;
      current += ch;
      continue;
    }
    if (!inString) {
      if (ch === '(') {
        if (depth === 0) {
          current = '';
        } else {
          current += ch;
        }
        depth += 1;
        continue;
      }
      if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          tuples.push(current);
          current = '';
          continue;
        }
        current += ch;
        continue;
      }
    }
    if (depth > 0) current += ch;
  }

  return tuples.map((t) => parseTuple(t));
}

function parseTuple(tuple: string): SeedRow {
  // Split on commas that are outside string literals.
  const parts: string[] = [];
  let inString = false;
  let current = '';
  for (const ch of tuple) {
    if (ch === "'") inString = !inString;
    if (ch === ',' && !inString) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());

  const stripQuotes = (s: string) => s.replace(/^'|'$/g, '');
  const parseNumOrNull = (s: string): number | null =>
    s.toUpperCase() === 'NULL' ? null : parseInt(s, 10);

  // Column order per 058 is fixed:
  //   country_code, specialty, retention_years, retention_until_age,
  //   patient_self_serve_days, source, effective_from
  return {
    country: stripQuotes(parts[0] ?? ''),
    specialty: stripQuotes(parts[1] ?? ''),
    retentionYears: parseInt(parts[2] ?? '0', 10),
    retentionUntilAge: parseNumOrNull(parts[3] ?? 'NULL'),
    patientSelfServeDays: parseInt(parts[4] ?? '0', 10),
    source: stripQuotes(parts[5] ?? ''),
    effectiveFrom: stripQuotes(parts[6] ?? ''),
  };
}

describe('058_regulatory_retention_policy_seed — structure', () => {
  const rows = parseSeedRows(sql);

  it('inserts exactly four seed rows', () => {
    expect(rows).toHaveLength(4);
  });

  it('every seed row has patient_self_serve_days = 90 (Decision 4 LOCKED)', () => {
    for (const row of rows) {
      expect(row.patientSelfServeDays).toBe(90);
    }
  });

  it('every seed row carries a non-empty source citation', () => {
    for (const row of rows) {
      expect(row.source.length).toBeGreaterThan(0);
    }
  });

  it('India general-medicine row is retention_years = 3 with no age override', () => {
    const row = rows.find((r) => r.country === 'IN' && r.specialty === '*');
    expect(row).toBeDefined();
    expect(row!.retentionYears).toBe(3);
    expect(row!.retentionUntilAge).toBeNull();
  });

  it('India pediatrics row carries retention_until_age = 21', () => {
    const row = rows.find(
      (r) => r.country === 'IN' && r.specialty === 'pediatrics',
    );
    expect(row).toBeDefined();
    expect(row!.retentionUntilAge).toBe(21);
  });

  it('India gynecology row is retention_years = 7', () => {
    const row = rows.find(
      (r) => r.country === 'IN' && r.specialty === 'gynecology',
    );
    expect(row).toBeDefined();
    expect(row!.retentionYears).toBe(7);
  });

  it('international fallback row is ("*", "*") with retention_years = 7', () => {
    const row = rows.find((r) => r.country === '*' && r.specialty === '*');
    expect(row).toBeDefined();
    expect(row!.retentionYears).toBe(7);
  });
});
