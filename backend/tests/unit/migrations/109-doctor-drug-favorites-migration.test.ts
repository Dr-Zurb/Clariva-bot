/**
 * Content-sanity test for migration 109 (doctor_drug_favorites).
 *
 * rx-polish-favorites batch · rxf-02
 *
 * No live-Supabase harness in this workspace — pins load-bearing clauses so an
 * accidental edit that drops the table, index, CHECK constraints, or RLS
 * policies fails in review. Constraint rejection and RLS isolation are verified
 * manually at smoke time (apply migration on local Supabase, insert bad rows,
 * cross-doctor SELECT).
 *
 * @see backend/migrations/109_doctor_drug_favorites.sql
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/109_doctor_drug_favorites.sql',
);

describe('109_doctor_drug_favorites.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('table doctor_drug_favorites', () => {
    it('creates the table with IF NOT EXISTS (idempotent re-run)', () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS doctor_drug_favorites/);
    });

    it('FKs doctor_id to auth.users(id) with ON DELETE CASCADE', () => {
      expect(sql).toMatch(
        /doctor_id\s+uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/,
      );
    });

    it('declares name with length CHECK between 1 and 60', () => {
      expect(sql).toMatch(
        /name\s+text NOT NULL CHECK \(length\(name\) BETWEEN 1 AND 60\)/,
      );
    });

    it('declares template as JSONB NOT NULL', () => {
      expect(sql).toMatch(/template\s+jsonb NOT NULL/);
    });

    it('does NOT enforce 30-max via CHECK (Postgres 0A000 forbids subqueries)', () => {
      expect(sql).not.toMatch(/CHECK[\s\S]*?COUNT\(\*\)/i);
      expect(sql).toMatch(/Max 30 enforced in app layer/i);
    });
  });

  describe('template shape CHECK constraint', () => {
    it('drops then adds the constraint (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS doctor_drug_favorites_template_shape_check/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT doctor_drug_favorites_template_shape_check CHECK/,
      );
    });

    it('requires template to be a JSON object', () => {
      expect(sql).toMatch(/jsonb_typeof\(template\) = 'object'/);
    });

    it('requires medicineName and dosage keys (MedicineRowValue minimum)', () => {
      expect(sql).toMatch(/template \? 'medicineName'/);
      expect(sql).toMatch(/template \? 'dosage'/);
    });
  });

  describe('name length CHECK (manual smoke: "" and 61-char inserts fail)', () => {
    it('documents the 1–60 char bound inline on the column', () => {
      expect(sql).toMatch(/length\(name\) BETWEEN 1 AND 60/);
    });
  });

  describe('indexes', () => {
    it('creates the doctor + created_at DESC index for list ordering', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS doctor_drug_favorites_doctor_idx\s+ON doctor_drug_favorites \(doctor_id, created_at DESC\)/,
      );
    });
  });

  describe('Row-Level Security', () => {
    it('enables RLS on the table', () => {
      expect(sql).toMatch(
        /ALTER TABLE doctor_drug_favorites ENABLE ROW LEVEL SECURITY/,
      );
    });

    it('declares owner SELECT policy gated on auth.uid()', () => {
      expect(sql).toMatch(/CREATE POLICY doctor_drug_favorites_owner_select/);
      expect(sql).toMatch(
        /FOR SELECT[\s\S]*?USING \(doctor_id = auth\.uid\(\)\)/,
      );
    });

    it('declares owner modify policy (FOR ALL) with USING and WITH CHECK', () => {
      expect(sql).toMatch(/CREATE POLICY doctor_drug_favorites_owner_modify/);
      expect(sql).toMatch(/FOR ALL[\s\S]*?USING \(doctor_id = auth\.uid\(\)\)/);
      expect(sql).toMatch(/WITH CHECK \(doctor_id = auth\.uid\(\)\)/);
    });

    it('drops policies before re-creating them (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP POLICY IF EXISTS doctor_drug_favorites_owner_select/,
      );
      expect(sql).toMatch(
        /DROP POLICY IF EXISTS doctor_drug_favorites_owner_modify/,
      );
    });
  });

  describe('comments and rollback', () => {
    it('comments the table with rxf-02 reference and app-layer 30-max note', () => {
      expect(sql).toMatch(/COMMENT ON TABLE doctor_drug_favorites IS/);
      expect(sql).toMatch(/rxf-02/);
      expect(sql).toMatch(/MedicineRowValue/);
    });

    it('documents rollback via DROP TABLE CASCADE', () => {
      expect(sql).toMatch(/DROP TABLE IF EXISTS doctor_drug_favorites CASCADE/);
    });
  });
});
