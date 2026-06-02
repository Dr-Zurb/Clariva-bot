/**
 * Unit tests for `services/consultation-message-service.ts` (Plan 04 · Task 18).
 *
 * Covers:
 *   - `listMessagesForSession`: ordered output, afterCreatedAt cutoff, empty/error fallback
 *   - `rateLimitInsertCheck`: under-limit pass, at-limit block, sliding-window aging,
 *     per-(session, sender) isolation, retryAfter computation
 *
 * The rate limiter is in-memory and process-local, so tests reset state
 * between cases via the `__resetRateLimitForTests` test hook.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks (registered before the unit-under-test import)
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/env', () => ({
  env: {
    CONSULTATION_MESSAGE_RATE_LIMIT_MAX: 3,
    CONSULTATION_MESSAGE_RATE_LIMIT_WINDOW_SECONDS: 60,
  },
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn:  jest.fn(),
    info:  jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

import {
  __resetRateLimitForTests,
  listMessagesForSession,
  rateLimitInsertCheck,
} from '../../../src/services/consultation-message-service';
import * as database from '../../../src/config/database';

const mockedDb = database as jest.Mocked<typeof database>;

beforeEach(() => {
  __resetRateLimitForTests();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// listMessagesForSession
// ---------------------------------------------------------------------------

describe('listMessagesForSession', () => {
  // Chain shape mirrors the implementation:
  //   from().select().eq().order().limit()    → terminal thenable
  //   .gt() may be called on the limited query for `afterCreatedAt`.
  function buildSelectChain(rows: unknown[], error: { message: string } | null = null) {
    const result = { data: rows, error };
    type Thenable = {
      then: (
        onFulfilled?: (v: { data: unknown[]; error: { message: string } | null }) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => Promise<unknown>;
      gt: jest.Mock;
    };
    const buildLimited = (): Thenable => {
      const obj: Thenable = {
        then: (onFulfilled, onRejected) =>
          Promise.resolve(result).then(onFulfilled, onRejected),
        gt: jest.fn().mockImplementation(() => buildLimited()),
      };
      return obj;
    };
    const limit  = jest.fn().mockImplementation(() => buildLimited());
    const order  = jest.fn().mockReturnValue({ limit });
    const eq     = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    return { from: jest.fn().mockReturnValue({ select }) };
  }

  it('returns mapped rows ordered ascending', async () => {
    const rows = [
      {
        id:                   'm-1',
        session_id:           's-1',
        sender_id:            'd-1',
        sender_role:          'doctor',
        kind:                 'text',
        body:                 'hi',
        attachment_url:       null,
        attachment_mime_type: null,
        attachment_byte_size: null,
        system_event:         null,
        created_at:           '2026-04-19T10:00:00.000Z',
      },
      {
        id:                   'm-2',
        session_id:           's-1',
        sender_id:            'patient:appt-1',
        sender_role:          'patient',
        kind:                 'text',
        body:                 'hello back',
        attachment_url:       null,
        attachment_mime_type: null,
        attachment_byte_size: null,
        system_event:         null,
        created_at:           '2026-04-19T10:00:30.000Z',
      },
    ];
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildSelectChain(rows) as unknown as ReturnType<typeof mockedDb.getSupabaseAdminClient>,
    );
    const result = await listMessagesForSession({ sessionId: 's-1' });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id:         'm-1',
      sessionId:  's-1',
      senderId:   'd-1',
      senderRole: 'doctor',
      kind:       'text',
      body:       'hi',
      attachmentUrl:      null,
      attachmentMimeType: null,
      attachmentByteSize: null,
      systemEvent:        null,
    });
    expect(result[1]?.senderRole).toBe('patient');
  });

  // Plan 06 · Task 39 — verify the extended shape is mapped correctly when the
  // session contains all three row kinds. The service ordering is `created_at
  // ascending` (SQL-layer), so the mock returns rows already in that order and
  // the test just asserts the mapped output preserves it + surfaces the new
  // columns for each kind.
  it('maps text + attachment + system rows preserving order and populating all new columns (Task 39)', async () => {
    const rows = [
      {
        id:                   'm-text',
        session_id:           's-1',
        sender_id:            'd-1',
        sender_role:          'doctor',
        kind:                 'text',
        body:                 'Let me look at that — can you share a photo?',
        attachment_url:       null,
        attachment_mime_type: null,
        attachment_byte_size: null,
        system_event:         null,
        created_at:           '2026-04-19T10:00:00.000Z',
      },
      {
        id:                   'm-attachment',
        session_id:           's-1',
        sender_id:            'patient:appt-1',
        sender_role:          'patient',
        kind:                 'attachment',
        body:                 null,
        attachment_url:       'https://storage.clariva.test/consultation-attachments/s-1/abc.jpg',
        attachment_mime_type: 'image/jpeg',
        attachment_byte_size: 245_312,
        system_event:         null,
        created_at:           '2026-04-19T10:00:45.000Z',
      },
      {
        id:                   'm-system',
        session_id:           's-1',
        sender_id:            '00000000-0000-0000-0000-000000000000',
        sender_role:          'system',
        kind:                 'system',
        body:                 'Doctor enabled video.',
        attachment_url:       null,
        attachment_mime_type: null,
        attachment_byte_size: null,
        system_event:         'modality_switched',
        created_at:           '2026-04-19T10:02:00.000Z',
      },
    ];
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildSelectChain(rows) as unknown as ReturnType<typeof mockedDb.getSupabaseAdminClient>,
    );

    const result = await listMessagesForSession({ sessionId: 's-1' });

    expect(result).toHaveLength(3);

    // text row — attachment/system fields null
    expect(result[0]).toMatchObject({
      id:                 'm-text',
      kind:               'text',
      body:               'Let me look at that — can you share a photo?',
      attachmentUrl:      null,
      attachmentMimeType: null,
      attachmentByteSize: null,
      systemEvent:        null,
    });

    // attachment row — metadata populated, body may be null (caption optional)
    expect(result[1]).toMatchObject({
      id:                 'm-attachment',
      kind:               'attachment',
      senderRole:         'patient',
      body:               null,
      attachmentUrl:      'https://storage.clariva.test/consultation-attachments/s-1/abc.jpg',
      attachmentMimeType: 'image/jpeg',
      attachmentByteSize: 245_312,
      systemEvent:        null,
    });

    // system row — sender_role='system', system_event set, attachment fields null
    expect(result[2]).toMatchObject({
      id:                 'm-system',
      kind:               'system',
      senderRole:         'system',
      body:               'Doctor enabled video.',
      attachmentUrl:      null,
      attachmentMimeType: null,
      attachmentByteSize: null,
      systemEvent:        'modality_switched',
    });

    // Chronological order preserved (SQL ORDER BY created_at ASC).
    const timestamps = result.map((row) => row.createdAt);
    expect(timestamps).toEqual([
      '2026-04-19T10:00:00.000Z',
      '2026-04-19T10:00:45.000Z',
      '2026-04-19T10:02:00.000Z',
    ]);
  });

  it('returns [] on missing sessionId', async () => {
    const result = await listMessagesForSession({ sessionId: '' });
    expect(result).toEqual([]);
    expect(mockedDb.getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('returns [] when admin client is unavailable', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(null);
    const result = await listMessagesForSession({ sessionId: 's-1' });
    expect(result).toEqual([]);
  });

  it('returns [] on query error (logs warning, no throw)', async () => {
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      buildSelectChain([], { message: 'boom' }) as unknown as ReturnType<typeof mockedDb.getSupabaseAdminClient>,
    );
    const result = await listMessagesForSession({ sessionId: 's-1' });
    expect(result).toEqual([]);
  });

  it('passes afterCreatedAt through as a `gt` filter (chain shape)', async () => {
    let capturedGtCall: { col: string; val: string } | null = null;
    const result = { data: [], error: null };
    const buildLimited = (): unknown => ({
      then: (
        onFulfilled?: (v: typeof result) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => Promise.resolve(result).then(onFulfilled, onRejected),
      gt: jest.fn<(col: string, val: string) => unknown>().mockImplementation((col, val) => {
        capturedGtCall = { col, val };
        return buildLimited();
      }),
    });
    const limit  = jest.fn().mockImplementation(() => buildLimited());
    const order  = jest.fn().mockReturnValue({ limit });
    const eq     = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    mockedDb.getSupabaseAdminClient.mockReturnValue(
      { from: jest.fn().mockReturnValue({ select }) } as unknown as ReturnType<typeof mockedDb.getSupabaseAdminClient>,
    );
    await listMessagesForSession({
      sessionId:      's-1',
      afterCreatedAt: '2026-04-19T11:00:00.000Z',
    });
    expect(capturedGtCall).toEqual({
      col: 'created_at',
      val: '2026-04-19T11:00:00.000Z',
    });
  });
});

// ---------------------------------------------------------------------------
// rateLimitInsertCheck
// ---------------------------------------------------------------------------

describe('rateLimitInsertCheck', () => {
  it('allows the first MAX events in the window then blocks the next', () => {
    // env mock sets MAX=3
    const a = rateLimitInsertCheck({ sessionId: 's-1', senderId: 'd-1' });
    const b = rateLimitInsertCheck({ sessionId: 's-1', senderId: 'd-1' });
    const c = rateLimitInsertCheck({ sessionId: 's-1', senderId: 'd-1' });
    const d = rateLimitInsertCheck({ sessionId: 's-1', senderId: 'd-1' });

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(c.allowed).toBe(true);
    expect(d.allowed).toBe(false);
    expect(d.remainingInWindow).toBe(0);
    expect(d.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('isolates per-(sessionId, senderId)', () => {
    rateLimitInsertCheck({ sessionId: 's-1', senderId: 'd-1' });
    rateLimitInsertCheck({ sessionId: 's-1', senderId: 'd-1' });
    rateLimitInsertCheck({ sessionId: 's-1', senderId: 'd-1' });
    // Same session, different sender — should be a fresh bucket.
    expect(rateLimitInsertCheck({ sessionId: 's-1', senderId: 'd-2' }).allowed).toBe(true);
    // Different session, same sender — should be a fresh bucket.
    expect(rateLimitInsertCheck({ sessionId: 's-2', senderId: 'd-1' }).allowed).toBe(true);
  });

  it('ages out old events (sliding window)', () => {
    // Use jest fake timers to advance the wall clock.
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-04-19T10:00:00Z'));
      rateLimitInsertCheck({ sessionId: 's-1', senderId: 'd-1' });
      rateLimitInsertCheck({ sessionId: 's-1', senderId: 'd-1' });
      rateLimitInsertCheck({ sessionId: 's-1', senderId: 'd-1' });
      expect(
        rateLimitInsertCheck({ sessionId: 's-1', senderId: 'd-1' }).allowed,
      ).toBe(false);

      // Advance > window (60s). All entries age out.
      jest.setSystemTime(new Date('2026-04-19T10:01:01Z'));
      expect(
        rateLimitInsertCheck({ sessionId: 's-1', senderId: 'd-1' }).allowed,
      ).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports remaining window slots accurately', () => {
    const a = rateLimitInsertCheck({ sessionId: 's-x', senderId: 'd-x' });
    expect(a.remainingInWindow).toBe(2);
    const b = rateLimitInsertCheck({ sessionId: 's-x', senderId: 'd-x' });
    expect(b.remainingInWindow).toBe(1);
    const c = rateLimitInsertCheck({ sessionId: 's-x', senderId: 'd-x' });
    expect(c.remainingInWindow).toBe(0);
  });

  it('returns blocked on missing session/sender', () => {
    expect(
      rateLimitInsertCheck({ sessionId: '', senderId: 'd' }).allowed,
    ).toBe(false);
    expect(
      rateLimitInsertCheck({ sessionId: 's', senderId: '' }).allowed,
    ).toBe(false);
  });
});
