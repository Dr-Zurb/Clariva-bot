/**
 * Patient Service unit tests — listPatientsForDoctor (MRN gate, merged exclusion).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  ensurePatientMrnIfEligible,
  listPatientsForDoctor,
} from '../../../src/services/patient-service';
import * as database from '../../../src/config/database';
import * as auditLogger from '../../../src/utils/audit-logger';

jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/audit-logger');

const mockedDb = database as jest.Mocked<typeof database>;
const mockedAudit = auditLogger as jest.Mocked<typeof auditLogger>;

const doctorId = '550e8400-e29b-41d4-a716-446655440000';
const correlationId = 'corr-patient-list';

const pidRegistered = '11111111-1111-1111-1111-111111111111';
const pidUnregistered = '22222222-2222-2222-2222-222222222222';
const pidMerged = '33333333-3333-3333-3333-333333333333';

function createSequentialSupabase(
  responses: Array<{ data: unknown; error: unknown }>
) {
  let idx = 0;
  const getNext = () => responses[idx++] ?? { data: null, error: null };

  const makeChain = () => {
    const chain: Record<string, unknown> = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
    };
    (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
      Promise.resolve(getNext()).then(resolve);
    return chain;
  };

  return { from: jest.fn().mockImplementation(() => makeChain()) };
}

describe('patient-service listPatientsForDoctor', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (mockedAudit.logDataAccess as jest.Mock) = jest
      .fn()
      .mockImplementation(() => Promise.resolve());
  });

  it('returns empty when no appointment or conversation patient ids', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase([
        { data: [], error: null },
        { data: [], error: null },
      ]) as never
    );

    const result = await listPatientsForDoctor(doctorId, correlationId);
    expect(result).toEqual([]);
    expect(mockedAudit.logDataAccess).not.toHaveBeenCalled();
  });

  it('excludes patients without MRN; includes those with MRN', async () => {
    const created = '2025-01-01T00:00:00.000Z';
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase([
        { data: [{ patient_id: pidRegistered }, { patient_id: pidUnregistered }], error: null },
        { data: [], error: null },
        {
          data: [
            {
              id: pidRegistered,
              name: 'Alice',
              phone: '+15550001111',
              age: 40,
              gender: 'female',
              medical_record_number: 'P-00001',
              created_at: created,
            },
            {
              id: pidUnregistered,
              name: 'Bob',
              phone: '+15550002222',
              age: 35,
              gender: 'male',
              medical_record_number: null,
              created_at: created,
            },
          ],
          error: null,
        },
        {
          data: [
            { patient_id: pidRegistered, appointment_date: '2025-06-01' },
            { patient_id: pidUnregistered, appointment_date: '2025-05-01' },
          ],
          error: null,
        },
      ]) as never
    );

    const result = await listPatientsForDoctor(doctorId, correlationId);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(pidRegistered);
    expect(result[0].medical_record_number).toBe('P-00001');
    expect(mockedAudit.logDataAccess).toHaveBeenCalledWith(
      correlationId,
      doctorId,
      'patient',
      undefined
    );
  });

  it('still excludes merged patients even if they have MRN', async () => {
    const created = '2025-01-01T00:00:00.000Z';
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase([
        { data: [{ patient_id: pidMerged }], error: null },
        { data: [], error: null },
        {
          data: [
            {
              id: pidMerged,
              name: '[Merged]',
              phone: `merged-${pidMerged}`,
              medical_record_number: 'P-00999',
              created_at: created,
            },
          ],
          error: null,
        },
        { data: [{ patient_id: pidMerged, appointment_date: '2025-06-01' }], error: null },
      ]) as never
    );

    const result = await listPatientsForDoctor(doctorId, correlationId);
    expect(result).toEqual([]);
  });

  it('returns empty when all candidates lack MRN', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase([
        { data: [{ patient_id: pidUnregistered }], error: null },
        { data: [], error: null },
        {
          data: [
            {
              id: pidUnregistered,
              name: 'Prepay',
              phone: '+15550003333',
              medical_record_number: null,
              created_at: '2025-01-01T00:00:00.000Z',
            },
          ],
          error: null,
        },
        { data: [{ patient_id: pidUnregistered, appointment_date: '2025-06-01' }], error: null },
      ]) as never
    );

    const result = await listPatientsForDoctor(doctorId, correlationId);
    expect(result).toEqual([]);
  });

  it('throws when admin client is null', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null);

    await expect(listPatientsForDoctor(doctorId, correlationId)).rejects.toThrow(
      'Service role client not available'
    );
  });
});

describe('ensurePatientMrnIfEligible', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (mockedAudit.logDataModification as jest.Mock) = jest
      .fn()
      .mockImplementation(() => Promise.resolve());
  });

  it('assigns MRN via RPC when patient has no MRN (same path as payment success)', async () => {
    const pid = '77777777-7777-7777-7777-777777777777';
    let rpcCalls = 0;
    const admin = {
      from: jest.fn().mockImplementation((table: unknown) => {
        if (table === 'patients') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest
              .fn()
              .mockResolvedValue({ data: { id: pid, medical_record_number: null }, error: null } as never),
          };
        }
        return {};
      }),
      rpc: jest.fn().mockImplementation(() => {
        rpcCalls += 1;
        return Promise.resolve({ data: 'P-00042', error: null });
      }),
    };
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const mrn = await ensurePatientMrnIfEligible(pid, correlationId);
    expect(mrn).toBe('P-00042');
    expect(rpcCalls).toBe(1);
    expect(admin.rpc).toHaveBeenCalledWith('assign_patient_mrn', { p_patient_id: pid });
  });

  it('returns existing MRN without calling RPC', async () => {
    const pid = '88888888-8888-8888-8888-888888888888';
    const admin = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({
            data: { id: pid, medical_record_number: 'P-EXIST' },
            error: null,
          } as never),
      }),
      rpc: jest.fn(),
    };
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const mrn = await ensurePatientMrnIfEligible(pid, correlationId);
    expect(mrn).toBe('P-EXIST');
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});
