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
import { runAbandonedBookingReminderJob } from '../services/abandoned-booking-reminder';
import { runConsultationPrePingJob } from '../services/consultation-pre-ping-job';
import { runAccountDeletionFinalizeJob } from '../workers/account-deletion-cron';
import { runRecordingArchivalJob } from '../workers/recording-archival-cron';
import { runVoiceTranscriptionJob } from '../workers/voice-transcription-worker';
import { runVideoEscalationTimeoutJob } from '../workers/video-escalation-timeout-worker';
import { runModalityPendingTimeoutJob } from '../workers/modality-pending-timeout-worker';
import { runModalityRefundRetryJob } from '../workers/modality-refund-retry-worker';
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

/**
 * POST /cron/abandoned-booking-reminders
 *
 * Send one-time reminder DM ~1 hour after booking link was sent with no payment.
 * Schedule externally (e.g. every 10 minutes) with same CRON_SECRET.
 */
/**
 * POST /cron/consultation-pre-ping
 *
 * Plan 04 · Task 18 — Pre-consult provisioning + patient fan-out for text
 * consults. Schedule externally **every minute** with the same
 * CRON_SECRET as payouts.
 *
 * Each tick: looks at text appointments inside the next
 * `CONSULTATION_PRE_PING_LEAD_MINUTES` window (default 5 min), creates a
 * `consultation_sessions` row via the facade if missing, and fires
 * `sendConsultationReadyToPatient` (DM + email + SMS, with dedup so
 * re-runs don't spam).
 *
 * Idempotent — safe to re-run / overlap. See `consultation-pre-ping-job.ts`.
 */
router.post('/consultation-pre-ping', async (req: Request, res: Response) => {
  if (!verifyCronAuth(req)) {
    return res.status(401).json({
      success: false,
      error: { code: 'Unauthorized', message: 'Invalid or missing cron secret' },
    });
  }

  const correlationId = `cron-consult-pre-ping-${Date.now()}`;

  try {
    const data = await runConsultationPrePingJob(correlationId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ correlationId, error: msg }, 'Cron consultation pre-ping failed');
    return res.status(500).json({
      success: false,
      error: { code: 'InternalError', message: 'Consultation pre-ping job failed' },
    });
  }
});

router.post('/abandoned-booking-reminders', async (req: Request, res: Response) => {
  if (!verifyCronAuth(req)) {
    return res.status(401).json({
      success: false,
      error: { code: 'Unauthorized', message: 'Invalid or missing cron secret' },
    });
  }

  const correlationId = `cron-abandoned-booking-${Date.now()}`;

  try {
    const data = await runAbandonedBookingReminderJob(correlationId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ correlationId, error: msg }, 'Cron abandoned booking reminders failed');
    return res.status(500).json({
      success: false,
      error: { code: 'InternalError', message: 'Abandoned booking reminder job failed' },
    });
  }
});

/**
 * POST /cron/account-deletion-finalize
 *
 * Plan 02 · Task 33 — finalize patient account-deletion requests whose
 * grace window has expired. Writes `signed_url_revocation` rows,
 * scrubs patient PII, sends the explainer DM, and stamps the audit
 * row. Idempotent per patient. Schedule externally **once per day**
 * (e.g. 02:30 IST) with the same CRON_SECRET as the payouts job.
 *
 * A per-row error is logged and counted in `failed`; the job as a
 * whole returns HTTP 200 unless the initial scan itself fails. Ops
 * dashboards should alert on `data.failed > 0`.
 */
router.post('/account-deletion-finalize', async (req: Request, res: Response) => {
  if (!verifyCronAuth(req)) {
    return res.status(401).json({
      success: false,
      error: { code: 'Unauthorized', message: 'Invalid or missing cron secret' },
    });
  }

  const correlationId = `cron-account-deletion-${Date.now()}`;

  try {
    const data = await runAccountDeletionFinalizeJob(correlationId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ correlationId, error: msg }, 'Cron account-deletion finalize failed');
    return res.status(500).json({
      success: false,
      error: { code: 'InternalError', message: 'Account-deletion finalize job failed' },
    });
  }
});

/**
 * POST /cron/recording-archival
 *
 * Plan 02 · Task 34 — nightly two-phase archival.
 *
 *   1. Hide phase: flips `patient_self_serve_visible` FALSE on
 *      artifacts past their 90-day TTL. Always real.
 *   2. Hard-delete phase: removes storage objects past the regulatory
 *      retention window. Dry-run unless
 *      `ARCHIVAL_HARD_DELETE_ENABLED === 'true'`.
 *
 * Per-row failures are counted in the response payload. Schedule
 * externally ~02:45 IST daily with the same CRON_SECRET as the other
 * cron routes. Ops alerts on `hidePhase.error` or `deletePhase.error`
 * being present, or on candidates-without-matching-mutations
 * (`hide.candidates > 0 && hide.hidden == 0`) once hard-delete is
 * enabled.
 */
router.post('/recording-archival', async (req: Request, res: Response) => {
  if (!verifyCronAuth(req)) {
    return res.status(401).json({
      success: false,
      error: { code: 'Unauthorized', message: 'Invalid or missing cron secret' },
    });
  }

  const correlationId = `cron-recording-archival-${Date.now()}`;

  try {
    const data = await runRecordingArchivalJob(correlationId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ correlationId, error: msg }, 'Cron recording archival failed');
    return res.status(500).json({
      success: false,
      error: { code: 'InternalError', message: 'Recording archival job failed' },
    });
  }
});

