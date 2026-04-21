/**
 * Content-sanity test for migration 061 (consultation_transcripts).
 *
 * Plan:  docs/Development/Daily-plans/April 2026/19-04-2026/Plans/plan-05-voice-consultation-twilio.md
 * Task:  docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-25-voice-transcription-pipeline.md
 *
 * Why a content-sanity test (not a live-DB RLS test)?
 *
 *   Same rationale as `consultation-messages-migration.test.ts`: the repo
 *   has no live-Supabase test harness today, and bootstrapping one for a
 *   single migration is out of scope. We pin the load-bearing clauses so a
 *   future edit that accidentally drops the unique index, the
 *   `retry_count` guard, or the CASCADE FK fails in review.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/061_consultation_transcripts.sql',
);

describe('061_consultation_transcripts.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('table consultation_transcripts', () => {
    it('creates the table with IF NOT EXISTS', () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS consultation_transcripts/);
    });

    it('FKs consultation_session_id to consultation_sessions(id) with ON DELETE CASCADE', () => {
      expect(sql).toMatch(
        /consultation_session_id\s+UUID\s+NOT NULL REFERENCES consultation_sessions\(id\) ON DELETE CASCADE/,
      );
    });

    it('constrains provider to the two v1 values', () => {
      expect(sql).toMatch(
        /provider\s+TEXT\s+NOT NULL CHECK \(provider IN \('openai_whisper', 'deepgram_nova_2'\)\)/,
      );
    });

    it('constrains status to queued | processing | completed | failed (full set)', () => {
      expect(sql).toMatch(
        /status[\s\S]+?CHECK \(status IN \('queued', 'processing', 'completed', 'failed'\)\)/,
      );
    });

    it('declares non-negative cost_usd_cents CHECK', () => {
      expect(sql).toMatch(/cost_usd_cents[\s\S]+?CHECK \(cost_usd_cents >= 0\)/);
    });

    it('declares non-negative duration_seconds CHECK', () => {
      expect(sql).toMatch(/duration_seconds[\s\S]+?CHECK \(duration_seconds >= 0\)/);
    });

    it('declares retry_count with default 0 and non-negative CHECK', () => {
      expect(sql).toMatch(
        /retry_count\s+INTEGER\s+NOT NULL DEFAULT 0 CHECK \(retry_count >= 0\)/,
      );
    });

    it('keeps composition_sid NOT NULL (worker resolves placeholder on first poll)', () => {
      expect(sql).toMatch(/composition_sid\s+TEXT\s+NOT NULL/);
    });

    it('keeps transcript_json as JSONB and transcript_text as TEXT with safe defaults', () => {
      // Safe defaults let a `queued` row exist before the worker has filled
      // them in. `'completed'` rows always have non-empty values but the
      // column definition itself is permissive.
      expect(sql).toMatch(/transcript_json\s+JSONB\s+NOT NULL DEFAULT '\{\}'::jsonb/);
      expect(sql).toMatch(/transcript_text\s+TEXT\s+NOT NULL DEFAULT ''/);
    });
  });

  describe('indexes', () => {
    it('declares the unique index on (consultation_session_id, provider)', () => {
      expect(sql).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS consultation_transcripts_session_provider_unique\s+ON consultation_transcripts\(consultation_session_id, provider\)/,
      );
    });

    it('declares the worker-scan index partial on queued/processing', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS consultation_transcripts_status_created_idx[\s\S]+?WHERE status IN \('queued', 'processing'\)/,
      );
    });

    it('declares the failed-rows ops-triage index', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS consultation_transcripts_failed_created_idx[\s\S]+?WHERE status = 'failed'/,
      );
    });
  });

  describe('RLS', () => {
    it('enables RLS on the table (service-role only in v1)', () => {
      expect(sql).toMatch(/ALTER TABLE consultation_transcripts ENABLE ROW LEVEL SECURITY/);
    });

    it('declares no SELECT / INSERT / UPDATE / DELETE policies (service-role only)', () => {
      // Plan 07 will add doctor-side read RLS when it ships. Until then the
      // table has zero policies and RLS blocks non-service-role access.
      expect(sql).not.toMatch(/CREATE POLICY[^;]+consultation_transcripts/);
    });
  });

  describe('reverse-migration documentation', () => {
    it('documents the manual reverse steps in a trailing comment', () => {
      expect(sql).toMatch(/Reverse migration/i);
      expect(sql).toMatch(/DROP TABLE IF EXISTS consultation_transcripts/);
      expect(sql).toMatch(/DROP INDEX IF EXISTS consultation_transcripts_session_provider_unique/);
    });
  });
});
