/**
 * Content-sanity test for migration 243 (illness chips column).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/243_appointments_previsit_context.sql'
);

describe('243_appointments_previsit_context.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('adds a nullable previsit_context column and leaves reason_for_visit alone', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS previsit_context JSONB NULL');
    expect(sql).not.toMatch(/ALTER COLUMN reason_for_visit/i);
    expect(sql).toContain('not reason_for_visit');
  });

  it('documents the four chips and that null is valid', () => {
    expect(sql).toContain('since (text)');
    expect(sql).toContain('course (better|same|worse)');
    expect(sql).toContain('tried (text)');
    expect(sql).toContain('aim (new_problem|follow_up|reports|refill)');
    expect(sql).toContain('NULL when the patient skipped');
  });

  it('lets a patient id be the actor when the source is the patient', () => {
    expect(sql).toContain('source = patient stores patients.id');
    expect(sql.match(/source = patient stores patients\.id/g)?.length).toBe(2);
    expect(sql).toContain('front_desk and assistant rows store an auth.users id');
    expect(sql).toContain('front_desk rows store an auth.users id');
  });

  it('does not add an RLS policy or an upload route', () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/INSERT INTO/i);
  });

  it('documents a reverse migration', () => {
    expect(sql).toMatch(/Reverse migration/);
    expect(sql).toContain('DROP COLUMN IF EXISTS previsit_context');
  });
});
