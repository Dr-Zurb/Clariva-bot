/**
 * Instagram Connect Service Unit Tests (e-task-2, e-task-4)
 *
 * Tests getDoctorIdByPageId: returns doctor_id when row exists,
 * null when no row; throws when admin client unavailable or query fails.
 * Tests disconnectInstagram: deletes row for doctor_id; idempotent when no row; throws when admin client null.
 *
 * No PHI in test data (TESTING.md).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  getDoctorIdByPageId,
  disconnectInstagram,
} from '../../../src/services/instagram-connect-service';
import * as database from '../../../src/config/database';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

const mockedDb = database as jest.Mocked<typeof database>;

const pageId = '123456789012345';
const doctorId = '550e8400-e29b-41d4-a716-446655440001';

function createMockSupabase(response: { data: unknown; error: unknown }) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(response as never),
  };
  const from = jest.fn().mockReturnValue(chain);
  return { from };
}

describe('Instagram Connect Service (e-task-2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns doctor_id when row exists for page_id', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { doctor_id: doctorId },
        error: null,
      } as never),
    };
    const from = jest.fn().mockReturnValue(chain);
    const mockSupabase = { from };
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

    const result = await getDoctorIdByPageId(pageId, 'corr-1');

    expect(result).toBe(doctorId);
    expect(from).toHaveBeenCalledWith('doctor_instagram');
    expect(chain.select).toHaveBeenCalledWith('doctor_id');
    expect(chain.eq).toHaveBeenCalledWith('instagram_page_id', pageId);
  });

  it('returns null when no row exists', async () => {
    const mockSupabase = createMockSupabase({ data: null, error: null });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

    const result = await getDoctorIdByPageId(pageId);

    expect(result).toBeNull();
  });

  it('returns null when pageId is empty string', async () => {
    const result = await getDoctorIdByPageId('');
    expect(result).toBeNull();
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('throws when supabase admin client is null', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null as never);

    await expect(getDoctorIdByPageId(pageId)).rejects.toThrow(
      'Service role client not available'
    );
  });

  it('throws when query returns error', async () => {
    const mockSupabase = createMockSupabase({
      data: null,
      error: { code: 'PGRST116', message: 'Not found' },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(mockSupabase as never);

    await expect(getDoctorIdByPageId(pageId, 'corr-1')).rejects.toThrow();
  });
});

function createMockSupabaseDelete() {
  const resolved = { error: null };
  const eqChain = {
    then: (resolve: (v: { error: null }) => void) => resolve(resolved),
  };
  const deleteChain = {
    eq: jest.fn().mockReturnValue(eqChain),
  };
  const fromChain = {
    delete: jest.fn().mockReturnValue(deleteChain),
  };
  const from = jest.fn().mockReturnValue(fromChain);
  return { from, fromChain, deleteChain };
}

describe('Instagram Connect Service – disconnectInstagram (e-task-4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes row when doctor has Instagram link', async () => {
    const { from, fromChain, deleteChain } = createMockSupabaseDelete();
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    await disconnectInstagram(doctorId, 'corr-disconnect');

    expect(from).toHaveBeenCalledWith('doctor_instagram');
    expect(fromChain.delete).toHaveBeenCalled();
    expect(deleteChain.eq).toHaveBeenCalledWith('doctor_id', doctorId);
  });

  it('succeeds when no row exists (idempotent)', async () => {
    const { from, fromChain, deleteChain } = createMockSupabaseDelete();
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    await expect(disconnectInstagram(doctorId, 'corr-idem')).resolves.not.toThrow();
    expect(from).toHaveBeenCalledWith('doctor_instagram');
    expect(fromChain.delete).toHaveBeenCalled();
    expect(deleteChain.eq).toHaveBeenCalledWith('doctor_id', doctorId);
  });

  it('throws when supabase admin client is null', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null as never);

    await expect(disconnectInstagram(doctorId, 'corr-1')).rejects.toThrow(
      'Service role client not available'
    );
  });
});
