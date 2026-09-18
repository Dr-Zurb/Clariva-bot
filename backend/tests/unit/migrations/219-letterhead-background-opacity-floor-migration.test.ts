/**
 * Content-sanity test for migration 219 (background opacity 0–40).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/219_letterhead_background_opacity_floor.sql'
);

describe('219_letterhead_background_opacity_floor.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('rewrites the opacity check to allow 0', () => {
    expect(sql).toContain('letterhead_background_opacity >= 0');
    expect(sql).toContain('letterhead_background_opacity <= 40');
  });

  it('does not add a registration_number column (BRD-D2)', () => {
    expect(sql).not.toMatch(/registration_number/);
  });

  it('documents a reverse migration', () => {
    expect(sql).toMatch(/Reverse migration/);
  });
});
