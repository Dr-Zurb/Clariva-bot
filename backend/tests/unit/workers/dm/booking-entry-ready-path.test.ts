/**
 * rcp-22: Shared ready-patient booking path helpers.
 */

import { describe, it, expect } from '@jest/globals';
import type { Patient } from '../../../../src/types/database';
import type { ReturningPatientProfile } from '../../../../src/types/returning-patient';
import {
  hydrateCollectedFieldNamesFromProfile,
  isPatientReadyForSlotLink,
  isReturningPatientReadyToSkipCollection,
} from '../../../../src/workers/dm/booking-entry-ready-path';

jest.mock('../../../../src/config/env', () => ({
  env: {
    RETURNING_PATIENT_MEMORY_ENABLED: false,
    LOG_LEVEL: 'info',
    NODE_ENV: 'test',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon',
  },
}));

jest.mock('../../../../src/services/slot-selection-service', () => ({
  buildBookingPageUrl: jest.fn(() => 'https://example.com/book'),
}));

jest.mock('../../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

function patient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'pat-1',
    name: 'Priya Sharma',
    phone: '+919876543210',
    consent_status: 'granted',
    medical_record_number: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function returningProfile(overrides: Partial<ReturningPatientProfile> = {}): ReturningPatientProfile {
  return {
    isReturning: true,
    hasGrantedConsent: true,
    consentStatus: 'granted',
    hasName: true,
    hasPhone: true,
    knownFieldKeys: ['name', 'phone', 'age', 'gender'],
    priorVisits: { attendedCount: 1 },
    ...overrides,
  };
}

describe('booking-entry-ready-path (rcp-22)', () => {
  it('isPatientReadyForSlotLink rejects placeholders', () => {
    expect(isPatientReadyForSlotLink(patient())).toBe(true);
    expect(isPatientReadyForSlotLink(patient({ name: 'Placeholder' }))).toBe(false);
    expect(isPatientReadyForSlotLink(patient({ phone: 'placeholder-instagram-1' }))).toBe(false);
    expect(isPatientReadyForSlotLink(patient({ consent_status: 'pending' }))).toBe(false);
  });

  it('isReturningPatientReadyToSkipCollection requires flag on + profile + patient row', () => {
    const { env } = jest.requireMock<{ env: { RETURNING_PATIENT_MEMORY_ENABLED: boolean } }>(
      '../../../../src/config/env'
    );
    env.RETURNING_PATIENT_MEMORY_ENABLED = true;
    expect(isReturningPatientReadyToSkipCollection(returningProfile(), patient())).toBe(true);
    expect(isReturningPatientReadyToSkipCollection(returningProfile({ hasName: false }), patient())).toBe(
      false
    );
    env.RETURNING_PATIENT_MEMORY_ENABLED = false;
    expect(isReturningPatientReadyToSkipCollection(returningProfile(), patient())).toBe(false);
  });

  it('hydrateCollectedFieldNamesFromProfile merges known keys with reason seed names only', () => {
    expect(hydrateCollectedFieldNamesFromProfile(returningProfile(), ['reason_for_visit'])).toEqual([
      'name',
      'phone',
      'age',
      'gender',
      'reason_for_visit',
    ]);
    expect(hydrateCollectedFieldNamesFromProfile(returningProfile(), [])).toEqual([
      'name',
      'phone',
      'age',
      'gender',
    ]);
  });
});
