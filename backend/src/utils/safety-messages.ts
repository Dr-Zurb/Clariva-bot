/**
 * RBH-15: Localized, non-diagnostic safety copy for medical_query + emergency.
 * No treatment advice; emergency = seek professional / local emergency numbers (India 112/108).
 *
 * Locale is the turn-resolved language (lang-06) — never re-detected from patient text.
 */

import {
  languageUsesDevanagari,
  languageUsesGurmukhi,
  toStaticLocale,
  type ConversationLanguage,
  type StaticMessageLocale,
} from './conversation-language';

export type SafetyMessageLocale = StaticMessageLocale;
export type SafetyMessageKind = 'medical_query' | 'emergency';

/** First escalation vs reaffirm after a prior 112 in-thread (hospital-first vs call-dispatch). */
export type EmergencySafetyVariant = 'first' | 'reaffirm';

export interface ResolveSafetyMessageOptions {
  /** When kind is emergency and prior 112 exists in-thread, use call-dispatch reaffirm copy. */
  emergencyVariant?: EmergencySafetyVariant;
}

/** English defaults (backward compatible exports). */
export const MEDICAL_QUERY_RESPONSE_EN =
  "I'm the receptionist. I can help with timings, availability, or a booking link.";

export const EMERGENCY_RESPONSE_EN =
  'Please call emergency services (in India: **112** or **108**) or go to the nearest hospital immediately.';

/** Repeat escalation: emphasize calling 112 for dispatch (still matches escalation-copy detector). */
export const EMERGENCY_REAFFIRM_RESPONSE_EN =
  'Please call **112** or **108** now - emergency services can reach you where you are. I cannot help medically over DM.';

const MEDICAL_QUERY_BY_LOCALE: Record<SafetyMessageLocale, string> = {
  en: MEDICAL_QUERY_RESPONSE_EN,
  hi: 'मैं रिसेप्शनिस्ट हूँ। समय, उपलब्धता, या बुकिंग लिंक में मदद कर सकता हूँ।',
  pa: 'Main receptionist haan. Timings, availability, ya booking link vich madad kar sakda haan.',
};

/** Roman Hindi - for users typing Hinglish without Devanagari */
const MEDICAL_QUERY_LATIN_HI =
  'Main receptionist hoon. Timings, availability, ya booking link mein madad kar sakta hoon.';

/** Roman Punjabi */
const MEDICAL_QUERY_LATIN_PA =
  'Main receptionist haan. Timings, availability, ya booking link vich madad kar sakda haan.';

const EMERGENCY_BY_LOCALE: Record<SafetyMessageLocale, string> = {
  en: EMERGENCY_RESPONSE_EN,
  hi: 'कृपया तुरंत आपातकालीन सेवा को कॉल करें (भारत: **112** या **108**) या नज़दीकी अस्पताल जाएं।',
  pa: 'ਕਿਰਪਾ ਕਰਕੇ ਤੁਰੰਤ ਐਮਰਜੈਂਸੀ ਸੇਵਾ ਨੂੰ ਕਾਲ ਕਰੋ (ਭਾਰਤ: **112** ਜਾਂ **108**) ਜਾਂ ਨੇੜਲੇ ਹਸਪਤਾਲ ਜਾਓ।',
};

const EMERGENCY_LATIN_HI =
  'Kripaya turant emergency service ko call karein (Bharat: **112** ya **108**) ya nazdeeki hospital jayein.';

const EMERGENCY_LATIN_PA =
  'Kirpa karke turant emergency nu call karo (Bharat: **112** jaan **108**) jaan nazdeeki hospital jao.';

const EMERGENCY_REAFFIRM_BY_LOCALE: Record<SafetyMessageLocale, string> = {
  en: EMERGENCY_REAFFIRM_RESPONSE_EN,
  hi: 'कृपया अभी **112** या **108** पर कॉल करें - आपातकालीन सेवा आपके स्थान पर पहुँच सकती है। मैं यहाँ चिकित्सा मदद नहीं दे सकता।',
  pa: 'ਕਿਰਪਾ ਕਰਕੇ ਹੁਣੇ **112** ਜਾਂ **108** ਤੇ ਕਾਲ ਕਰੋ - ਐਮਰਜੈਂਸੀ ਸੇਵਾ ਤੁਹਾਡੇ ਕੋਲ ਪਹੁੰਚ ਸਕਦੀ ਹੈ। ਮੈਂ ਇੱਥੇ ਵੈਦਕ ਮਦਦ ਨਹੀਂ ਦੇ ਸਕਦਾ।',
};