/**
 * POST /cron/voice-transcription
 *
 * Plan 05 · Task 25 — post-consult voice transcription polling worker.
 *
 * Each tick:
 *   1. Pulls up to `VOICE_TRANSCRIPTION_WORKER_BATCH_SIZE` queued rows
 *      (oldest first, backoff-aware).
 *   2. Resolves the Twilio audio Composition; rows whose Composition
 *      hasn't been finalised yet are left queued and counted in
 *      `notYetReady`.
 *   3. Runs the selected provider (Whisper / Deepgram), persists the
 *      transcript + cost telemetry, and emits the structured
 *      `'voice-transcription: completed'` log line.
 *
 * Schedule externally **every minute** (or every 30s if latency matters)
 * with the same CRON_SECRET as the other cron routes. Per-row failures
 * are counted in the response; the HTTP call returns 200 with totals so
 * Render Cron doesn't spam alerts on transient provider blips. Ops
 * dashboards alert on `failed > 0 && processed === 0` or on the
 * `'voice-transcription-worker: retry cap hit'` log signal.
 */
router.post('/voice-transcription', async (req: Request, res: Response) => {
  if (!verifyCronAuth(req)) {
    return res.status(401).json({
      success: false,
      error: { code: 'Unauthorized', message: 'Invalid or missing cron secret' },
    });
  }

  const correlationId = `cron-voice-transcription-${Date.now()}`;

  try {
    const data = await runVoiceTranscriptionJob(correlationId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ correlationId, error: msg }, 'Cron voice transcription failed');
    return res.status(500).json({
      success: false,
      error: { code: 'InternalError', message: 'Voice transcription job failed' },
    });
  }
});

/**
 * POST /cron/video-escalation-timeout
 *
 * Plan 08 · Task 41 — close `video_escalation_audit` rows whose 60s
 * patient-consent window has elapsed without a response (flips
 * `patient_response` to `'timeout'`). Designed to be safe under
 * concurrent runs (atomic UPDATE with `patient_response IS NULL`
 * predicate); cron ticks every 5s so timeouts fire at 60–65s worst
 * case. Same CRON_SECRET gating as the other jobs.
 */
router.post('/video-escalation-timeout', async (req: Request, res: Response) => {
  if (!verifyCronAuth(req)) {
    return res.status(401).json({
      success: false,
      error: { code: 'Unauthorized', message: 'Invalid or missing cron secret' },
    });
  }

  const correlationId = `cron-video-escalation-timeout-${Date.now()}`;

  try {
    const data = await runVideoEscalationTimeoutJob(correlationId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ correlationId, error: msg }, 'Cron video escalation timeout failed');
    return res.status(500).json({
      success: false,
      error: { code: 'InternalError', message: 'Video escalation timeout job failed' },
    });
  }
});

/**
 * POST /cron/modality-pending-timeout
 *
 * Plan 09 · Task 47 — close `modality_change_pending_requests` rows
 * whose 90s (patient-upgrade) or 60s (doctor-upgrade) window has
 * elapsed without a counter-party response (flips `response` to
 * `'timeout'`). Safe under concurrent runs (atomic UPDATE with
 * `response IS NULL` predicate); schedule every 5s so timeouts fire
 * at 60-65s / 90-95s worst case. Same CRON_SECRET gating as the
 * other jobs.
 */
router.post('/modality-pending-timeout', async (req: Request, res: Response) => {
  if (!verifyCronAuth(req)) {
    return res.status(401).json({
      success: false,
      error: { code: 'Unauthorized', message: 'Invalid or missing cron secret' },
    });
  }

  const correlationId = `cron-modality-pending-timeout-${Date.now()}`;

  try {
    const data = await runModalityPendingTimeoutJob(correlationId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ correlationId, error: msg }, 'Cron modality pending timeout failed');
    return res.status(500).json({
      success: false,
      error: { code: 'InternalError', message: 'Modality pending timeout job failed' },
    });
  }
});

/**
 * POST /cron/modality-refund-retry
 *
 * Plan 09 Task 49 refund retry worker. Run every 15 minutes by the
 * cron provider. Scans `consultation_modality_history` rows where
 * `billing_action='auto_refund_downgrade' AND razorpay_refund_id IS NULL`
 * and retries the Razorpay refund with exponential backoff
 * (1m → 5m → 15m → 1h → 6h → 24h). After 6 failed attempts the row is
 * sentinelled (`refund_retry_count=99`) + an `admin_payment_alerts`
 * row is written for ops follow-up.
 */
router.post('/modality-refund-retry', async (req: Request, res: Response) => {
  if (!verifyCronAuth(req)) {
    return res.status(401).json({
      success: false,
      error: { code: 'Unauthorized', message: 'Invalid or missing cron secret' },
    });
  }

  const correlationId = `cron-modality-refund-retry-${Date.now()}`;

  try {
    const data = await runModalityRefundRetryJob(correlationId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ correlationId, error: msg }, 'Cron modality refund retry failed');
    return res.status(500).json({
      success: false,
      error: { code: 'InternalError', message: 'Modality refund retry job failed' },
    });
  }
});

export default router;
