/**
 * Comment private-reply daily cap (fail closed).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  COMMENT_PRIVATE_REPLY_DAILY_CAP,
  canSendCommentPrivateReply,
  countCommentPrivateRepliesToday,
} from '../../../src/services/comment-lead-service';
import { getSupabaseAdminClient } from '../../../src/config/database';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockGetSupabase = getSupabaseAdminClient as jest.MockedFunction<
  typeof getSupabaseAdminClient
>;

const doctorId = '7ab212da-2694-4e6d-97ff-c71ab451ef52';
const correlationId = 'corr-cap';

function mockCountChain(result: { count: number | null; error: { code?: string } | null }) {
  const chain = {
    select: jest.fn(),
    eq: jest.fn(),
    gte: jest.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.gte.mockResolvedValue(result as never);
  return chain;
}

describe('comment private-reply daily cap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null (unknown) when admin client is missing', async () => {
    mockGetSupabase.mockReturnValue(null as never);
    await expect(countCommentPrivateRepliesToday(doctorId, correlationId)).resolves.toBeNull();
    await expect(canSendCommentPrivateReply(doctorId, correlationId)).resolves.toBe(false);
  });

  it('allows a send when today is under the cap', async () => {
    const chain = mockCountChain({ count: COMMENT_PRIVATE_REPLY_DAILY_CAP - 1, error: null });
    mockGetSupabase.mockReturnValue({ from: jest.fn().mockReturnValue(chain) } as never);

    await expect(canSendCommentPrivateReply(doctorId, correlationId)).resolves.toBe(true);
    expect(chain.eq).toHaveBeenCalledWith('doctor_id', doctorId);
    expect(chain.eq).toHaveBeenCalledWith('dm_sent', true);
  });

  it('blocks when today is at the cap', async () => {
    const chain = mockCountChain({ count: COMMENT_PRIVATE_REPLY_DAILY_CAP, error: null });
    mockGetSupabase.mockReturnValue({ from: jest.fn().mockReturnValue(chain) } as never);

    await expect(canSendCommentPrivateReply(doctorId, correlationId)).resolves.toBe(false);
  });

  it('fails closed when the count query errors', async () => {
    const chain = mockCountChain({ count: null, error: { code: '42P01' } });
    mockGetSupabase.mockReturnValue({ from: jest.fn().mockReturnValue(chain) } as never);

    await expect(canSendCommentPrivateReply(doctorId, correlationId)).resolves.toBe(false);
  });
});
