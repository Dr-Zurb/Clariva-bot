/**
 * RBH-15: Localized, non-diagnostic safety copy for medical_query + emergency.
 * No treatment advice; emergency = seek professional / local emergency numbers (India 112/108).
 */

export type SafetyMessageLocale = 'en' | 'hi' | 'pa';
export type SafetyMessageKind = 'medical_query' | 'emergency';

/** English defaults (backward compatible exports). */
export const MEDICAL_QUERY_RESPONSE_EN =
  "I'm the scheduling assistant. I can't give medical advice here. Book a teleconsult through this chat, or discuss your concerns with the doctor during your visit.";

export const EMERGENCY_RESPONSE_EN =
  'Please call emergency services (in India: **112** or **108**) or go to the nearest hospital immediately.';

const MEDICAL_QUERY_BY_LOCALE: Record<SafetyMessageLocale, string> = {
  en: MEDICAL_QUERY_RESPONSE_EN,
  hi: 'मैं अपॉइंटमेंट बुक करने में मदद करने वाला सहायक हूँ। मैं यहाँ चिकित्सा सलाह नहीं दे सकता। कृपया इस चैट से टेलीकंसल्ट बुक करें, या विज़िट के दौरान डॉक्टर से अपनी बात साझा करें।',
  pa: 'ਮੈਂ ਸਿਰਫ਼ ਅਪਾਇੰਟਮੈਂਟ ਲਈ ਸਹਾਇਕ ਹਾਂ। ਮੈਂ ਇੱਥੇ ਵੈਦਕ ਸਲਾਹ ਨਹੀਂ ਦੇ ਸਕਦਾ। ਕਿਰਪਾ ਕਰਕੇ ਇਸ ਚੈਟ ਰਾਹੀਂ ਟੈਲੀਕੰਸਲਟ ਬੁੱਕ ਕਰੋ, ਜਾਂ ਦੌਰਾਨ ਡਾਕਟਰ ਨਾਲ ਗੱਲ ਕਰੋ।',
};

/** Roman Hindi - for users typing Hinglish without Devanagari */
const MEDICAL_QUERY_LATIN_HI =
  'Main appointment booking assistant hoon. Main yahan medical advice nahi de sakta. Kripaya is chat se teleconsult book karein, ya visit ke dauran doctor se baat karein.';

/** Roman Punjabi */
const MEDICAL_QUERY_LATIN_PA =
  'Main sirf appointment layi assistant haan. Main ithe medical salah nahi de sakda. Kirpa karke is chat rahi teleconsult book karo, jaan visit dauran doctor naal gal karo.';

const EMERGENCY_BY_LOCALE: Record<SafetyMessageLocale, string> = {
  en: EMERGENCY_RESPONSE_EN,
  hi: 'कृपया तुरंत आपातकालीन सेवा को कॉल करें (भारत: **112** या **108**) या नज़दीकी अस्पताल जाएं।',
  pa: 'ਕਿਰਪਾ ਕਰਕੇ ਤੁਰੰਤ ਐਮਰਜੈਂਸੀ ਸੇਵਾ ਨੂੰ ਕਾਲ ਕਰੋ (ਭਾਰਤ: **112** ਜਾਂ **108**) ਜਾਂ ਨੇੜਲੇ ਹਸਪਤਾਲ ਜਾਓ।',
};

const EMERGENCY_LATIN_HI =
  'Kripaya turant emergency service ko call karein (Bharat: **112** ya **108**) ya nazdeeki hospital jayein.';

const EMERGENCY_LATIN_PA =
  'Kirpa karke turant emergency nu call karo (Bharat: **112** jaan **108**) jaan nazdeeki hospital jao.';

/**
 * Guess locale from script + common Latin transliterations (no LLM).
 */
export function detectSafetyMessageLocale(raw: string): SafetyMessageLocale {
  const t = raw.trim();
  if (!t) return 'en';
  // Gurmukhi (Punjabi)
  if (/[\u0A00-\u0A7F]/.test(t)) return 'pa';
  // Devanagari (Hindi and similar)
  if (/[\u0900-\u097F]/.test(t)) return 'hi';

  const lower = t.toLowerCase();
  // Latin Punjabi markers (prefer before Hindi when strong cues)
  if (
    /\b(menu|meri|mera|naal|vich|chhati|chhaati|behosh|behoshi|punjabi)\b/i.test(t) ||
    /\b(menu\s+(tin|ten|ik|do)|meri\s+chhati|saas\s+nahi|sass\s+nahi)\b/i.test(lower)
  ) {
    return 'pa';
  }
  // Latin Hindi / Hinglish markers (incl. fee questions: kitni fees, acha kitna, etc.)
  if (
    /\b(mujhe|mere|mera|meri|kya|hai|hain|nahi|nahin|dard|bukhar|bukhhaar|khansi|khans|jukam|jukaam|saans|sans|chakkar|ulti|tabiyat|beech)\b/i.test(
      t
    ) ||
    /\b(pet\s+dard|sir\s+dard|kitni\s+din)\b/i.test(lower) ||
    /\b(kitni|kitna|kitne|acha|accha|bolo|bhai|yaar|yar|toh|theek|thik|rupaye|rupiya|paise|paisa|zada|zyada|doc|goli|batado|batao|bohut)\b/i.test(
      lower
    )
  ) {
    return 'hi';
  }
  return 'en';
}

