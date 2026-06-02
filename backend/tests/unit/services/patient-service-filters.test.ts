/**
 * Filtered patients list service tests (pr-02).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { listPatientsForDoctorFiltered } from '../../../src/services/patient-service';
import * as database from '../../../src/config/database';
import * as auditLogger from '../../../src/utils/audit-logger';

jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/audit-logger');

const mockedDb = database as jest.Mocked<typeof database>;
const mockedAudit = auditLogger as jest.Mocked<typeof auditLogger>;

const doctorId = '550e8400-e29b-41d4-a716-446655440000';
const correlationId = 'corr-filtered-list';

const pidA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const pidB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

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

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function baseListResponses() {
  const createdRecent = isoDaysAgo(10);
  const createdOld = isoDaysAgo(120);
  return [
    { data: [{ patient_id: pidA }, { patient_id: pidB }], error: null },
    { data: [], error: null },
    {
      data: [
        {
          id: pidA,
          name: 'Alice Smith',
          phone: '+15550001111',
          medical_record_number: 'P-00001',
          patient_tag: 'VIP',
          platform_external_id: 'ig_alice',
          created_at: createdRecent,
        },
        {
          id: pidB,
          name: 'Bob Jones',
          phone: '+15550002222',
          medical_record_number: 'P-00002',
          patient_tag: null,
          platform_external_id: null,
          created_at: createdOld,
        },
      ],
      error: null,
    },
    {
      data: [
        { patient_id: pidA, appointment_date: isoDaysAgo(14) },
        { patient_id: pidB, appointment_date: isoDaysAgo(200) },
      ],
      error: null,
    },
  ];
}

describe('listPatientsForDoctorFiltered', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (mockedAudit.logDataAccess as jest.Mock) = jest
      .fn()
      .mockImplementation(() => Promise.resolve());
  });

  it('applies q filter and pagination metadata', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase(baseListResponses()) as never
    );

    const result = await listPatientsForDoctorFiltered(
      doctorId,
      { q: 'alice', page: 1, pageSize: 20 },
      correlationId
    );

    expect(result.patients).toHaveLength(1);
    expect(result.patients[0].name).toBe('Alice Smith');
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it('filters untagged segment', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase(baseListResponses()) as never
    );

    const result = await listPatientsForDoctorFiltered(
      doctorId,
      { segment: 'untagged', page: 1, pageSize: 50 },
      correlationId
    );

    expect(result.patients).toHaveLength(1);
    expect(result.patients[0].id).toBe(pidB);
  });

  it('filters active-90d by last appointment', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase(baseListResponses()) as never
    );

    const result = await listPatientsForDoctorFiltered(
      doctorId,
      { segment: 'active-90d', page: 1, pageSize: 50 },
      correlationId
    );

    expect(result.patients.map((p) => p.id)).toEqual([pidA]);
  });

  it('sorts by name ascending', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase(baseListResponses()) as never
    );

    const result = await listPatientsForDoctorFiltered(
      doctorId,
      { sort: 'name-asc', page: 1, pageSize: 50 },
      correlationId
    );

    expect(result.patients.map((p) => p.name)).toEqual(['Alice Smith', 'Bob Jones']);
  });
});
