/**
 * Instagram DM copy for booking / reschedule links (OPD slot vs queue mode).
 * lang-22: every family takes sticky turn `language` (LANG3-D1).
 * lang-26: reviewed Roman Hindi / Roman Punjabi arms for booking-critical families.
 */

import type { DoctorSettingsRow } from '../types/doctor-settings';
import { resolveOpdModeFromSettings } from '../services/opd/opd-mode-service';
import {
  toStaticLocale,
  type ConversationLanguage,
  type StaticMessageLocale,
} from './conversation-language';
import { buildRecordingAudioDisclosureMessage } from './dm-copy';

export interface BookingLinkDmInput {
  readonly language: ConversationLanguage;
  readonly slotLink: string;
  readonly doctorSettings: DoctorSettingsRow | null | undefined;
}

type BookingLinkCopy = {
  readonly queue: (slotLink: string) => string;
  readonly slot: (slotLink: string) => string;
};

const BOOKING_LINK_COPY: Readonly<Record<StaticMessageLocale, BookingLinkCopy>> = {
  en: {
    queue: (slotLink) =>
      `Join the queue for your visit here: ${slotLink}\n\nChoose a day, then confirm - you'll get a token number. Wait times are approximate.`,
    slot: (slotLink) =>
      `Pick your slot and complete payment here: ${slotLink}\n\nYou'll be redirected back to this chat when done.`,
  },
  hi: {
    queue: (slotLink) =>
      `Apni visit ke liye yahan queue join karein: ${slotLink}\n\nEk din choose karein, phir confirm karein - aapko token number milega. Wait time approximate hai.`,
    slot: (slotLink) =>
      `Apna slot pick karein aur payment yahan complete karein: ${slotLink}\n\nDone hone par aap wapas is chat par aa jayenge.`,
  },
  pa: {
    queue: (slotLink) =>
      `Apni visit layi ithe queue join karo: ${slotLink}\n\nIk din choose karo, phir confirm karo - tenu token number milega. Wait time approximate hai.`,
    slot: (slotLink) =>
      `Apna slot pick karo te payment ithe complete karo: ${slotLink}\n\nDone hon to tusi wapas is chat te aa jaoge.`,
  },
};

/**
 * Primary booking link message after patient details are ready.
 */
export function formatBookingLinkDm(input: BookingLinkDmInput): string {
  const locale = toStaticLocale(input.language);
  const copy = BOOKING_LINK_COPY[locale];
  const mode = resolveOpdModeFromSettings(input.doctorSettings);
  const link = mode === 'queue' ? copy.queue(input.slotLink) : copy.slot(input.slotLink);
  return `${link}\n\n${buildRecordingAudioDisclosureMessage()}`;
}

export interface RescheduleLinkDmInput {
  readonly language: ConversationLanguage;
  readonly url: string;
  readonly doctorSettings: DoctorSettingsRow | null | undefined;
}

type RescheduleLinkCopy = {
  readonly queue: (url: string) => string;
  readonly slot: (url: string) => string;
};

const RESCHEDULE_LINK_COPY: Readonly<Record<StaticMessageLocale, RescheduleLinkCopy>> = {
  en: {
    queue: (url) => `Pick a new day for your visit: [Reschedule](${url})`,
    slot: (url) => `Pick a new date and time: [Reschedule](${url})`,
  },
  hi: {
    queue: (url) => `Apni visit ke liye naya din pick karein: [Reschedule](${url})`,
    slot: (url) => `Naya date aur time pick karein: [Reschedule](${url})`,
  },
  pa: {
    queue: (url) => `Apni visit layi nava din pick karo: [Reschedule](${url})`,
    slot: (url) => `Navi date te time pick karo: [Reschedule](${url})`,
  },
};

/**
 * Reschedule deep-link (Markdown) - queue practices emphasize day, not fixed time.
 */
export function formatRescheduleLinkDm(input: RescheduleLinkDmInput): string {
  const locale = toStaticLocale(input.language);
  const copy = RESCHEDULE_LINK_COPY[locale];
  const mode = resolveOpdModeFromSettings(input.doctorSettings);
  return mode === 'queue' ? copy.queue(input.url) : copy.slot(input.url);
}

export interface RescheduleChoiceLinkDmInput {
  readonly language: ConversationLanguage;
  readonly url: string;
  readonly doctorSettings: DoctorSettingsRow | null | undefined;
}

const RESCHEDULE_CHOICE_LINK_COPY: Readonly<Record<StaticMessageLocale, RescheduleLinkCopy>> = {
  en: {
    queue: (url) => `Pick a new day for your visit: [Choose new day](${url})`,
    slot: (url) => `Pick a new date and time: [Choose new slot](${url})`,
  },
  hi: {
    queue: (url) => `Apni visit ke liye naya din pick karein: [Choose new day](${url})`,
    slot: (url) => `Naya date aur time pick karein: [Choose new slot](${url})`,
  },
  pa: {
    queue: (url) => `Apni visit layi nava din pick karo: [Choose new day](${url})`,
    slot: (url) => `Navi date te time pick karo: [Choose new slot](${url})`,
  },
};

/**
 * Reschedule flow after user picks from list (uses "Choose new slot" label).
 */
export function formatRescheduleChoiceLinkDm(input: RescheduleChoiceLinkDmInput): string {
  const locale = toStaticLocale(input.language);
  const copy = RESCHEDULE_CHOICE_LINK_COPY[locale];
  const mode = resolveOpdModeFromSettings(input.doctorSettings);
  return mode === 'queue' ? copy.queue(input.url) : copy.slot(input.url);
}

export interface BookingAwaitingFollowUpDmInput {
  readonly language: ConversationLanguage;
  readonly doctorSettings: DoctorSettingsRow | null | undefined;
}

type BookingAwaitingFollowUpCopy = {
  readonly queue: string;
  readonly slot: string;
};

const BOOKING_AWAITING_FOLLOW_UP_COPY: Readonly<
  Record<StaticMessageLocale, BookingAwaitingFollowUpCopy>
> = {
  en: {
    queue: "Join the queue using the link above, or say 'change' to get a new link.",
    slot: "Pick your slot and complete payment using the link above, or say 'change' to get a new link.",
  },
  hi: {
    queue: "Upar wale link se queue join karein, ya naya link ke liye 'change' likhein.",
    slot: "Upar wale link se apna slot pick karein aur payment complete karein, ya naya link ke liye 'change' likhein.",
  },
  pa: {
    queue: "Upar wale link ton queue join karo, ya nava link layi 'change' likho.",
    slot: "Upar wale link ton apna slot pick karo te payment complete karo, ya nava link layi 'change' likho.",
  },
};

/**
 * When user is in awaiting_slot_selection and did not ask for a new link.
 */
export function formatBookingAwaitingFollowUpDm(
  input: BookingAwaitingFollowUpDmInput
): string {
  const locale = toStaticLocale(input.language);
  const copy = BOOKING_AWAITING_FOLLOW_UP_COPY[locale];
  const mode = resolveOpdModeFromSettings(input.doctorSettings);
  return mode === 'queue' ? copy.queue : copy.slot;
}
