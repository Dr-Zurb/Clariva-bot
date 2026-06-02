/**
 * Migration 048 — catalog_mode back-fill (Plan 03 · Task 08).
 *
 * No DB harness exists in this workspace, so this test verifies the back-fill
 * semantics two ways:
 *
 * 1. **Classification mirror** — a pure TypeScript function `classifyCatalogMode`
 *    that re-implements the SQL `CASE ... END` branches from
 *    `backend/migrations/048_catalog_mode.sql`. We test the four classification
 *    cases + idempotency (re-running against already-classified rows is a no-op).
 *
 * 2. **Drift guard** — we read the migration file and assert it contains the
 *    signature clauses (ALTER, CHECK constraint, each of the four CASE branches,
 *    `WHERE catalog_mode IS NULL` idempotency gate). If someone edits one side
 *    without the other, this test surfaces the divergence.
 *
 * The SQL is the source of truth (it runs against staging/prod without the app
 * deployed); the TS mirror is test-only and MUST stay in sync with the SQL.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// SQL mirror — keep in sync with 048_catalog_mode.sql
// ============================================================================

interface Row {
  catalog_mode: 'single_fee' | 'multi_service' | null;
  appointment_fee_minor: number | null;
  /** Shape-matches what reaches Postgres: null | { version; services: [...] }. */
  service_offerings_json: { services: unknown[] } | null;
}

/**
 * Mirror of the SQL `CASE ... END` in 048_catalog_mode.sql.
 * Applied only to rows where `catalog_mode IS NULL` (idempotency gate).
 */
function classifyCatalogMode(row: Row): 'single_fee' | 'multi_service' | null {
  const services = Array.isArray(row.service_offerings_json?.services)
    ? row.service_offerings_json!.services
    : null;

  // Case 1: ≥ 2 services → multi_service
  if (services && services.length >= 2) return 'multi_service';

  // Case 2: exactly 1 service → single_fee
  if (services && services.length === 1) return 'single_fee';

  // Case 3: no/empty catalog + flat fee → single_fee
  const noCatalog = !services || services.length === 0;
  if (noCatalog && row.appointment_fee_minor !== null) return 'single_fee';

  // Case 4: fresh onboarding → stay NULL
  return null;
}

/**
 * Apply the back-fill to a fixture array, gated by `WHERE catalog_mode IS NULL`.
 * Returns the new array (pure — caller compares pre/post).
 */
function applyBackfill(rows: Row[]): Row[] {
  return rows.map((row) =>
    row.catalog_mode === null
      ? { ...row, catalog_mode: classifyCatalogMode(row) }
      : row
  );
}

// ============================================================================
// Classification cases
// ============================================================================

describe('Migration 048 · back-fill classification (mirror)', () => {
  it('Case 1: catalog with ≥ 2 services → multi_service', () => {
    const row: Row = {
      catalog_mode: null,
      appointment_fee_minor: null,
      service_offerings_json: { services: [{ service_key: 'a' }, { service_key: 'b' }] },
    };
    expect(classifyCatalogMode(row)).toBe('multi_service');
  });

  it('Case 1 (edge): exactly 3 services → multi_service', () => {
    const row: Row = {
      catalog_mode: null,
      appointment_fee_minor: 50000,
      service_offerings_json: { services: [{}, {}, {}] },
    };
    expect(classifyCatalogMode(row)).toBe('multi_service');
  });

  it('Case 2: catalog with exactly 1 service → single_fee', () => {
    const row: Row = {
      catalog_mode: null,
      appointment_fee_minor: null,
      service_offerings_json: { services: [{ service_key: 'only' }] },
    };
    expect(classifyCatalogMode(row)).toBe('single_fee');
  });

  it('Case 3a: null catalog + flat fee → single_fee', () => {
    const row: Row = {
      catalog_mode: null,
      appointment_fee_minor: 50000,
      service_offerings_json: null,
    };
    expect(classifyCatalogMode(row)).toBe('single_fee');
  });

  it('Case 3b: empty services array + flat fee → single_fee', () => {
    const row: Row = {
      catalog_mode: null,
      appointment_fee_minor: 75000,
      service_offerings_json: { services: [] },
    };
    expect(classifyCatalogMode(row)).toBe('single_fee');
  });

  it('Case 4a: null catalog + null fee → NULL (fresh onboarding)', () => {
    const row: Row = {
      catalog_mode: null,
      appointment_fee_minor: null,
      service_offerings_json: null,
    };
    expect(classifyCatalogMode(row)).toBeNull();
  });

  it('Case 4b: empty catalog + null fee → NULL', () => {
    const row: Row = {
      catalog_mode: null,
      appointment_fee_minor: null,
      service_offerings_json: { services: [] },
    };
    expect(classifyCatalogMode(row)).toBeNull();
  });

  it('fee amount does NOT override an existing multi-service catalog', () => {
    // A doctor with both a flat fee (legacy) and a real catalog keeps multi_service.
    const row: Row = {
      catalog_mode: null,
      appointment_fee_minor: 50000,
      service_offerings_json: { services: [{}, {}] },
    };
    expect(classifyCatalogMode(row)).toBe('multi_service');
  });
});

