/**
 * Doctor note favorites service — unit tests (subjective-tab · subj-06).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn().mockResolvedValue(undefined as never),
  logDataModification: jest.fn().mockResolvedValue(undefined as never),
}));

import * as database from '../../../src/config/database';
import {
  createDoctorNoteFavorite,
  listDoctorNoteFavorites,
  MAX_NOTE_FAVORITES_PER_FIELD,
} from '../../../src/services/note-favorites-service';
import { ValidationError } from '../../../src/utils/errors';

const mockedDb = database as jest.Mocked<typeof database>;

const correlationId = 'corr-subj-06';
const doctorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function buildListChain(rows: unknown[]) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    then(onFulfilled: (v: { data: unknown[]; error: null }) => unknown) {
      return Promise.resolve(onFulfilled({ data: rows, error: null }));
    },
  };
  chain.order.mockReturnValue(chain);
  return chain;
}

function buildCountChain(count: number) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    then(onFulfilled: (v: { count: number; error: null }) => unknown) {
      return Promise.resolve(onFulfilled({ count, error: null }));
    },
  };
  return chain;
}

describe('note-favorites-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists favorites for a doctor', async () => {
    const row = {
      id: 'f-1',
      doctor_id: doctorId,
      field_key: 'family_history',
      value: 'Father — HTN',
      use_count: 3,
      last_used_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };

    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => buildListChain([row])),
    } as never);

    const favorites = await listDoctorNoteFavorites(correlationId, doctorId);
    expect(favorites).toEqual([row]);
  });

  it('rejects create when at cap', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue({
      from: jest.fn(() => buildCountChain(MAX_NOTE_FAVORITES_PER_FIELD)),
    } as never);

    await expect(
      createDoctorNoteFavorite(
        { fieldKey: 'complaint_name', value: 'Headache' },
        correlationId,
        doctorId,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
