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

import axios from 'axios';
import crypto from 'crypto';
import { paypalConfig, isPayPalConfigured } from '../config/payment';
import { verifyPayPalWebhook } from '../utils/paypal-verification';
import type {
  IPaymentGateway,
  AdapterCreatePaymentLinkInput,
  AdapterCreatePaymentLinkResult,
  ParsedPaymentSuccess,
} from './payment-gateway.interface';
import type { PayPalWebhookPayload } from '../types/payment';

// ============================================================================
// PayPal Adapter
// ============================================================================

export class PayPalAdapter implements IPaymentGateway {
  readonly gateway = 'paypal' as const;

  private async getAccessToken(): Promise<string> {
    if (!isPayPalConfigured()) {
      throw new Error('PayPal is not configured (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET)');
    }

    const auth = Buffer.from(
      `${paypalConfig.clientId}:${paypalConfig.clientSecret}`
    ).toString('base64');

    const { data } = await axios.post<{ access_token: string }>(
      `${paypalConfig.baseUrl}/v1/oauth2/token`,
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      }
    );

    return data.access_token;
  }

  async createPaymentLink(
    input: AdapterCreatePaymentLinkInput
  ): Promise<AdapterCreatePaymentLinkResult> {
    const accessToken = await this.getAccessToken();

    const amountValue = (input.amountMinor / 100).toFixed(2);

    const orderPayload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: input.referenceId,
          description: input.description,
          amount: {
            currency_code: input.currency,
            value: amountValue,
          },
        },
      ],
    };

    const { data } = await axios.post<{
      id?: string;
      status?: string;
      links?: Array<{ href: string; rel: string }>;
    }>(
      `${paypalConfig.baseUrl}/v2/checkout/orders`,
      orderPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const orderId = data.id;
    if (!orderId) {
      throw new Error('PayPal order creation failed - no order ID returned');
    }

    const approveLink = data.links?.find((l) => l.rel === 'approve')?.href;
    const url = approveLink ?? `${paypalConfig.baseUrl}/checkoutnow?token=${orderId}`;

    return {
      url,
      gatewayOrderId: orderId,
      expiresAt: undefined,
    };
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
