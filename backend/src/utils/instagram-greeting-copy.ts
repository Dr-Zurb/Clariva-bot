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
};

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
  const topics = joinHelpTopics(greetingHelpTopics(opts));
  if (!opts?.hasAddress && opts?.catalogMode !== 'single_fee' && openerLocale === 'en') {
    return RECEPTIONIST_GREETING_EN;
  }
  return `${OPENER[openerLocale]} ${topics}. ${CLOSER[openerLocale]}`;
}
