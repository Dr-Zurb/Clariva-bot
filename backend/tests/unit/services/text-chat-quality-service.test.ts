/**
 * Unit tests for text-chat-quality-service (Sub-batch D · task-text-D4).
 */

import { describe, expect, it, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/env', () => ({
  env: {
    SUPABASE_JWT_SECRET: 'test-secret-at-least-16-chars-long',
  },
}));
jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import {
  checkTextChatQualityRateLimit,
  resetTextChatQualityRateLimitForTests,
  validateTextChatQualityBody,
} from '../../../src/services/text-chat-quality-service';
import { ForbiddenError, ValidationError } from '../../../src/utils/errors';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

describe('text-chat-quality-service · validateTextChatQualityBody', () => {
  it('accepts a valid sample body', () => {
    const body = validateTextChatQualityBody(
      {
        session_id: SESSION_ID,
        roundtrip_p95_ms: 420,
        realtime_reconnects: 0,
        presence_flaps: 1,
        messages_in_window: 3,
      },
      SESSION_ID,
    );
    expect(body.roundtrip_p95_ms).toBe(420);
    expect(body.realtime_reconnects).toBe(0);
    expect(body.presence_flaps).toBe(1);
    expect(body.messages_in_window).toBe(3);
  });

  it('rejects session_id mismatch with path', () => {
    expect(() =>
      validateTextChatQualityBody(
        {
          session_id: '22222222-2222-4222-8222-222222222222',
          realtime_reconnects: 0,
          presence_flaps: 0,
          messages_in_window: 0,
        },
        SESSION_ID,
      ),
    ).toThrow(ForbiddenError);
  });

  it('rejects out-of-range counters', () => {
    expect(() =>
      validateTextChatQualityBody(
        {
          session_id: SESSION_ID,
          realtime_reconnects: -1,
          presence_flaps: 0,
          messages_in_window: 0,
        },
        SESSION_ID,
      ),
    ).toThrow(ValidationError);
  });
});

describe('text-chat-quality-service · rate limit', () => {
  beforeEach(() => {
    resetTextChatQualityRateLimitForTests();
  });

  it('allows the first sample and rejects a second within 25s', () => {
    const senderId = '33333333-3333-4333-8333-333333333333';
    expect(checkTextChatQualityRateLimit(SESSION_ID, senderId, 1_000)).toBe(true);
    expect(checkTextChatQualityRateLimit(SESSION_ID, senderId, 10_000)).toBe(false);
    expect(checkTextChatQualityRateLimit(SESSION_ID, senderId, 26_500)).toBe(true);
  });
});
