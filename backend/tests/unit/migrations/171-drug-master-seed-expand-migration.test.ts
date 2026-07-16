/**
 * Content-sanity test for migration 171 (drug_master seed expand).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/171_drug_master_seed_expand.sql',
);

describe('171_drug_master_seed_expand.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('inserts into drug_master with the canonical column set', () => {
    expect(sql).toMatch(
      /INSERT INTO drug_master \(generic_name, brand_names, strength, form, route_default\)/,
    );
  });

  it('is idempotent (guarded on lower(generic_name))', () => {
    expect(sql).toMatch(
      /WHERE NOT EXISTS \(\s*SELECT 1 FROM drug_master dm\s*WHERE lower\(dm\.generic_name\) = lower\(seed\.generic_name\)/,
    );
  });

  it('ships a large curated expand (≥400 VALUE rows)', () => {
    const rows = sql.match(/^\s+\('/gm) ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(400);
  });

  it('includes known high-volume Indian OPD drugs / brands', () => {
    expect(sql).toMatch(/'Aceclofenac'/);
    expect(sql).toMatch(/'Zerodol'/);
    expect(sql).toMatch(/'Telmisartan \+ Amlodipine'/);
    expect(sql).toMatch(/'Dapagliflozin'/);
    expect(sql).toMatch(/'Levetiracetam'/);
    expect(sql).toMatch(/'Tamsulosin'/);
    expect(sql).toMatch(/'Clobetasol'/);
    expect(sql).toMatch(/'Latanoprost'/);
    expect(sql).toMatch(/'Semaglutide'/);
  });

  it('does not rewrite schema or RLS', () => {
    expect(sql).not.toMatch(/CREATE TABLE/i);
    expect(sql).not.toMatch(/ALTER TABLE/i);
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });
});
