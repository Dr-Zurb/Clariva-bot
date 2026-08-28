/**
 * Dashboard Onboarding Service unit tests (doctor-onboarding-v1 · onb-01).
 *
 * Covers: each go-live signal independently, complete only when all true,
 * fresh doctor (no settings) → all false without throw, doctor-scoped
 * availability query.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  getOnboardingStatus,
  isPracticeInfoSet,
  isPricingSet,
} from '../../../src/services/dashboard-onboarding-service';
import * as database from '../../../src/config/database';
import * as doctorSettings from '../../../src/services/doctor-settings-service';
import * as igConnect from '../../../src/services/instagram-connect-service';
import type { DoctorSettingsRow } from '../../../src/types/doctor-settings';

jest.mock('../../../src/config/database');
jest.mock('../../../src/services/doctor-settings-service');
jest.mock('../../../src/services/instagram-connect-service');

const mockedDb = database as jest.Mocked<typeof database>;
const mockedSettings = doctorSettings as jest.Mocked<typeof doctorSettings>;
const mockedIg = igConnect as jest.Mocked<typeof igConnect>;

const doctorId = '550e8400-e29b-41d4-a716-446655440000';
const correlationId = 'corr-onboarding';

function makeAvailabilityAdmin(rows: unknown[]) {
  const eqCalls: Array<[string, unknown]> = [];
  const chain: Record<string, unknown> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn((col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return chain;
    }),
    limit: jest.fn().mockReturnThis(),
  };
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve({ data: rows, error: null }).then(resolve);

  const admin = {
    from: jest.fn((table: string) => {
      if (table !== 'availability') {
        throw new Error(`unexpected table ${table}`);
      }
      return chain;
    }),
  };
  return { admin, eqCalls };
}

function baseSettings(
  overrides: Partial<DoctorSettingsRow> = {}
): DoctorSettingsRow {
  return {
    doctor_id: doctorId,
    appointment_fee_minor: null,
    appointment_fee_currency: 'INR',
    country: null,
    practice_name: null,
    timezone: 'Asia/Kolkata',
    slot_interval_minutes: 30,
    max_advance_booking_days: 30,
    min_advance_hours: 1,
    business_hours_summary: null,
    cancellation_policy_hours: null,
    max_appointments_per_day: null,
    booking_buffer_minutes: null,
    welcome_message: null,
    specialty: null,
    address_summary: null,
    consultation_types: null,
    service_offerings_json: null,
    default_notes: null,
    catalog_mode: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as DoctorSettingsRow;
}

beforeEach(() => {
  jest.resetAllMocks();
  mockedIg.getConnectionStatus.mockResolvedValue({
    connected: false,
    username: null,
  });
  mockedSettings.getDoctorSettings.mockResolvedValue(null);
  const { admin } = makeAvailabilityAdmin([]);
  mockedDb.getSupabaseAdminClient.mockReturnValue(
    admin as unknown as ReturnType<typeof database.getSupabaseAdminClient>
  );
});

describe('isPracticeInfoSet / isPricingSet helpers', () => {
  it('practice: rejects null/blank, accepts non-empty', () => {
    expect(isPracticeInfoSet(null)).toBe(false);
    expect(isPracticeInfoSet('  ')).toBe(false);
    expect(isPracticeInfoSet('Halo Clinic')).toBe(true);
  });

  it('pricing: single_fee needs fee; multi_service needs ≥1 offering', () => {
    expect(isPricingSet(null)).toBe(false);
    expect(isPricingSet(baseSettings({ catalog_mode: null }))).toBe(false);
    expect(
      isPricingSet(
        baseSettings({ catalog_mode: 'single_fee', appointment_fee_minor: null })
      )
    ).toBe(false);
    expect(
      isPricingSet(
        baseSettings({ catalog_mode: 'single_fee', appointment_fee_minor: 50000 })
      )
    ).toBe(true);
    expect(
      isPricingSet(
        baseSettings({
          catalog_mode: 'multi_service',
          service_offerings_json: { version: 1, services: [] } as never,
        })
      )
    ).toBe(false);
    // multi_service + ≥1 offering is delegated to teleconsultCatalogServiceRowCount;
    // covered via that util's own tests. Here we only assert the mode gate.
  });
});

describe('getOnboardingStatus', () => {
  it('fresh doctor → all false, no throw', async () => {
    const status = await getOnboardingStatus({ doctorId, correlationId });
    expect(status).toEqual({
      instagramConnected: false,
      practiceInfoSet: false,
      pricingSet: false,
      availabilitySet: false,
      complete: false,
    });
  });

  it('instagramConnected true when IG row exists', async () => {
    mockedIg.getConnectionStatus.mockResolvedValue({
      connected: true,
      username: 'doc',
    });
    const status = await getOnboardingStatus({ doctorId, correlationId });
    expect(status.instagramConnected).toBe(true);
    expect(status.complete).toBe(false);
    expect(mockedIg.getConnectionStatus).toHaveBeenCalledWith(
      doctorId,
      correlationId
    );
  });

  it('practiceInfoSet true when practice_name set', async () => {
    mockedSettings.getDoctorSettings.mockResolvedValue(
      baseSettings({ practice_name: 'Halo Clinic' })
    );
    const status = await getOnboardingStatus({ doctorId, correlationId });
    expect(status.practiceInfoSet).toBe(true);
    expect(status.pricingSet).toBe(false);
  });

  it('pricingSet true for single_fee with fee', async () => {
    mockedSettings.getDoctorSettings.mockResolvedValue(
      baseSettings({
        practice_name: 'Clinic',
        catalog_mode: 'single_fee',
        appointment_fee_minor: 1000,
      })
    );
    const status = await getOnboardingStatus({ doctorId, correlationId });
    expect(status.pricingSet).toBe(true);
  });

  it('availabilitySet true when ≥1 row; scopes by doctor_id', async () => {
    const { admin, eqCalls } = makeAvailabilityAdmin([{ id: 'av-1' }]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );
    const status = await getOnboardingStatus({ doctorId, correlationId });
    expect(status.availabilitySet).toBe(true);
    expect(eqCalls).toContainEqual(['doctor_id', doctorId]);
  });

  it('complete only when all four true', async () => {
    mockedIg.getConnectionStatus.mockResolvedValue({
      connected: true,
      username: 'doc',
    });
    mockedSettings.getDoctorSettings.mockResolvedValue(
      baseSettings({
        practice_name: 'Halo Clinic',
        catalog_mode: 'single_fee',
        appointment_fee_minor: 50000,
      })
    );
    const { admin } = makeAvailabilityAdmin([{ id: 'av-1' }]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      admin as unknown as ReturnType<typeof database.getSupabaseAdminClient>
    );

    const status = await getOnboardingStatus({ doctorId, correlationId });
    expect(status).toEqual({
      instagramConnected: true,
      practiceInfoSet: true,
      pricingSet: true,
      availabilitySet: true,
      complete: true,
    });
  });
});
