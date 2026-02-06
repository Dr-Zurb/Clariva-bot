/**
 * Email Configuration (e-task-5)
 *
 * Sends transactional email via Resend. TLS 1.2+ by default (HTTPS).
 * When RESEND_API_KEY is not set, sendEmail no-ops and logs (don't block flows).
 *
 * @see EXTERNAL_SERVICES.md - Email provider patterns
 */

import { Resend } from 'resend';
import { env } from './env';
import { logger } from './logger';

const RESEND_API_KEY = env.RESEND_API_KEY?.trim();
const DEFAULT_FROM = 'Clariva <onboarding@resend.dev>';

let resendClient: Resend | null = null;
if (RESEND_API_KEY) {
  resendClient = new Resend(RESEND_API_KEY);
}

/**
 * Send a single transactional email.
 * No-op if RESEND_API_KEY is not set (logs at info, does not throw).
 *
 * @param to - Recipient email address
 * @param subject - Email subject
 * @param text - Plain text body (no HTML for Phase 0)
 * @param correlationId - For logging (metadata only, no PII)
 * @returns true if sent, false if skipped or failed (log only; caller should not block)
 */
export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  correlationId: string
): Promise<boolean> {
  if (!resendClient) {
    logger.info(
      { correlationId, toLength: to.length },
      'Email skipped (RESEND_API_KEY not set)'
    );
    return false;
  }

  try {
    const { data, error } = await resendClient.emails.send({
      from: DEFAULT_FROM,
      to: [to],
      subject,
      text,
    });

    if (error) {
      logger.warn(
        { correlationId, errorMessage: error.message },
        'Email send failed'
      );
      return false;
    }

    logger.info(
      { correlationId, emailId: data?.id },
      'Email sent'
    );
    return true;
  } catch (err) {
    logger.warn(
      { correlationId, error: err instanceof Error ? err.message : String(err) },
      'Email send error'
    );
    return false;
  }
}

export function isEmailConfigured(): boolean {
  return Boolean(resendClient);
}
