/**
 * Payout Service (Payout Initiative)
 *
 * Processes single-payment payouts via Razorpay Route.
 * Called when consultation is verified and doctor has payout_schedule='per_appointment'.
 * Core logic reused by batch job (e-task-5).
 *
 * @see PAYOUT_INITIATIVE.md
 */

import { DateTime } from 'luxon';
import { getSupabaseAdminClient } from '../config/database';
import { getDoctorSettings } from './doctor-settings-service';
import { createTransferFromPayment } from '../adapters/razorpay-route-adapter';
import { handleSupabaseError } from '../utils/db-helpers';
import { logger } from '../config/logger';
import { logDataModification } from '../utils/audit-logger';
const DEFAULT_TZ = 'Asia/Kolkata';

export type BatchSchedule = 'daily' | 'weekly' | 'monthly';

export interface PeriodResult {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
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
      // Last Monday 00:00 – Sunday 23:59
      const lastWeekEnd = now.minus({ weeks: 1 }).endOf('week'); // last Sunday 23:59
      const lastWeekStart = lastWeekEnd.startOf('week'); // last Monday 00:00
      start = lastWeekStart;
      end = lastWeekEnd;
      break;
    }
    case 'monthly': {
      // Last month 1st 00:00 – last day 23:59
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
 * Process payout for a single payment.
 * Idempotent: skips if payout_status is not pending.
 *
 * @param paymentId - Our payments.id (UUID)
 * @param correlationId - Request correlation ID
 * @param options - skipThresholdCheck: when true, bypass payout_minor check (used by batch)
 * @returns { success: true } when payout completed; { success: false } when skipped or failed
 */
export async function processPayoutForPayment(
  paymentId: string,
  correlationId: string,
  options?: { skipThresholdCheck?: boolean }
): Promise<{ success: boolean }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn({ correlationId, paymentId }, 'Payout skipped: no database');
    return { success: false };
  }

  const { data: payment, error: payErr } = await admin
    .from('payments')
    .select(
      'id, appointment_id, gateway, gateway_payment_id, status, payout_status, doctor_amount_minor, currency'
    )
    .eq('id', paymentId)
    .single();

  if (payErr || !payment) {
    logger.warn({ correlationId, paymentId, error: payErr?.message }, 'Payout skipped: payment not found');
    return { success: false };
  }

  if (payment.status !== 'captured') {
    logger.debug({ correlationId, paymentId, status: payment.status }, 'Payout skipped: payment not captured');
    return { success: false };
  }

  const payoutStatus = payment.payout_status ?? 'pending';
  if (payoutStatus !== 'pending') {
    logger.debug({ correlationId, paymentId, payoutStatus }, 'Payout skipped: already processed');
    return { success: false };
  }

  if (payment.gateway !== 'razorpay' || (payment.currency || '').toUpperCase() !== 'INR') {
    logger.debug({ correlationId, paymentId, gateway: payment.gateway }, 'Payout skipped: Razorpay INR only');
    return { success: false };
  }

  const doctorAmount = payment.doctor_amount_minor ?? 0;
  if (doctorAmount <= 0) {
    logger.warn({ correlationId, paymentId }, 'Payout skipped: no doctor amount');
    return { success: false };
  }

  if (!payment.gateway_payment_id) {
    logger.warn({ correlationId, paymentId }, 'Payout skipped: no Razorpay payment ID');
    return { success: false };
  }

  const { data: appointment } = await admin
    .from('appointments')
    .select('doctor_id')
    .eq('id', payment.appointment_id)
    .single();

  if (!appointment?.doctor_id) {
    logger.warn({ correlationId, paymentId }, 'Payout skipped: appointment not found');
    return { success: false };
  }

  const settings = await getDoctorSettings(appointment.doctor_id);
  if (!settings?.razorpay_linked_account_id) {
    logger.info(
      { correlationId, paymentId, doctorId: appointment.doctor_id },
      'Payout skipped: doctor has no linked account'
    );
    return { success: false };
  }

  const skipThreshold = options?.skipThresholdCheck === true;
  const payoutMinor = settings.payout_minor ?? 0;
  if (!skipThreshold && payoutMinor > 0 && doctorAmount < payoutMinor) {
    logger.info(
      { correlationId, paymentId, doctorAmount, payoutMinor },
      'Payout skipped: below minimum threshold'
    );
    return { success: false };
  }

  const { error: updateProcessing } = await admin
    .from('payments')
    .update({ payout_status: 'processing' })
    .eq('id', paymentId);

  if (updateProcessing) {
    logger.error({ correlationId, paymentId, error: updateProcessing.message }, 'Failed to set payout processing');
    return { success: false };
  }

  try {
    const { transferId } = await createTransferFromPayment(
      {
        razorpayPaymentId: payment.gateway_payment_id,
        linkedAccountId: settings.razorpay_linked_account_id,
        amountMinor: doctorAmount,
        currency: payment.currency || 'INR',
        notes: { payment_id: paymentId, appointment_id: payment.appointment_id },
      },
      correlationId
    );

    const now = new Date().toISOString();
    const { error: updatePaid } = await admin
      .from('payments')
      .update({ payout_status: 'paid', payout_id: transferId, paid_at: now, payout_failed_reason: null })
      .eq('id', paymentId);

    if (updatePaid) {
      handleSupabaseError(updatePaid, correlationId);
      return { success: false };
    }

    logger.info({ correlationId, paymentId, transferId }, 'Payout completed');
    await logDataModification(correlationId, undefined as any, 'update', 'payment', paymentId, [
      'payout_status',
      'payout_id',
      'paid_at',
    ]);
    return { success: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const { error: updateFailed } = await admin
      .from('payments')
      .update({ payout_status: 'failed', payout_failed_reason: errMsg })
      .eq('id', paymentId);

    if (updateFailed) {
      logger.error({ correlationId, paymentId }, 'Failed to record payout failure');
    }

    logger.error({ correlationId, paymentId, error: errMsg }, 'Payout transfer failed');
    return { success: false };
  }
}

