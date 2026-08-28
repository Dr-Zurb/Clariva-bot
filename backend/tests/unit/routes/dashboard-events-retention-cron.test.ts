/**
 * Cron route tests for POST /cron/dashboard-events-retention (alr2-05).
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../../src/config/env', () => ({
  env: { CRON_SECRET: 'test-cron-secret' },
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../src/services/payout-service', () => ({
  processBatchedPayouts: jest.fn(),
}));
jest.mock('../../../src/services/service-staff-review-service', () => ({
  runStaffReviewTimeoutJob: jest.fn(),
}));
jest.mock('../../../src/services/booking-review-sla-alert-service', () => ({
  runBookingReviewSlaAlertJob: jest.fn(),
}));
jest.mock('../../../src/services/service-match-learning-policy-service', () => ({
  runStablePatternDetectionJob: jest.fn(),
}));
jest.mock('../../../src/services/abandoned-booking-reminder', () => ({
  runAbandonedBookingReminderJob: jest.fn(),
}));
jest.mock('../../../src/services/consultation-pre-ping-job', () => ({
  runConsultationPrePingJob: jest.fn(),
}));
jest.mock('../../../src/workers/account-deletion-cron', () => ({
  runAccountDeletionFinalizeJob: jest.fn(),
}));
jest.mock('../../../src/workers/recording-archival-cron', () => ({
  runRecordingArchivalJob: jest.fn(),
}));
const mockRunJob = jest.fn<
  (...args: unknown[]) => Promise<{
    retentionDays: number;
    scanned: number;
    deleted: number;
    errors: number;
  }>
>();
jest.mock('../../../src/workers/dashboard-events-retention-cron', () => ({
  runDashboardEventsRetentionJob: (...a: unknown[]) => mockRunJob(...a),
}));
jest.mock('../../../src/workers/instagram-token-health-cron', () => ({
  runInstagramTokenHealthJob: jest.fn(),
}));
jest.mock('../../../src/workers/ghost-account-sweep-cron', () => ({
  runGhostAccountSweepJob: jest.fn(),
}));
jest.mock('../../../src/workers/voice-transcription-worker', () => ({
  runVoiceTranscriptionJob: jest.fn(),
}));
jest.mock('../../../src/workers/video-escalation-timeout-worker', () => ({
  runVideoEscalationTimeoutJob: jest.fn(),
}));
jest.mock('../../../src/workers/modality-pending-timeout-worker', () => ({
  runModalityPendingTimeoutJob: jest.fn(),
}));
jest.mock('../../../src/workers/modality-refund-retry-worker', () => ({
  runModalityRefundRetryJob: jest.fn(),
}));

import cronRouter from '../../../src/routes/cron';

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: Request, res: Response) => unknown }>;
  };
};

function getHandler(): (req: Request, res: Response) => Promise<unknown> {
  const stack = (cronRouter as unknown as { stack: Layer[] }).stack;
  const layer = stack.find(
    (l) =>
      l.route?.path === '/dashboard-events-retention' &&
      l.route.methods.post === true,
  );
  if (!layer?.route?.stack[0]?.handle) {
    throw new Error('POST /dashboard-events-retention handler not found');
  }
  return layer.route.stack[0].handle as (req: Request, res: Response) => Promise<unknown>;
}

function makeRes(): {
  res: Response;
  getStatus: () => number;
  getPayload: () => unknown;
} {
  const out = { statusCode: 0, payload: undefined as unknown };
  const res = {
    status(code: number) {
      out.statusCode = code;
      return res;
    },
    json(body: unknown) {
      out.payload = body;
      return res;
    },
  } as unknown as Response;
  return {
    res,
    getStatus:  () => out.statusCode,
    getPayload: () => out.payload,
  };
}

function makeReq(headers: Record<string, string>): Request {
  return {
    headers,
    method: 'POST',
    url:    '/cron/dashboard-events-retention',
  } as unknown as Request;
}

describe('POST /cron/dashboard-events-retention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunJob.mockResolvedValue({
      retentionDays: 90,
      scanned:       3,
      deleted:       3,
      errors:        0,
    });
  });

  it('returns 401 when the cron secret is missing/wrong', async () => {
    const handler = getHandler();
    const box = makeRes();

    await handler(makeReq({ authorization: 'Bearer wrong' }), box.res);

    expect(box.getStatus()).toBe(401);
    expect(box.getPayload()).toMatchObject({
      success: false,
      error:   { code: 'Unauthorized' },
    });
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('returns 200 totals when authorized', async () => {
    const handler = getHandler();
    const box = makeRes();

    await handler(
      makeReq({ authorization: 'Bearer test-cron-secret' }),
      box.res,
    );

    expect(box.getStatus()).toBe(200);
    expect(box.getPayload()).toEqual({
      success: true,
      data: {
        retentionDays: 90,
        scanned:       3,
        deleted:       3,
        errors:        0,
      },
    });
    expect(mockRunJob).toHaveBeenCalledTimes(1);
    expect(String(mockRunJob.mock.calls[0]?.[0])).toMatch(
      /^cron-dashboard-events-retention-/,
    );
  });
});
