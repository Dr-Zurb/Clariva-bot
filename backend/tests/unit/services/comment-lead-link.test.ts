/**
 * ibi-01: linkCommentLeadToConversation + maybeLinkCommentLeadAfterDm
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  linkCommentLeadToConversation,
  maybeLinkCommentLeadAfterDm,
} from '../../../src/services/comment-lead-service';
import { getSupabaseAdminClient } from '../../../src/config/database';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

const mockGetSupabase = getSupabaseAdminClient as jest.MockedFunction<
  typeof getSupabaseAdminClient
>;

const doctorId = '7ab212da-2694-4e6d-97ff-c71ab451ef52';
const conversationId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const commenterIgId = 'ig-sender-111';
const correlationId = 'corr-ibi-01';

type Chain = {
  update: jest.Mock;
  eq: jest.Mock;
  is: jest.Mock;
  select: jest.Mock;
};

function mockUpdateChain(result: {
  data: Array<{ id: string }> | null;
  error: { code?: string; message?: string } | null;
}): Chain {
  const chain: Chain = {
    update: jest.fn(),
    eq: jest.fn(),
    is: jest.fn(),
    select: jest.fn(),
  };
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.select.mockResolvedValue(result as never);
  return chain;
}

describe('linkCommentLeadToConversation (ibi-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates unlinked leads scoped by doctor + platform + commenter', async () => {
    const chain = mockUpdateChain({
      data: [{ id: 'lead-1' }],
      error: null,
    });
    mockGetSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue(chain),
    } as never);

    const result = await linkCommentLeadToConversation({
      commenterIgId,
      conversationId,
      doctorId,
      platform: 'instagram',
      correlationId,
    });

    expect(result).toEqual({ linked: true, count: 1 });
    expect(chain.update).toHaveBeenCalledWith({ conversation_id: conversationId });
    expect(chain.eq).toHaveBeenCalledWith('doctor_id', doctorId);
    expect(chain.eq).toHaveBeenCalledWith('platform', 'instagram');
    expect(chain.eq).toHaveBeenCalledWith('commenter_ig_id', commenterIgId);
    expect(chain.is).toHaveBeenCalledWith('conversation_id', null);
  });

  it('returns linked:false when no unlinked lead (already linked or none)', async () => {
    const chain = mockUpdateChain({ data: [], error: null });
    mockGetSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue(chain),
    } as never);

    const result = await linkCommentLeadToConversation({
      commenterIgId,
      conversationId,
      doctorId,
      platform: 'facebook',
      correlationId,
    });

    expect(result).toEqual({ linked: false, count: 0 });
    expect(chain.eq).toHaveBeenCalledWith('platform', 'facebook');
  });

  it('soft-fails on DB error (does not throw)', async () => {
    const chain = mockUpdateChain({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    });
    mockGetSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue(chain),
    } as never);

    await expect(
      linkCommentLeadToConversation({
        commenterIgId,
        conversationId,
        doctorId,
        platform: 'instagram',
        correlationId,
      })
    ).resolves.toEqual({ linked: false, count: 0 });
  });

  it('returns linked:false when admin client unavailable', async () => {
    mockGetSupabase.mockReturnValue(null as never);
    await expect(
      linkCommentLeadToConversation({
        commenterIgId,
        conversationId,
        doctorId,
        platform: 'instagram',
        correlationId,
      })
    ).resolves.toEqual({ linked: false, count: 0 });
  });
});

describe('maybeLinkCommentLeadAfterDm (ibi-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('no-ops for whatsapp (no comment leads)', async () => {
    mockGetSupabase.mockReturnValue({
      from: jest.fn(),
    } as never);

    const result = await maybeLinkCommentLeadAfterDm({
      doctorId,
      channel: 'whatsapp',
      senderId: commenterIgId,
      conversationId,
      correlationId,
    });

    expect(result).toEqual({ linked: false, count: 0 });
    expect(mockGetSupabase).not.toHaveBeenCalled();
  });

  it('links for facebook channel', async () => {
    const chain = mockUpdateChain({
      data: [{ id: 'lead-fb' }],
      error: null,
    });
    mockGetSupabase.mockReturnValue({
      from: jest.fn().mockReturnValue(chain),
    } as never);

    const result = await maybeLinkCommentLeadAfterDm({
      doctorId,
      channel: 'facebook',
      senderId: 'fb-psid-9',
      conversationId,
      correlationId,
    });

    expect(result).toEqual({ linked: true, count: 1 });
    expect(chain.eq).toHaveBeenCalledWith('platform', 'facebook');
    expect(chain.eq).toHaveBeenCalledWith('commenter_ig_id', 'fb-psid-9');
  });
});
