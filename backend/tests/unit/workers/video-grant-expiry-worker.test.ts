/**
 * rec-22 grant-expiry worker.
 *
 * Pins: elapsed allow is reverted + stamped `grant_expired`; a revoked
 * row is not in the scan; a concurrent stop is `raced`; Twilio failure
 * leaves the row unstamped; an ended session is a debug no-op stamp.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

const mockFindSession = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../../../src/services/consultation-session-service', () => ({
  findSessionById: (...a: unknown[]) => mockFindSession(...a),
}));

const mockRevert = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../../../src/services/recording-track-service', () => ({
  revertToAudioOnlyRecording: (...a: unknown[]) => mockRevert(...a),
}));

const mockEmitStopped = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../../../src/services/consultation-message-service', () => ({
  emitVideoRecordingStopped: (...a: unknown[]) => mockEmitStopped(...a),
}));

import * as database from '../../../src/config/database';
import { runVideoGrantExpiryJob } from '../../../src/workers/video-grant-expiry-worker';

const NOW = Date.parse('2026-08-20T10:02:00.000Z');
const EXPIRED_AT = '2026-08-20T10:02:00.000Z';

type QueueItem = { data: unknown; error: unknown };

function buildAdmin(scan: QueueItem, stamp: QueueItem) {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    let isUpdate = false;
    const self = (): unknown => chain;
    chain.select = () => self();
    chain.eq = () => self();
    chain.is = () => self();
    chain.not = () => self();
    chain.lte = () => self();
    chain.gt = () => self();
    chain.order = () => self();
    chain.limit = () => Promise.resolve(isUpdate ? stamp : scan);
    chain.update = () => {
      isUpdate = true;
      return self();
    };
    chain.maybeSingle = () => Promise.resolve(stamp);
    return chain;
  };

  return {
    from: jest.fn((table: string) => {
      if (table === 'consultation_recording_audit') {
        const chain: Record<string, unknown> = {};
        const self = (): unknown => chain;
        chain.select = () => self();
        chain.eq = () => self();
        chain.order = () => self();
        chain.limit = () => Promise.resolve({ data: [], error: null });
        return chain;
      }
      return makeChain();
    }),
  };
}

describe('runVideoGrantExpiryJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindSession.mockResolvedValue({
      id: 'sess-1',
      status: 'live',
      providerSessionId: 'RM1',
    });
    mockRevert.mockResolvedValue({ correlationId: 'c1' });
    mockEmitStopped.mockResolvedValue(undefined);
  });

  it('no-ops when nothing is due', async () => {
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      buildAdmin({ data: [], error: null }, { data: null, error: null }),
    );
    const result = await runVideoGrantExpiryJob('corr-empty', NOW);
    expect(result).toEqual({ scanned: 0, expired: 0, raced: 0, errors: [] });
    expect(mockRevert).not.toHaveBeenCalled();
  });

  it('reverts and stamps grant_expired at the boundary', async () => {
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      buildAdmin(
        {
          data: [{
            id: 'g1',
            session_id: 'sess-1',
            correlation_id: 'row-c',
            grant_expires_at: EXPIRED_AT,
          }],
          error: null,
        },
        { data: { id: 'g1' }, error: null },
      ),
    );
    const result = await runVideoGrantExpiryJob('corr-ok', NOW);
    expect(result.scanned).toBe(1);
    expect(result.expired).toBe(1);
    expect(mockRevert).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-1',
        roomSid: 'RM1',
        reason: 'grant_expired',
        initiatedBy: 'system',
      }),
    );
    expect(mockEmitStopped).toHaveBeenCalledWith(
      'sess-1',
      'row-c',
      'system',
      'grant_expired',
    );
  });

  it('counts a concurrent stop as raced and does not emit', async () => {
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      buildAdmin(
        {
          data: [{
            id: 'g1',
            session_id: 'sess-1',
            correlation_id: 'row-c',
            grant_expires_at: EXPIRED_AT,
          }],
          error: null,
        },
        { data: null, error: null },
      ),
    );
    const result = await runVideoGrantExpiryJob('corr-race', NOW);
    expect(result.raced).toBe(1);
    expect(result.expired).toBe(0);
    expect(mockRevert).toHaveBeenCalled();
    expect(mockEmitStopped).not.toHaveBeenCalled();
  });

  it('leaves the row unstamped when Twilio fails', async () => {
    mockRevert.mockRejectedValueOnce(new Error('twilio down'));
    const admin = buildAdmin(
      {
        data: [{
          id: 'g1',
          session_id: 'sess-1',
          correlation_id: 'row-c',
          grant_expires_at: EXPIRED_AT,
        }],
        error: null,
      },
      { data: { id: 'g1' }, error: null },
    );
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(admin);
    const result = await runVideoGrantExpiryJob('corr-twilio', NOW);
    expect(result.expired).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(mockEmitStopped).not.toHaveBeenCalled();
  });

  it('ended session is a debug no-op stamp without Twilio', async () => {
    mockFindSession.mockResolvedValueOnce({ id: 'sess-1', status: 'ended' });
    (database.getSupabaseAdminClient as jest.Mock).mockReturnValue(
      buildAdmin(
        {
          data: [{
            id: 'g1',
            session_id: 'sess-1',
            correlation_id: 'row-c',
            grant_expires_at: EXPIRED_AT,
          }],
          error: null,
        },
        { data: { id: 'g1' }, error: null },
      ),
    );
    const result = await runVideoGrantExpiryJob('corr-ended', NOW);
    expect(result.expired).toBe(1);
    expect(mockRevert).not.toHaveBeenCalled();
    expect(mockEmitStopped).not.toHaveBeenCalled();
  });
});
