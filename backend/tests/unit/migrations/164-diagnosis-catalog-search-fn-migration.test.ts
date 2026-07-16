/**
 * Content-sanity test for migration 164 (diagnosis_catalog search function).
 *
 * assessment-tab · asmt-06 (Wave 6).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/164_diagnosis_catalog_search_fn.sql',
);

describe('164_diagnosis_catalog_search_fn.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('search function', () => {
    it('creates search_diagnosis_catalog returning catalog rows', () => {
      expect(sql).toMatch(
        /CREATE OR REPLACE FUNCTION search_diagnosis_catalog\(/,
      );
      expect(sql).toMatch(/RETURNS SETOF diagnosis_catalog/);
    });

    it('is STABLE, SECURITY INVOKER, with a pinned search_path', () => {
      expect(sql).toMatch(/\bSTABLE\b/);
      expect(sql).toMatch(/SECURITY INVOKER/);
      expect(sql).toMatch(/SET search_path = public/);
    });

    it('ranks code/title/synonym matches (trigram + prefix)', () => {
      expect(sql).toMatch(/lower\(d\.code\) LIKE/);
      expect(sql).toMatch(/d\.title ILIKE/);
      expect(sql).toMatch(/d\.title % p\.raw/);
      expect(sql).toMatch(/unnest\(d\.synonyms\)/);
      expect(sql).toMatch(/similarity\(/);
    });
  });

  describe('access + indexes', () => {
    it('grants execute to the app roles (non-PHI public lookup)', () => {
      expect(sql).toMatch(
        /GRANT EXECUTE ON FUNCTION search_diagnosis_catalog\(text, integer\)\s*\n?\s*TO anon, authenticated, service_role/,
      );
    });

    it('adds a code prefix index for LIKE probes', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_diagnosis_catalog_code_lower_pattern[\s\S]*text_pattern_ops/,
      );
    });
  });

  describe('idempotency + rollback + PHI discipline', () => {
    it('is idempotent (CREATE OR REPLACE / IF NOT EXISTS)', () => {
      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION/);
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS/);
    });

    it('documents a drop-function rollback', () => {
      expect(sql).toMatch(/DROP FUNCTION IF EXISTS search_diagnosis_catalog/);
    });

    it('does NOT touch prescriptions RLS or table', () => {
      expect(sql).not.toMatch(/ALTER TABLE\s+prescriptions/i);
      expect(sql).not.toMatch(/\bON\s+prescriptions\b/i);
    });
  });
});
