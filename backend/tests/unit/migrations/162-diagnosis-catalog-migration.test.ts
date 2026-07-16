/**
 * Content-sanity test for migration 162 (diagnosis_catalog — ICD-11 lookup).
 *
 * assessment-tab · asmt-06 (Wave 6)
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/162_diagnosis_catalog.sql',
);

describe('162_diagnosis_catalog.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('table diagnosis_catalog', () => {
    it('creates the table idempotently with code/title/synonyms columns', () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS diagnosis_catalog/);
      expect(sql).toMatch(/code\s+TEXT NOT NULL/);
      expect(sql).toMatch(/title\s+TEXT NOT NULL/);
      expect(sql).toMatch(/synonyms\s+TEXT\[\] NOT NULL DEFAULT '\{\}'/);
    });
  });

  describe('indexes', () => {
    it('enforces a unique (case-insensitive) index on code — the AI whitelist key', () => {
      expect(sql).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS idx_diagnosis_catalog_code_lower[\s\S]*lower\(code\)/,
      );
    });

    it('adds trigram + prefix + synonyms search indexes', () => {
      expect(sql).toMatch(/gin \(title gin_trgm_ops\)/);
      expect(sql).toMatch(/lower\(title\) text_pattern_ops/);
      expect(sql).toMatch(/gin \(synonyms\)/);
    });
  });

  describe('Row-Level Security', () => {
    it('enables RLS with a read-all policy (public, non-PHI code list)', () => {
      expect(sql).toMatch(
        /ALTER TABLE diagnosis_catalog ENABLE ROW LEVEL SECURITY/,
      );
      expect(sql).toMatch(/CREATE POLICY diagnosis_catalog_read_all/);
      expect(sql).toMatch(/FOR SELECT\s+USING \(true\)/);
    });

    it('does NOT touch prescriptions RLS or table (ASMT-D8)', () => {
      // A doc comment may reference `prescriptions`, but NO DDL may target it.
      expect(sql).not.toMatch(/ALTER TABLE\s+prescriptions/i);
      expect(sql).not.toMatch(/\bON\s+prescriptions\b/i);
    });

    it('grants no write policy — seeded by migration only', () => {
      expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE)/i);
    });
  });

  describe('PHI + provenance documentation', () => {
    it('documents the table as NON-PHI ICD-11 (MMS) reference data', () => {
      expect(sql).toMatch(/NON-?PHI/i);
      expect(sql).toMatch(/ICD-11/);
      expect(sql).toMatch(/MMS/);
      expect(sql).toMatch(/CC BY-ND/);
    });
  });

  describe('seed', () => {
    it('is idempotent (guarded on lower(code))', () => {
      expect(sql).toMatch(/INSERT INTO diagnosis_catalog/);
      expect(sql).toMatch(
        /WHERE NOT EXISTS \(\s*SELECT 1 FROM diagnosis_catalog d WHERE lower\(d\.code\) = lower\(v\.code\)/,
      );
    });

    it('seeds known ICD-11 codes with canonical WHO titles', () => {
      expect(sql).toMatch(/\('BA00', 'Essential hypertension'/);
      expect(sql).toMatch(/\('5A11', 'Type 2 diabetes mellitus'/);
      expect(sql).toMatch(/\('CA23', 'Asthma'/);
    });

    it('carries vernacular synonyms so patient phrasing resolves', () => {
      expect(sql).toMatch(/sugar/);
      expect(sql).toMatch(/high blood pressure/);
    });
  });

  describe('rollback documentation', () => {
    it('documents the drop-table rollback', () => {
      expect(sql).toMatch(/DROP TABLE IF EXISTS diagnosis_catalog CASCADE/);
    });
  });
});
