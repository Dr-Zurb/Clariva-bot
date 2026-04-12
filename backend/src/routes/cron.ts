/**
 * Cron Routes (e-task-5)
 *
 * HTTP endpoints for scheduled jobs (e.g. Render Cron).
 * Secured by CRON_SECRET (Authorization: Bearer <secret> or X-Cron-Secret header).
 */

import { Router, Request, Response } from 'express';
import { DateTime } from 'luxon';
import { env } from '../config/env';
import { processBatchedPayouts } from '../services/payout-service';
import { runStaffReviewTimeoutJob } from '../services/service-staff-review-service';
import { runStablePatternDetectionJob } from '../services/service-match-learning-policy-service';
import { logger } from '../config/logger';

const router = Router();
const IST = 'Asia/Kolkata';

function verifyCronAuth(req: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  const authHeader = req.headers.authorization;
  const cronSecret = req.headers['x-cron-secret'] as string | undefined;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : cronSecret;
  return !!token && token === secret;
}

/**
 * POST /cron/payouts/schedule/:schedule
 *
 * Run a specific schedule (for manual/testing). Same auth as above.
 * Registered first so it matches before the generic /payouts.
 */
router.post('/payouts/schedule/:schedule', async (req: Request, res: Response) => {
  if (!verifyCronAuth(req)) {
    return res.status(401).json({
      success: false,
      error: { code: 'Unauthorized', message: 'Invalid or missing cron secret' },
    });
  }

  const schedule = req.params.schedule as 'daily' | 'weekly' | 'monthly';
  if (!['daily', 'weekly', 'monthly'].includes(schedule)) {
    return res.status(400).json({
      success: false,
      error: { code: 'ValidationError', message: 'schedule must be daily, weekly, or monthly' },
    });
  }

  const correlationId = `cron-${schedule}-${Date.now()}`;

  try {
    const result = await processBatchedPayouts(schedule, correlationId);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ correlationId, schedule, error: msg }, 'Cron payout schedule failed');
    return res.status(500).json({
      success: false,
      error: { code: 'InternalError', message: 'Batch payout failed' },
    });
  }
});

/**
 * POST /cron/payouts
 *
 * Runs scheduled batch payouts. Call daily at 02:00 IST.
 * Processes:
 * - daily: always
 * - weekly: only on Mondays
 * - monthly: only on 1st
 */
router.post('/payouts', async (req: Request, res: Response) => {
  if (!verifyCronAuth(req)) {
    return res.status(401).json({
      success: false,
      error: { code: 'Unauthorized', message: 'Invalid or missing cron secret' },
    });
  }

  const correlationId = `cron-${Date.now()}`;
  const now = DateTime.now().setZone(IST);
  const isMonday = now.weekday === 1;
  const isFirstOfMonth = now.day === 1;

  const schedules: Array<'daily' | 'weekly' | 'monthly'> = ['daily'];
  if (isMonday) schedules.push('weekly');
  if (isFirstOfMonth) schedules.push('monthly');

  const results: Array<{
    schedule: string;
    doctorsProcessed: number;
    paymentsProcessed: number;
    paymentsSkipped: number;
    paymentsFailed: number;
  }> = [];

  try {
    for (const schedule of schedules) {
      const r = await processBatchedPayouts(schedule, correlationId);
      results.push(r);
    }

    return res.status(200).json({
      success: true,
      data: {
        ranAt: now.toISO(),
        schedulesProcessed: schedules,
        results,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ correlationId, error: msg }, 'Cron payouts failed');
    return res.status(500).json({
      success: false,
      error: { code: 'InternalError', message: 'Batch payout failed' },
    });
  }
});

/**
 * POST /cron/staff-review-timeouts
 *
 * ARM-08: close expired pending staff service-review rows and send at-most-once Instagram notify where applicable.
 * Schedule externally (e.g. every 15 minutes UTC) with same CRON_SECRET as payouts.
 */
router.post('/staff-review-timeouts', async (req: Request, res: Response) => {
  if (!verifyCronAuth(req)) {
    return res.status(401).json({
      success: false,
      error: { code: 'Unauthorized', message: 'Invalid or missing cron secret' },
    });
  }

  const correlationId = `cron-staff-review-timeout-${Date.now()}`;

  try {
    const data = await runStaffReviewTimeoutJob(correlationId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ correlationId, error: msg }, 'Cron staff review timeouts failed');
    return res.status(500).json({
      success: false,
      error: { code: 'InternalError', message: 'Staff review timeout job failed' },
    });
  }
});

/**
 * POST /cron/learning-policy-detection
 *
 * learn-04: RPC stable_reassignment_pattern_candidates + insert pending policy suggestions.
 * Schedule daily (or weekly) with same CRON_SECRET as payouts.
 */
router.post('/learning-policy-detection', async (req: Request, res: Response) => {
  if (!verifyCronAuth(req)) {
    return res.status(401).json({
      success: false,
      error: { code: 'Unauthorized', message: 'Invalid or missing cron secret' },
    });
  }

  const correlationId = `cron-learning-policy-${Date.now()}`;

  try {
    const data = await runStablePatternDetectionJob(correlationId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ correlationId, error: msg }, 'Cron learning policy detection failed');
    return res.status(500).json({
      success: false,
      error: { code: 'InternalError', message: 'Learning policy detection job failed' },
    });
  }
});

export default router;
