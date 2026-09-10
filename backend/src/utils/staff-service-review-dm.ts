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
  readonly body: (practice: string, visitClause: string) => string;
};

const AWAITING_STAFF_COPY: Readonly<Record<StaticMessageLocale, AwaitingStaffCopy>> = {
  en: {
    body: (practice, visitClause) =>
      `Thanks — **${practice}** will confirm your visit type before we open scheduling.${visitClause} ` +
      `Our team will reply here **soon**. ` +
      `You do **not** need to pay yet. We'll message you when you can pick a time.`,
  },
  hi: {
    body: (practice, visitClause) =>
      `Dhanyavaad — scheduling shuru karne se pehle **${practice}** aapki visit type confirm karega.${visitClause} ` +
      `Hamari team yahan **jald** reply karegi. ` +
      `Abhi aapko **payment** nahi karni. Jab aap time pick kar sakte hain tab hum message karenge.`,
  },
  pa: {
    body: (practice, visitClause) =>
      `Dhanyavaad — scheduling shuru karn ton pehlan **${practice}** tuhadi visit type confirm karega.${visitClause} ` +
      `Sadi team ithe **jald** reply karegi. ` +
      `Hun tenu **payment** nahi karni. Jadon tusi time pick kar sakde ho tab asi message karange.`,
  },
};

/** First message after consent / match when scheduling is gated (server-owned copy; no invented fees). */
export function formatAwaitingStaffServiceConfirmationDm(
  language: ConversationLanguage,
  settings: DoctorSettingsRow | null,
  state: ConversationState
): string {
  const locale = toStaticLocale(language);
  const practice = settings?.practice_name?.trim() || 'the clinic';
  const visit = resolveVisitTypeLabelForDm(settings, state);
  const visitClauseByLocale: Record<StaticMessageLocale, (label: string) => string> = {
    en: (label) => ` We've noted your request as **${label}**.`,
    hi: (label) => ` Humne aapki request **${label}** ke roop mein note kar li hai.`,
    pa: (label) => ` Asi tuhadi request **${label}** vajon note kar li hai.`,
  };
  const visitClause = visit ? visitClauseByLocale[locale](visit) : '';
  return AWAITING_STAFF_COPY[locale].body(practice, visitClause);
}

type StillPendingCopy = {
  readonly body: (practice: string) => string;
};

const STILL_PENDING_COPY: Readonly<Record<StaticMessageLocale, StillPendingCopy>> = {
  en: {
    body: (practice) =>
      `We're still confirming with **${practice}**. You'll get a message here when you can choose a time. ` +
      `Thanks for your patience.`,
  },
  hi: {
    body: (practice) =>
      `Hum ab bhi **${practice}** ke saath confirm kar rahe hain. Jab aap time choose kar sakte hain tab aapko yahan message milega. ` +
      `Aapke sabr ke liye dhanyavaad.`,
  },
  pa: {
    body: (practice) =>
      `Asi hun vi **${practice}** naal confirm kar rahe haan. Jadon tusi time choose kar sakde ho tab tenu ithe message milega. ` +
      `Tuhade sabr layi dhanyavaad.`,
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
