/**
 * Content-sanity test for migration 151 (prescriptions Vitals 2.0 extended vitals).
 *
 * objective-tab p2 · obj-05
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/151_prescriptions_vitals_2.sql',
);

describe('151_prescriptions_vitals_2.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('added columns (idempotent, nullable, canonical units)', () => {
    const columns: Array<[string, string]> = [
      ['vitals_rr', 'INTEGER'],
      ['vitals_pain_score', 'INTEGER'],
      ['vitals_glucose_mg_dl', 'NUMERIC\\(5,1\\)'],
      ['vitals_gcs_total', 'INTEGER'],
      ['vitals_bp_posture', 'TEXT'],
      ['vitals_bp_limb', 'TEXT'],
      ['vitals_head_circumference_cm', 'NUMERIC\\(4,1\\)'],
      ['vitals_muac_cm', 'NUMERIC\\(4,1\\)'],
      ['vitals_waist_cm', 'NUMERIC\\(5,1\\)'],
    ];

    it.each(columns)('adds %s as %s NULL via ADD COLUMN IF NOT EXISTS', (col, type) => {
      const re = new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\s+${type}\\s+NULL`);
      expect(sql).toMatch(re);
    });
  });

  describe('CHECK ranges (drop+add, NULL-tolerant)', () => {
    const ranges: Array<[string, string]> = [
      ['prescriptions_vitals_rr_chk', 'vitals_rr BETWEEN 0 AND 120'],
      ['prescriptions_vitals_pain_score_chk', 'vitals_pain_score BETWEEN 0 AND 10'],
      ['prescriptions_vitals_glucose_mg_dl_chk', 'vitals_glucose_mg_dl BETWEEN 10 AND 1500'],
      ['prescriptions_vitals_gcs_total_chk', 'vitals_gcs_total BETWEEN 3 AND 15'],
      ['prescriptions_vitals_head_circumference_cm_chk', 'vitals_head_circumference_cm BETWEEN 10 AND 80'],
      ['prescriptions_vitals_muac_cm_chk', 'vitals_muac_cm BETWEEN 5 AND 60'],
      ['prescriptions_vitals_waist_cm_chk', 'vitals_waist_cm BETWEEN 20 AND 300'],
    ];

    it.each(ranges)('drops then adds %s with the documented bounds', (name, predicate) => {
      expect(sql).toMatch(new RegExp(`DROP CONSTRAINT IF EXISTS ${name}`));
      expect(sql).toMatch(new RegExp(`ADD CONSTRAINT ${name}`));
      expect(sql).toMatch(new RegExp(predicate.replace(/[()]/g, '\\$&')));
    });

    it('ORs every numeric CHECK with IS NULL so existing rows pass', () => {
      expect(sql).toMatch(/vitals_rr IS NULL OR vitals_rr BETWEEN/);
      expect(sql).toMatch(/vitals_waist_cm IS NULL OR vitals_waist_cm BETWEEN/);
    });
  });

  describe('posture/limb allowed-value sets', () => {
    it('constrains BP posture to sitting|standing|supine', () => {
      expect(sql).toMatch(/prescriptions_vitals_bp_posture_chk/);
      expect(sql).toMatch(/vitals_bp_posture IN \('sitting', 'standing', 'supine'\)/);
    });

    it('constrains BP limb to the four allowed limbs', () => {
      expect(sql).toMatch(/prescriptions_vitals_bp_limb_chk/);
      expect(sql).toMatch(
        /vitals_bp_limb IN \('left_arm', 'right_arm', 'left_leg', 'right_leg'\)/,
      );
    });
  });

  describe('PHI column comments', () => {
    it('documents PHI on each new column with canonical-unit notes', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN prescriptions\.vitals_glucose_mg_dl IS\s+'PHI[^']*mg\/dL/);
      expect(sql).toMatch(/COMMENT ON COLUMN prescriptions\.vitals_gcs_total IS\s+'PHI/);
      expect(sql).toMatch(/COMMENT ON COLUMN prescriptions\.vitals_waist_cm IS\s+'PHI/);
    });
  });

  describe('Row-Level Security', () => {
    it('does not enable RLS or add new policies (inherits migration 026)', () => {
      expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
      expect(sql).not.toMatch(/CREATE POLICY/i);
      expect(sql).toMatch(/RLS unchanged/i);
    });
  });

  describe('additive-only (P2-D6) + rollback documentation', () => {
    it('does not drop or alter the shipped vitals columns', () => {
      expect(sql).not.toMatch(/DROP COLUMN IF EXISTS vitals_bp_systolic/);
      expect(sql).not.toMatch(/DROP COLUMN IF EXISTS vitals_ht_cm/);
    });

    it('documents the drop-column rollback for the new columns', () => {
      expect(sql).toMatch(/DROP COLUMN IF EXISTS vitals_rr/);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS vitals_waist_cm/);
    });
  });
});
