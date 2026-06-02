/**
 * Content-sanity test for migration 108 (doctor_drug_usage).
 *
 * rx-polish-favorites batch · rxf-01
 *
 * No live-Supabase harness in this workspace — pins load-bearing clauses so an
 * accidental edit that drops the PK, CHECK, top-N index, RLS guards, or
 * idempotent re-run wrappers fails in review. Live behaviour (PK conflict,
 * CHECK violation, cross-doctor RLS isolation, rollback) is verified manually
 * on apply against local Supabase; see task-rxf-01 smoke steps.
 *
 * @see backend/migrations/108_doctor_drug_usage.sql
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/108_doctor_drug_usage.sql',
);

describe('108_doctor_drug_usage.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('table doctor_drug_usage', () => {
    it('creates the table with IF NOT EXISTS (idempotent re-run)', () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS doctor_drug_usage/);
    });

    it('FKs doctor_id to auth.users(id) with ON DELETE CASCADE', () => {
      expect(sql).toMatch(
        /doctor_id\s+UUID NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/,
      );
    });

    it('FKs drug_master_id to drug_master(id) with ON DELETE CASCADE', () => {
      expect(sql).toMatch(
        /drug_master_id\s+UUID NOT NULL REFERENCES drug_master\(id\) ON DELETE CASCADE/,
      );
    });

    it('declares composite PRIMARY KEY (doctor_id, drug_master_id)', () => {
      expect(sql).toMatch(/PRIMARY KEY \(doctor_id, drug_master_id\)/);
    });

    it('defaults usage_count to 0 and enforces usage_count >= 0 CHECK', () => {
      expect(sql).toMatch(/usage_count\s+INT\s+NOT NULL DEFAULT 0 CHECK \(usage_count >= 0\)/);
    });

    it('defaults last_used_at to now()', () => {
      expect(sql).toMatch(/last_used_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
    });

    it('does not add a per-row increment trigger (rxf-03 uses batch RPC)', () => {
      expect(sql).not.toMatch(/CREATE TRIGGER/i);
    });

    it('declares increment_doctor_drug_usage_batch for atomic Send Rx upsert', () => {
      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION increment_doctor_drug_usage_batch/);
      expect(sql).toMatch(/INSERT INTO doctor_drug_usage/);
      expect(sql).toMatch(/FROM unnest\(p_drug_master_ids\)/);
      expect(sql).toMatch(/ON CONFLICT \(doctor_id, drug_master_id\)/);
      expect(sql).toMatch(
        /usage_count = doctor_drug_usage\.usage_count \+ 1/,
      );
    });
  });

  describe('indexes', () => {
    it('creates the top-N index on (doctor_id, usage_count DESC)', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS doctor_drug_usage_top_n_idx\s+ON doctor_drug_usage \(doctor_id, usage_count DESC\)/,
      );
    });
  });

  describe('Row-Level Security', () => {
    it('enables RLS on the table', () => {
      expect(sql).toMatch(/ALTER TABLE doctor_drug_usage ENABLE ROW LEVEL SECURITY/);
    });

    it('declares owner SELECT policy gated on auth.uid()', () => {
      expect(sql).toMatch(/CREATE POLICY doctor_drug_usage_owner_select/);
      expect(sql).toMatch(
        /FOR SELECT[\s\S]*?USING \(doctor_id = auth\.uid\(\)\)/,
      );
    });

    it('declares owner modify policy with USING and WITH CHECK on auth.uid()', () => {
      expect(sql).toMatch(/CREATE POLICY doctor_drug_usage_owner_modify/);
      expect(sql).toMatch(/FOR ALL[\s\S]*?USING \(doctor_id = auth\.uid\(\)\)/);
      expect(sql).toMatch(/WITH CHECK \(doctor_id = auth\.uid\(\)\)/);
    });

    it('drops policies before re-creating them (idempotent re-run)', () => {
      expect(sql).toMatch(/DROP POLICY IF EXISTS doctor_drug_usage_owner_select/);
      expect(sql).toMatch(/DROP POLICY IF EXISTS doctor_drug_usage_owner_modify/);
    });

    it('documents cross-doctor isolation in the header (doctor B cannot read A)', () => {
      expect(sql).toMatch(/Doctor B can never[\s\S]*?read or write doctor A's rows/i);
    });
  });

  describe('comments', () => {
    it('comments the table with rxf-01 + R-RX-POLISH reference', () => {
      expect(sql).toMatch(/COMMENT ON TABLE doctor_drug_usage IS/);
      expect(sql).toMatch(/rxf-01/);
      expect(sql).toMatch(/R-RX-POLISH\/2\.2/);
      expect(sql).toMatch(/not draft save/i);
      expect(sql).toMatch(/Free-text drugs not counted/i);
    });
  });

  describe('rollback documentation', () => {
    it('documents DROP TABLE rollback in the header', () => {
      expect(sql).toMatch(/DROP TABLE IF EXISTS doctor_drug_usage CASCADE/);
    });
  });
});
