/**
 * Doctor Settings Service Unit Tests (e-task-4.1)
 *
 * Tests getDoctorSettings: returns row when found, null when no row or error.
 * Plan 03 · Task 08: PATCH validation for `catalog_mode` enum.
 * Plan 03 · Task 09:
 *   - `computeSingleFeeCatalogSyncUpdate` trigger matrix (mode flip, fee change,
 *     consultation_types change, explicit catalog override).
 *   - `ensureSingleFeeCatalogMaterialized` lazy back-fill on GET for rows whose
 *     catalog_mode was flipped to 'single_fee' by the Task 08 migration but
 *     whose service_offerings_json is still null.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  getDoctorSettings,
  computeSingleFeeCatalogSyncUpdate,
  ensureSingleFeeCatalogMaterialized,
  type SingleFeeSyncExistingRow,
} from '../../../src/services/doctor-settings-service';
import * as database from '../../../src/config/database';
import { validatePatchDoctorSettings } from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';
import {
  CATALOG_MODES,
  type DoctorSettingsRow,
} from '../../../src/types/doctor-settings';
import {
  SINGLE_FEE_BACKUP_KEY,
  SINGLE_FEE_SERVICE_KEY,
  buildSingleFeeCatalog,
} from '../../../src/utils/single-fee-catalog';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

const mockedDb = database as jest.Mocked<typeof database>;

const doctorId = '550e8400-e29b-41d4-a716-446655440001';
const secondDoctorId = '550e8400-e29b-41d4-a716-446655440002';

/**
 * Build a Supabase mock that supports BOTH reader chains used by the service:
 *   - `.from().select().eq().maybeSingle()`  → used by `getDoctorSettings`
 *   - `.from().update().eq().is()`           → used by `ensureSingleFeeCatalogMaterialized`
 *
 * `updateResult` defaults to success so the happy-path materialization test
 * doesn't have to opt in.
 */
function createMockSupabase(
  response: { data: unknown; error: unknown },
  updateResult: { error: unknown } = { error: null }
) {
  const updateChain = {
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockResolvedValue(updateResult as never),
  };
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(response as never),
    update: jest.fn().mockReturnValue(updateChain),
  };
  const from = jest.fn().mockReturnValue(chain);
  return { from, chain, updateChain };
}

/** Minimal existing-row fixture for `computeSingleFeeCatalogSyncUpdate` tests. */
function existingRow(
  overrides: Partial<SingleFeeSyncExistingRow> = {}
): SingleFeeSyncExistingRow {
  return {
    doctor_id: doctorId,
    catalog_mode: null,
    appointment_fee_minor: 50000,
    consultation_types: null,
    practice_name: null,
    service_offerings_json: null,
    ...overrides,
  };
}

