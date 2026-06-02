/**
 * Content-sanity test for migration 110 (consultation_messages INSERT rate limit).
 *
 * @see backend/migrations/110_consultation_messages_rate_limit.sql
 * @see docs/Work/Daily-plans/April 2026/28-04-2026/Tasks/text/task-text-D5-rate-limit-rls-and-toast.md
 *
 * The repo has no live-Supabase test harness for jest (same doctrine as
 * migration 051 / 062 / 084's tests). We pin the load-bearing SQL
 * clauses so a future edit that silently drops the rate-check, the
 * per-branch AND, or the safe_uuid_sub() guard fails loudly in CI.
 *
 * Behavioural verification (35 inserts in 30s, first 30 land, 31+ get
 * 42501) happens at manual smoke time per the task file Acceptance §.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/110_consultation_messages_rate_limit.sql',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');
// Strip SQL line comments so prose mentions of policy keywords (the
// rollback example in the header) don't trip the predicate-only
// assertions below.
const sqlCodeOnly = sql.replace(/--[^\n]*/g, '');

describe('110_consultation_messages_rate_limit.sql — check_chat_insert_rate function', () => {
  it('defines public.check_chat_insert_rate with the (UUID, UUID) -> BOOLEAN signature', () => {
    expect(sqlCodeOnly).toMatch(
      /CREATE OR REPLACE FUNCTION public\.check_chat_insert_rate\s*\(\s*p_session_id\s+UUID\s*,\s*p_sender_id\s+UUID\s*\)\s+RETURNS BOOLEAN/i,
    );
  });

  it('marks the function STABLE + SECURITY DEFINER + SET search_path = public', () => {
    expect(sqlCodeOnly).toMatch(/LANGUAGE plpgsql/i);
    expect(sqlCodeOnly).toMatch(/\bSTABLE\b/);
    expect(sqlCodeOnly).toMatch(/\bSECURITY DEFINER\b/);
    expect(sqlCodeOnly).toMatch(/SET\s+search_path\s*=\s*public/i);
  });

  it('enforces the per-minute (30) and per-hour (200) caps with the documented intervals', () => {
    expect(sqlCodeOnly).toMatch(/v_minute_count\s+INTEGER/);
    expect(sqlCodeOnly).toMatch(/v_hour_count\s+INTEGER/);
    expect(sqlCodeOnly).toMatch(/interval\s+'1 minute'/);
    expect(sqlCodeOnly).toMatch(/interval\s+'1 hour'/);
    expect(sqlCodeOnly).toMatch(/v_minute_count\s*>=\s*30/);
    expect(sqlCodeOnly).toMatch(/v_hour_count\s*>=\s*200/);
  });

  it('counts only inserts keyed on (session_id, sender_id, created_at window)', () => {
    // Both COUNT branches must filter on the same tuple — dropping the
    // sender_id clause would summing the whole session and over-throttle.
    const countBlocks = sqlCodeOnly.match(
      /SELECT COUNT\(\*\) INTO v_(?:minute|hour)_count[\s\S]*?created_at\s*>\s*\(now\(\)\s*-\s*interval\s*'1 (?:minute|hour)'\)/gi,
    );
    expect(countBlocks).not.toBeNull();
    expect(countBlocks!).toHaveLength(2);
    for (const block of countBlocks!) {
      expect(block).toMatch(/FROM consultation_messages/i);
      expect(block).toMatch(/session_id\s*=\s*p_session_id/i);
      expect(block).toMatch(/sender_id\s*=\s*p_sender_id/i);
    }
  });

  it('attaches a COMMENT ON FUNCTION so future readers know the rate is the contract', () => {
    expect(sqlCodeOnly).toMatch(
      /COMMENT ON FUNCTION public\.check_chat_insert_rate\(UUID,\s*UUID\)/i,
    );
  });
});

describe('110_consultation_messages_rate_limit.sql — INSERT policy rewrite', () => {
  it('DROPs and re-CREATEs the canonical INSERT policy (preserving the policy name)', () => {
    expect(sqlCodeOnly).toMatch(
      /DROP POLICY IF EXISTS consultation_messages_insert_live_participants\s+ON consultation_messages/i,
    );
    expect(sqlCodeOnly).toMatch(
      /CREATE POLICY consultation_messages_insert_live_participants\s+ON consultation_messages\s+FOR INSERT/i,
    );
  });

  it('keeps migration 079\'s two-branch (patient + doctor) shape — no regression to single-branch', () => {
    // Patient branch — JWT claim-keyed membership + live-session guard.
    expect(sqlCodeOnly).toMatch(/auth\.jwt\(\) ->> 'consult_role' = 'patient'/);
    expect(sqlCodeOnly).toMatch(
      /auth\.jwt\(\) ->> 'session_id' = consultation_messages\.session_id::text/,
    );

    // Doctor branch — sender_id = safe_uuid_sub() (impersonation guard).
    expect(sqlCodeOnly).toMatch(/sender_id\s*=\s*public\.safe_uuid_sub\(\)/);
    expect(sqlCodeOnly).toMatch(/doctor_id\s*=\s*public\.safe_uuid_sub\(\)/);

    // Both branches must include the status='live' guard.
    const liveGuards = sqlCodeOnly.match(/AND status = 'live'/g);
    expect(liveGuards).not.toBeNull();
    expect(liveGuards!.length).toBeGreaterThanOrEqual(2);
  });

  it('AND-chains the rate-check on BOTH branches (patient + doctor)', () => {
    // Two call sites of check_chat_insert_rate, one per branch. If a
    // future edit removes one we'd see a single match and the branch
    // would silently un-rate-limit.
    const rateCalls = sqlCodeOnly.match(
      /public\.check_chat_insert_rate\s*\(\s*consultation_messages\.session_id\s*,\s*consultation_messages\.sender_id\s*\)/g,
    );
    expect(rateCalls).not.toBeNull();
    expect(rateCalls!).toHaveLength(2);
  });

  it('does NOT touch SELECT / UPDATE / DELETE policies (D5 rewrites only the INSERT gate)', () => {
    expect(sqlCodeOnly).not.toMatch(/CREATE POLICY[^\n]*FOR SELECT/i);
    expect(sqlCodeOnly).not.toMatch(/CREATE POLICY[^\n]*FOR UPDATE/i);
    expect(sqlCodeOnly).not.toMatch(/CREATE POLICY[^\n]*FOR DELETE/i);
    expect(sqlCodeOnly).not.toMatch(
      /DROP POLICY[^\n]*consultation_messages_select_participants/i,
    );
  });

  it('does NOT touch storage RLS (file uploads share the chat-row rate limit)', () => {
    expect(sqlCodeOnly).not.toMatch(/storage\.objects/);
    expect(sqlCodeOnly).not.toMatch(/consultation_attachments_/);
  });

  it('forces a PostgREST schema reload so cached policy plans get rebuilt', () => {
    expect(sqlCodeOnly).toMatch(/NOTIFY pgrst, 'reload schema'/i);
  });
});

describe('110_consultation_messages_rate_limit.sql — header doctrine', () => {
  it('documents the rollback (drop policy + restore prior + drop function)', () => {
    // The reverse-migration steps live in the header doctrine; we
    // require the three load-bearing keywords so a future trim of the
    // doctrine without replacement runbook fails in code review.
    expect(sql).toMatch(/ROLLBACK/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS consultation_messages_insert_live_participants/);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.check_chat_insert_rate/);
  });

  it('documents the 30/min, 200/hour contract in human prose', () => {
    expect(sql).toMatch(/30 messages \/ minute/);
    expect(sql).toMatch(/200 messages \/ hour/);
  });
});
