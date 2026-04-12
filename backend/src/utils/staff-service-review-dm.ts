/**
 * ARM-05: Patient-facing copy when teleconsult visit type awaits staff confirmation (no slot/payment yet).
 * No fixed SLA window — staff confirm when they can; future notification system may nudge clinicians.
 */

import type { DoctorSettingsRow } from '../types/doctor-settings';
import type { ConversationState } from '../types/conversation';
import { findServiceOfferingByKey, getActiveServiceCatalog } from './service-catalog-helpers';

export function resolveVisitTypeLabelForDm(
  settings: DoctorSettingsRow | null,
  state: ConversationState
): string | undefined {
  const catalog = getActiveServiceCatalog(settings);
  if (!catalog) return undefined;
  const key =
    state.matcherProposedCatalogServiceKey?.trim() ||
    state.catalogServiceKey?.trim() ||
    undefined;
  if (!key) return undefined;
  const row = findServiceOfferingByKey(catalog, key);
  return row?.label?.trim() || undefined;
}

/** First message after consent / match when scheduling is gated (server-owned copy; no invented fees). */
export function formatAwaitingStaffServiceConfirmationDm(
  settings: DoctorSettingsRow | null,
  state: ConversationState
): string {
  const practice = settings?.practice_name?.trim() || 'the clinic';
  const visit = resolveVisitTypeLabelForDm(settings, state);
  const visitClause = visit ? ` We've noted your request as **${visit}**.` : '';
  return (
    `Thanks — **${practice}** will confirm your visit type before we open scheduling.${visitClause} ` +
    `Our team will reply here **soon**. ` +
    `You do **not** need to pay yet. We'll message you when you can pick a time.`
  );
}

/** Follow-up when patient messages while still pending staff (still no link). */
export function formatStaffServiceReviewStillPendingDm(
  settings: DoctorSettingsRow | null
): string {
  const practice = settings?.practice_name?.trim() || 'the clinic';
  return (
    `We're still confirming with **${practice}**. You'll get a message here when you can choose a time. ` +
    `Thanks for your patience.`
  );
}

/** After staff confirms or reassigns visit type: patient can open booking page (matches prior “we’ll message you” promise). */
export function formatStaffReviewResolvedContinueBookingDm(
  settings: DoctorSettingsRow | null,
  visitLabel: string,
  bookingUrl: string,
  kind: 'confirmed' | 'reassigned' | 'learning_policy_autobook'
): string {
  const practice = settings?.practice_name?.trim() || 'the clinic';
  const label = visitLabel.trim() || 'your visit';
  const intro =
    kind === 'confirmed'
      ? `**${practice}** has confirmed your visit type: **${label}**.`
      : kind === 'learning_policy_autobook'
        ? `**${practice}** has applied your saved visit-type preference: **${label}**.`
        : `**${practice}** has updated your visit type to **${label}**.`;
  return (
    `${intro} You can **pick a time and complete booking** here — tap to open: ${bookingUrl}\n\n` +
    `If something looks wrong, just reply here in this chat.`
  );
}
