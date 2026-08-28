/**
 * Cron route tests for POST /cron/booking-review-sla-alerts (alr2-04).
 *
 * Mocks sibling cron deps so importing `routes/cron` stays light, then
 * invokes the matching Express layer handler with hand-rolled req/res.
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
const mockRunJob = jest.fn<
  (...args: unknown[]) => Promise<{
    scanned: number;
    inserted: number;
    deduped: number;
    errors: number;
  }>
>();
jest.mock('../../../src/services/booking-review-sla-alert-service', () => ({
  runBookingReviewSlaAlertJob: (...a: unknown[]) => mockRunJob(...a),
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
jest.mock('../../../src/workers/dashboard-events-retention-cron', () => ({
  runDashboardEventsRetentionJob: jest.fn(),
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
      l.route?.path === '/booking-review-sla-alerts' &&
      l.route.methods.post === true,
  );
  if (!layer?.route?.stack[0]?.handle) {
    throw new Error('POST /booking-review-sla-alerts handler not found');
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
    url:    '/cron/booking-review-sla-alerts',
  } as unknown as Request;
}

describe('POST /cron/booking-review-sla-alerts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunJob.mockResolvedValue({
      scanned:  1,
      inserted: 1,
      deduped:  0,
      errors:   0,
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
        scanned:  1,
        inserted: 1,
        deduped:  0,
        errors:   0,
      },
    });
    expect(mockRunJob).toHaveBeenCalledTimes(1);
    expect(String(mockRunJob.mock.calls[0]?.[0])).toMatch(
      /^cron-booking-review-sla-alert-/,
    );
  });
});
