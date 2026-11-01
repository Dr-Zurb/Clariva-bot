import { afterEach, describe, expect, it, jest } from '@jest/globals';

const mockEnv: {
  NODE_ENV: 'development' | 'production' | 'test';
  VIDEO_ESCALATION_WORKER_ENABLED?: boolean;
} = {
  NODE_ENV: 'test',
};

jest.mock('../../../src/config/env', () => ({
  env: mockEnv,
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mockTimeout = jest.fn<(correlationId: string) => Promise<{ scanned: number }>>();
const mockGrant = jest.fn<(correlationId: string) => Promise<{ scanned: number }>>();

jest.mock('../../../src/workers/video-escalation-timeout-worker', () => ({
  runVideoEscalationTimeoutJob: (id: string) => mockTimeout(id),
}));
jest.mock('../../../src/workers/video-grant-expiry-worker', () => ({
  runVideoGrantExpiryJob: (id: string) => mockGrant(id),
}));

import {
  clearVideoEscalationWakesForTests,
  scheduleVideoEscalationWake,
} from '../../../src/workers/video-escalation-wake';

afterEach(() => {
  clearVideoEscalationWakesForTests();
  jest.useRealTimers();
  mockEnv.NODE_ENV = 'test';
  delete mockEnv.VIDEO_ESCALATION_WORKER_ENABLED;
  mockTimeout.mockReset();
  mockGrant.mockReset();
});

describe('scheduleVideoEscalationWake', () => {
  it('does not arm a timer outside production when the flag is unset', () => {
    jest.useFakeTimers();
    mockEnv.NODE_ENV = 'development';
    scheduleVideoEscalationWake(
      'consent:abc',
      new Date(Date.now() + 1_000).toISOString(),
    );
    jest.advanceTimersByTime(5_000);
    expect(mockTimeout).not.toHaveBeenCalled();
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it('runs both jobs at the later deadline when the same key is rescheduled', async () => {
    jest.useFakeTimers();
    mockEnv.NODE_ENV = 'production';
    mockTimeout.mockResolvedValue({ scanned: 0 });
    mockGrant.mockResolvedValue({ scanned: 0 });
    const now = Date.now();
    scheduleVideoEscalationWake('grant:row', new Date(now + 1_000).toISOString());
    scheduleVideoEscalationWake('grant:row', new Date(now + 5_000).toISOString());

    await jest.advanceTimersByTimeAsync(1_000);
    expect(mockTimeout).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(4_000);
    expect(mockTimeout).toHaveBeenCalledTimes(1);
    expect(mockGrant).toHaveBeenCalledTimes(1);
    expect(mockTimeout.mock.calls[0]?.[0]).toContain('grant:row');
    expect(mockTimeout.mock.calls[0]?.[0].endsWith('-timeout')).toBe(true);
    expect(mockGrant.mock.calls[0]?.[0].endsWith('-grant')).toBe(true);
  });
});
