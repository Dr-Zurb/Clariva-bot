/**
 * Content-sanity tests for Plan 08 · Task 43 — recording_audit_action
 * ENUM widen (migration 071).
 *
 * Pins the load-bearing bits of migration 071 so an accidental edit
 * that drops either ENUM value or removes the `ADD VALUE IF NOT EXISTS`
 * idempotency guard gets caught in review.
 *
 * Mirrors the content-sanity pattern from
 * `video-recording-audit-extensions-migration.test.ts` — pure regex
 * against file contents, no live Postgres required.
 *
 * @see backend/migrations/071_recording_audit_action_video_values.sql
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-43-recording-track-service-twilio-rules-wrapper.md
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/071_recording_audit_action_video_values.sql',
);

describe('071_recording_audit_action_video_values.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('cites Plan 08 · Task 43 in the header', () => {
    expect(sql).toMatch(/Plan 08 · Task 43/);
  });

  it('adds the video_recording_started value idempotently', () => {
    expect(sql).toMatch(
      /ALTER\s+TYPE\s+recording_audit_action\s+ADD\s+VALUE\s+IF\s+NOT\s+EXISTS\s+'video_recording_started'\s*;/i,
    );
  });

  it('adds the video_recording_reverted value idempotently', () => {
    expect(sql).toMatch(
      /ALTER\s+TYPE\s+recording_audit_action\s+ADD\s+VALUE\s+IF\s+NOT\s+EXISTS\s+'video_recording_reverted'\s*;/i,
    );
  });

  it('does NOT introduce separate _attempted / _completed / _failed enum values (status stays in metadata)', () => {
    expect(sql).not.toMatch(/ADD\s+VALUE\s+[^']*'video_escalation_attempted'/i);
    expect(sql).not.toMatch(/ADD\s+VALUE\s+[^']*'video_escalation_completed'/i);
    expect(sql).not.toMatch(/ADD\s+VALUE\s+[^']*'video_escalation_failed'/i);
    expect(sql).not.toMatch(/ADD\s+VALUE\s+[^']*'audio_only_revert_attempted'/i);
    expect(sql).not.toMatch(/ADD\s+VALUE\s+[^']*'audio_only_revert_completed'/i);
    expect(sql).not.toMatch(/ADD\s+VALUE\s+[^']*'audio_only_revert_failed'/i);
  });

  it('does NOT drop / rename the pre-existing ENUM values from Migration 064 (excluding header comments)', () => {
    const nonCommentLines = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(nonCommentLines).not.toMatch(/DROP\s+VALUE/i);
    expect(nonCommentLines).not.toMatch(/RENAME\s+VALUE/i);
    expect(nonCommentLines).not.toMatch(/DROP\s+TYPE/i);
  });

  it('refreshes the COMMENT ON TYPE narrative to include the new values', () => {
    expect(sql).toMatch(/COMMENT ON TYPE recording_audit_action/i);
    expect(sql).toMatch(/video_recording_started/);
    expect(sql).toMatch(/video_recording_reverted/);
  });

  it('documents the reverse migration (no DROP VALUE in Postgres)', () => {
    expect(sql).toMatch(/Reverse migration/i);
  });
});
