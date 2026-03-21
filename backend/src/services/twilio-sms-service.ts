/**
 * Twilio SMS Service (e-task-8)
 *
 * Sends SMS via Twilio REST API. Used for consultation link and other patient notifications.
 * No-op when TWILIO_PHONE_NUMBER or credentials not configured.
 *
 * @see COMPLIANCE.md - No PHI in logs
 */

import Twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../config/logger';

function getTwilioClient(): Twilio.Twilio | null {
  const sid = env.TWILIO_ACCOUNT_SID?.trim();
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) return null;
  return Twilio(sid, token);
}

/**
 * Send SMS via Twilio.
 * No-op if Twilio SMS not configured (TWILIO_PHONE_NUMBER, ACCOUNT_SID, AUTH_TOKEN).
 *
 * @param to - Recipient E.164 phone number
 * @param body - Message text
 * @param correlationId - For logging (metadata only, no PHI)
 * @returns true if sent, false if skipped or failed (log only)
 */
export async function sendSms(
  to: string,
  body: string,
  correlationId: string
): Promise<boolean> {
  const client = getTwilioClient();
  const from = env.TWILIO_PHONE_NUMBER?.trim();

  if (!client || !from) {
    logger.info({ correlationId }, 'SMS skipped (Twilio SMS not configured)');
    return false;
  }

  const trimmedTo = to?.trim();
  if (!trimmedTo) {
    logger.warn({ correlationId }, 'SMS skipped (recipient empty)');
    return false;
  }

  try {
    const message = await client.messages.create({
      to: trimmedTo,
      from,
      body,
    });

    logger.info(
      { correlationId, messageSid: message.sid },
      'SMS sent'
    );
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err && typeof err === 'object' && 'status' in err ? (err as { status: number }).status : undefined;
    logger.warn(
      { correlationId, error: message, status },
      'SMS send failed'
    );
    return false;
  }
}
