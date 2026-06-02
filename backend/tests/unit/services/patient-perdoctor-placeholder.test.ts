/**
 * rcp-26: findOrCreatePlaceholderPatient — per-doctor lookup, insert, and 23505 retry.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { findOrCreatePlaceholderPatient } from '../../../src/services/patient-service';
import * as database from '../../../src/config/database';
import * as auditLogger from '../../../src/utils/audit-logger';

jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/audit-logger');

const mockedDb = database as jest.Mocked<typeof database>;
const mockedAudit = auditLogger as jest.Mocked<typeof auditLogger>;

const doctorA = '550e8400-e29b-41d4-a716-446655440000';
const doctorB = '660e8400-e29b-41d4-a716-446655440001';
const senderId = '987654321012345';
const correlationId = 'corr-perdoctor-create';

function makePatient(id: string, doctorId: string) {
  return {
    id,
    name: 'Placeholder',
    phone: `placeholder-instagram-${senderId}`,
    doctor_id: doctorId,
    platform: 'instagram',
    platform_external_id: senderId,
    consent_status: 'pending',
    medical_record_number: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function createSequentialSupabase(
  responses: Array<{ data: unknown; error: unknown }>
) {
  let idx = 0;
  const getNext = () => responses[idx++] ?? { data: null, error: null };

  const makeChain = () => {
    const chain: Record<string, unknown> = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockImplementation(() => Promise.resolve(getNext())),
      insert: jest.fn().mockReturnThis(),
    };
    (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
      Promise.resolve(getNext()).then(resolve);
    return chain;
  };

  return { from: jest.fn().mockImplementation(() => makeChain()) };
}

describe('findOrCreatePlaceholderPatient (rcp-26 per-doctor)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (mockedAudit.logDataModification as jest.Mock) = jest
      .fn()
      .mockImplementation(() => Promise.resolve());
  });

  it('returns existing per-doctor row without insert', async () => {
    const existing = makePatient('patient-a', doctorA);
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase([{ data: existing, error: null }]) as never
    );

    const result = await findOrCreatePlaceholderPatient(
      doctorA,
      'instagram',
      senderId,
      correlationId
    );

    expect(result).toEqual(existing);
    expect(mockedAudit.logDataModification).not.toHaveBeenCalled();
  });

  it('inserts per-doctor row with doctor_id on miss', async () => {
    const created = makePatient('patient-new', doctorA);
    const client = createSequentialSupabase([
      { data: null, error: { code: 'PGRST116' } },
      { data: created, error: null },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await findOrCreatePlaceholderPatient(
      doctorA,
      'instagram',
      senderId,
      correlationId
    );

    expect(result).toEqual(created);
    expect(result.doctor_id).toBe(doctorA);
    expect(mockedAudit.logDataModification).toHaveBeenCalledWith(
      correlationId,
      undefined,
      'create',
      'patient',
      created.id
    );
  });

  it('supports two per-doctor rows for the same sender under different doctors', async () => {
    const patientA = makePatient('patient-a', doctorA);
    const patientB = makePatient('patient-b', doctorB);

    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase([
        { data: null, error: { code: 'PGRST116' } },
        { data: patientA, error: null },
      ]) as never
    );
    const resultA = await findOrCreatePlaceholderPatient(
      doctorA,
      'instagram',
      senderId,
      correlationId
    );

    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase([
        { data: null, error: { code: 'PGRST116' } },
        { data: patientB, error: null },
      ]) as never
    );
    const resultB = await findOrCreatePlaceholderPatient(
      doctorB,
      'instagram',
      senderId,
      correlationId
    );

    expect(resultA.id).not.toBe(resultB.id);
    expect(resultA.doctor_id).toBe(doctorA);
    expect(resultB.doctor_id).toBe(doctorB);
    expect(resultA.consent_status).toBe('pending');
    expect(resultB.consent_status).toBe('pending');
  });

  it('23505 race retry re-queries per-doctor (not global)', async () => {
    const raced = makePatient('patient-raced', doctorA);
    jest.useFakeTimers();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase([
        { data: null, error: { code: 'PGRST116' } },
        { data: null, error: { code: '23505', message: 'duplicate key' } },
        { data: null, error: { code: 'PGRST116' } },
        { data: raced, error: null },
      ]) as never
    );

    const promise = findOrCreatePlaceholderPatient(
      doctorA,
      'instagram',
      senderId,
      correlationId
    );
    await jest.advanceTimersByTimeAsync(200);
    const result = await promise;
    jest.useRealTimers();

    expect(result).toEqual(raced);
    expect(mockedAudit.logDataModification).not.toHaveBeenCalled();
  });
});
