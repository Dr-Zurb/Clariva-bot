/**
 * Best-effort appointment refund primitive (pdm-09 — session overrun cancel_refund).
 *
 * Idempotent: no-ops when there is no captured payment or Razorpay is not configured.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type Razorpay from 'razorpay';
import { logger } from '../config/logger';
import { isRazorpayConfigured, razorpayConfig } from '../config/payment';

export interface RefundAppointmentOptions {
  reason: string;
  correlationId?: string;
}

let razorpayClient: Razorpay | null = null;

async function getRazorpayClient(): Promise<Razorpay | null> {
  if (!isRazorpayConfigured()) return null;
  if (razorpayClient) return razorpayClient;
  const RazorpaySdk = (await import('razorpay')).default;
  razorpayClient = new RazorpaySdk({
    key_id: razorpayConfig.keyId!,
    key_secret: razorpayConfig.keySecret!,
  });
  return razorpayClient;
}

/**
 * Refund the captured payment for an appointment when possible.
 * Failures are logged and swallowed so cancel can still proceed.
 */
export async function refundAppointment(
  supabase: SupabaseClient,
  appointmentId: string,
  options: RefundAppointmentOptions
): Promise<void> {
  const correlationId = options.correlationId ?? `refund-${appointmentId}`;

  const { data: payment, error } = await supabase
    .from('payments')
    .select('id, gateway, gateway_payment_id, amount_minor, status')
    .eq('appointment_id', appointmentId)
    .eq('status', 'captured')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn(
      { appointmentId, correlationId, err: error.message },
      'refundAppointment: payment lookup failed'
    );
    return;
  }

  if (!payment) {
    logger.info({ appointmentId, correlationId }, 'refundAppointment: no captured payment — skip');
    return;
  }

  if (payment.status === 'refunded') {
    return;
  }

  if (payment.gateway !== 'razorpay' || !payment.gateway_payment_id) {
    logger.info(
      { appointmentId, gateway: payment.gateway, correlationId },
      'refundAppointment: non-razorpay or missing gateway_payment_id — skip'
    );
    return;
  }

  const client = await getRazorpayClient();
  if (!client) {
    logger.warn({ appointmentId, correlationId }, 'refundAppointment: Razorpay not configured — skip');
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refund = (await (client.payments as any).refund(payment.gateway_payment_id, {
      amount: payment.amount_minor,
      speed: 'normal',
      notes: { reason: options.reason, appointment_id: appointmentId, correlation_id: correlationId },
    })) as { id?: string };

    if (refund?.id) {
      await supabase
        .from('payments')
        .update({ status: 'refunded' })
        .eq('id', payment.id)
        .eq('status', 'captured');
    }

    logger.info(
      {
        event: 'opd_overrun.refunded',
        appointmentId,
        paymentId: payment.id,
        refundId: refund?.id,
        correlationId,
      },
      'opd_overrun.refunded'
    );
  } catch (err) {
    logger.warn(
      {
        appointmentId,
        correlationId,
        err: err instanceof Error ? err.message : String(err),
      },
      'refundAppointment: Razorpay refund failed (best-effort)'
    );
  }
}