const EMERGENCY_REAFFIRM_LATIN_HI =
  'Kripaya abhi **112** ya **108** par call karein - emergency service aapke location tak pahunch sakti hai. Main yahan medical help nahi de sakta.';

const EMERGENCY_REAFFIRM_LATIN_PA =
  'Kirpa karke hune **112** jaan **108** te call karo - emergency service tuhade kol pahunch sakdi hai. Main ithe medical madad nahi de sakda.';

// ---------------------------------------------------------------------------
// Booking safety-net line (booking page only — never a Meta DM)
// ---------------------------------------------------------------------------
//
// The sentence used to ride payment confirmations and the T−24h reminder.
// Those Meta messages no longer include it. The constants stay so
// `stripBookingSafetyNetLines` can still remove historical copies before
// emergency matching: they contain 112/108 + hospital and would otherwise
// make an old confirmation look like a prior emergency escalation.
// If you edit a line, the strip list updates automatically. The booking page
// shows the English sentence (without markdown bold).

export const BOOKING_SAFETY_NET_LINE_EN =
  "If your symptoms get worse or feel like an emergency before your visit, don't wait — call **112** or **108**, or go to the nearest hospital right away.";

export const BOOKING_SAFETY_NET_LINE_HI =
  'अगर विज़िट से पहले आपके लक्षण बढ़ें या इमरजेंसी जैसा लगे, तो इंतज़ार न करें — **112** या **108** पर कॉल करें, या नज़दीकी अस्पताल जाएं।';

export const BOOKING_SAFETY_NET_LINE_HI_LATN =
  'Agar visit se pehle aapke symptoms badh jayein ya emergency jaisa lage, to intezaar na karein — **112** ya **108** par call karein, ya nazdeeki hospital jayein.';

export const BOOKING_SAFETY_NET_LINE_PA_LATN =
  'Je visit ton pehlan tuhade symptoms vadh jaan ya emergency varga lage, ta intezaar na karo — **112** ya **108** te call karo, ya nazdeeki hospital jao.';

/** Every shipped variant — the strip list for the escalation-copy detector. */
export const KNOWN_BOOKING_SAFETY_NET_LINES: readonly string[] = [
  BOOKING_SAFETY_NET_LINE_EN,
  BOOKING_SAFETY_NET_LINE_HI,
  BOOKING_SAFETY_NET_LINE_HI_LATN,
  BOOKING_SAFETY_NET_LINE_PA_LATN,
];

/**
 * Remove known booking safety-net lines from outbound text before emergency
 * pattern-matching. Exact-substring removal is safe: the lines are fixed
 * templates with no interpolation.
 */
export function stripBookingSafetyNetLines(text: string): string {
  let out = text;
  for (const line of KNOWN_BOOKING_SAFETY_NET_LINES) {
    out = out.split(line).join('');
  }
  return out;
}

/**
 * Resolve localized safety copy from the turn language (lang-06).
 * `hi` / `pa` → native script; `hi-Latn` / `pa-Latn` → Roman; `en` / `other` → English.
 * Emergency reaffirm (after prior 112) still must match `assistantMessageIsEmergencyEscalationCopy`.
 */
export function resolveSafetyMessage(
  kind: SafetyMessageKind,
  language: ConversationLanguage,
  options?: ResolveSafetyMessageOptions
): string {
  const locale = toStaticLocale(language);
  const hasDevanagari = languageUsesDevanagari(language);
  const hasGurmukhi = languageUsesGurmukhi(language);

  if (kind === 'emergency') {
    const reaffirm = options?.emergencyVariant === 'reaffirm';
    if (reaffirm) {
      if (locale === 'hi' && !hasDevanagari) return EMERGENCY_REAFFIRM_LATIN_HI;
      if (locale === 'pa' && !hasGurmukhi) return EMERGENCY_REAFFIRM_LATIN_PA;
      return EMERGENCY_REAFFIRM_BY_LOCALE[locale];
    }
    if (locale === 'hi' && !hasDevanagari) return EMERGENCY_LATIN_HI;
    if (locale === 'pa' && !hasGurmukhi) return EMERGENCY_LATIN_PA;
    return EMERGENCY_BY_LOCALE[locale];
  }

  if (locale === 'hi' && !hasDevanagari) return MEDICAL_QUERY_LATIN_HI;
  if (locale === 'pa' && !hasGurmukhi) return MEDICAL_QUERY_LATIN_PA;
  return MEDICAL_QUERY_BY_LOCALE[locale];
}

