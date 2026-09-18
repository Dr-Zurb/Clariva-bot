/**
 * Locked Instagram FAQ leads — receptionist + booking page, no catalog / teleconsult list.
 */

import {
  languageUsesDevanagari,
  languageUsesGurmukhi,
  toStaticLocale,
  type ConversationLanguage,
  type StaticMessageLocale,
} from './conversation-language';

const THANKS_ONLY = /^(thanks|thank you|thx|ty|thanku|dhanyavaad|shukriya)[\s!?.]*$/i;

const HOURS_FAQ =
  /\b(hours|timings?|opening hours|closing hours|what time (do you|are you) open|kab (kholt|open)|kitne baje)\b/i;

const LOCATION_FAQ =
  /\b(where (is|are) (the )?(clinic|hospital|practice|office)|clinic (address|location)|your address|clinic (kahan|kidhar))\b/i;

/** Prescribe / advice / artifacts — must not go to the LLM as ask_question. */
const CLINICAL_ADVICE =
  /\b(?:are you (?:a |the )?doctor|can you prescribe|prescribe|prescription|refill|what (?:should|can|do) i take|what to take|(?:please )?advise|medical advice|medical certificate|(?:lab |blood )?reports?|is \w+ safe|paracetamol|pregnant|do you treat|(?:my )?(?:bp|blood pressure))\b/i;

function pickLocale(
  language: ConversationLanguage,
  byLocale: Record<StaticMessageLocale, string>
): string {
  const locale = toStaticLocale(language);
  if (locale === 'hi' && !languageUsesDevanagari(language)) return byLocale.hi;
  if (locale === 'pa' && !languageUsesGurmukhi(language)) return byLocale.pa;
  return byLocale[locale];
}

export function isThanksOnlyUserMessage(text: string): boolean {
  return THANKS_ONLY.test(text.trim());
}

export function isHoursFaqUserMessage(text: string): boolean {
  return HOURS_FAQ.test(text);
}

export function isLocationFaqUserMessage(text: string): boolean {
  return LOCATION_FAQ.test(text);
}

export function isClinicalAdviceUserMessage(text: string): boolean {
  return CLINICAL_ADVICE.test(text);
}

export function buildReceptionistThanksMessage(language: ConversationLanguage): string {
  return pickLocale(language, {
    en: "You're welcome.",
    hi: 'Shukriya.',
    pa: 'Shukriya.',
  });
}

export function buildPricesOnBookingPageLead(language: ConversationLanguage): string {
  return pickLocale(language, {
    en: 'Prices are on the booking page.',
    hi: 'Prices booking page par hain.',
    pa: 'Prices booking page te han.',
  });
}

export function buildHoursQuoteLead(language: ConversationLanguage, hours: string): string {
  const trimmed = hours.trim();
  return pickLocale(language, {
    en: `Timings: ${trimmed}`,
    hi: `Timings: ${trimmed}`,
    pa: `Timings: ${trimmed}`,
  });
}

export function buildHoursMissingLead(language: ConversationLanguage): string {
  return pickLocale(language, {
    en: 'Timings are on the booking page.',
    hi: 'Timings booking page par hain.',
    pa: 'Timings booking page te han.',
  });
}

export function buildLocationOnBookingPageLead(language: ConversationLanguage): string {
  return pickLocale(language, {
    en: 'You can book on the website.',
    hi: 'Aap website par book kar sakte hain.',
    pa: 'Tusi website te book kar sakde ho.',
  });
}
