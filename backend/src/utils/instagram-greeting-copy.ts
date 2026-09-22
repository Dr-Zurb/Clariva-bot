/**
 * Locked Instagram greeting — receptionist, no doctor / teleconsult / medical wording.
 * Idle greeting is this template, not the LLM (App Review first file).
 * Menu only: no ₹, street, or hours in the hello.
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

/** Instagram profile name safe to speak in the hello. Digits-only ids are dropped. */
export function instagramAccountNameForGreeting(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name || name.length > 30 || /^\d+$/.test(name)) return null;
  return name;
}

/** Default hello: packaged / no address (no fee in the menu). */
export const RECEPTIONIST_GREETING_EN =
  "Hi — I'm the receptionist. I can help with availability, cancel/reschedule, or a booking link. How can I help today?";

function joinHelpTopics(topics: string[]): string {
  if (topics.length === 0) return 'a booking link';
  if (topics.length === 1) return topics[0]!;
  if (topics.length === 2) return `${topics[0]} or ${topics[1]}`;
  return `${topics.slice(0, -1).join(', ')}, or ${topics[topics.length - 1]}`;
}

function greetingHelpTopics(opts?: ReceptionistGreetingOpts): string[] {
  const topics = ['availability'];
  if (opts?.hasAddress) topics.push('address');
  if (opts?.catalogMode === 'single_fee') topics.push('the consult fee');
  topics.push('cancel/reschedule', 'a booking link');
  return topics;
}

const OPENER: Record<StaticMessageLocale, string> = {
  en: "Hi — I'm the receptionist. I can help with",
  hi: 'Namaste — main receptionist hoon. Main madad kar sakta hoon',
  pa: 'Sat sri akal — main receptionist haan. Main madad kar sakda haan',
};

function namedOpener(locale: StaticMessageLocale, name: string): string {
  if (locale === 'hi') {
    return `Namaste — main ${name} ka receptionist hoon. Main madad kar sakta hoon`;
  }
  if (locale === 'pa') {
    return `Sat sri akal — main ${name} da receptionist haan. Main madad kar sakda haan`;
  }
  return `Hi — I'm ${name}'s receptionist. I can help with`;
}

const CLOSER: Record<StaticMessageLocale, string> = {
  en: 'How can I help today?',
  hi: 'Aaj kaise help karun?',
  pa: 'Ajj kivain help karan?',
};

export function buildReceptionistGreetingMessage(
  language: ConversationLanguage,
  opts?: ReceptionistGreetingOpts
): string {
  const locale = toStaticLocale(language);
  const openerLocale =
    locale === 'hi' && !languageUsesDevanagari(language)
      ? 'hi'
      : locale === 'pa' && !languageUsesGurmukhi(language)
        ? 'pa'
        : locale;
  const accountName = instagramAccountNameForGreeting(opts?.accountName);
  const topics = joinHelpTopics(greetingHelpTopics(opts));
  if (!opts?.hasAddress && opts?.catalogMode !== 'single_fee' && openerLocale === 'en') {
    if (!accountName) return RECEPTIONIST_GREETING_EN;
    return `Hi — I'm ${accountName}'s receptionist. I can help with availability, cancel/reschedule, or a booking link. How can I help today?`;
  }
  const opener = accountName ? namedOpener(openerLocale, accountName) : OPENER[openerLocale];
  return `${opener} ${topics}. ${CLOSER[openerLocale]}`;
}