/**
 * Last check on model-written Instagram/Facebook text.
 * Appointment-fee wording stays. Health, emergency numbers, and “doctor” do not.
 */
const META_REPLY_HARD_BLOCK =
  /\b(112|108)\b|\bprescriptions?\b|\bdiagnos|\bsymptoms?\b|\bmedicines?\b|\bmedications?\b|\ballerg|\bhospital\b|\bemergency\b|\bdoctors?\b|\bdr\.?\b|visit type|welcome back|डॉक्टर|ਡਾਕਟਰ|अस्पताल|ਹਸਪਤਾਲ|इमरजेंसी|ਐਮਰਜੈਂਸੀ/i;

export function guardMetaOutboundReply(text: string, language: ConversationLanguage): string {
  const softened = text
    .replace(/\bteleconsultations\b/gi, 'online appointments')
    .replace(/\bteleconsultation\b/gi, 'online appointment')
    .replace(/\bteleconsults\b/gi, 'online appointments')
    .replace(/\bteleconsult\b/gi, 'online appointment')
    .replace(/\bconsultations\b/gi, 'appointments')
    .replace(/\bconsultation\b/gi, 'appointment');
  if (META_REPLY_HARD_BLOCK.test(softened)) {
    return resolveSafetyMessage('medical_query', language);
  }
  return softened;
}

// ---------------------------------------------------------------------------
// Emergency signal detection (keyword / phrase; deterministic, no logging)
// ---------------------------------------------------------------------------

