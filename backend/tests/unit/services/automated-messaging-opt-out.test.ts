/**
 * mca-06 / mca-07 / mca-08 — phrase detection + fail-closed Meta skip.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/services/conversation-service', () => ({
  findConversationByPlatformId: jest.fn(),
  readAutomatedMessagingOptedOutAt: jest.fn(),
  readLatestPatientMessageAt: jest.fn(),
  setAutomatedMessagingOptedOutAt: jest.fn(),
}));

import {
  isInsideMetaStandardMessagingWindow,
  isStartMessagingText,
  isStopMessagingText,
  META_MESSAGING_WINDOW_SAFETY_MS,
  META_STANDARD_MESSAGING_WINDOW_MS,
  shouldSkipAutomatedMetaSend,
  shouldSkipCommentPrivateReply,
} from '../../../src/services/automated-messaging-opt-out';
import * as conversationService from '../../../src/services/conversation-service';

const readFlag = conversationService.readAutomatedMessagingOptedOutAt as jest.MockedFunction<
  typeof conversationService.readAutomatedMessagingOptedOutAt
>;
const readLatest = conversationService.readLatestPatientMessageAt as jest.MockedFunction<
  typeof conversationService.readLatestPatientMessageAt
>;
const findConv = conversationService.findConversationByPlatformId as jest.MockedFunction<
  typeof conversationService.findConversationByPlatformId
>;

describe('isStopMessagingText', () => {
  it.each([
    'STOP',
    'stop',
    'please stop',
    'unsubscribe',
    'stop messaging me',
    'opt out',
    'message mat bhejo',
  ])('matches %s', (text) => {
    expect(isStopMessagingText(text)).toBe(true);
  });

  it.each(['stop by the clinic', 'cannot stop coughing', 'book tomorrow'])(
    'does not match %s',
    (text) => {
      expect(isStopMessagingText(text)).toBe(false);
    }
  );
});

describe('isStartMessagingText', () => {
  it.each(['START', 'start again', 'resume', 'opt in', 'message me again', 'shuru karo'])(
    'matches %s',
    (text) => {
      expect(isStartMessagingText(text)).toBe(true);
    }
  );

  it('does not treat a booking ask as start', () => {
    expect(isStartMessagingText('start the booking for tomorrow')).toBe(false);
  });
});

describe('shouldSkipAutomatedMetaSend', () => {
  const recent = new Date().toISOString();

  beforeEach(() => {
    jest.clearAllMocks();
    readLatest.mockResolvedValue({ ok: true, createdAt: recent });
  });

  it('allows when the stamp is null and the person wrote inside the window', async () => {
    readFlag.mockResolvedValue({ ok: true, optedOutAt: null });
    await expect(
      shouldSkipAutomatedMetaSend({
        conversationId: 'conv-1',
        correlationId: 'c1',
        ifMissing: 'skip',
      })
    ).resolves.toEqual({ skip: false });
  });

  it('skips when the last patient message is outside the window', async () => {
    readFlag.mockResolvedValue({ ok: true, optedOutAt: null });
    readLatest.mockResolvedValue({
      ok: true,
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    });
    const result = await shouldSkipAutomatedMetaSend({
      conversationId: 'conv-1',
      correlationId: 'c1',
      ifMissing: 'skip',
    });
    expect(result).toEqual({ skip: true, reason: 'messaging_window_closed' });
  });

  it('skips when no patient message is on file', async () => {
    readFlag.mockResolvedValue({ ok: true, optedOutAt: null });
    readLatest.mockResolvedValue({ ok: true, createdAt: null });
    const result = await shouldSkipAutomatedMetaSend({
      conversationId: 'conv-1',
      correlationId: 'c1',
      ifMissing: 'skip',
    });
    expect(result).toEqual({ skip: true, reason: 'messaging_window_closed' });
  });

  it('fail-closes when the window cannot be read', async () => {
    readFlag.mockResolvedValue({ ok: true, optedOutAt: null });
    readLatest.mockResolvedValue({ ok: false });
    const result = await shouldSkipAutomatedMetaSend({
      conversationId: 'conv-1',
      correlationId: 'c1',
      ifMissing: 'skip',
    });
    expect(result).toEqual({ skip: true, reason: 'window_unreadable' });
  });

  it('skips when opted out', async () => {
    readFlag.mockResolvedValue({ ok: true, optedOutAt: '2026-09-16T00:00:00.000Z' });
    const result = await shouldSkipAutomatedMetaSend({
      conversationId: 'conv-1',
      correlationId: 'c1',
      ifMissing: 'skip',
    });
    expect(result).toEqual({ skip: true, reason: 'opted_out' });
  });

  it('fail-closes when the flag is unreadable', async () => {
    readFlag.mockResolvedValue({ ok: false });
    const result = await shouldSkipAutomatedMetaSend({
      conversationId: 'conv-1',
      correlationId: 'c1',
      ifMissing: 'skip',
    });
    expect(result).toEqual({ skip: true, reason: 'flag_unreadable' });
  });

  it('ifMissing=allow lets a new commenter through', async () => {
    const result = await shouldSkipAutomatedMetaSend({
      conversationId: null,
      correlationId: 'c1',
      ifMissing: 'allow',
    });
    expect(result).toEqual({ skip: false });
    expect(readFlag).not.toHaveBeenCalled();
    expect(readLatest).not.toHaveBeenCalled();
  });
});

describe('isInsideMetaStandardMessagingWindow', () => {
  const now = Date.parse('2026-09-23T12:00:00.000Z');

  it('is open just inside the safety margin', () => {
    const at = new Date(
      now - (META_STANDARD_MESSAGING_WINDOW_MS - META_MESSAGING_WINDOW_SAFETY_MS)
    ).toISOString();
    expect(isInsideMetaStandardMessagingWindow(at, now)).toBe(true);
  });

  it('is closed one millisecond past the safety margin', () => {
    const at = new Date(
      now - (META_STANDARD_MESSAGING_WINDOW_MS - META_MESSAGING_WINDOW_SAFETY_MS) - 1
    ).toISOString();
    expect(isInsideMetaStandardMessagingWindow(at, now)).toBe(false);
  });

  it('is closed when the timestamp is missing', () => {
    expect(isInsideMetaStandardMessagingWindow(null, now)).toBe(false);
    expect(isInsideMetaStandardMessagingWindow('not-a-date', now)).toBe(false);
  });
});

describe('shouldSkipCommentPrivateReply', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows when no conversation exists yet', async () => {
    findConv.mockResolvedValue(null);
    await expect(
      shouldSkipCommentPrivateReply({
        doctorId: 'doc-1',
        platform: 'instagram',
        commenterPlatformId: 'ig-1',
        correlationId: 'c1',
      })
    ).resolves.toBe(false);
  });

  it('skips when the linked conversation opted out', async () => {
    findConv.mockResolvedValue({
      id: 'conv-1',
      automated_messaging_opted_out_at: '2026-09-16T00:00:00.000Z',
    } as never);
    await expect(
      shouldSkipCommentPrivateReply({
        doctorId: 'doc-1',
        platform: 'instagram',
        commenterPlatformId: 'ig-1',
        correlationId: 'c1',
      })
    ).resolves.toBe(true);
  });

  it('fail-closes when lookup throws', async () => {
    findConv.mockRejectedValue(new Error('db down'));
    await expect(
      shouldSkipCommentPrivateReply({
        doctorId: 'doc-1',
        platform: 'instagram',
        commenterPlatformId: 'ig-1',
        correlationId: 'c1',
      })
    ).resolves.toBe(true);
  });
});
