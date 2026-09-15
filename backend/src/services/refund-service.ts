/**
 * Best-effort appointment refund (P2.5).
 * Always uses the doctor's own Razorpay credentials — never the platform account.
 * Failures are swallowed so cancel can still proceed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { razorpayAdapter } from '../adapters/razorpay-adapter';
import { logger } from '../config/logger';
import { getDecryptedGatewayCredentials } from './doctor-gateway-credentials-service';

export interface RefundAppointmentOptions {
  reason: string;
  correlationId?: string;
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

  if (payment.gateway !== 'razorpay' || !payment.gateway_payment_id) {
    logger.info(
      { appointmentId, gateway: payment.gateway, correlationId },
      'refundAppointment: non-razorpay or missing gateway_payment_id — skip'
    );
    return;
  }

  const { data: appointment, error: aptError } = await supabase
    .from('appointments')
    .select('doctor_id')
    .eq('id', appointmentId)
    .maybeSingle();

  if (aptError || !appointment?.doctor_id) {
    logger.warn(
      { appointmentId, correlationId },
      'refundAppointment: doctor lookup failed — skip'
    );
    return;
  }

  let credentials;
  try {
    credentials = await getDecryptedGatewayCredentials(appointment.doctor_id as string, correlationId);
  } catch {
    logger.warn({ appointmentId, correlationId }, 'refundAppointment: credentials load failed — skip');
    return;
  }

  if (!credentials) {
    logger.warn(
      { appointmentId, correlationId },
      'refundAppointment: doctor gateway not connected — skip'
    );
    return;
  }

  try {
    const refund = await razorpayAdapter.refund(
      {
        gatewayPaymentId: payment.gateway_payment_id as string,
        amountMinor: payment.amount_minor as number,
        idempotencyKey: `refund-${payment.id}`,
        notes: {
          reason: options.reason,
          appointment_id: appointmentId,
          correlation_id: correlationId,
        },
      },
      credentials
    );

    await supabase
      .from('payments')
      .update({ status: 'refunded' })
      .eq('id', payment.id)
      .eq('status', 'captured');

    logger.info(
      {
        event: 'payment.refunded',
        appointmentId,
        paymentId: payment.id,
        refundId: refund.gatewayRefundId,
        correlationId,
      },
      'payment.refunded'
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
