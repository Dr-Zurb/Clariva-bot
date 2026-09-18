/**
 * Content-sanity test for migration 189 (platform usernames).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/189_platform_username.sql'
);

describe('189_platform_username.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('adds commenter_username on comment_leads', () => {
    expect(sql).toMatch(
      /ALTER TABLE comment_leads[\s\S]*commenter_username TEXT NULL/
    );
  });

  it('adds platform_username on patients', () => {
    expect(sql).toMatch(
      /ALTER TABLE patients[\s\S]*platform_username TEXT NULL/
    );
  });
});
