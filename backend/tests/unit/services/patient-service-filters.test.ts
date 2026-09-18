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
      range: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
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

  it('ranks name matches ahead of relative-name matches for q', async () => {
    const created = isoDaysAgo(10);
    const responses = [
      { data: [{ patient_id: pidA }, { patient_id: pidB }], error: null },
      { data: [], error: null },
      { data: [], error: null },
      {
        data: [
          {
            id: pidB,
            name: 'Manjot Kaur',
            phone: '+15550002222',
            medical_record_number: 'P-00002',
            guardian_name: 'Jasbir Singh',
            created_at: created,
          },
          {
            id: pidA,
            name: 'Jasbir Kaur',
            phone: '+15550001111',
            medical_record_number: 'P-00001',
            guardian_name: 'Kewal Singh',
            created_at: created,
          },
        ],
        error: null,
      },
      { data: [], error: null },
    ];
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase(responses) as never
    );

    const result = await listPatientsForDoctorFiltered(
      doctorId,
      { q: 'jasbir', page: 1, pageSize: 20, sort: 'last-visit-desc' },
      correlationId
    );

    expect(result.patients.map((p) => p.name)).toEqual(['Jasbir Kaur', 'Manjot Kaur']);
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

  it('drops archived rows unless includeArchived is set', async () => {
    const responses = [
      ...baseListResponses().slice(0, 3),
      {
        data: [
          ...(baseListResponses()[3].data as Array<Record<string, unknown>>),
          {
            id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            name: 'Archived Patel',
            phone: '+15550003333',
            medical_record_number: 'P-00003',
            patient_tag: null,
            platform_external_id: null,
            created_at: isoDaysAgo(5),
            archived_at: '2026-08-23T10:00:00.000Z',
          },
        ],
        error: null,
      },
      baseListResponses()[4],
    ];

    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase(responses) as never
    );

    const hidden = await listPatientsForDoctorFiltered(
      doctorId,
      { page: 1, pageSize: 50 },
      correlationId
    );
    expect(hidden.patients.map((p) => p.name)).toEqual(['Alice Smith', 'Bob Jones']);

    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase(responses) as never
    );
    const shown = await listPatientsForDoctorFiltered(
      doctorId,
      { includeArchived: true, page: 1, pageSize: 50 },
      correlationId
    );
    expect(shown.patients.map((p) => p.name)).toEqual(
      expect.arrayContaining(['Alice Smith', 'Bob Jones', 'Archived Patel'])
    );
    expect(shown.patients.find((p) => p.name === 'Archived Patel')?.archived_at).toBeTruthy();
  });

  it('lean list sets last and next visit from the appointments pass', async () => {
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 7);
    const futureIso = future.toISOString();
    const lastIso = isoDaysAgo(14);
    const responses = [
      ...baseListResponses().slice(0, 4),
      {
        data: [
          { patient_id: pidA, appointment_date: futureIso, status: 'scheduled' },
          { patient_id: pidA, appointment_date: lastIso, status: 'completed' },
          { patient_id: pidB, appointment_date: isoDaysAgo(200), status: 'completed' },
        ],
        error: null,
      },
    ];

    mockedDb.getSupabaseAdminClient.mockReturnValue(
      createSequentialSupabase(responses) as never
    );

    const result = await listPatientsForDoctorFiltered(
      doctorId,
      { lean: true, page: 1, pageSize: 50 },
      correlationId
    );

    const alice = result.patients.find((p) => p.id === pidA);
    expect(alice?.last_appointment_date).toBe(lastIso);
    expect(alice?.next_appointment_date).toBe(futureIso);
  });

  it('lean q search queries owned patients instead of the full linked roster', async () => {
    const created = isoDaysAgo(10);
    const lastIso = isoDaysAgo(14);
    const client = createSequentialSupabase([
      {
        data: [
          {
            id: pidA,
            name: 'Jasbir Kaur',
            phone: '+15550001111',
            medical_record_number: 'P-00001',
            guardian_name: 'Kewal Singh',
            created_at: created,
          },
          {
            id: pidB,
            name: 'Manjot Kaur',
            phone: '+15550002222',
            medical_record_number: 'P-00002',
            guardian_name: 'Jasbir Singh',
            created_at: created,
          },
        ],
        error: null,
      },
      {
        data: [{ patient_id: pidA, appointment_date: lastIso, status: 'completed' }],
        error: null,
      },
    ]);
    mockedDb.getSupabaseAdminClient.mockReturnValue(client as never);

    const result = await listPatientsForDoctorFiltered(
      doctorId,
      { q: 'jasbir', lean: true, page: 1, pageSize: 20 },
      correlationId
    );

    expect(result.total).toBe(2);
    expect(result.patients[0]?.name).toBe('Jasbir Kaur');
    expect(result.patients[0]?.last_appointment_date).toBe(lastIso);
    expect(client.from).toHaveBeenCalledTimes(2);
    expect(client.from).toHaveBeenNthCalledWith(1, 'patients');
    expect(client.from).toHaveBeenNthCalledWith(2, 'appointments');
  });
});