export function resolveSafetyMessage(kind: SafetyMessageKind, userText: string): string {
  const locale = detectSafetyMessageLocale(userText);
  const hasDevanagari = /[\u0900-\u097F]/.test(userText);
  const hasGurmukhi = /[\u0A00-\u0A7F]/.test(userText);

  if (kind === 'emergency') {
    if (locale === 'hi' && !hasDevanagari) return EMERGENCY_LATIN_HI;
    if (locale === 'pa' && !hasGurmukhi) return EMERGENCY_LATIN_PA;
    return EMERGENCY_BY_LOCALE[locale];
  }

  if (locale === 'hi' && !hasDevanagari) return MEDICAL_QUERY_LATIN_HI;
  if (locale === 'pa' && !hasGurmukhi) return MEDICAL_QUERY_LATIN_PA;
  return MEDICAL_QUERY_BY_LOCALE[locale];
}

// ---------------------------------------------------------------------------
// Emergency signal detection (keyword / phrase; deterministic, no logging)
// ---------------------------------------------------------------------------

const EMERGENCY_PATTERNS_EN: RegExp[] = [
  /\b(chest\s+pain|can'?t\s+breathe|cannot\s+breathe|difficulty\s+breathing)\b/i,
  /\b(heart\s+attack|stroke|unconscious)\b/i,
  /\b(bleeding\s+heavily|uncontrolled\s+bleeding)\b/i,
  /\b(severe\s+pain|critical\s+condition)\b/i,
  /\b(poison(ing)?|swallowed\s+poison|consumed\s+poison)\b/i,
  /\b(faint(ed|ing)?|passed\s+out|collapse(d)?)\b/i,
  /\b(accident|car\s+crash|road\s+accident)\b/i,
  /\b(emergency\s+(services|help|room)|need\s+emergency\s+help)\b/i,
];

/** Hindi / Hinglish (Devanagari + Latin) */
const EMERGENCY_PATTERNS_HI: RegExp[] = [
  /छाती\s*(में\s*)?दर्द/,
  /साँस\s*(नहीं|नहीं\s*आ)/,
  /दम\s*घुट/,
  /बेहोश|अचेत/,
  /दुर्घटना|खून\s*बह/,
  /ज़हर|विष(?:\s*खा)?/,
  /\b(chhaati\s+mein\s+dard|saans\s+nahi|saas\s+nahi|sans\s+nahi|dam\s+ghut|behosh|durghatna|khoon)\b/i,
  /\b(chest\s+dard)\b/i,
];

/** Punjabi Gurmukhi + common Latin transliteration */
const EMERGENCY_PATTERNS_PA: RegExp[] = [
  /ਛਾਤੀ(\s*ਵਿੱਚ)?\s*ਦਰਦ/,
  /ਸਾਸ\s*(ਨਹੀਂ|ਨ\s*ਆ)/,
  /ਬੇਹੋਸ਼|ਬੇ\s*ਹੋਸ਼/,
  /ਦੁਰਘਟਨਾ|ਜ਼ਹਿਰ/,
  /\b(chhati\s+vich\s+dard|chhaati\s+vich\s+dard)\b/i,
  /\b(saas\s+nahi|sass\s+nahi)\b/i,
  /\b(behosh|zehar|zahar|khoon)\b/i,
  /\b(meri\s+chhati|menu\s+saans)\b/i,
];

const ALL_EMERGENCY_PATTERNS: RegExp[] = [
  ...EMERGENCY_PATTERNS_EN,
  ...EMERGENCY_PATTERNS_HI,
  ...EMERGENCY_PATTERNS_PA,
];

/**
 * True when message should be treated as emergency (same signals as intent fast-path).
 */
export function isEmergencyUserMessage(text: string): boolean {
  const t = text.trim();
  if (t.length > 500) return false;
  if (/\bemergency\s+appointment\b/i.test(t)) return false;
  if (/\burgent\s+appointment\b/i.test(t)) return false;
  return ALL_EMERGENCY_PATTERNS.some((p) => p.test(t));
}
