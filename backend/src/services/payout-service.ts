/**
 * Payout Service — DEPRECATED (billing P0, 2026-08-22).
 *
 * Used to transfer patient payments to doctors via Razorpay Route.
 * That is RBI PA activity and the model the pricing decision log rules out.
 * `processPayoutForPayment` and `processBatchedPayouts` are no-ops: they
 * log and return without calling Razorpay. Cron routes stay mounted (P0-D3).
 *
 * `getPeriodForSchedule` is kept — it is date math, not money movement.
 *
 * @see docs/Work/Product plans/billing/plan-p0-billing-demolition.md
 */

import { DateTime } from 'luxon';
import { logger } from '../config/logger';

const DEFAULT_TZ = 'Asia/Kolkata';

export type BatchSchedule = 'daily' | 'weekly' | 'monthly';

export interface PeriodResult {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
}

export interface BatchedPayoutResult {
  schedule: BatchSchedule;
  doctorsProcessed: number;
  paymentsProcessed: number;
  paymentsSkipped: number;
  paymentsFailed: number;
  skipped?: 'deprecated';
}

/**
 * Get period boundaries for a payout schedule in a given timezone.
 * Uses doctor's timezone for correct period boundaries.
 *
 * @param schedule - daily | weekly | monthly
 * @param tz - IANA timezone (e.g. Asia/Kolkata); defaults to Asia/Kolkata
 * @param referenceDate - Optional date to compute "last" period from (default: now in tz)
 */
export function getPeriodForSchedule(
  schedule: BatchSchedule,
  tz: string = DEFAULT_TZ,
  referenceDate?: Date
): PeriodResult {
  const ref = referenceDate ? DateTime.fromJSDate(referenceDate, { zone: tz }) : DateTime.now().setZone(tz);
  const zone = ref.isValid ? ref.zone : undefined;
  const safeTz = zone ? tz : DEFAULT_TZ;
  const now = ref.isValid ? ref : DateTime.now().setZone(safeTz);

  let start: DateTime;
  let end: DateTime;

  switch (schedule) {
    case 'daily': {
      const yesterday = now.minus({ days: 1 });
      start = yesterday.startOf('day');
      end = yesterday.endOf('day');
      break;
    }
    case 'weekly': {
      const lastWeekEnd = now.minus({ weeks: 1 }).endOf('week');
      const lastWeekStart = lastWeekEnd.startOf('week');
      start = lastWeekStart;
      end = lastWeekEnd;
      break;
    }
    case 'monthly': {
      const lastMonth = now.minus({ months: 1 });
      start = lastMonth.startOf('month');
      end = lastMonth.endOf('month');
      break;
    }
    default:
      throw new Error(`Unknown schedule: ${schedule}`);
  }

  return {
    start: start.toJSDate(),
    end: end.toJSDate(),
    startIso: start.toISO()!,
    endIso: end.toISO()!,
  };
}

/**
 * Deprecated no-op. Does not transfer money.
 */
export async function processPayoutForPayment(
  paymentId: string,
  correlationId: string,
  _options?: { skipThresholdCheck?: boolean }
): Promise<{ success: boolean; skipped: 'deprecated' }> {
  logger.info(
    { correlationId, paymentId },
    'Payout skipped: deprecated — Halo Aid is never in the patient money flow'
  );
  return { success: true, skipped: 'deprecated' };
}

/**
 * Deprecated no-op. Does not transfer money. Returns zero counts so cron stays 200.
 */
export async function processBatchedPayouts(
  schedule: BatchSchedule,
  correlationId: string
): Promise<BatchedPayoutResult> {
  logger.info(
    { correlationId, schedule },
    'Batch payout skipped: deprecated — Halo Aid is never in the patient money flow'
  );
  return {
    schedule,
    doctorsProcessed: 0,
    paymentsProcessed: 0,
    paymentsSkipped: 0,
    paymentsFailed: 0,
    skipped: 'deprecated',
  };
}