// ============================================================================
// Idempotency: second run must be a no-op
// ============================================================================

describe('Migration 048 · idempotency', () => {
  it('second back-fill run does not change already-classified rows', () => {
    const fixtures: Row[] = [
      {
        catalog_mode: null,
        appointment_fee_minor: null,
        service_offerings_json: { services: [{}, {}] },
      },
      {
        catalog_mode: null,
        appointment_fee_minor: 50000,
        service_offerings_json: null,
      },
      {
        catalog_mode: null,
        appointment_fee_minor: null,
        service_offerings_json: null,
      },
    ];

    const firstRun = applyBackfill(fixtures);
    expect(firstRun.map((r) => r.catalog_mode)).toEqual([
      'multi_service',
      'single_fee',
      null,
    ]);

    // Simulate a second migration run — WHERE catalog_mode IS NULL should skip
    // the two already-classified rows. The fresh-onboarding row (case 4) stays
    // NULL, and re-classification yields the same NULL, so the column value
    // does not flip.
    const secondRun = applyBackfill(firstRun);
    expect(secondRun).toEqual(firstRun);
  });

  it('a mode manually set by Task 12 after first run is NOT overwritten', () => {
    // Simulates: migration runs, later a doctor picks "multi_service" via UI,
    // then migration is re-run (e.g. accidental re-deploy). The WHERE gate
    // protects the explicitly-chosen mode.
    const rows: Row[] = [
      {
        catalog_mode: 'multi_service', // doctor picked via UI after back-fill
        appointment_fee_minor: 50000, // still has legacy fee present
        service_offerings_json: null, // hasn't built a catalog yet
      },
    ];
    const rerun = applyBackfill(rows);
    expect(rerun[0]?.catalog_mode).toBe('multi_service');
  });
});

// ============================================================================
// Drift guard: the migration SQL must contain the clauses the mirror assumes.
// ============================================================================

describe('Migration 048 · SQL drift guard', () => {
  // __dirname = backend/tests/unit/migrations — climb 3 levels to `backend/`.
  const migrationPath = join(
    __dirname,
    '..',
    '..',
    '..',
    'migrations',
    '048_catalog_mode.sql'
  );
  const sql = readFileSync(migrationPath, 'utf8');

  it('adds the nullable catalog_mode column idempotently', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS catalog_mode TEXT/i);
  });

  it('adds the CHECK constraint restricting allowed values', () => {
    expect(sql).toMatch(/doctor_settings_catalog_mode_check/);
    expect(sql).toMatch(
      /CHECK\s*\(\s*catalog_mode IS NULL OR catalog_mode IN \(\s*'single_fee'\s*,\s*'multi_service'\s*\)\s*\)/i
    );
  });

  it('drops the CHECK constraint before re-adding (idempotent)', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS doctor_settings_catalog_mode_check/i);
  });

  it('gates the back-fill on catalog_mode IS NULL (idempotency)', () => {
    expect(sql).toMatch(/WHERE\s+catalog_mode\s+IS\s+NULL/i);
  });

  it('has the four classification branches (multi_service / single_fee / single_fee / NULL)', () => {
    // Cardinality >= 2 branch (multi_service).
    expect(sql).toMatch(/jsonb_array_length\(\s*service_offerings_json\s*->\s*'services'\s*\)\s*>=\s*2/);
    // Cardinality = 1 branch (single_fee).
    expect(sql).toMatch(/jsonb_array_length\(\s*service_offerings_json\s*->\s*'services'\s*\)\s*=\s*1/);
    // Fee-only branch references appointment_fee_minor IS NOT NULL.
    expect(sql).toMatch(/appointment_fee_minor IS NOT NULL/);
    // ELSE NULL for fresh onboarding.
    expect(sql).toMatch(/ELSE NULL/);
  });
});
