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
import { computePlatformFee } from '../config/platform-fee';
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

  const notes: Record<string, string> = { appointment_id: input.appointmentId };
  if (input.quoteMetadata) {
    notes.visit_kind = input.quoteMetadata.visit_kind;
    notes.service_key = input.quoteMetadata.service_key;
    notes.modality = input.quoteMetadata.modality;
    if (input.quoteMetadata.episode_id) {
      notes.episode_id = input.quoteMetadata.episode_id;
    }
    if (input.quoteMetadata.service_id) {
      notes.service_id = input.quoteMetadata.service_id;
    }
  }

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
    notes,
    expireBy: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    callbackUrl: input.callbackUrl,
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
 * Resolution order (defensive against Razorpay's multi-event firing):
 *   1. `gateway_order_id = gatewayOrderId` (primary — typically the
 *      payment-link id `plink_xxx` we stored at create time, OR the
 *      order id `order_xxx` when only that is present in the event).
 *   2. `gateway_order_id = gatewayAlternateOrderId` (the OTHER id when
 *      the webhook carried both — e.g. `payment_link.paid` carries
 *      both plink and order ids; either one might be what's stored).
 *   3. Lookup by `appointmentIdHint` from the webhook's `notes` field
 *      (we seed `notes.appointment_id` at create time and Razorpay
 *      echoes it back). This is the bullet that lets the fast
 *      `payment.captured` event — which carries ONLY the order id —
 *      still trigger the notification immediately, instead of waiting
 *      for the slower `payment_link.paid` follow-up event whose
 *      delivery latency in test mode can be tens of seconds to
 *      minutes.
 *
 * @param gateway - 'razorpay' | 'paypal'
 * @param gatewayOrderId - Primary id from webhook payload
 * @param gatewayPaymentId - Optional payment/capture ID
 * @param amountMinor - Amount in smallest unit
 * @param currency - Currency code
 * @param correlationId - Request correlation ID
 * @param gatewayAlternateOrderId - Optional alternate id (e.g. order id when primary is plink)
 * @param appointmentIdHint - Optional appointment id from webhook `notes`
 * @returns appointmentId when payment was found and updated (for notifications); undefined when not found (e.g. duplicate)
 */
export async function processPaymentSuccess(
  gateway: 'razorpay' | 'paypal',
  gatewayOrderId: string,
  gatewayPaymentId: string | undefined,
  amountMinor: number,
  currency: string,
  correlationId: string,
  gatewayAlternateOrderId?: string,
  appointmentIdHint?: string
): Promise<{ appointmentId: string } | undefined> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available');
  }

  // Build the candidate id set for the gateway_order_id lookup. Use
  // `.in()` so we hit both ids in a single round-trip; Razorpay can
  // present the same payment under either id depending on the event
  // type. Empty/duplicate guards keep the IN list minimal.
  const orderIdCandidates = Array.from(
    new Set([gatewayOrderId, gatewayAlternateOrderId].filter((v): v is string => !!v))
  );

  let payment: { id: string; appointment_id: string } | null = null;
  let lookupError: { message?: string } | null = null;

  if (orderIdCandidates.length > 0) {
    const { data, error } = await supabase
      .from('payments')
      .select('id, appointment_id')
      .eq('gateway', gateway)
      .in('gateway_order_id', orderIdCandidates)
      .in('status', ['pending'])
      .limit(1)
      .maybeSingle();
    payment = (data as { id: string; appointment_id: string } | null) ?? null;
    lookupError = error;
  }

  // Fallback: notes-based lookup. Razorpay echoes `notes.appointment_id`
  // on every event tied to our payment link, so we can recover even if
  // a row was inserted with a historical id shape that doesn't match
  // either webhook id. Constrained to status='pending' so we don't
  // re-process a row that's already captured.
  if (!payment && appointmentIdHint) {
    const { data, error } = await supabase
      .from('payments')
      .select('id, appointment_id')
      .eq('gateway', gateway)
      .eq('appointment_id', appointmentIdHint)
      .in('status', ['pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    payment = (data as { id: string; appointment_id: string } | null) ?? null;
    lookupError = error ?? lookupError;
    if (payment) {
      logger.info(
        {
          gateway,
          gatewayOrderId,
          gatewayAlternateOrderId,
          appointmentIdHint,
          paymentId: payment.id,
          correlationId,
        },
        'Payment row resolved via notes.appointment_id fallback (id mismatch between create and webhook)'
      );
    }
  }

  if (!payment) {
    logger.warn(
      {
        gateway,
        gatewayOrderId,
        gatewayAlternateOrderId,
        appointmentIdHint,
        correlationId,
        error: lookupError?.message,
      },
      'Payment record not found for webhook (may be duplicate)'
    );
    return undefined;
  }

  // Compute platform fee (INR: 5% or flat; non-INR: 0 for now)
  const isInr = currency.toUpperCase() === 'INR';
  const feeResult = isInr
    ? computePlatformFee(amountMinor, currency)
    : { platformFeeMinor: 0, gstMinor: 0, doctorAmountMinor: amountMinor };

  const { error: updatePaymentError } = await supabase
    .from('payments')
    .update({
      gateway_payment_id: gatewayPaymentId ?? null,
      amount_minor: amountMinor,
      currency,
      status: 'captured',
      platform_fee_minor: feeResult.platformFeeMinor,
      gst_minor: feeResult.gstMinor,
      doctor_amount_minor: feeResult.doctorAmountMinor,
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
      platformFeeMinor: feeResult.platformFeeMinor,
      gstMinor: feeResult.gstMinor,
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
): Promise<{
  id: string;
  appointment_id: string;
  gateway: string;
  status: string;
  amount_minor: number;
  currency: string;
  platform_fee_minor?: number | null;
  gst_minor?: number | null;
  doctor_amount_minor?: number | null;
} | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available');
  }

  const { data: payment, error } = await supabase
    .from('payments')
    .select('id, appointment_id, gateway, status, amount_minor, currency, platform_fee_minor, gst_minor, doctor_amount_minor')
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

  return payment as {
    id: string;
    appointment_id: string;
    gateway: string;
    status: string;
    amount_minor: number;
    currency: string;
    platform_fee_minor?: number | null;
    gst_minor?: number | null;
    doctor_amount_minor?: number | null;
  };
}

/**
 * Check if an appointment has a captured payment (webhook may have run before appointment update).
 * Used to show "confirmed" when payment is done but appointment status is still "pending".
 */
export async function hasCapturedPaymentForAppointment(
  appointmentId: string,
  _correlationId: string
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from('payments')
    .select('id')
    .eq('appointment_id', appointmentId)
    .eq('status', 'captured')
    .limit(1)
    .maybeSingle();

  if (error || !data) return false;
  return true;
}

// ============================================================================
// Helpers
// ============================================================================

function getAdapter(gateway: 'razorpay' | 'paypal'): IPaymentGateway {
  if (gateway === 'razorpay') return razorpayAdapter;
  if (gateway === 'paypal') return paypalAdapter;
  throw new ValidationError(`Unknown gateway: ${gateway}`);
}
