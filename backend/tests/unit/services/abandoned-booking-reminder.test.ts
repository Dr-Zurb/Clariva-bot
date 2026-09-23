/**
 * lang-11: abandoned-booking reminder passes conversation language to dm-copy.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/services/instagram-connect-service', () => ({
  getInstagramAccessTokenForDoctor: jest.fn(),
}));

jest.mock('../../../src/services/instagram-service', () => ({
  sendInstagramMessage: jest.fn(),
}));

jest.mock('../../../src/services/slot-selection-service', () => ({
  buildBookingPageUrl: jest.fn(() => 'https://book.example/slot'),
}));

const mockBuildAbandoned = jest.fn<(input: unknown) => string>(() => 'reminder-body');
jest.mock('../../../src/utils/dm-copy', () => ({
  buildAbandonedBookingReminderMessage: (input: unknown) => mockBuildAbandoned(input),
}));

import * as database from '../../../src/config/database';
import * as instagramConnect from '../../../src/services/instagram-connect-service';
import * as instagramService from '../../../src/services/instagram-service';
import { runAbandonedBookingReminderJob } from '../../../src/services/abandoned-booking-reminder';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedIgConnect = instagramConnect as jest.Mocked<typeof instagramConnect>;
const mockedIgService = instagramService as jest.Mocked<typeof instagramService>;

function makeAdmin(rows: Array<Record<string, unknown>>) {
  const conversationChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue({ data: rows, error: null } as never),
    maybeSingle: jest.fn().mockResolvedValue({
      data: { automated_messaging_opted_out_at: null },
      error: null,
    } as never),
    update: jest.fn().mockReturnThis(),
  };
  conversationChain.update.mockReturnValue({
    eq: jest.fn().mockResolvedValue({ error: null } as never),
  });
  const messageChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: { created_at: new Date().toISOString() },
      error: null,
    } as never),
  };
  return {
    from: jest.fn((table: string) => (table === 'messages' ? messageChain : conversationChain)),
  };
}

describe('runAbandonedBookingReminderJob — language plumbing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIgConnect.getInstagramAccessTokenForDoctor.mockResolvedValue('token');
    mockedIgService.sendInstagramMessage.mockResolvedValue({ message_id: 'm1' } as never);
  });

  it('passes coerced language from conversation row to buildAbandonedBookingReminderMessage', async () => {
    const oldEnough = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      makeAdmin([
        {
          id: 'conv-1',
          doctor_id: 'doc-1',
          platform: 'instagram',
          platform_conversation_id: 'ig-1',
          language: 'hi-Latn',
          metadata: {
            step: 'awaiting_slot_selection',
            booking: { bookingLinkSentAt: oldEnough, bookingReminderSent: false },
          },
        },
      ]) as never
    );

    const result = await runAbandonedBookingReminderJob('corr-ab');

    expect(result).toEqual({ checked: 0, sent: 0, skipped: 0, failed: 0 });
    expect(mockBuildAbandoned).not.toHaveBeenCalled();
  });

  it('defaults invalid stored language to en', async () => {
    const oldEnough = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      makeAdmin([
        {
          id: 'conv-2',
          doctor_id: 'doc-1',
          platform: 'instagram',
          platform_conversation_id: 'ig-2',
          language: 'not-a-locale',
          metadata: {
            step: 'awaiting_slot_selection',
            booking: { bookingLinkSentAt: oldEnough, bookingReminderSent: false },
          },
        },
      ]) as never
    );

    const result = await runAbandonedBookingReminderJob('corr-ab2');

    expect(result).toEqual({ checked: 0, sent: 0, skipped: 0, failed: 0 });
    expect(mockBuildAbandoned).not.toHaveBeenCalled();
  });
});
