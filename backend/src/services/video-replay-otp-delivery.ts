/**
 * Delivery pipe for video-replay OTP codes.
 *
 * Prefer Meta Cloud WhatsApp authentication templates when configured.
 * Fall back to Twilio SMS so a missing/failed template does not lock
 * video replay. Consult-link SMS in notification-service is unchanged.
 */

import { logger } from '../config/logger';
import { isWhatsappAuthOtpConfigured, sendWhatsappAuthOtp } from './meta-whatsapp-auth-otp-service';
import { sendSms } from './twilio-sms-service';

export type VideoReplayOtpChannel = 'whatsapp_auth' | 'twilio_sms';

export interface DeliverVideoReplayOtpResult {
  sent: boolean;
  channel: VideoReplayOtpChannel;
  fallbackFromWhatsapp: boolean;
}

function buildOtpSmsBody(code: string): string {
  return (
    `Your Halo Aid video replay code is ${code}. Valid for 5 minutes. ` +
    `If you didn't request this, ignore this SMS.`
  );
}

export async function deliverVideoReplayOtpCode(
  phone: string,
  code: string,
  correlationId: string,
): Promise<DeliverVideoReplayOtpResult> {
  if (isWhatsappAuthOtpConfigured()) {
    const waSent = await sendWhatsappAuthOtp(phone, code, correlationId);
    if (waSent) {
      return { sent: true, channel: 'whatsapp_auth', fallbackFromWhatsapp: false };
    }
    logger.warn(
      { correlationId },
      'video-replay-otp-delivery: WhatsApp auth failed; falling back to Twilio SMS',
    );
    const smsSent = await sendSms(phone, buildOtpSmsBody(code), correlationId);
    return { sent: smsSent, channel: 'twilio_sms', fallbackFromWhatsapp: true };
  }

  const sent = await sendSms(phone, buildOtpSmsBody(code), correlationId);
  return { sent, channel: 'twilio_sms', fallbackFromWhatsapp: false };
}
