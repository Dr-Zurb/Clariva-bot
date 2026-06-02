/**
 * Payment Gateway Interface
 *
 * Abstraction for payment gateways (Razorpay, PayPal, future Stripe).
 * Enables region-specific routing and future Stripe migration.
 *
 * IMPORTANT:
 * - No PCI data (card numbers, CVV) in any interface
 * - Amount in smallest unit (paise INR, cents USD)
 * - All adapters must implement signature verification for webhooks
 *
 * @see e-task-4-payment-integration.md
 */

import type { PaymentGateway } from '../types/payment';

// ============================================================================
// Create Payment Link
// ============================================================================

/**
 * Input for createPaymentLink (adapter-specific, derived from CreatePaymentLinkInput)
 */
export interface AdapterCreatePaymentLinkInput {
  amountMinor: number;
  currency: string;
  referenceId: string;
  description: string;
  customer?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  callbackUrl?: string;
  expireBy?: number; // Unix timestamp
}

/**
 * Result from createPaymentLink (adapter-specific)
 */
export interface AdapterCreatePaymentLinkResult {
  url: string;
  gatewayOrderId: string;
  expiresAt?: Date;
}

// ============================================================================
// Webhook Parsing (Success / Captured)
// ============================================================================

/**
 * Parsed success payload from payment webhook
 * Used to update appointment status and store payment record
 *
 * Why the alternate / hint fields:
 *   Razorpay sends multiple events per payment — `payment.captured`
 *   (fast, ~1s after pay) carries only the **order id** (`order_xxx`)
 *   while `payment_link.paid` (often delayed 10s–2min in test mode)
 *   carries the **payment-link id** (`plink_xxx`). Our DB stores the
 *   plink id as `gateway_order_id`, so a strict single-id lookup
 *   misses the fast event and we end up waiting on the slow one.
 *
 *   Adapters now surface every reference they can — the primary
 *   `gatewayOrderId`, the optional `gatewayAlternateOrderId` (the
 *   other id when both are present in the payload), and an
 *   `appointmentIdHint` extracted from the `notes` we set at
 *   payment-link creation. The service tries them in order so the
 *   first webhook to arrive triggers the notification.
 */
export interface ParsedPaymentSuccess {
  gatewayOrderId: string;
  gatewayAlternateOrderId?: string;
  appointmentIdHint?: string;
  gatewayPaymentId?: string;
  amountMinor: number;
  currency: string;
  status: 'captured' | 'paid';
}

// ============================================================================
// PaymentGateway Interface
// ============================================================================

/**
 * Payment Gateway adapter interface.
 * Implementations: RazorpayAdapter, PayPalAdapter; future: StripeAdapter.
 */
export interface IPaymentGateway {
  readonly gateway: PaymentGateway;

  /**
   * Create a payment link for the given amount and metadata.
   * Returns URL for customer to complete payment.
   */
  createPaymentLink(
    input: AdapterCreatePaymentLinkInput
  ): Promise<AdapterCreatePaymentLinkResult>;

  /**
   * Verify webhook signature. MUST use raw request body.
   * Razorpay: HMAC sync; PayPal: REST API async.
   * @param signature - From gateway-specific header (X-Razorpay-Signature)
   * @param rawBody - Raw request body as Buffer
   * @param headers - Optional headers (PayPal needs paypal-* headers)
   */
  verifyWebhook(
    signature: string | undefined,
    rawBody: Buffer,
    headers?: Record<string, string | undefined>
  ): boolean | Promise<boolean>;

  /**
   * Parse webhook payload to extract success/captured payment info.
   * Returns null if event is not a success/captured event.
   */
  parseSuccessPayload(payload: unknown): ParsedPaymentSuccess | null;

  /**
   * Extract event ID for idempotency (platform-specific or hash).
   */
  extractEventId(payload: unknown, headers?: Record<string, string | undefined>): string;
}
