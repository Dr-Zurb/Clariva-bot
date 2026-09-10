import { afterEach, describe, expect, it, jest } from '@jest/globals';

const mockEnv: { NODE_ENV: 'development' | 'production' | 'test' } = {
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
  startVideoEscalationPollWorker,
  __testInternals,
} from '../../../src/workers/video-escalation-poll-cron';

afterEach(() => {
  mockEnv.NODE_ENV = 'test';
  mockTimeout.mockReset();
  mockGrant.mockReset();
});

describe('video-escalation-poll-cron', () => {
  it('stays off in test so Jest does not open a 5s interval', async () => {
    expect(__testInternals.isWorkerEnabled()).toBe(false);
    const handle = startVideoEscalationPollWorker();
    await handle.runOnce('test');
    expect(mockTimeout).not.toHaveBeenCalled();
    expect(mockGrant).not.toHaveBeenCalled();
    handle.stop();
  });

  it('ticks both jobs on runOnce when enabled', async () => {
    mockEnv.NODE_ENV = 'development';
    mockTimeout.mockResolvedValue({ scanned: 0 });
    mockGrant.mockResolvedValue({ scanned: 0 });
    const handle = startVideoEscalationPollWorker();
    await handle.runOnce('once');
    handle.stop();
    expect(mockTimeout).toHaveBeenCalledWith('once-timeout');
    expect(mockGrant).toHaveBeenCalledWith('once-grant');
  });

  it('ticks every 5 seconds', () => {
    expect(__testInternals.INTERVAL_MS).toBe(5_000);
  });
});
