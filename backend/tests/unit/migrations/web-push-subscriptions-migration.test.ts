/**
 * Content-sanity test for migration 111 (web_push_subscriptions).
 *
 * task-text-D6a · Web Push part 1
 *
 * No live-Supabase harness — pins load-bearing clauses (safe_uuid_sub()
 * RLS shape, UNIQUE constraint, partial index) so accidental edits fail in CI.
 *
 * @see backend/migrations/111_web_push_subscriptions.sql
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/111_web_push_subscriptions.sql',
);

describe('111_web_push_subscriptions.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const sqlCodeOnly = sql.replace(/--[^\n]*/g, '');

  describe('table web_push_subscriptions', () => {
    it('creates the table with IF NOT EXISTS (idempotent re-run)', () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS web_push_subscriptions/);
    });

    it('declares user_role CHECK for doctor and patient only', () => {
      expect(sql).toMatch(
        /user_role\s+TEXT\s+NOT NULL CHECK \(user_role IN \('doctor', 'patient'\)\)/,
      );
    });

    it('enforces UNIQUE (user_id, endpoint) for one subscription per device', () => {
      expect(sql).toMatch(/UNIQUE \(user_id, endpoint\)/);
    });

    it('stores push credential columns endpoint, p256dh_key, auth_key', () => {
      expect(sql).toMatch(/endpoint\s+TEXT\s+NOT NULL/);
      expect(sql).toMatch(/p256dh_key\s+TEXT\s+NOT NULL/);
      expect(sql).toMatch(/auth_key\s+TEXT\s+NOT NULL/);
    });

    it('tracks revoked_at and last_used_at lifecycle columns', () => {
      expect(sql).toMatch(/revoked_at\s+TIMESTAMPTZ/);
      expect(sql).toMatch(/last_used_at\s+TIMESTAMPTZ/);
    });
  });

  describe('indexes', () => {
    it('creates partial index on user_id WHERE revoked_at IS NULL', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user_active\s+ON web_push_subscriptions \(user_id\) WHERE revoked_at IS NULL/,
      );
    });
  });

  describe('Row-Level Security (safe_uuid_sub)', () => {
    it('enables RLS on the table', () => {
      expect(sql).toMatch(/ALTER TABLE web_push_subscriptions ENABLE ROW LEVEL SECURITY/);
    });

    it('SELECT policy gates on safe_uuid_sub()', () => {
      expect(sqlCodeOnly).toMatch(/CREATE POLICY web_push_subscriptions_select_own/);
      expect(sqlCodeOnly).toMatch(
        /FOR SELECT[\s\S]*?USING \(user_id = public\.safe_uuid_sub\(\)\)/,
      );
    });

    it('INSERT policy gates WITH CHECK on safe_uuid_sub()', () => {
      expect(sqlCodeOnly).toMatch(/CREATE POLICY web_push_subscriptions_insert_own/);
      expect(sqlCodeOnly).toMatch(
        /FOR INSERT[\s\S]*?WITH CHECK \(user_id = public\.safe_uuid_sub\(\)\)/,
      );
    });

    it('UPDATE policy uses safe_uuid_sub() in USING and WITH CHECK', () => {
      expect(sqlCodeOnly).toMatch(/CREATE POLICY web_push_subscriptions_update_own/);
      expect(sqlCodeOnly).toMatch(
        /FOR UPDATE[\s\S]*?USING \(user_id = public\.safe_uuid_sub\(\)\)/,
      );
      expect(sqlCodeOnly).toMatch(
        /FOR UPDATE[\s\S]*?WITH CHECK \(user_id = public\.safe_uuid_sub\(\)\)/,
      );
    });

    it('DELETE policy gates on safe_uuid_sub()', () => {
      expect(sqlCodeOnly).toMatch(/CREATE POLICY web_push_subscriptions_delete_own/);
      expect(sqlCodeOnly).toMatch(
        /FOR DELETE[\s\S]*?USING \(user_id = public\.safe_uuid_sub\(\)\)/,
      );
    });

    it('drops policies before re-creating them (idempotent re-run)', () => {
      expect(sql).toMatch(/DROP POLICY IF EXISTS web_push_subscriptions_select_own/);
      expect(sql).toMatch(/DROP POLICY IF EXISTS web_push_subscriptions_insert_own/);
      expect(sql).toMatch(/DROP POLICY IF EXISTS web_push_subscriptions_update_own/);
      expect(sql).toMatch(/DROP POLICY IF EXISTS web_push_subscriptions_delete_own/);
    });
  });

  describe('rollback documentation', () => {
    it('documents reverse migration via DROP TABLE CASCADE', () => {
      expect(sql).toMatch(/DROP TABLE IF EXISTS web_push_subscriptions CASCADE/);
    });
  });
});
