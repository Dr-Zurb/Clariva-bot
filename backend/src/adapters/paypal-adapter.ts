/**
 * PayPal Payment Gateway Adapter
 *
 * Implements IPaymentGateway for PayPal (International - USD, EUR, GBP).
 * Uses PayPal Orders API v2 (create order, return approval URL).
 *
 * IMPORTANT:
 * - Amount in smallest unit (cents for USD)
 * - No PCI data
 * - Webhook: PAYMENT.CAPTURE.COMPLETED
 *
 * @see e-task-4-payment-integration.md
 */

import crypto from 'crypto';
import { verifyPayPalWebhook } from '../utils/paypal-verification';
import { ForbiddenError } from '../utils/errors';
import type {
  IPaymentGateway,
  AdapterCreatePaymentLinkInput,
  AdapterCreatePaymentLinkResult,
  AdapterRefundInput,
  AdapterRefundResult,
  GatewayCredentials,
  ParsedPaymentSuccess,
} from './payment-gateway.interface';
import type { PayPalWebhookPayload } from '../types/payment';

// ============================================================================
// PayPal Adapter
// ============================================================================

export class PayPalAdapter implements IPaymentGateway {
  readonly gateway = 'paypal' as const;

  async createPaymentLink(
    _input: AdapterCreatePaymentLinkInput,
    _credentials: GatewayCredentials
  ): Promise<AdapterCreatePaymentLinkResult> {
    throw new ForbiddenError('Prepaid bookings currently support Razorpay only');
  }

  async refund(
    _input: AdapterRefundInput,
    _credentials: GatewayCredentials
  ): Promise<AdapterRefundResult> {
    throw new ForbiddenError('Prepaid bookings currently support Razorpay only');
  }

  async verifyWebhook(
    _signature: string | undefined,
    rawBody: Buffer,
    headers?: Record<string, string | undefined>
  ): Promise<boolean> {
    if (!headers) return false;
    return verifyPayPalWebhook(headers, rawBody);
  }

  parseSuccessPayload(payload: unknown): ParsedPaymentSuccess | null {
    const p = payload as PayPalWebhookPayload;
    const eventType = p?.event_type;

    if (!eventType) return null;

    if (eventType !== 'PAYMENT.CAPTURE.COMPLETED') return null;

    const resource = p.resource;
    if (!resource) return null;

    const amountStr = (resource.amount as { value?: string })?.value;
    const currency = (resource.amount as { currency_code?: string })?.currency_code;
    const captureId = resource.id;
    const orderId =
      (resource.supplementary_data as { related_ids?: { order_id?: string } })?.related_ids
        ?.order_id;

    if (!captureId || !amountStr || !currency) return null;

    const amountMinor = Math.round(parseFloat(amountStr) * 100);

    return {
      gatewayOrderId: orderId ?? captureId,
      gatewayPaymentId: captureId,
      amountMinor,
      currency,
      status: 'captured',
    };
  }

  extractEventId(
    payload: unknown,
    headers?: Record<string, string | undefined>
  ): string {
    const eventId = headers?.['paypal-transmission-id'];
    if (eventId) return eventId;

    const p = payload as PayPalWebhookPayload;
    const id = p?.id;
    if (id) return `paypal-${id}`;

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    return `paypal-fallback-${hash.slice(0, 32)}`;
  }
}

export const paypalAdapter = new PayPalAdapter();
