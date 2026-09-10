/**
 * Video-replay OTP over WhatsApp Cloud API authentication templates.
 *
 * Direct Meta Graph send — not Twilio WhatsApp (their per-message fee
 * erases the save). Inbound receptionist WhatsApp (`WHATSAPP_ENABLED`)
 * is a different product and is not required here.
 *
 * @see https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates/copy-code-button-authentication-templates/
 */

import { env } from '../config/env';
import { logger } from '../config/logger';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const SEND_TIMEOUT_MS = 10_000;

export function isWhatsappAuthOtpConfigured(): boolean {
  return Boolean(
    env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim() &&
      env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim() &&
      env.WHATSAPP_OTP_TEMPLATE_NAME?.trim(),
  );
}

/** Meta `to` is digits + country code, no leading +. */
export function toWhatsappRecipient(e164: string): string {
  return e164.trim().replace(/^\+/, '').replace(/\s+/g, '');
}

interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

interface GraphSendBody {
  messages?: Array<{ id?: string }>;
}

/**
 * Send a 6-digit code via the configured authentication template.
 * Returns false when unconfigured, rejected, or the network fails.
 * Never logs the recipient or the code.
 */
export async function sendWhatsappAuthOtp(
  to: string,
  code: string,
  correlationId: string,
): Promise<boolean> {
  const phoneNumberId = env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim();
  const token = env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim();
  const templateName = env.WHATSAPP_OTP_TEMPLATE_NAME?.trim();
  const language = env.WHATSAPP_OTP_TEMPLATE_LANGUAGE?.trim() || 'en';

  if (!phoneNumberId || !token || !templateName) {
    logger.info({ correlationId }, 'WhatsApp auth OTP skipped (Cloud API not configured)');
    return false;
  }

  const recipient = toWhatsappRecipient(to);
  if (!recipient) {
    logger.warn({ correlationId }, 'WhatsApp auth OTP skipped (recipient empty)');
    return false;
  }

  const trimmedCode = code.trim();
  if (!/^\d{4,15}$/.test(trimmedCode)) {
    logger.warn({ correlationId }, 'WhatsApp auth OTP skipped (code shape invalid)');
    return false;
  }

  const url = `${GRAPH_BASE}/${encodeURIComponent(phoneNumberId)}/messages`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: trimmedCode }],
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: trimmedCode }],
            },
          ],
        },
      }),
    });

    if (!res.ok) {
      let graphCode: number | undefined;
      let graphSubcode: number | undefined;
      let graphType: string | undefined;
      try {
        const errJson = (await res.json()) as GraphErrorBody;
        graphCode = errJson.error?.code;
        graphSubcode = errJson.error?.error_subcode;
        graphType = errJson.error?.type;
      } catch {
        // Body may be empty; status is enough.
      }
      logger.warn(
        { correlationId, status: res.status, graphCode, graphSubcode, graphType },
        'WhatsApp auth OTP send failed',
      );
      return false;
    }

    const json = (await res.json()) as GraphSendBody;
    const messageId = json.messages?.[0]?.id;
    logger.info(
      { correlationId, hasMessageId: Boolean(messageId) },
      'WhatsApp auth OTP sent',
    );
    return Boolean(messageId);
  } catch (err: unknown) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    logger.warn(
      {
        correlationId,
        aborted,
        error: err instanceof Error ? err.name : 'unknown',
      },
      'WhatsApp auth OTP send failed',
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}
