/**
 * Outbound Meta send-failure spike detector.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFrom = jest.fn();
const mockSendEmail = jest.fn<(...args: unknown[]) => Promise<boolean>>();
const mockPause = jest.fn<
  (...args: unknown[]) => Promise<'paused' | 'already_paused' | 'unavailable'>
>();

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => ({ from: (...a: unknown[]) => mockFrom(...a) }),
}));
jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../src/config/email', () => ({
  sendEmail: (...a: unknown[]) => mockSendEmail(...a),
}));
jest.mock('../../../src/config/env', () => ({
  env: {
    OUTBOUND_SPIKE_AUTO_PAUSE: true,
    DEFAULT_DOCTOR_EMAIL: 'founder@example.com',
  },
}));
jest.mock('../../../src/services/doctor-settings-service', () => ({
  pauseInstagramReceptionistForIncident: (...a: unknown[]) => mockPause(...a),
}));

import {
  OUTBOUND_SPIKE_FAILURE_THRESHOLD,
  isSpikeErrorType,
  runOutboundSpikeJob,
} from '../../../src/workers/outbound-spike-cron';

const DOCTOR_ID = '7ab212da-2694-4e6d-97ff-c71ab451ef52';

function failureRows(count: number, errorType: string) {
  return Array.from({ length: count }, () => ({
    metadata: { doctor_id: DOCTOR_ID, error_type: errorType },
  }));
}

function chainSelect(rows: unknown[]) {
  const q = {
    select: jest.fn(() => q),
    eq: jest.fn(() => q),
    gte: jest.fn(() => q),
    limit: jest.fn(async () => ({ data: rows, error: null })),
  };
  return q;
}

describe('isSpikeErrorType', () => {
  it('ignores window-expired, kill-switch, and not-found', () => {
    expect(isSpikeErrorType('MessageWindowExpiredError')).toBe(false);
    expect(isSpikeErrorType('ServiceUnavailableError')).toBe(false);
    expect(isSpikeErrorType('NotFoundError')).toBe(false);
  });

  it('counts restriction-shaped failures', () => {
    expect(isSpikeErrorType('ForbiddenError')).toBe(true);
    expect(isSpikeErrorType('TooManyRequestsError')).toBe(true);
    expect(isSpikeErrorType('UnauthorizedError')).toBe(true);
  });
});

describe('runOutboundSpikeJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendEmail.mockResolvedValue(true);
    mockPause.mockResolvedValue('paused');
  });

  it('does nothing under the threshold', async () => {
    mockFrom.mockReturnValue(chainSelect(failureRows(2, 'ForbiddenError')));
    const result = await runOutboundSpikeJob('c1');
    expect(result.doctorsOverThreshold).toBe(0);
    expect(mockPause).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('pauses and emails when over threshold', async () => {
    mockFrom.mockReturnValue(
      chainSelect(failureRows(OUTBOUND_SPIKE_FAILURE_THRESHOLD, 'ForbiddenError'))
    );
    const result = await runOutboundSpikeJob('c1');
    expect(result.doctorsOverThreshold).toBe(1);
    expect(result.paused).toBe(1);
    expect(result.emailed).toBe(1);
    expect(mockPause).toHaveBeenCalledWith(DOCTOR_ID, 'c1');
    expect(mockSendEmail).toHaveBeenCalledWith(
      'founder@example.com',
      'Halo Aid: Instagram send-failure spike',
      expect.stringContaining(DOCTOR_ID),
      'c1'
    );
  });

  it('skips email when already paused', async () => {
    mockPause.mockResolvedValue('already_paused');
    mockFrom.mockReturnValue(
      chainSelect(failureRows(OUTBOUND_SPIKE_FAILURE_THRESHOLD, 'TooManyRequestsError'))
    );
    const result = await runOutboundSpikeJob('c1');
    expect(result.alreadyPaused).toBe(1);
    expect(result.emailed).toBe(0);
  });

  it('ignores window-expired rows even at high volume', async () => {
    mockFrom.mockReturnValue(
      chainSelect(failureRows(OUTBOUND_SPIKE_FAILURE_THRESHOLD, 'MessageWindowExpiredError'))
    );
    const result = await runOutboundSpikeJob('c1');
    expect(result.doctorsOverThreshold).toBe(0);
    expect(mockPause).not.toHaveBeenCalled();
  });
});
