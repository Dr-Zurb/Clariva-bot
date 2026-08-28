/**
 * Unit tests for Instagram token health sweep (ilr-04).
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockForceRefresh = jest.fn<
  (...args: unknown[]) => Promise<{
    level: string;
    checkedAt: string;
    tokenExpiresAt: string | null;
    lastDmSuccessAt: string | null;
    message: string;
    reconnectRecommended: boolean;
  } | null>
>();
const mockSendNudge = jest.fn<(...args: unknown[]) => Promise<boolean>>();
const mockFrom = jest.fn();

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => ({ from: (...a: unknown[]) => mockFrom(...a) }),
}));
jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../src/services/instagram-connect-service', () => ({
  forceRefreshInstagramHealth: (...a: unknown[]) => mockForceRefresh(...a),
}));
jest.mock('../../../src/services/notification-service', () => ({
  sendInstagramReconnectNudgeToDoctor: (...a: unknown[]) => mockSendNudge(...a),
}));

import {
  runInstagramTokenHealthJob,
  __test,
} from '../../../src/workers/instagram-token-health-cron';

function chainSelect(rows: unknown[]) {
  const q = {
    select: jest.fn(() => q),
    not: jest.fn(() => q),
    order: jest.fn(() => q),
    limit: jest.fn(async () => ({ data: rows, error: null })),
  };
  return q;
}

describe('shouldNudgeReconnect', () => {
  const base = {
    level: 'warning' as const,
    checkedAt: new Date().toISOString(),
    tokenExpiresAt: null,
    lastDmSuccessAt: null,
    message: 'expiring',
    reconnectRecommended: true,
  };

  it('nudges when transitioning from ok', () => {
    expect(__test.shouldNudgeReconnect('ok', base)).toBe(true);
  });

  it('does not nudge when already warning', () => {
    expect(__test.shouldNudgeReconnect('warning', base)).toBe(false);
  });

  it('nudges on warning → error escalate', () => {
    expect(
      __test.shouldNudgeReconnect('warning', { ...base, level: 'error' })
    ).toBe(true);
  });

  it('does not nudge when reconnect not recommended', () => {
    expect(
      __test.shouldNudgeReconnect('ok', { ...base, reconnectRecommended: false })
    ).toBe(false);
  });
});

describe('runInstagramTokenHealthJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes and nudges on ok → warning transition', async () => {
    mockFrom.mockReturnValue(
      chainSelect([{ doctor_id: 'doc-1', instagram_health_level: 'ok' }])
    );
    mockForceRefresh.mockResolvedValue({
      level: 'warning',
      checkedAt: new Date().toISOString(),
      tokenExpiresAt: null,
      lastDmSuccessAt: null,
      message: 'Token expires soon',
      reconnectRecommended: true,
    });
    mockSendNudge.mockResolvedValue(true);

    const result = await runInstagramTokenHealthJob('corr-1');

    expect(result).toEqual({ scanned: 1, refreshed: 1, nudged: 1, errors: 0 });
    expect(mockForceRefresh).toHaveBeenCalledWith('doc-1', 'corr-1');
    expect(mockSendNudge).toHaveBeenCalledWith('doc-1', 'Token expires soon', 'corr-1');
  });

  it('does not nudge when already in warning', async () => {
    mockFrom.mockReturnValue(
      chainSelect([{ doctor_id: 'doc-1', instagram_health_level: 'warning' }])
    );
    mockForceRefresh.mockResolvedValue({
      level: 'warning',
      checkedAt: new Date().toISOString(),
      tokenExpiresAt: null,
      lastDmSuccessAt: null,
      message: 'still warning',
      reconnectRecommended: true,
    });

    const result = await runInstagramTokenHealthJob('corr-2');

    expect(result.nudged).toBe(0);
    expect(mockSendNudge).not.toHaveBeenCalled();
  });

  it('caps scan via limit', async () => {
    mockFrom.mockReturnValue(chainSelect([]));
    await runInstagramTokenHealthJob('corr-3');
    const q = mockFrom.mock.results[0]?.value as { limit: jest.Mock };
    expect(q.limit).toHaveBeenCalledWith(__test.BATCH_SIZE_CAP);
  });
});
