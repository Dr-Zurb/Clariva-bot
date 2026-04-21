/**
 * Unit tests for `services/regulatory-retention-service.ts` (Plan 02 · Task 34).
 *
 * Covers:
 *   - Exact (country, specialty) match wins over country-wildcard and global.
 *   - Country wildcard wins over global when exact is absent.
 *   - Global fallback when neither exact nor country match is available.
 *   - Throws InternalError when the global fallback row itself is missing
 *     (i.e. the seed migration (058) has not been applied — an
 *     environment-setup bug the service must surface loudly).
 *   - Case-insensitivity: lowercase country input resolves to the uppercase
 *     stored row; uppercase specialty input resolves to the lowercase row.
 *   - Versioned policies: only the row active at `asOf` matches; a row
 *     with a later `effective_from` or an expired `effective_until` is
 *     filtered out in application code.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

import { resolveRetentionPolicy } from '../../../src/services/regulatory-retention-service';
import { InternalError } from '../../../src/utils/errors';
import * as database from '../../../src/config/database';

const mockedDb = database as jest.Mocked<typeof database>;

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Mock harness: per-(country, specialty) → row[] lookup table.
// Each tuple represents what the SELECT .eq('country').eq('specialty')
// would return, ordered by effective_from DESC.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function makeClient(
  lookup: Map<string, Row[]>,
): ReturnType<typeof mockedDb.getSupabaseAdminClient> {
  const from = jest.fn((table: string) => {
    if (table !== 'regulatory_retention_policy') {
      throw new Error(`unexpected table ${table}`);
    }
    const filters = { country: '', specialty: '' };
    const leaf = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn((col: string, val: string) => {
        if (col === 'country_code') filters.country = val;
        if (col === 'specialty') filters.specialty = val;
        return leaf;
      }),
      order: jest.fn(() => {
        const key = `${filters.country}|${filters.specialty}`;
        return Promise.resolve({ data: lookup.get(key) ?? [], error: null });
      }),
    };
    return leaf;
  });
  return { from } as unknown as ReturnType<
    typeof mockedDb.getSupabaseAdminClient
  >;
}

function policyRow(overrides: Row): Row {
  return {
    id: 'p-id',
    country_code: 'IN',
    specialty: '*',
    retention_years: 3,
    retention_until_age: null,
    patient_self_serve_days: 90,
    source: 'test',
    effective_from: '2020-01-01',
    effective_until: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveRetentionPolicy — precedence', () => {
  it('prefers exact (country, specialty) over country-wildcard and global', async () => {
    const lookup = new Map<string, Row[]>();
    lookup.set('IN|pediatrics', [
      policyRow({
        id: 'exact',
        country_code: 'IN',
        specialty: 'pediatrics',
        retention_years: 3,
        retention_until_age: 21,
      }),
    ]);
    lookup.set('IN|*', [
      policyRow({ id: 'country', retention_years: 3 }),
    ]);
    lookup.set('*|*', [
      policyRow({ id: 'global', country_code: '*', retention_years: 7 }),
    ]);

    mockedDb.getSupabaseAdminClient.mockReturnValue(makeClient(lookup));

    const res = await resolveRetentionPolicy({
      countryCode: 'IN',
      specialty: 'pediatrics',
    });

    expect(res.policyId).toBe('exact');
    expect(res.matchedTier).toBe('exact');
    expect(res.retentionUntilAge).toBe(21);
    expect(res.retentionYears).toBe(3);
  });

  it('falls back to country-wildcard when exact is absent', async () => {
    const lookup = new Map<string, Row[]>();
    lookup.set('IN|gynecology', []); // no exact row
    lookup.set('IN|*', [
      policyRow({ id: 'country', retention_years: 3 }),
    ]);
    lookup.set('*|*', [
      policyRow({ id: 'global', country_code: '*', retention_years: 7 }),
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(makeClient(lookup));

    const res = await resolveRetentionPolicy({
      countryCode: 'IN',
      specialty: 'gynecology',
    });
    expect(res.policyId).toBe('country');
    expect(res.matchedTier).toBe('country');
    expect(res.retentionYears).toBe(3);
  });

  it('falls back to global ("*", "*") when neither exact nor country-wildcard match', async () => {
    const lookup = new Map<string, Row[]>();
    lookup.set('US|cardiology', []);
    lookup.set('US|*', []);
    lookup.set('*|*', [
      policyRow({
        id: 'global',
        country_code: '*',
        specialty: '*',
        retention_years: 7,
      }),
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(makeClient(lookup));

    const res = await resolveRetentionPolicy({
      countryCode: 'US',
      specialty: 'cardiology',
    });
    expect(res.policyId).toBe('global');
    expect(res.matchedTier).toBe('global');
    expect(res.retentionYears).toBe(7);
  });

  it('throws InternalError when even the global fallback is missing', async () => {
    const lookup = new Map<string, Row[]>();
    lookup.set('US|cardiology', []);
    lookup.set('US|*', []);
    lookup.set('*|*', []);
    mockedDb.getSupabaseAdminClient.mockReturnValue(makeClient(lookup));

    await expect(
      resolveRetentionPolicy({ countryCode: 'US', specialty: 'cardiology' }),
    ).rejects.toBeInstanceOf(InternalError);
  });
});

describe('resolveRetentionPolicy — normalisation', () => {
  it('upper-cases country input and lower-cases specialty input before lookup', async () => {
    const lookup = new Map<string, Row[]>();
    lookup.set('IN|pediatrics', [
      policyRow({
        id: 'exact',
        country_code: 'IN',
        specialty: 'pediatrics',
      }),
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(makeClient(lookup));

    const res = await resolveRetentionPolicy({
      countryCode: 'in',
      specialty: 'PEDIATRICS',
    });
    expect(res.policyId).toBe('exact');
  });

  it('treats null / empty inputs as wildcard', async () => {
    const lookup = new Map<string, Row[]>();
    lookup.set('*|*', [
      policyRow({ id: 'global', country_code: '*', specialty: '*' }),
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(makeClient(lookup));

    const res = await resolveRetentionPolicy({
      countryCode: null,
      specialty: null,
    });
    expect(res.policyId).toBe('global');
    expect(res.matchedTier).toBe('global');
  });
});

describe('resolveRetentionPolicy — versioning', () => {
  it('ignores rows whose effective_from is after asOf', async () => {
    const lookup = new Map<string, Row[]>();
    lookup.set('IN|*', [
      // Most-recent first: future row
      policyRow({
        id: 'future',
        effective_from: '2099-01-01',
      }),
      policyRow({
        id: 'active',
        effective_from: '2020-01-01',
        effective_until: null,
      }),
    ]);
    lookup.set('*|*', [
      policyRow({ id: 'global', country_code: '*', specialty: '*' }),
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(makeClient(lookup));

    const res = await resolveRetentionPolicy({
      countryCode: 'IN',
      specialty: '*',
      asOf: new Date('2026-04-19T00:00:00Z'),
    });
    expect(res.policyId).toBe('active');
  });

  it('ignores rows whose effective_until has passed', async () => {
    const lookup = new Map<string, Row[]>();
    lookup.set('IN|*', [
      policyRow({
        id: 'expired',
        effective_from: '2020-01-01',
        effective_until: '2022-01-01',
      }),
    ]);
    lookup.set('*|*', [
      policyRow({ id: 'global', country_code: '*', specialty: '*' }),
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(makeClient(lookup));

    const res = await resolveRetentionPolicy({
      countryCode: 'IN',
      specialty: '*',
      asOf: new Date('2026-04-19T00:00:00Z'),
    });
    expect(res.policyId).toBe('global');
  });
});
