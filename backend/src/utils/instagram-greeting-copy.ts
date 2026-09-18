/**
 * Locked Instagram greeting — receptionist, no doctor / teleconsult / medical wording.
 * Idle greeting is this template, not the LLM (App Review first file).
 */

import {
  languageUsesDevanagari,
  languageUsesGurmukhi,
  toStaticLocale,
  type ConversationLanguage,
  type StaticMessageLocale,
} from './conversation-language';

export const RECEPTIONIST_GREETING_EN =
  "Hi — I'm the receptionist. I can help with timings, availability, or a booking link. How can I help today?";

const BY_LOCALE: Record<StaticMessageLocale, string> = {
  en: RECEPTIONIST_GREETING_EN,
  hi: 'Namaste — main receptionist hoon. Timings, availability, ya booking link mein madad kar sakta hoon. Aaj kaise help karun?',
  pa: 'Sat sri akal — main receptionist haan. Timings, availability, ya booking link vich madad kar sakda haan. Ajj kivain help karan?',
};

const LATIN_HI = BY_LOCALE.hi;
const LATIN_PA = BY_LOCALE.pa;

export function buildReceptionistGreetingMessage(language: ConversationLanguage): string {
  const locale = toStaticLocale(language);
  if (locale === 'hi' && !languageUsesDevanagari(language)) return LATIN_HI;
  if (locale === 'pa' && !languageUsesGurmukhi(language)) return LATIN_PA;
  return BY_LOCALE[locale];
}
