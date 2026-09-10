/**
 * Content-sanity test for migration 187 (doctor_facebook + RLS).
 *
 * @see docs/Work/Daily-plans/July 2026/26-07-2026/facebook-messenger-channel/p1-connect-and-messenger/Tasks/task-fbm-02-doctor-facebook-migration.md
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/187_doctor_facebook.sql',
);

describe('187_doctor_facebook.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('table + columns', () => {
    it('creates doctor_facebook idempotently keyed on auth.users with CASCADE', () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS doctor_facebook/);
      expect(sql).toMatch(
        /doctor_id\s+UUID PRIMARY KEY REFERENCES auth\.users\(id\) ON DELETE CASCADE/,
      );
    });

    it('requires facebook_page_id and page_access_token', () => {
      expect(sql).toMatch(/facebook_page_id\s+TEXT NOT NULL/);
      expect(sql).toMatch(/page_access_token\s+TEXT NOT NULL/);
    });

    it('enforces unique facebook_page_id (one Page → one doctor)', () => {
      expect(sql).toMatch(
        /CONSTRAINT doctor_facebook_page_id_unique UNIQUE \(facebook_page_id\)/,
      );
    });

    it('indexes page id for webhook lookup', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_doctor_facebook_page_id\s+ON doctor_facebook\(facebook_page_id\)/,
      );
    });

    it('includes health + display columns for Integrations UI', () => {
      expect(sql).toMatch(/page_name\s+TEXT NULL/);
      expect(sql).toMatch(/facebook_health_level\s+TEXT NULL/);
      expect(sql).toMatch(/facebook_last_dm_success_at\s+TIMESTAMPTZ NULL/);
    });
  });

  describe('RLS', () => {
    it('enables row level security', () => {
      expect(sql).toMatch(/ALTER TABLE doctor_facebook ENABLE ROW LEVEL SECURITY/);
    });

    it('lets doctors CRUD only their own row', () => {
      expect(sql).toMatch(/Doctors can read own facebook/);
      expect(sql).toMatch(/Doctors can insert own facebook/);
      expect(sql).toMatch(/Doctors can update own facebook/);
      expect(sql).toMatch(/Doctors can delete own facebook/);
      expect(sql).toMatch(/USING \(doctor_id = auth\.uid\(\)\)/);
    });

    it('documents service-role read for workers', () => {
      expect(sql).toMatch(/Service role can read doctor facebook/);
      expect(sql).toMatch(/auth\.role\(\) = 'service_role'/);
    });
  });

  describe('trigger', () => {
    it('wires updated_at via shared helper', () => {
      expect(sql).toMatch(/doctor_facebook_updated_at/);
      expect(sql).toMatch(/update_updated_at_column\(\)/);
    });
  });
});
