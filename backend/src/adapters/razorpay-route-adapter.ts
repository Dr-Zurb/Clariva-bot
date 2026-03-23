/**
 * Razorpay Route Adapter (Payout Initiative)
 *
 * Creates transfers from captured payments to Linked Accounts.
 * Uses Razorpay Route API: POST /v1/payments/:id/transfers
 *
 * IMPORTANT:
 * - INR only (Route supports INR only)
 * - Amount in paise (min 100 paise = ₹1)
 * - Requires Razorpay Route enabled + doctor Linked Account
 *
 * @see https://razorpay.com/docs/api/payments/route/create-transfers-payments/
 */

import axios, { AxiosError } from 'axios';
import { razorpayConfig, isRazorpayConfigured } from '../config/payment';
import { logger } from '../config/logger';

const RAZORPAY_BASE = 'https://api.razorpay.com/v1';
const MIN_TRANSFER_PAISE = 100;

// ============================================================================
// Types
// ============================================================================

export interface CreateTransferFromPaymentInput {
  /** Razorpay payment ID (gateway_payment_id), e.g. pay_xxx */
  razorpayPaymentId: string;
  /** Razorpay Route Linked Account ID, e.g. acc_xxx */
  linkedAccountId: string;
  /** Amount in paise (min 100) */
  amountMinor: number;
  /** Currency (INR only for Route) */
  currency: string;
  /** Optional notes for reconciliation */
  notes?: Record<string, string>;
}

export interface CreateTransferFromPaymentResult {
  transferId: string;
}

interface RazorpayTransferItem {
  id: string;
  entity: string;
  status: string;
  amount: number;
  currency: string;
  recipient: string;
  error?: { code?: string; description?: string; reason?: string };
}

interface RazorpayTransfersResponse {
  entity: string;
  count: number;
  items: RazorpayTransferItem[];
}

// ============================================================================
// Adapter
// ============================================================================

/**
 * Create a transfer from a captured payment to a Linked Account.
 * Uses same credentials as Razorpay payments (key_id, key_secret).
 *
 * @throws Error when Razorpay not configured, amount < 100 paise, or API fails
 */
export async function createTransferFromPayment(
  input: CreateTransferFromPaymentInput,
  correlationId?: string
): Promise<CreateTransferFromPaymentResult> {
  if (!isRazorpayConfigured()) {
    throw new Error('Razorpay is not configured (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)');
  }

  const { razorpayPaymentId, linkedAccountId, amountMinor, currency } = input;

  if (currency.toUpperCase() !== 'INR') {
    throw new Error('Razorpay Route supports INR only');
  }

  if (amountMinor < MIN_TRANSFER_PAISE || !Number.isInteger(amountMinor)) {
    throw new Error(`Transfer amount must be at least ${MIN_TRANSFER_PAISE} paise (₹1) and an integer`);
  }

  const url = `${RAZORPAY_BASE}/payments/${razorpayPaymentId}/transfers`;
  const auth = Buffer.from(
    `${razorpayConfig.keyId}:${razorpayConfig.keySecret}`,
    'utf-8'
  ).toString('base64');

  const body = {
    transfers: [
      {
        account: linkedAccountId,
        amount: amountMinor,
        currency: 'INR',
        on_hold: false,
        ...(input.notes && Object.keys(input.notes).length > 0 ? { notes: input.notes } : {}),
      },
    ],
  };

  let data: RazorpayTransfersResponse;
  try {
    const res = await axios.post<RazorpayTransfersResponse>(url, body, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
    });
    data = res.data;
  } catch (err) {
    const axiosErr = err as AxiosError<{ error?: { description?: string }; message?: string }>;
    const status = axiosErr.response?.status;
    const bodyMsg =
      axiosErr.response?.data?.error?.description ??
      axiosErr.response?.data?.message ??
      axiosErr.message;
    logger.error(
      {
        correlationId,
        razorpayPaymentId,
        status,
        message: bodyMsg,
      },
      'Razorpay Route transfer failed'
    );
    throw new Error(
      status === 400
        ? `Razorpay Route: ${bodyMsg}`
        : `Razorpay Route transfer failed: ${bodyMsg}`
    );
  }

  const items = data?.items;
  if (!items?.length || !items[0]?.id) {
    throw new Error('Razorpay Route returned no transfer id');
  }

  const first = items[0];
  if (first.status === 'failed' && first.error?.description) {
    throw new Error(`Razorpay Route transfer failed: ${first.error.description}`);
  }

  return { transferId: first.id };
}
