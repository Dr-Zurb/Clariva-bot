/**
 * Content-sanity test for migration 188 (comment_leads.platform).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/188_comment_leads_platform.sql',
);

describe('188_comment_leads_platform.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('adds platform with instagram default', () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'instagram'/,
    );
  });

  it('checks platform is instagram or facebook', () => {
    expect(sql).toMatch(/comment_leads_platform_check/);
    expect(sql).toMatch(/platform IN \('instagram', 'facebook'\)/);
  });

  it('indexes doctor+platform and commenter+platform', () => {
    expect(sql).toMatch(/idx_comment_leads_doctor_platform/);
    expect(sql).toMatch(/idx_comment_leads_commenter_platform/);
  });
});
