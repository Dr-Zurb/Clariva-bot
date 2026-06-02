/**
 * Razorpay Payment Gateway Adapter
 *
 * Implements IPaymentGateway for Razorpay (India - INR).
 * Uses Razorpay Payment Links API (POST /v1/payment_links).
 *
 * IMPORTANT:
 * - Amount in paise (₹100 = 10000 paise)
 * - No PCI data
 * - Webhook: payment.captured, payment_link.paid
 *
 * @see e-task-4-payment-integration.md
 */

import Razorpay from 'razorpay';
import crypto from 'crypto';
import { razorpayConfig, isRazorpayConfigured } from '../config/payment';
import { verifyRazorpaySignature } from '../utils/razorpay-verification';
import type {
  IPaymentGateway,
  AdapterCreatePaymentLinkInput,
  AdapterCreatePaymentLinkResult,
  ParsedPaymentSuccess,
} from './payment-gateway.interface';
import type { RazorpayWebhookPayload } from '../types/payment';

// ============================================================================
// Razorpay Adapter
// ============================================================================

export class RazorpayAdapter implements IPaymentGateway {
  readonly gateway = 'razorpay' as const;
  private instance: Razorpay | null = null;

  private getClient(): Razorpay {
    if (!isRazorpayConfigured()) {
      throw new Error('Razorpay is not configured (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)');
    }
    if (!this.instance) {
      this.instance = new Razorpay({
        key_id: razorpayConfig.keyId!,
        key_secret: razorpayConfig.keySecret!,
      });
    }
    return this.instance;
  }

  async createPaymentLink(
    input: AdapterCreatePaymentLinkInput
  ): Promise<AdapterCreatePaymentLinkResult> {
    const client = this.getClient();

    const params: Record<string, unknown> = {
      amount: input.amountMinor,
      currency: input.currency,
      reference_id: input.referenceId,
      description: input.description,
    };

    if (input.customer) {
      params.customer = {
        name: input.customer.name ?? 'Customer',
        contact: input.customer.contact ?? '+919999999999',
        email: input.customer.email ?? 'customer@example.com',
      };
    }

    if (input.notes && Object.keys(input.notes).length > 0) {
      params.notes = input.notes;
    }

    if (input.callbackUrl) {
      params.callback_url = input.callbackUrl;
      params.callback_method = 'get';
    }

    if (input.expireBy) {
      params.expire_by = input.expireBy;
    }

    // Razorpay SDK types expect specific shape; our params match the API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = (await client.paymentLink.create(params as any)) as {
      short_url?: string;
      id?: string;
      expire_by?: number;
    };
    const shortUrl = response.short_url ?? response.id;
    const gatewayOrderId = response.id ?? input.referenceId;

    return {
      url: shortUrl ?? '',
      gatewayOrderId,
      expiresAt: (response as { expire_by?: number }).expire_by
        ? new Date((response as { expire_by: number }).expire_by * 1000)
        : undefined,
    };
  }

  verifyWebhook(signature: string | undefined, rawBody: Buffer): boolean {
    return verifyRazorpaySignature(signature, rawBody, 'razorpay-webhook');
  }

  parseSuccessPayload(payload: unknown): ParsedPaymentSuccess | null {
    const p = payload as RazorpayWebhookPayload;
    const event = p?.event;

    if (!event) return null;

    const successEvents = ['payment.captured', 'payment_link.paid'];
    if (!successEvents.includes(event)) return null;

    const paymentEntity = p.payload?.payment?.entity;
    const plinkEntity = p.payload?.payment_link?.entity;
    const orderEntity = p.payload?.order?.entity;

    const amount =
      paymentEntity?.amount ?? orderEntity?.amount_paid ?? orderEntity?.amount ?? plinkEntity?.amount_paid ?? plinkEntity?.amount;
    const currency = paymentEntity?.currency ?? orderEntity?.currency ?? plinkEntity?.currency;
    const paymentId = paymentEntity?.id;
    const plinkId = plinkEntity?.id;
    const orderId = orderEntity?.id ?? paymentEntity?.order_id ?? plinkEntity?.order_id;

    if ((!plinkId && !orderId) || amount === undefined || !currency) return null;

    // Prefer plink id as the primary because that's what we store at
    // payment-link creation (see payment-service.ts → createPaymentLink).
    // Surface the order id (when distinct) as the alternate so a fast
    // `payment.captured` webhook — which carries ONLY the order id —
    // still resolves the payment row without waiting for the slower
    // `payment_link.paid` event.
    const primary = plinkId ?? orderId ?? '';
    const alternate = plinkId && orderId && plinkId !== orderId ? orderId : undefined;

    // Razorpay echoes the `notes` we set at link creation back on every
    // related event. We seed `notes.appointment_id` in payment-service,
    // so reading it here gives us a third resolution path when neither
    // id matches a stored row (defensive — covers payment-row inserts
    // that raced or used a different storage shape historically).
    const notes =
      (paymentEntity as { notes?: Record<string, unknown> } | undefined)?.notes ??
      (plinkEntity as { notes?: Record<string, unknown> } | undefined)?.notes ??
      (orderEntity as { notes?: Record<string, unknown> } | undefined)?.notes;
    const appointmentIdHint =
      typeof notes?.appointment_id === 'string' ? notes.appointment_id : undefined;

    return {
      gatewayOrderId: primary,
      gatewayAlternateOrderId: alternate,
      appointmentIdHint,
      gatewayPaymentId: paymentId ?? undefined,
      amountMinor: amount,
      currency,
      status: 'captured',
    };
  }

  extractEventId(
    payload: unknown,
    headers?: Record<string, string | undefined>
  ): string {
    const eventId = headers?.['x-razorpay-event-id'];
    if (eventId) return eventId;

    const p = payload as RazorpayWebhookPayload;
    const entity = p?.payload?.payment?.entity ?? p?.payload?.payment_link?.entity;
    const id = (entity as { id?: string })?.id ?? (p as { id?: string })?.id;
    if (id) return `razorpay-${id}`;

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    return `razorpay-fallback-${hash.slice(0, 32)}`;
  }
}

export const razorpayAdapter = new RazorpayAdapter();
