/**
 * Content-sanity test for migration 108 (text chat quality telemetry).
 *
 * @see backend/migrations/108_text_chat_quality.sql
 * @see docs/Work/Daily-plans/April 2026/28-04-2026/Tasks/text/task-text-D4-chat-quality-telemetry.md
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/108_text_chat_quality.sql',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');
const sqlCodeOnly = sql.replace(/--[^\n]*/g, '');

describe('108_text_chat_quality.sql', () => {
  it('creates text_chat_quality idempotently with expected columns', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS text_chat_quality/);
    expect(sql).toMatch(/roundtrip_p95_ms\s+INTEGER/);
    expect(sql).toMatch(/realtime_reconnects\s+INTEGER/);
    expect(sql).toMatch(/presence_flaps\s+INTEGER/);
    expect(sql).toMatch(/messages_in_window\s+INTEGER/);
    expect(sql).toMatch(/sender_role.*CHECK.*doctor.*patient/s);
  });

  it('indexes session_id + sample_at for doctor badge queries', () => {
    expect(sql).toMatch(
      /idx_text_chat_quality_session_time[\s\S]*session_id,\s*sample_at DESC/,
    );
  });

  it('enables RLS with doctor-only SELECT via safe_uuid_sub()', () => {
    expect(sql).toMatch(/ALTER TABLE text_chat_quality ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/text_chat_quality_select_doctor/);
    expect(sql).toMatch(/public\.safe_uuid_sub\(\)/);
    expect(sqlCodeOnly).not.toMatch(/\bauth\.uid\(\)/);
  });

  it('does not grant client INSERT (service-role ingest only)', () => {
    expect(sql).not.toMatch(/FOR INSERT/);
  });

  it('adds text_chat_quality to supabase_realtime publication idempotently', () => {
    expect(sql).toMatch(/ALTER PUBLICATION supabase_realtime ADD TABLE text_chat_quality/);
    expect(sql).toMatch(/WHEN duplicate_object/);
  });

  it('documents reverse migration steps', () => {
    expect(sql).toMatch(/DROP TABLE\s+IF EXISTS text_chat_quality/);
  });
});
