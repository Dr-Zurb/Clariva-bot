/**
 * Locked Instagram menu. Not a person: no receptionist, no "I", no question.
 * Idle greeting and the unmatched-message reply both use this template.
 * Menu only: no ₹, street, or hours.
 */

import {
  languageUsesDevanagari,
  languageUsesGurmukhi,
  toStaticLocale,
  type ConversationLanguage,
  type StaticMessageLocale,
} from './conversation-language';

export type ReceptionistGreetingOpts = {
  catalogMode?: string | null;
  hasAddress?: boolean;
  /** Display name of the connected Instagram account (not the numeric id, not the @handle). */
  accountName?: string | null;
};

/** Instagram profile name safe to speak. Digits-only ids are dropped. */
export function instagramAccountNameForGreeting(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name || name.length > 30 || /^\d+$/.test(name)) return null;
  return name;
}

const DEFAULT_FROM = 'Halo Aid';

export const AUTOMATED_MENU_EN =
  'Automated reply from Halo Aid. Options: availability, cancel/reschedule, or a booking link.';

export const AUTOMATED_MENU_HI =
  'Halo Aid का automated message. Options: availability, cancel/reschedule, या booking link.';

export const AUTOMATED_MENU_HI_LATN =
  'Halo Aid ka automated message. Options: availability, cancel/reschedule, ya booking link.';

export const AUTOMATED_MENU_PA =
  'Halo Aid ਦਾ automated message. Options: availability, cancel/reschedule, ਜਾਂ booking link.';

export const AUTOMATED_MENU_PA_LATN =
  'Halo Aid da automated message. Options: availability, cancel/reschedule, ja booking link.';

/** Default hello. Kept so existing imports still compile. */
export const RECEPTIONIST_GREETING_EN = AUTOMATED_MENU_EN;

function menuLine(locale: StaticMessageLocale, script: 'native' | 'latin', from: string): string {
  if (locale === 'hi' && script === 'native') {
    return `${from} का automated message. Options: availability, cancel/reschedule, या booking link.`;
  }
  if (locale === 'hi') {
    return `${from} ka automated message. Options: availability, cancel/reschedule, ya booking link.`;
  }
  if (locale === 'pa' && script === 'native') {
    return `${from} ਦਾ automated message. Options: availability, cancel/reschedule, ਜਾਂ booking link.`;
  }
  if (locale === 'pa') {
    return `${from} da automated message. Options: availability, cancel/reschedule, ja booking link.`;
  }
  return `Automated reply from ${from}. Options: availability, cancel/reschedule, or a booking link.`;
}

export function buildAutomatedMenuMessage(
  language: ConversationLanguage,
  opts?: ReceptionistGreetingOpts
): string {
  const locale = toStaticLocale(language);
  const script =
    (locale === 'hi' && languageUsesDevanagari(language)) ||
    (locale === 'pa' && languageUsesGurmukhi(language))
      ? 'native'
      : 'latin';
  const from = instagramAccountNameForGreeting(opts?.accountName) ?? DEFAULT_FROM;
  return menuLine(locale, script, from);
}

export function buildReceptionistGreetingMessage(
  language: ConversationLanguage,
  opts?: ReceptionistGreetingOpts
): string {
  return buildAutomatedMenuMessage(language, opts);
}
