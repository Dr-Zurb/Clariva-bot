/**
 * ARM-05: Patient-facing copy when teleconsult visit type awaits staff confirmation (no slot/payment yet).
 * No fixed SLA window — staff confirm when they can; future notification system may nudge clinicians.
 * lang-22: awaiting / still-pending take sticky `language` (LANG3-D1).
 * lang-26: reviewed Roman Hindi / Roman Punjabi arms.
 */

import type { DoctorSettingsRow } from '../types/doctor-settings';
import type { ConversationState } from '../types/conversation';
import {
  toStaticLocale,
  type ConversationLanguage,
  type StaticMessageLocale,
} from './conversation-language';
import { buildStaffReviewResolvedBookingMessage } from './dm-copy';
import { findServiceOfferingByKey, getActiveServiceCatalog } from './service-catalog-helpers';

export function resolveVisitTypeLabelForDm(
  settings: DoctorSettingsRow | null,
  state: ConversationState
): string | undefined {
  const catalog = getActiveServiceCatalog(settings);
  if (!catalog) return undefined;
  const key =
    state.serviceMatch?.matcherProposedCatalogServiceKey?.trim() ||
    state.serviceMatch?.catalogServiceKey?.trim() ||
    undefined;
  if (!key) return undefined;
  const row = findServiceOfferingByKey(catalog, key);
  return row?.label?.trim() || undefined;
}

type AwaitingStaffCopy = {
  readonly body: (practice: string) => string;
};

const AWAITING_STAFF_COPY: Readonly<Record<StaticMessageLocale, AwaitingStaffCopy>> = {
  en: {
    body: (practice) =>
      `Thanks. **${practice}** is confirming this booking. Message here when you want the booking page. You do not need to pay in this chat.`,
  },
  hi: {
    body: (practice) =>
      `Dhanyavaad. **${practice}** is booking ko confirm kar raha hai. Booking page chahiye ho to yahan message karein. Is chat mein payment nahi karni.`,
  },
  pa: {
    body: (practice) =>
      `Dhanyavaad. **${practice}** is booking nu confirm kar reha hai. Booking page chahidi hove ta ithe message karo. Is chat vich payment nahi karni.`,
  },
};

/** First message after consent / match when scheduling is gated (server-owned copy; no invented fees). */
export function formatAwaitingStaffServiceConfirmationDm(
  language: ConversationLanguage,
  settings: DoctorSettingsRow | null,
  state: ConversationState
): string {
  void state;
  const locale = toStaticLocale(language);
  const practice = settings?.practice_name?.trim() || 'the clinic';
  return AWAITING_STAFF_COPY[locale].body(practice);
}

type StillPendingCopy = {
  readonly body: (practice: string) => string;
};

const STILL_PENDING_COPY: Readonly<Record<StaticMessageLocale, StillPendingCopy>> = {
  en: {
    body: (practice) =>
      `**${practice}** is still confirming this booking. Message here when you want the booking page.`,
  },
  hi: {
    body: (practice) =>
      `**${practice}** ab bhi is booking ko confirm kar raha hai. Booking page chahiye ho to yahan message karein.`,
  },
  pa: {
    body: (practice) =>
      `**${practice}** hun vi is booking nu confirm kar reha hai. Booking page chahidi hove ta ithe message karo.`,
  },
};

/** Follow-up when patient messages while still pending staff (still no link). */
export function formatStaffServiceReviewStillPendingDm(
  language: ConversationLanguage,
  settings: DoctorSettingsRow | null
): string {
  const locale = toStaticLocale(language);
  const practice = settings?.practice_name?.trim() || 'the clinic';
  return STILL_PENDING_COPY[locale].body(practice);
}

const SLA_TIMEOUT_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: "Our team hasn't responded to your booking review yet — we're following up now. You can also try again later or ask to book.",
  hi: "Hamari team ne ab tak aapki booking review ka jawab nahi diya — hum ab follow-up kar rahe hain. Baad mein dobara try kar sakte hain ya book karne ko keh sakte hain.",
  pa: "Sadi team ne hun tak tuhadi booking review da jawab nahi dita — asi hun follow-up kar rahe haan. Baad vich dobara try kar sakde ho ya book karn layi keh sakde ho.",
};

/** Out-of-band SLA breach nudge (cron) — sticky conversation language (LANG3-D3). */
export function formatStaffServiceReviewSlaTimeoutDm(
  language: ConversationLanguage
): string {
  return SLA_TIMEOUT_COPY[toStaticLocale(language)];
}

/**
 * After staff confirms or reassigns visit type (or the learning-policy
 * autobook path fires): patient can open the booking page.
 *
 * Layout / copy is owned by `buildStaffReviewResolvedBookingMessage` in
 * `dm-copy.ts` (Task 08 — URL on its own line for reliable tap targets).
 * This wrapper is kept as the ARM-05 entry point so existing call sites
 * (`service-staff-review-service.ts`, `service-match-learning-autobook.ts`)
 * don't need to know about the `dm-copy` module.
 */
export function formatStaffReviewResolvedContinueBookingDm(
  language: ConversationLanguage,
  settings: DoctorSettingsRow | null,
  visitLabel: string,
  bookingUrl: string,
  kind: 'confirmed' | 'reassigned' | 'learning_policy_autobook'
): string {
  return buildStaffReviewResolvedBookingMessage({
    language,
    practiceName: settings?.practice_name ?? undefined,
    visitLabel,
    bookingUrl,
    kind,
  });
}
