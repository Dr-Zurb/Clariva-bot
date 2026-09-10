import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

import {
  acceptDoctorRecordingAttestation,
  assertDoctorRecordingAttestation,
  getDoctorRecordingAttestationStatus,
} from '../../../src/services/doctor-recording-attestation-service';
import { RECORDING_ATTESTATION_POLICY_VERSION } from '../../../src/constants/recording-attestation';
import * as database from '../../../src/config/database';
import { DoctorRecordingAttestationRequiredError } from '../../../src/utils/errors';

const mockedDb = database as jest.Mocked<typeof database>;
const DOCTOR_ID = '11111111-1111-4111-8111-111111111111';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    doctor_id: DOCTOR_ID,
    policy_version: RECORDING_ATTESTATION_POLICY_VERSION,
    accepted_at: '2026-08-23T10:00:00.000Z',
    created_at: '2026-08-23T10:00:00.000Z',
    updated_at: '2026-08-23T10:00:00.000Z',
    ...overrides,
  };
}

function mountSelect(result: { data: unknown; error: { message: string } | null }) {
  const maybeSingle = jest.fn(async () => result);
  const eqVersion = jest.fn().mockReturnValue({ maybeSingle });
  const eqDoctor = jest.fn().mockReturnValue({ eq: eqVersion });
  const select = jest.fn().mockReturnValue({ eq: eqDoctor });
  mockedDb.getSupabaseAdminClient.mockReturnValue({
    from: () => ({ select }),
  } as never);
  return { select, eqDoctor, eqVersion };
}

function mountInsert(result: {
  data: unknown;
  error: { message: string; code?: string } | null;
}) {
  const maybeSingle = jest.fn(async () => result);
  const select = jest.fn().mockReturnValue({ maybeSingle });
  const insert = jest.fn().mockReturnValue({ select });
  mockedDb.getSupabaseAdminClient.mockReturnValue({
    from: () => ({ insert, select }),
  } as never);
  return { insert };
}

describe('doctor-recording-attestation-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns not-accepted when no row exists for the active version', async () => {
    mountSelect({ data: null, error: null });
    const status = await getDoctorRecordingAttestationStatus(DOCTOR_ID);
    expect(status.accepted).toBe(false);
    expect(status.acceptedAt).toBeNull();
    expect(status.policyVersion).toBe(RECORDING_ATTESTATION_POLICY_VERSION);
    expect(status.clauses).toHaveLength(6);
  });

  it('returns accepted when a row exists at the active version', async () => {
    mountSelect({ data: row(), error: null });
    const status = await getDoctorRecordingAttestationStatus(DOCTOR_ID);
    expect(status.accepted).toBe(true);
    expect(status.acceptedAt).toBe('2026-08-23T10:00:00.000Z');
  });

  it('does not treat an older-version-only row as accepted (lookup is version-scoped)', async () => {
    mountSelect({ data: null, error: null });
    const status = await getDoctorRecordingAttestationStatus(DOCTOR_ID);
    expect(status.accepted).toBe(false);
  });

  it('assert throws when not accepted and passes when accepted', async () => {
    mountSelect({ data: null, error: null });
    await expect(assertDoctorRecordingAttestation(DOCTOR_ID)).rejects.toBeInstanceOf(
      DoctorRecordingAttestationRequiredError
    );

    mountSelect({ data: row(), error: null });
    await expect(assertDoctorRecordingAttestation(DOCTOR_ID)).resolves.toBeUndefined();
  });

  it('accept inserts one row and a unique conflict returns the original accepted_at', async () => {
    const first = mountInsert({ data: row(), error: null });
    const created = await acceptDoctorRecordingAttestation(DOCTOR_ID);
    expect(first.insert).toHaveBeenCalledWith({
      doctor_id: DOCTOR_ID,
      policy_version: RECORDING_ATTESTATION_POLICY_VERSION,
    });
    expect(created.acceptedAt).toBe('2026-08-23T10:00:00.000Z');

    const maybeSingle = jest.fn(async () => ({
      data: null,
      error: { message: 'duplicate', code: '23505' },
    }));
    const selectAfterInsert = jest.fn().mockReturnValue({ maybeSingle });
    const insert = jest.fn().mockReturnValue({ select: selectAfterInsert });
    const existingMaybe = jest.fn(async () => ({ data: row(), error: null }));
    const eqVersion = jest.fn().mockReturnValue({ maybeSingle: existingMaybe });
    const eqDoctor = jest.fn().mockReturnValue({ eq: eqVersion });
    const selectExisting = jest.fn().mockReturnValue({ eq: eqDoctor });
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: () => ({ insert, select: selectExisting }),
    } as never);

    const again = await acceptDoctorRecordingAttestation(DOCTOR_ID);
    expect(again.acceptedAt).toBe('2026-08-23T10:00:00.000Z');
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
