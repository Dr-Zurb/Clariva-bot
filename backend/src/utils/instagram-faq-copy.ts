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
  /\b(hours|timings?|opening hours|closing hours|what time (do you|are you) open|kab (kholt|open)|kitne baje|(?:your\s+)?availability)\b/i;

const LOCATION_FAQ =
  /\b(where (is|are) (the )?(clinic|hospital|practice|office|you)|clinic (address|adress|location)|your address|address|adress|location|clinic (kahan|kidhar))\b/i;

/** Insurance / cash-or-UPI — page link, not a consult-fee quote. */
const OPS_PAYMENT_FAQ =
  /\b(insurance|cash\s+or\s+upi|upi\s+or\s+cash|cash\s+or\s+card|do you (?:take|accept) (?:insurance|upi|cash|card)|payment method|pay by (?:upi|cash|card))\b/i;

/** Prescribe / advice / artifacts — must not go to the LLM as ask_question. */
const CLINICAL_ADVICE =
  /\b(?:are you (?:a |the )?doctor|can you prescribe|prescribe|prescription|refill|what (?:should|can|do) i take|what to take|(?:please )?advise|medical advice|medical certificate|(?:lab |blood )?reports?|is \w+ safe|paracetamol|pregnant|do you treat|(?:my )?(?:bp|blood pressure))\b/i;

/** Symptom report — receptionist deflection, not a greeting. Emergency regex still wins first. */
const SYMPTOM_REPORT =
  /\b(?:i(?:'ve|'m)?\s+(?:have(?:\s+got)?|got|am\s+having|having)|got\s+a|my)\b.{0,40}\b(?:headache|migraine|fever|cough|cold|pain|stomachache|stomach\s+ache|sore\s+throat|nausea|vomiting|dizzy(?:ness)?|rash)\b/i;

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

export function isOpsPaymentFaqUserMessage(text: string): boolean {
  return OPS_PAYMENT_FAQ.test(text);
}

export function isClinicalAdviceUserMessage(text: string): boolean {
  return CLINICAL_ADVICE.test(text) || SYMPTOM_REPORT.test(text);
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
    en: 'Visit prices are on this page:',
    hi: 'Visit prices is page par hain:',
    pa: 'Visit prices is page te han:',
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

export function buildHoursOnPageLead(language: ConversationLanguage): string {
  return pickLocale(language, {
    en: 'Timings are on this page:',
    hi: 'Timings is page par hain:',
    pa: 'Timings is page te han:',
  });
}

export function buildHoursMissingLead(language: ConversationLanguage): string {
  return pickLocale(language, {
    en: "I don't have timings saved. They're on this page:",
    hi: 'Timings save nahi hain. Woh is page par hain:',
    pa: 'Timings save nahi han. Oh is page te han:',
  });
}

/**
 * Street to speak on Instagram. NULL flag keeps today's rule: share a saved address.
 * false withholds it. The letterhead still uses address_summary either way.
 */
export function instagramAddressToShare(
  settings:
    | {
        address_summary?: string | null;
        share_address_on_instagram?: boolean | null;
      }
    | null
    | undefined
): string | null {
  const address = settings?.address_summary?.trim() || '';
  if (!address || settings?.share_address_on_instagram === false) return null;
  return address;
}

export function buildLocationQuoteLead(language: ConversationLanguage, address: string): string {
  const trimmed = address.trim();
  return pickLocale(language, {
    en: `Address: ${trimmed}`,
    hi: `Address: ${trimmed}`,
    pa: `Address: ${trimmed}`,
  });
}

export function buildLocationOnBookingPageLead(language: ConversationLanguage): string {
  return pickLocale(language, {
    en: 'The clinic details are on this page:',
    hi: 'Clinic details is page par hain:',
    pa: 'Clinic details is page te han:',
  });
}

/** Address exists for the letterhead, or none is saved, and Instagram must not say a street. */
export function buildAddressNotSharedLead(language: ConversationLanguage): string {
  return pickLocale(language, {
    en: "I don't share a street address here. I can help with timings or a booking link.",
    hi: 'Main yahan street address share nahi karta. Main timings ya booking link mein madad kar sakta hoon.',
    pa: 'Main ethe street address share nahi karda. Main timings ja booking link vich madad kar sakda haan.',
  });
}

/** Online-only practice, no street address. No "teleconsult" in the patient line. */
export function buildOnlineOnlyNoAddressLead(language: ConversationLanguage): string {
  return pickLocale(language, {
    en: "Appointments are online, so there isn't a street address. I can help with timings or a booking link.",
    hi: 'Appointments online hain, isliye koi street address nahi hai. Main timings ya booking link mein madad kar sakta hoon.',
    pa: 'Appointments online han, is layi koi street address nahi. Main timings ja booking link vich madad kar sakda haan.',
  });
}

export function buildPaymentOnBookingPageLead(language: ConversationLanguage): string {
  return pickLocale(language, {
    en: "I don't have payment details saved. They're on this page:",
    hi: 'Payment details save nahi hain. Woh is page par hain:',
    pa: 'Payment details save nahi han. Oh is page te han:',
  });
}