// ============================================================================
// Batch Payouts (e-task-5)
// ============================================================================

export interface BatchedPayoutResult {
  schedule: BatchSchedule;
  doctorsProcessed: number;
  paymentsProcessed: number;
  paymentsSkipped: number;
  paymentsFailed: number;
}

/**
 * Process batched payouts for a schedule (daily, weekly, monthly).
 * Option B: multiple Payment transfers (one per payment). Doctor receives multiple credits.
 *
 * For each doctor with payout_schedule = schedule and razorpay_linked_account_id set:
 * - Compute period (yesterday, last Mon–Sun, last month) in doctor's timezone
 * - Query payments: captured, payout_status=pending, appointment.verified_at in period
 * - Sum doctor_amount_minor; skip doctor if sum < payout_minor
 * - Process each payment via processPayoutForPayment (with skipThresholdCheck)
 *
 * @param schedule - daily | weekly | monthly
 * @param correlationId - Request correlation ID
 */
export async function processBatchedPayouts(
  schedule: BatchSchedule,
  correlationId: string
): Promise<BatchedPayoutResult> {
  const result: BatchedPayoutResult = {
    schedule,
    doctorsProcessed: 0,
    paymentsProcessed: 0,
    paymentsSkipped: 0,
    paymentsFailed: 0,
  };

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn({ correlationId, schedule }, 'Batch payout skipped: no database');
    return result;
  }

  const { data: doctors, error: docErr } = await admin
    .from('doctor_settings')
    .select('doctor_id, timezone, payout_minor')
    .eq('payout_schedule', schedule)
    .not('razorpay_linked_account_id', 'is', null);

  if (docErr) {
    logger.error({ correlationId, schedule, error: docErr.message }, 'Batch payout: failed to fetch doctors');
    return result;
  }

  if (!doctors?.length) {
    logger.debug({ correlationId, schedule }, 'Batch payout: no doctors with this schedule');
    return result;
  }

  for (const doc of doctors) {
    const tz = doc.timezone || DEFAULT_TZ;
    const { startIso, endIso } = getPeriodForSchedule(schedule, tz);

    // Get appointments verified in period for this doctor
    const { data: aptIds } = await admin
      .from('appointments')
      .select('id')
      .eq('doctor_id', doc.doctor_id)
      .gte('verified_at', startIso)
      .lte('verified_at', endIso)
      .not('verified_at', 'is', null);

    const appointmentIds = aptIds?.map((a: { id: string }) => a.id) ?? [];
    if (appointmentIds.length === 0) {
      continue;
    }

    const { data: paymentsData, error: payErr2 } = await admin
      .from('payments')
      .select(
        'id, appointment_id, gateway, gateway_payment_id, status, payout_status, doctor_amount_minor, currency'
      )
      .eq('status', 'captured')
      .or(`payout_status.eq.pending,payout_status.is.null`)
      .in('appointment_id', appointmentIds);

    if (payErr2 || !paymentsData?.length) {
      continue;
    }

    const pendingPayments = paymentsData.filter(
      (p: { payout_status?: string | null }) => (p.payout_status ?? 'pending') === 'pending'
    );
    if (pendingPayments.length === 0) {
      continue;
    }

    const sumMinor = pendingPayments.reduce(
      (s: number, p: { doctor_amount_minor?: number | null }) => s + (p.doctor_amount_minor ?? 0),
      0
    );
    const payoutMinor = doc.payout_minor ?? 0;
    if (payoutMinor > 0 && sumMinor < payoutMinor) {
      logger.info(
        { correlationId, doctorId: doc.doctor_id, sumMinor, payoutMinor, schedule },
        'Batch payout: doctor below threshold, skipping'
      );
      result.paymentsSkipped += pendingPayments.length;
      continue;
    }

    result.doctorsProcessed += 1;
    for (const p of pendingPayments) {
      const res = await processPayoutForPayment(p.id, correlationId, { skipThresholdCheck: true });
      if (res.success) {
        result.paymentsProcessed += 1;
      } else {
        result.paymentsFailed += 1;
      }
    }
  }

  logger.info(
    { correlationId, ...result },
    'Batch payout completed'
  );
  return result;
}
