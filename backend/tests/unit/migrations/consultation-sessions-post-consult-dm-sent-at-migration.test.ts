/**
 * Content-sanity test for migration 067
 * (consultation_sessions.post_consult_dm_sent_at).
 *
 * Plan: docs/Development/Daily-plans/April 2026/19-04-2026/Plans/plan-07-recording-replay-and-history.md
 * Task: docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-31-post-consult-chat-history-surface.md
 *
 * Pins the load-bearing clauses of the migration so an accidental edit
 * that drops:
 *   - the `IF NOT EXISTS` (re-runnability against an already-migrated DB),
 *   - the `TIMESTAMPTZ` type (matches `last_ready_notification_at`),
 *   - the additive shape (no NOT NULL, no DEFAULT — explicit null sentinel),
 *
 * will fail in review.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/067_consultation_sessions_post_consult_dm_sent_at.sql',
);

describe('067_consultation_sessions_post_consult_dm_sent_at.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('uses ADD COLUMN IF NOT EXISTS for idempotent re-runs', () => {
    expect(sql).toMatch(
      /ALTER TABLE consultation_sessions\s+ADD COLUMN IF NOT EXISTS post_consult_dm_sent_at TIMESTAMPTZ/,
    );
  });

  it('keeps the column nullable (NULL = never sent)', () => {
    // Explicit assertion that we did NOT accidentally add a NOT NULL or
    // DEFAULT — both would change the semantics from "tri-state with
    // null sentinel" to "definitely fired now".
    expect(sql).not.toMatch(/post_consult_dm_sent_at[^,;]*NOT NULL/i);
    expect(sql).not.toMatch(/post_consult_dm_sent_at[^,;]*DEFAULT/i);
  });

  it('does not create an index (lookup is PK-driven inside the helper)', () => {
    expect(sql).not.toMatch(/CREATE\s+INDEX[^;]*post_consult_dm_sent_at/i);
  });

  it('comments the column with the plan + task reference', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN consultation_sessions\.post_consult_dm_sent_at IS/);
    expect(sql).toMatch(/Plan 07 Task 31/);
  });
});
