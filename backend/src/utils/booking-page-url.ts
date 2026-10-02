/**
 * Owned booking-page links. The token is the existing booking token.
 * Do not log the token.
 */

import { env } from '../config/env';
import { generateBookingToken } from './booking-token';
import { mintHistoryFormToken, type HistoryFormAppointment } from './history-form-token';
import { isPublicSlugShape } from './public-clinic-slug';

function bookingPageBase(): string {
  return (env.BOOKING_PAGE_URL?.trim() || 'https://example.com/book').replace(/\/$/, '');
}

/**
 * Book link. A public slug uses `/d/:slug?c=` on the same site.
 * No slug keeps `/book?token=`.
 */
/** Public clinic page, no conversation token. Null when the slug is missing or invalid. */
export function buildPublicClinicPageUrl(publicSlug: string | null | undefined): string | null {
  const slug = publicSlug?.trim() ?? '';
  if (!slug || !isPublicSlugShape(slug)) return null;
  const origin = bookingPageBase().replace(/\/book$/, '');
  return `${origin}/d/${slug}`;
}

export function buildBookingPageUrl(
  conversationId: string,
  doctorId: string,
  publicSlug?: string | null
): string {
  const token = generateBookingToken(conversationId, doctorId);
  const slug = publicSlug?.trim() ?? '';
  if (slug && isPublicSlugShape(slug)) {
    const origin = bookingPageBase().replace(/\/book$/, '');
    return `${origin}/d/${slug}?c=${token}`;
  }
  return `${bookingPageBase()}?token=${token}`;
}

/**
 * Reschedule stays on `/book?token=`. The token includes the appointment.
 */
export function buildReschedulePageUrl(
  conversationId: string,
  doctorId: string,
  appointmentId: string
): string {
  const token = generateBookingToken(conversationId, doctorId, { appointmentId });
  return `${bookingPageBase()}?token=${token}`;
}

/** Prep form. Relative path for the same browser session. */
export function buildHistoryFormPath(appointment: HistoryFormAppointment): string {
  const token = mintHistoryFormToken(appointment);
  return `/book/prep?t=${encodeURIComponent(token)}`;
}

/** Absolute prep URL for the one booking SMS. */
export function buildHistoryFormUrl(appointment: HistoryFormAppointment): string {
  const origin = bookingPageBase().replace(/\/book$/, '');
  const token = mintHistoryFormToken(appointment);
  return `${origin}/book/prep?t=${encodeURIComponent(token)}`;
}