const EMERGENCY_PATTERNS_EN: RegExp[] = [
  // Chest anchored (avoids bare "pressure" / "blood pressure"). A7.2: discomfort/tightness.
  /\b(chest\s+(pain|discomfort|tightness|heaviness|pressure|burning))\b/i,
  /\b(can'?t\s+breathe|cannot\s+breathe|difficulty\s+breathing|shortness\s+of\s+breath|breathless)\b/i,
  /\b(getting\s+worse|worsening|feel\s+worse|much\s+worse)\b/i,
  /\b(heart\s+attack|stroke|unconscious)\b/i,
  /\b(bleeding\s+heavily|uncontrolled\s+bleeding)\b/i,
  /\b(severe\s+pain|critical\s+condition)\b/i,
  /\b(poison(ing)?|swallowed\s+poison|consumed\s+poison)\b/i,
  /\b(faint(ed|ing)?|passed\s+out|collapse(d)?)\b/i,
  /\b(accident|car\s+crash|road\s+accident)\b/i,
  // SAFE-D1: bare "emergency" (booking compounds excluded in isEmergencyUserMessage).
  /\bemergency\b/i,
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

/**
 * Self-harm / suicidal ideation (stress pack A6.4–A6.6). Deterministic on purpose:
 * a crisis this severe must not depend on the classifier firing. Outranks the
 * booking-compound guards in {@link isEmergencyUserMessage}.
 */
const SELF_HARM_PATTERNS: RegExp[] = [
  /\b(suicide|suicidal)\b/i,
  /\b(kill|hurt|harm|cut)(ing)?\s+(myself|himself|herself|themselves)\b/i,
  /\b(end|ending)\s+(my|his|her|their)\s+life\b/i,
  /\b(end\s+it\s+all|no\s+reason\s+to\s+live|nothing\s+to\s+live\s+for)\b/i,
  /\b(don'?t|dont|do\s+not)\s+want\s+to\s+live\b/i,
  /\bself[-\s]?harm\b/i,
  /\b(overdose|over\s?dose)\b/i,
  // Roman Hindi / Punjabi. Tolerates the common dropped leading "j" in "jaan".
  /\bj?aan\s*de\s*d(u|oo)ng/i,
  /\b(khud\s?khushi|khudkushi|aatmahatya|atmahatya)\b/i,
  /\b(marna\s+chaht|mar\s+jaunga|mar\s+jaungi|mar\s+jana\s+chaht)/i,
  /\b(jeena\s+nahi\s+chaht|jina\s+nahi\s+chaht|zindagi\s+khatam)/i,
  // Devanagari / Gurmukhi (no \b — unreliable outside ASCII).
  /आत्महत्या|जान\s*दे\s*दूंग|मरना\s*चाह|जीना\s*नहीं\s*चाह/,
  /ਆਤਮਹੱਤਿਆ|ਜਾਨ\s*ਦੇ\s*ਦਿਆਂ|ਮਰਨਾ\s*ਚਾਹ|ਜੀਣਾ\s*ਨਹੀਂ\s*ਚਾਹ/,
];

/** Deterministic self-harm signal. Exported for tests and gate telemetry. */
export function messageSignalsSelfHarm(text: string): boolean {
  const t = text.trim();
  if (t.length > 500) return false;
  return SELF_HARM_PATTERNS.some((p) => p.test(t));
}

const ALL_EMERGENCY_PATTERNS: RegExp[] = [
  ...EMERGENCY_PATTERNS_EN,
  ...EMERGENCY_PATTERNS_HI,
  ...EMERGENCY_PATTERNS_PA,
  ...SELF_HARM_PATTERNS,
];

/**
 * Plausible BP readings from patient text (slash or hyphen). Filters obvious non-BP pairs (dates, 24/7).
 * When multiple pairs exist, callers should prefer the **last** pair — patients often report crisis first, then current.
 *
 * **Scope:** Used by `applyEmergencyIntentPostPolicy` and `userMessageSignalsPostEmergencyStability`
 * (keep / resume after 112 when crisis-level vitals are still present). **Primary** routing for
 * “is this an emergency?” is the intent classifier with **conversation context** — not this parser
 * (see AI_BOT_BUILDING_PHILOSOPHY.md §2–3).
 */
export function parsePlausibleBloodPressurePairs(text: string): { systolic: number; diastolic: number }[] {
  const t = text.trim();
  if (t.length < 3) return [];
  const out: { systolic: number; diastolic: number }[] = [];
  const re = /\b(\d{2,3})\s*[/-]\s*(\d{2,3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    let sys = parseInt(m[1]!, 10);
    let dia = parseInt(m[2]!, 10);
    if (Number.isNaN(sys) || Number.isNaN(dia)) continue;
    // Typical typo: values reversed (e.g. 110/200 meant 200/110)
    if (dia > sys) {
      [sys, dia] = [dia, sys];
    }
    if (sys < 40 || sys > 300 || dia < 30 || dia > 200) continue;
    if (sys < dia) continue;
    out.push({ systolic: sys, diastolic: dia });
  }
  return out;
}

/** Hypertensive crisis–range BP (common threshold: systolic ≥180 and/or diastolic ≥120). */
const CRISIS_SYS = 180;
const CRISIS_DIA = 120;

export function bloodPressurePairIsHypertensiveCrisis(pair: {
  systolic: number;
  diastolic: number;
}): boolean {
  return pair.systolic >= CRISIS_SYS || pair.diastolic >= CRISIS_DIA;
}

/**
 * True when the patient's **current** reported BP (last plausible pair in the message) is in hypertensive crisis range.
 * If two pairs appear (e.g. "was 200/100, now 135/85"), the last pair wins so stabilization routes to medical_query / booking, not EMS.
 */
export function messageHasHypertensiveCrisisBloodPressureReading(text: string): boolean {
  const pairs = parsePlausibleBloodPressurePairs(text);
  if (pairs.length === 0) return false;
  const last = pairs[pairs.length - 1]!;
  return bloodPressurePairIsHypertensiveCrisis(last);
}

/**
 * After an emergency escalation in-thread, patient clarifies **stability** or gives **non-crisis** vitals.
 * Used to route to booking resume (AI) instead of generic medical deflection. Not a clinical diagnosis.
 */
export function userMessageSignalsPostEmergencyStability(text: string): boolean {
  if (messageHasHypertensiveCrisisBloodPressureReading(text)) return false;
  const t = text.trim().toLowerCase();
  if (t.length < 3) return false;
  if (
    /\b(stable|stabilized|better|improved|ok now|fine now|under control|feeling better|no other symptom|now its okay|now it's okay|now okay|okay now|all good|its okay|it's okay)\b/.test(
      t
    )
  ) {
    return true;
  }
  const pairs = parsePlausibleBloodPressurePairs(text);
  if (pairs.length === 0) return false;
  const last = pairs[pairs.length - 1]!;
  return !bloodPressurePairIsHypertensiveCrisis(last);
}

/**
 * Deterministic **acute-phrase** emergency signals (latency, obvious EMS language).
 * Does **not** include BP numbers — vitals/crisis vs stable vs booking-safe is assessed by the **intent
 * classifier** using full-thread context (LLM). See `messageHasHypertensiveCrisisBloodPressureReading` only
 * for post-escalation repeat policy.
 *
 * SAFE-D1: bare `emergency` matches, but booking compounds
 * (`emergency appointment|slot|booking|visit|consult`) and `urgent appointment` do not.
 */
export function isEmergencyUserMessage(text: string): boolean {
  const t = text.trim();
  if (t.length > 500) return false;
  // Self-harm outranks the booking guards — no wording suppresses it.
  if (messageSignalsSelfHarm(t)) return true;
  // B-row false-positive traps: urgency/slot wording, not EMS crisis.
  if (
    /\bemergency\s+(appointment|slot|booking|visit|consult(?:ation)?)\b/i.test(t)
  ) {
    return false;
  }
  if (/\burgent\s+(appointment|slot|booking)\b/i.test(t)) return false;
  return ALL_EMERGENCY_PATTERNS.some((p) => p.test(t));
}

/**
 * True when an assistant line is the standard emergency escalation (India 112/108 + hospital),
 * including localized variants (Latin emergency/hospital, Hindi आपातकालीन/अस्पताल, Punjabi ਐਮਰਜੈਂਸੀ/ਹਸਪਤਾਲ).
 *
 * Booking safety-net lines are stripped first: confirmations/reminders carry
 * 112/108 + hospital by design and must NOT read as a prior escalation
 * (would flip reaffirm copy + the classifier's crisis context on every booking).
 */
export function assistantMessageIsEmergencyEscalationCopy(text: string): boolean {
  const withoutSafetyNet = stripBookingSafetyNetLines(text);
  const c = withoutSafetyNet.trim().toLowerCase();
  if (c.length < 15) return false;
  if (!/\b(112|108)\b/.test(c)) return false;
  return (
    /\b(emergency|hospital)\b/i.test(c) ||
    /आपातकालीन|अस्पताल/.test(withoutSafetyNet) ||
    /ਐਮਰਜੈਂਸੀ|ਹਸਪਤਾਲ/.test(withoutSafetyNet)
  );
}

/**
 * Outbound content that discusses emergency *guidance* but omits India 112/108.
 * Used as a post-stage floor when the LLM improvises crisis copy without the numbers
 * (gate never fired → no deterministic template). Booking phrasing is excluded.
 */
export function assistantMessageNeedsEmergencyNumberFloor(text: string): boolean {
  const t = text.trim();
  if (t.length < 20) return false;
  if (/\b(112|108)\b/.test(t)) return false;
  if (assistantMessageIsEmergencyEscalationCopy(t)) return false;

  // Booking / non-crisis phrasing — do not append 112 to slot confirmations.
  if (/\bemergency\s+(appointment|slot|booking|visit|consult(?:ation)?)\b/i.test(t)) {
    return false;
  }
  if (/\burgent\s+(appointment|slot|booking)\b/i.test(t)) return false;

  // Explicit EMS / ED guidance (narrow — bare "hospital" address is not enough).
  if (
    /\b(local\s+emergency\s+number|emergency\s+(services|number|department|room)|nearest\s+emergency|life[- ]threatening|ambulance|stroke\s+signs)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (/आपातकालीन/.test(t) || /ਐਮਰਜੈਂਸੀ/.test(t)) return true;

  // "emergency" + directive to call / go to hospital / act immediately.
  if (
    /\bemergency\b/i.test(t) &&
    /\b(call|hospital|immediately|right\s+now|severe|life[- ]threatening)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Append localized 112/108 escalation when outbound text gives emergency guidance without numbers.
 * Pure — caller persists `safety.escalatedAt` when `applied` is true.
 */
export function applyEmergencyNumberFloor(
  reply: string,
  language: ConversationLanguage
): { reply: string; applied: boolean } {
  if (!assistantMessageNeedsEmergencyNumberFloor(reply)) {
    return { reply, applied: false };
  }
  const floor = resolveSafetyMessage('emergency', language, { emergencyVariant: 'first' });
  return {
    reply: `${reply.trim()}\n\n${floor}`,
    applied: true,
  };
}

/** True if any assistant/system line in the thread is canonical emergency escalation (not only the last bot line). */
export function recentThreadHasAssistantEmergencyEscalation(
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].sender_type === 'patient') continue;
    const c = (recentMessages[i].content ?? '').trim();
    if (c && assistantMessageIsEmergencyEscalationCopy(c)) return true;
  }
  return false;
}
