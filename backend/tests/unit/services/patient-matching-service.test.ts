/**
 * Patient Matching Service Unit Tests (e-task-2)
 *
 * Tests for findPossiblePatientMatches: phone match, name similarity, confidence scoring.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { findPossiblePatientMatches } from '../../../src/services/patient-matching-service';
import * as database from '../../../src/config/database';

jest.mock('../../../src/config/database');

const mockedDb = database as jest.Mocked<typeof database>;

const doctorId = '550e8400-e29b-41d4-a716-446655440000';
const correlationId = 'corr-123';

function createMockChain(responses: { data: unknown; error: unknown }[]) {
  let idx = 0;
  const getNext = () => responses[idx++] ?? { data: null, error: null };
  const chain: Record<string, unknown> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    in: jest.fn().mockImplementation(function (this: unknown) {
      return Promise.resolve(getNext());
    }),
  };
  chain.then = (resolve: (v: unknown) => void) => {
    const r = getNext();
    return Promise.resolve(r).then(resolve as (v: unknown) => Promise<unknown>);
  };
  return { from: jest.fn().mockReturnValue(chain), getNext };
}

describe('Patient Matching Service (e-task-2)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns empty when phone has fewer than 10 digits', async () => {
    (mockedDb.getSupabaseAdminClient as jest.Mock).mockReturnValue({ from: jest.fn() });

    const result = await findPossiblePatientMatches(
      doctorId,
      '123',
      'Ramesh Masih',
      undefined,
      undefined,
      correlationId
    );

    expect(result).toEqual([]);
  });

  it('returns empty when name is empty', async () => {
    (mockedDb.getSupabaseAdminClient as jest.Mock).mockReturnValue({ from: jest.fn() });

    const result = await findPossiblePatientMatches(
      doctorId,
      '9814861579',
      '   ',
      undefined,
      undefined,
      correlationId
    );

    expect(result).toEqual([]);
  });

  it('returns matches when phone matches and name is similar', async () => {
    const { from } = createMockChain([
      { data: [{ patient_id: 'p1' }], error: null },
      { data: [{ patient_id: 'p1' }], error: null },
      {
        data: [
          {
            id: 'p1',
            name: 'Ramesh Masih',
            phone: '9814861579',
            age: 56,
            gender: 'male',
            medical_record_number: 'P-00001',
          },
        ],
        error: null,
      },
    ]);

    (mockedDb.getSupabaseAdminClient as jest.Mock).mockReturnValue({ from });

    const result = await findPossiblePatientMatches(
      doctorId,
      '9814861579',
      'Ramesh Masih',
      56,
      'male',
      correlationId
    );

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].patientId).toBe('p1');
    expect(result[0].name).toBe('Ramesh Masih');
    expect(result[0].confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('returns empty when no patients linked to doctor', async () => {
    const { from } = createMockChain([
      { data: [], error: null },
      { data: [], error: null },
    ]);

    (mockedDb.getSupabaseAdminClient as jest.Mock).mockReturnValue({ from });

    const result = await findPossiblePatientMatches(
      doctorId,
      '9814861579',
      'Ramesh Masih',
      undefined,
      undefined,
      correlationId
    );

    expect(result).toEqual([]);
  });
});