describe('Doctor Settings Service (e-task-4.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns doctor settings when row exists', async () => {
    const row = {
      doctor_id: doctorId,
      appointment_fee_minor: 75000,
      appointment_fee_currency: 'INR',
      country: 'IN',
      practice_name: null,
      timezone: 'Asia/Kolkata',
      slot_interval_minutes: 15,
      max_advance_booking_days: 90,
      min_advance_hours: 0,
      business_hours_summary: null,
      cancellation_policy_hours: null,
      max_appointments_per_day: null,
      booking_buffer_minutes: null,
      welcome_message: null,
      specialty: null,
      address_summary: null,
      consultation_types: null,
      default_notes: null,
      catalog_mode: 'single_fee' as const,
      created_at: '2026-01-30T00:00:00Z',
      updated_at: '2026-01-30T00:00:00Z',
    };
    const mockSupabase = createMockSupabase({ data: row, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

    const result = await getDoctorSettings(doctorId);

    expect(result).not.toBeNull();
    expect(result?.doctor_id).toBe(doctorId);
    expect(result?.appointment_fee_minor).toBe(75000);
    expect(result?.appointment_fee_currency).toBe('INR');
    expect(result?.country).toBe('IN');
    expect(result?.catalog_mode).toBe('single_fee');
    expect(mockSupabase.from).toHaveBeenCalledWith('doctor_settings');
  });

  it('returns null when no row exists', async () => {
    const mockSupabase = createMockSupabase({ data: null, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

    const result = await getDoctorSettings(doctorId);

    expect(result).toBeNull();
  });

  it('returns null when supabase admin client is null', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null as never);

    const result = await getDoctorSettings(doctorId);

    expect(result).toBeNull();
  });

  it('returns null when query errors', async () => {
    const mockSupabase = createMockSupabase({
      data: null,
      error: { message: 'DB error' },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

    const result = await getDoctorSettings(doctorId);

    expect(result).toBeNull();
  });
});

describe('Doctor Settings PATCH · catalog_mode (Plan 03 · Task 08)', () => {
  it.each(CATALOG_MODES)('accepts %s', (mode) => {
    const parsed = validatePatchDoctorSettings({ catalog_mode: mode });
    expect(parsed.catalog_mode).toBe(mode);
  });

  it('accepts null (clears the field)', () => {
    const parsed = validatePatchDoctorSettings({ catalog_mode: null });
    expect(parsed.catalog_mode).toBeNull();
  });

  it('omits the field when absent (PATCH is partial)', () => {
    const parsed = validatePatchDoctorSettings({ practice_name: 'Clinic' });
    expect('catalog_mode' in parsed).toBe(false);
  });

  it('rejects an unknown value with ValidationError', () => {
    expect(() =>
      validatePatchDoctorSettings({ catalog_mode: 'bogus' })
    ).toThrow(ValidationError);
  });

  it('rejects a non-string value', () => {
    expect(() =>
      validatePatchDoctorSettings({ catalog_mode: 42 })
    ).toThrow(ValidationError);
  });

  it('keeps `.strict()` so typos adjacent to valid catalog_mode are rejected', () => {
    expect(() =>
      validatePatchDoctorSettings({ catalog_mode: 'single_fee', catalogMode: 'x' })
    ).toThrow(ValidationError);
  });
});

// ---------------------------------------------------------------------------
// Plan 03 · Task 09 · computeSingleFeeCatalogSyncUpdate (PATCH trigger matrix)
// ---------------------------------------------------------------------------

describe('computeSingleFeeCatalogSyncUpdate (Plan 03 · Task 09)', () => {
  describe('no-op cases (didSync=false)', () => {
    it('skips when caller explicitly supplies service_offerings_json (caller wins)', () => {
      const result = computeSingleFeeCatalogSyncUpdate({
        doctorId,
        payload: {
          catalog_mode: 'single_fee',
          service_offerings_json: { version: 1, services: [] },
        },
        existingRow: existingRow(),
      });
      expect(result.didSync).toBe(false);
      expect(result.newServiceOfferingsJson).toBeNull();
    });

    it('skips when effective mode is multi_service', () => {
      const result = computeSingleFeeCatalogSyncUpdate({
        doctorId,
        payload: { catalog_mode: 'multi_service', appointment_fee_minor: 9999 },
        existingRow: existingRow({ catalog_mode: 'multi_service' }),
      });
      expect(result.didSync).toBe(false);
    });

    it('skips when effective mode is null', () => {
      const result = computeSingleFeeCatalogSyncUpdate({
        doctorId,
        payload: { appointment_fee_minor: 9999 },
        existingRow: existingRow({ catalog_mode: null }),
      });
      expect(result.didSync).toBe(false);
    });

    it('skips when single_fee but nothing relevant changed', () => {
      const result = computeSingleFeeCatalogSyncUpdate({
        doctorId,
        payload: { practice_name: 'New Name' },
        existingRow: existingRow({ catalog_mode: 'single_fee' }),
      });
      expect(result.didSync).toBe(false);
    });

    it('skips when appointment_fee_minor in payload equals existing value', () => {
      const result = computeSingleFeeCatalogSyncUpdate({
        doctorId,
        payload: { appointment_fee_minor: 50000 },
        existingRow: existingRow({
          catalog_mode: 'single_fee',
          appointment_fee_minor: 50000,
        }),
      });
      expect(result.didSync).toBe(false);
    });

    it('skips when consultation_types in payload equals existing value', () => {
      const result = computeSingleFeeCatalogSyncUpdate({
        doctorId,
        payload: { consultation_types: 'Video only' },
        existingRow: existingRow({
          catalog_mode: 'single_fee',
          consultation_types: 'Video only',
        }),
      });
      expect(result.didSync).toBe(false);
    });
  });

  describe('Trigger A: mode flip to single_fee', () => {
    it('rebuilds catalog and backs up prior service_offerings_json', () => {
      const priorCatalog = {
        version: 1,
        services: [{ service_id: 'xxx', service_key: 'general' }],
      };
      const result = computeSingleFeeCatalogSyncUpdate({
        doctorId,
        payload: { catalog_mode: 'single_fee' },
        existingRow: existingRow({
          catalog_mode: 'multi_service',
          appointment_fee_minor: 75000,
          consultation_types: 'Video, Text',
          practice_name: 'Test Clinic',
          service_offerings_json: priorCatalog as never,
        }),
      });
      expect(result.didSync).toBe(true);
      expect(result.newServiceOfferingsJson).not.toBeNull();
      const json = result.newServiceOfferingsJson as Record<string, unknown>;
      expect(json.version).toBe(1);
      expect(Array.isArray(json.services)).toBe(true);
      expect((json.services as unknown[]).length).toBe(1);
      expect(json[SINGLE_FEE_BACKUP_KEY]).toEqual(priorCatalog);
      const services = json.services as Array<{ service_key: string }>;
      expect(services[0].service_key).toBe(SINGLE_FEE_SERVICE_KEY);
    });

    it('backs up null when there was no prior catalog on the mode flip', () => {
      const result = computeSingleFeeCatalogSyncUpdate({
        doctorId,
        payload: { catalog_mode: 'single_fee' },
        existingRow: existingRow({
          catalog_mode: null,
          service_offerings_json: null,
        }),
      });
      expect(result.didSync).toBe(true);
      const json = result.newServiceOfferingsJson as Record<string, unknown>;
      // null backup → key is intentionally omitted by buildSingleFeePersistedJson
      expect(SINGLE_FEE_BACKUP_KEY in json).toBe(false);
    });

    it('mode flip with NULL existing row (first-ever write) still rebuilds', () => {
      const result = computeSingleFeeCatalogSyncUpdate({
        doctorId,
        payload: {
          catalog_mode: 'single_fee',
          appointment_fee_minor: 40000,
          consultation_types: 'Text only',
        },
        existingRow: null,
      });
      expect(result.didSync).toBe(true);
      const json = result.newServiceOfferingsJson as Record<string, unknown>;
      expect(json.version).toBe(1);
    });
  });

  describe('Trigger B: appointment_fee_minor change while in single_fee', () => {
    it('rebuilds catalog and preserves existing backup, does NOT overwrite with current catalog', () => {
      const originalBackup = { version: 1, services: [{ service_key: 'old' }] };
      const currentCatalog = {
        ...buildSingleFeeCatalog({
          doctor_id: doctorId,
          appointment_fee_minor: 50000,
          consultation_types: null,
          practice_name: null,
        }),
        [SINGLE_FEE_BACKUP_KEY]: originalBackup,
      };
      const result = computeSingleFeeCatalogSyncUpdate({
        doctorId,
        payload: { appointment_fee_minor: 99999 },
        existingRow: existingRow({
          catalog_mode: 'single_fee',
          appointment_fee_minor: 50000,
          service_offerings_json: currentCatalog as never,
        }),
      });
      expect(result.didSync).toBe(true);
      const json = result.newServiceOfferingsJson as Record<string, unknown>;
      expect(json[SINGLE_FEE_BACKUP_KEY]).toEqual(originalBackup);
    });

    it('no backup on prior row → keeps backup absent on rebuild', () => {
      const currentCatalog = buildSingleFeeCatalog({
        doctor_id: doctorId,
        appointment_fee_minor: 50000,
        consultation_types: null,
        practice_name: null,
      });
      const result = computeSingleFeeCatalogSyncUpdate({
        doctorId,
        payload: { appointment_fee_minor: 60000 },
        existingRow: existingRow({
          catalog_mode: 'single_fee',
          appointment_fee_minor: 50000,
          service_offerings_json: currentCatalog as never,
        }),
      });
      expect(result.didSync).toBe(true);
      const json = result.newServiceOfferingsJson as Record<string, unknown>;
      expect(SINGLE_FEE_BACKUP_KEY in json).toBe(false);
    });
  });

  describe('Trigger C: consultation_types change while in single_fee', () => {
    it('rebuilds with new allowed modalities', () => {
      const result = computeSingleFeeCatalogSyncUpdate({
        doctorId,
        payload: { consultation_types: 'Video only' },
        existingRow: existingRow({
          catalog_mode: 'single_fee',
          appointment_fee_minor: 50000,
          consultation_types: 'Text, Voice, Video',
        }),
      });
      expect(result.didSync).toBe(true);
      const json = result.newServiceOfferingsJson as Record<string, unknown>;
      const services = json.services as Array<{
        modalities: Record<string, { enabled: boolean } | undefined>;
      }>;
      // Disabled modalities are OMITTED (not set to enabled=false) — keeps the
      // catalog compact and matches how the rest of the system represents
      // opted-out channels.
      expect(services[0].modalities.video?.enabled).toBe(true);
      expect(services[0].modalities.text).toBeUndefined();
      expect(services[0].modalities.voice).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Plan 03 · Task 09 · ensureSingleFeeCatalogMaterialized (lazy back-fill on GET)
// ---------------------------------------------------------------------------

describe('ensureSingleFeeCatalogMaterialized (Plan 03 · Task 09)', () => {
  function rowFixture(
    overrides: Partial<DoctorSettingsRow> = {}
  ): DoctorSettingsRow {
    return {
      doctor_id: doctorId,
      appointment_fee_minor: 50000,
      appointment_fee_currency: 'INR',
      country: 'IN',
      practice_name: null,
      timezone: 'Asia/Kolkata',
      slot_interval_minutes: 15,
      max_advance_booking_days: 90,
      min_advance_hours: 0,
      business_hours_summary: null,
      cancellation_policy_hours: null,
      max_appointments_per_day: null,
      booking_buffer_minutes: null,
      welcome_message: null,
      specialty: null,
      address_summary: null,
      consultation_types: null,
      default_notes: null,
      catalog_mode: 'single_fee',
      service_offerings_json: null,
      created_at: '2026-01-30T00:00:00Z',
      updated_at: '2026-01-30T00:00:00Z',
      ...overrides,
    } as DoctorSettingsRow;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns row untouched when catalog_mode is not single_fee', async () => {
    const row = rowFixture({ catalog_mode: 'multi_service' });
    const result = await ensureSingleFeeCatalogMaterialized(row);
    expect(result).toBe(row);
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('returns row untouched when service_offerings_json is already present', async () => {
    const row = rowFixture({
      service_offerings_json: { version: 1, services: [] } as never,
    });
    const result = await ensureSingleFeeCatalogMaterialized(row);
    expect(result).toBe(row);
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('returns row untouched when doctor_id is missing', async () => {
    const row = rowFixture({ doctor_id: '' });
    const result = await ensureSingleFeeCatalogMaterialized(row);
    expect(result).toBe(row);
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('materializes catalog and persists with optimistic concurrency guard', async () => {
    const row = rowFixture({
      appointment_fee_minor: 75000,
      consultation_types: 'Video only',
      practice_name: 'Test Clinic',
    });
    const mockSupabase = createMockSupabase({ data: null, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

    const result = await ensureSingleFeeCatalogMaterialized(row);

    expect(result).not.toBe(row);
    expect(result.service_offerings_json).not.toBeNull();
    const json = result.service_offerings_json as unknown as Record<string, unknown>;
    expect(json.version).toBe(1);
    expect(Array.isArray(json.services)).toBe(true);

    expect(mockSupabase.from).toHaveBeenCalledWith('doctor_settings');
    expect(mockSupabase.chain.update).toHaveBeenCalledTimes(1);
    expect(mockSupabase.updateChain.eq).toHaveBeenCalledWith('doctor_id', doctorId);
    // Optimistic concurrency: only write if service_offerings_json is still NULL.
    expect(mockSupabase.updateChain.is).toHaveBeenCalledWith(
      'service_offerings_json',
      null
    );
  });

  it('returns materialized row even when persist fails (best-effort; next GET will retry)', async () => {
    const row = rowFixture();
    const mockSupabase = createMockSupabase(
      { data: null, error: null },
      { error: { message: 'persist failed' } }
    );
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

    const result = await ensureSingleFeeCatalogMaterialized(row);

    expect(result.service_offerings_json).not.toBeNull();
  });

  it('still returns materialized row when supabase client is null (no DB write attempted)', async () => {
    const row = rowFixture({ doctor_id: secondDoctorId });
    mockedDb.getSupabaseAdminClient.mockReturnValue(null as never);

    const result = await ensureSingleFeeCatalogMaterialized(row);

    expect(result.service_offerings_json).not.toBeNull();
  });
});
