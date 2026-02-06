/**
 * Payment Service
 *
 * Creates payment links, stores order mapping for webhook reconciliation,
 * and processes payment webhooks (update appointment, store payment record).
 *
 * IMPORTANT:
 * - No PCI data
 * - Amount in smallest unit (paise INR, cents USD)
 * - Region routing: doctor country -> Razorpay (India) vs PayPal (International)
 *
 * @see e-task-4-payment-integration.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { selectGatewayByCountry } from '../config/payment';
import { razorpayAdapter } from '../adapters/razorpay-adapter';
import { paypalAdapter } from '../adapters/paypal-adapter';
import type { CreatePaymentLinkInput, CreatePaymentLinkResult } from '../types/payment';
import type { IPaymentGateway } from '../adapters/payment-gateway.interface';
import { handleSupabaseError } from '../utils/db-helpers';
import { InternalError, ValidationError } from '../utils/errors';
import { logger } from '../config/logger';

// ============================================================================
// Create Payment Link
// ============================================================================

/**
 * Create payment link for an appointment.
 * Selects gateway by doctor country; stores pending payment for webhook reconciliation.
 *
 * @param input - Create payment link input
 * @param correlationId - Request correlation ID
 * @returns Payment URL and gateway info
 */
export async function createPaymentLink(
  input: CreatePaymentLinkInput,
  correlationId: string
): Promise<CreatePaymentLinkResult> {
  const gateway = selectGatewayByCountry(input.doctorCountry);
  const adapter = getAdapter(gateway);

  const referenceId = input.appointmentId;

  const adapterInput = {
    amountMinor: input.amountMinor,
    currency: input.currency,
    referenceId,
    description: input.description ?? `Appointment payment - ${input.appointmentId}`,
    customer: input.patientName
      ? {
          name: input.patientName,
          email: input.patientEmail,
          contact: input.patientPhone,
        }
      : undefined,
    notes: { appointment_id: input.appointmentId },
    expireBy: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  };

  const result = await adapter.createPaymentLink(adapterInput);

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available');
  }

  const { error } = await supabase.from('payments').insert({
    appointment_id: input.appointmentId,
    gateway,
    gateway_order_id: result.gatewayOrderId,
    amount_minor: input.amountMinor,
    currency: input.currency,
    status: 'pending',
  });

  if (error) {
    logger.error(
      { error, appointmentId: input.appointmentId, correlationId },
      'Failed to store payment order mapping'
    );
    throw handleSupabaseError(error, 'Failed to store payment order mapping');
  }

  return {
    url: result.url,
    gateway,
    gatewayOrderId: result.gatewayOrderId,
    expiresAt: result.expiresAt,
  };
}

// ============================================================================
// Webhook Processing (Update Appointment + Payment)
// ============================================================================

/**
 * Process payment success webhook.
 * Finds payment by gateway_order_id + gateway, updates to captured, updates appointment to confirmed.
 *
 * @param gateway - 'razorpay' | 'paypal'
 * @param gatewayOrderId - From webhook payload
 * @param gatewayPaymentId - Optional payment/capture ID
 * @param amountMinor - Amount in smallest unit
 * @param currency - Currency code
 * @param correlationId - Request correlation ID
 * @returns appointmentId when payment was found and updated (for notifications); undefined when not found (e.g. duplicate)
 */
export async function processPaymentSuccess(
  gateway: 'razorpay' | 'paypal',
  gatewayOrderId: string,
  gatewayPaymentId: string | undefined,
  amountMinor: number,
  currency: string,
  correlationId: string
): Promise<{ appointmentId: string } | undefined> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available');
  }

  const { data: payment, error: fetchError } = await supabase
    .from('payments')
    .select('id, appointment_id')
    .eq('gateway', gateway)
    .eq('gateway_order_id', gatewayOrderId)
    .in('status', ['pending'])
    .single();

  if (fetchError || !payment) {
    logger.warn(
      {
        gateway,
        gatewayOrderId,
        correlationId,
        error: fetchError?.message,
      },
      'Payment record not found for webhook (may be duplicate)'
    );
    return undefined;
  }

  const { error: updatePaymentError } = await supabase
    .from('payments')
    .update({
      gateway_payment_id: gatewayPaymentId ?? null,
      amount_minor: amountMinor,
      currency,
      status: 'captured',
    })
    .eq('id', payment.id);

  if (updatePaymentError) {
    logger.error(
      { error: updatePaymentError, paymentId: payment.id, correlationId },
      'Failed to update payment record'
    );
    throw handleSupabaseError(updatePaymentError, 'Failed to update payment');
  }

  const { error: updateAppointmentError } = await supabase
    .from('appointments')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', payment.appointment_id);

  if (updateAppointmentError) {
    logger.error(
      { error: updateAppointmentError, appointmentId: payment.appointment_id, correlationId },
      'Failed to update appointment status'
    );
    throw handleSupabaseError(updateAppointmentError, 'Failed to update appointment');
  }

  logger.info(
    {
      paymentId: payment.id,
      appointmentId: payment.appointment_id,
      gateway,
      correlationId,
    },
    'Payment captured and appointment confirmed'
  );

  return { appointmentId: payment.appointment_id };
}

// ============================================================================
// Get Payment Status
// ============================================================================

/**
 * Get payment by ID.
 * Doctor auth: userId required; validates ownership via appointment.doctor_id.
 */
export async function getPaymentById(
  paymentId: string,
  _correlationId: string,
  userId: string
): Promise<{ id: string; appointment_id: string; gateway: string; status: string; amount_minor: number; currency: string } | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available');
  }

  const { data: payment, error } = await supabase
    .from('payments')
    .select('id, appointment_id, gateway, status, amount_minor, currency')
    .eq('id', paymentId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw handleSupabaseError(error, 'Failed to fetch payment');
  }

  if (!payment) return null;

  const { data: appointment } = await supabase
    .from('appointments')
    .select('doctor_id')
    .eq('id', payment.appointment_id)
    .single();

  if (!appointment || appointment.doctor_id !== userId) {
    return null;
  }

  return payment as { id: string; appointment_id: string; gateway: string; status: string; amount_minor: number; currency: string };
}

// ============================================================================
// Helpers
// ============================================================================

function getAdapter(gateway: 'razorpay' | 'paypal'): IPaymentGateway {
  if (gateway === 'razorpay') return razorpayAdapter;
  if (gateway === 'paypal') return paypalAdapter;
  throw new ValidationError(`Unknown gateway: ${gateway}`);
}
