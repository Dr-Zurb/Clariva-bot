/**
 * Abandoned-booking nudge stays off Instagram. The person already has the booking link.
 */

import { logger } from '../config/logger';

export interface AbandonedBookingReminderResult {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function runAbandonedBookingReminderJob(
  correlationId: string
): Promise<AbandonedBookingReminderResult> {
  logger.info({ correlationId }, 'abandoned_booking_reminder_skipped_meta');
  return { checked: 0, sent: 0, skipped: 0, failed: 0 };
}
