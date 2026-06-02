/**
 * rcp-27: Doctor-scoped patient search must not surface another clinic's row for a shared PSID.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { listPatientsForDoctorFiltered } from '../../../src/services/patient-service';
import * as database from '../../../src/config/database';
import * as auditLogger from '../../../src/utils/audit-logger';

jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/audit-logger');

const mockedDb = database as jest.Mocked<typeof database>;
const mockedAudit = auditLogger as jest.Mocked<typeof auditLogger>;

const doctorA = '550e8400-e29b-41d4-a716-446655440000';
const doctorB = '660e8400-e29b-41d4-a716-446655440001';
const correlationId = 'corr-rcp-27-search';
const sharedPsid = '987654321012345';
const patientA = '11111111-1111-1111-1111-111111111111';
const patientB = '22222222-2222-2222-2222-222222222222';

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
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
    };
    (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
      Promise.resolve(getNext()).then(resolve);
    return chain;
  };

  return { from: jest.fn().mockImplementation(() => makeChain()) };
}

function doctorALinkedResponses() {
  return [
    { data: [{ patient_id: patientA }], error: null },
    { data: [{ patient_id: patientA }], error: null },
    {
      data: [
        {
          id: patientA,
          name: 'Clinic A Patient',
          phone: '+15550001111',
          medical_record_number: 'P-00001',
          patient_tag: null,
          platform: 'instagram',
          platform_external_id: sharedPsid,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    },
    { data: [{ patient_id: patientA, appointment_date: '2026-01-15T00:00:00.000Z' }], error: null },
  ];
}

function doctorBLinkedResponses() {
  return [
    { data: [{ patient_id: patientB }], error: null },
    { data: [{ patient_id: patientB }], error: null },
    {
      data: [
        {
          id: patientB,
          name: 'Clinic B Patient',
          phone: '+15550002222',
          medical_record_number: 'P-00002',
          patient_tag: null,
          platform: 'instagram',
          platform_external_id: sharedPsid,
          created_at: '2026-01-02T00:00:00.000Z',
        },
      ],
      error: null,
    },
    { data: [{ patient_id: patientB, appointment_date: '2026-01-16T00:00:00.000Z' }], error: null },
  ];
}

describe('patient search PSID isolation (rcp-27)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (mockedAudit.logDataAccess as jest.Mock) = jest
      .fn()
      .mockImplementation(() => Promise.resolve());
  });

  it('doctorA search by shared PSID returns only doctorA linked row', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase(doctorALinkedResponses()) as never
    );

    const result = await listPatientsForDoctorFiltered(
      doctorA,
      { q: sharedPsid, page: 1, pageSize: 50 },
      correlationId
    );

    expect(result.patients).toHaveLength(1);
    expect(result.patients[0].id).toBe(patientA);
    expect(result.patients[0].name).toBe('Clinic A Patient');
  });

  it('doctorB search by shared PSID returns only doctorB linked row', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase(doctorBLinkedResponses()) as never
    );

    const result = await listPatientsForDoctorFiltered(
      doctorB,
      { q: sharedPsid, page: 1, pageSize: 50 },
      correlationId
    );

    expect(result.patients).toHaveLength(1);
    expect(result.patients[0].id).toBe(patientB);
    expect(result.patients[0].name).toBe('Clinic B Patient');
  });
});
