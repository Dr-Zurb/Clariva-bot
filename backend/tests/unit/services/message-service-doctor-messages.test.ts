/**
 * ibi-03: getConversationMessagesForDoctor — ownership before PHI read + paging.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { getConversationMessagesForDoctor } from '../../../src/services/message-service';
import { getSupabaseAdminClient } from '../../../src/config/database';
import { NotFoundError } from '../../../src/utils/errors';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn(async () => undefined),
  logDataModification: jest.fn(async () => undefined),
}));

const mockGetSupabase = getSupabaseAdminClient as jest.MockedFunction<
  typeof getSupabaseAdminClient
>;

const doctorId = '7ab212da-2694-4e6d-97ff-c71ab451ef52';
const conversationId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const correlationId = 'corr-ibi-03';

function makeFromMock(opts: {
  conversation: { data: { id: string } | null; error: null };
  messages: {
    data: Array<Record<string, unknown>> | null;
    error: null;
  };
}) {
  const convChain: Record<string, unknown> = {};
  convChain.select = jest.fn(() => convChain);
  convChain.eq = jest.fn(() => convChain);
  convChain.maybeSingle = jest.fn(async () => opts.conversation);

  const msgChain: Record<string, unknown> = {};
  msgChain.select = jest.fn(() => msgChain);
  msgChain.eq = jest.fn(() => msgChain);
  msgChain.order = jest.fn(() => msgChain);
  msgChain.lt = jest.fn(() => msgChain);
  msgChain.limit = jest.fn(async () => opts.messages);

  const from = jest.fn((table: string) => {
    if (table === 'conversations') return convChain;
    if (table === 'messages') return msgChain;
    throw new Error(`unexpected table ${table}`);
  });

  mockGetSupabase.mockReturnValue({ from } as never);
  return { from, convChain, msgChain };
}

describe('getConversationMessagesForDoctor (ibi-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns newest page ascending when conversation belongs to doctor', async () => {
    makeFromMock({
      conversation: { data: { id: conversationId }, error: null },
      messages: {
        data: [
          {
            id: 'msg-2',
            conversation_id: conversationId,
            sender_type: 'bot',
            content: 'hi',
            intent: null,
            created_at: '2026-07-27T08:01:00.000Z',
          },
          {
            id: 'msg-1',
            conversation_id: conversationId,
            sender_type: 'patient',
            content: 'hello',
            intent: null,
            created_at: '2026-07-27T08:00:00.000Z',
          },
        ],
        error: null,
      },
    });

    const page = await getConversationMessagesForDoctor(
      doctorId,
      conversationId,
      correlationId,
      { limit: 50 }
    );

    expect(page.messages).toHaveLength(2);
    expect(page.hasMoreOlder).toBe(false);
    // Reversed to chronological
    expect(page.messages[0].id).toBe('msg-1');
    expect(page.messages[1].id).toBe('msg-2');
  });

  it('sets hasMoreOlder when limit+1 rows returned', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `msg-${i}`,
      conversation_id: conversationId,
      sender_type: 'patient',
      content: `m${i}`,
      intent: null,
      created_at: `2026-07-27T08:0${i}:00.000Z`,
    }));
    makeFromMock({
      conversation: { data: { id: conversationId }, error: null },
      messages: { data: rows, error: null },
    });

    const page = await getConversationMessagesForDoctor(
      doctorId,
      conversationId,
      correlationId,
      { limit: 2 }
    );

    expect(page.messages).toHaveLength(2);
    expect(page.hasMoreOlder).toBe(true);
  });

  it('throws NotFoundError for other doctor (no message query leak)', async () => {
    const { msgChain } = makeFromMock({
      conversation: { data: null, error: null },
      messages: { data: [], error: null },
    });

    await expect(
      getConversationMessagesForDoctor(doctorId, conversationId, correlationId)
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(msgChain.select).not.toHaveBeenCalled();
  });
});
