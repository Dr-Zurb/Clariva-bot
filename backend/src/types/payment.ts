/**
 * Payment Type Definitions
 *
 * Types for payment integration (Razorpay, PayPal).
 * Supports dual gateway for best customer experience (India vs International).
 *
 * IMPORTANT:
 * - No PCI data (card numbers, CVV) in types
 * - Amount in smallest unit (paise INR, cents USD)
 */

// ============================================================================
// Gateway Types
// ============================================================================

export type PaymentGateway = 'razorpay' | 'paypal';

export type PaymentStatus = 'pending' | 'captured' | 'failed' | 'refunded';

/** Payout state: pending -> processing -> paid | failed. Migration 024. */
export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';

export type DoctorCountry = 'IN' | 'US' | 'UK' | 'EU' | string;

// ============================================================================
// Payment Record (matches DB schema)
// ============================================================================

/**
 * Payment record from database.
 * platform_fee_minor, gst_minor, doctor_amount_minor added in migration 022 (monetization).
 * payout_status, payout_id, payout_failed_reason, paid_at added in migration 024 (payout).
 */
export interface Payment {
  id: string;
  appointment_id: string;
  gateway: PaymentGateway;
  gateway_order_id: string;
  gateway_payment_id: string | null;
  amount_minor: number;
  currency: string;
  status: PaymentStatus;
  /** Clariva platform fee in smallest unit (paise). 5% or flat for < threshold. Migration 022. */
  platform_fee_minor?: number | null;
  /** GST (18% on platform fee) in smallest unit. Migration 022. */
  gst_minor?: number | null;
  /** Amount to doctor (gross - platform_fee - gst) in smallest unit. Migration 022. */
  doctor_amount_minor?: number | null;
  /** Payout state. Migration 024. */
  payout_status?: PayoutStatus | null;
  /** Razorpay Route transfer ID when paid. Migration 024. */
  payout_id?: string | null;
  /** Error message when payout failed. Migration 024. */
  payout_failed_reason?: string | null;
  /** When payout was completed. Migration 024. */
  paid_at?: Date | string | null;
  created_at: Date;
}

export interface InsertPayment {
  appointment_id: string;
  gateway: PaymentGateway;
  gateway_order_id: string;
  gateway_payment_id?: string | null;
  amount_minor: number;
  currency: string;
  status: PaymentStatus;
}

// ============================================================================
// Create Payment Link Input
// ============================================================================

/** SFU-05: string-only metadata for gateway notes / reconciliation */
export interface PaymentQuoteMetadata {
  visit_kind: string;
  service_key: string;
  modality: string;
  episode_id?: string;
}

export interface CreatePaymentLinkInput {
  appointmentId: string;
  amountMinor: number;
  currency: string;
  doctorCountry: DoctorCountry;
  doctorId: string;
  patientId: string;
  patientName?: string;
  patientPhone?: string;
  patientEmail?: string;
  description?: string;
  /** Razorpay redirect URL after payment (e.g. /book/success?token=X) */
  callbackUrl?: string;
  /** SFU-05: merged into adapter notes (Razorpay) alongside appointment_id */
  quoteMetadata?: PaymentQuoteMetadata;
}

export interface CreatePaymentLinkResult {
  url: string;
  gateway: PaymentGateway;
  gatewayOrderId: string;
  expiresAt?: Date;
}

// ============================================================================
// Webhook Payload Types (minimal - no PCI data)
// ============================================================================

/** Razorpay webhook event (payment.captured, payment_link.paid, etc.) */
export interface RazorpayWebhookPayload {
  entity?: string;
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        status?: string;
      };
    };
    payment_link?: {
      entity?: {
        id?: string;
        reference_id?: string;
        order_id?: string;
        amount?: number;
        amount_paid?: number;
        currency?: string;
        status?: string;
      };
    };
    order?: {
      entity?: {
        id?: string;
        amount?: number;
        amount_paid?: number;
        currency?: string;
        status?: string;
      };
    };
  };
}

/** PayPal webhook event (payment.capture.completed, etc.) */
export interface PayPalWebhookPayload {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    amount?: { value: string; currency_code: string };
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
}
