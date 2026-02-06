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

export type DoctorCountry = 'IN' | 'US' | 'UK' | 'EU' | string;

// ============================================================================
// Payment Record (matches DB schema)
// ============================================================================

export interface Payment {
  id: string;
  appointment_id: string;
  gateway: PaymentGateway;
  gateway_order_id: string;
  gateway_payment_id: string | null;
  amount_minor: number;
  currency: string;
  status: PaymentStatus;
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
