/**
 * RBH-13: Structured consultation / fee copy for Instagram DM (no invented amounts).
 * Supports plain text from doctor_settings.consultation_types or optional compact JSON.
 * Localized intro/footer via detectSafetyMessageLocale(userText). Falls back to appointment_fee_minor (INR) when no ₹ in consultation_types.
 */

import {
  type SafetyMessageLocale,
  detectSafetyMessageLocale,
} from './safety-messages';
import type {
  FollowUpPolicyV1,
  ServiceCatalogV1,
  ServiceMatcherHintsV1,
} from './service-catalog-schema';
import {
  CATALOG_CATCH_ALL_SERVICE_KEY,
  SERVICE_CATALOG_VERSION,
  safeParseServiceCatalogV1FromDb,
} from './service-catalog-schema';
import type { DoctorSettingsRow } from '../types/doctor-settings';
import {
  SERVICE_CATALOG_MATCH_REASON_CODES,
  type ServiceCatalogMatchConfidence,
} from '../types/conversation';
import {
  pickSuggestedModality,
  runDeterministicServiceCatalogMatchStageA,
} from './service-catalog-deterministic-match';
import { env } from '../config/env';
import type { MatchServiceCatalogDoctorProfile } from '../services/service-catalog-matcher';

/** Optional compact JSON in consultation_types (keep under doctor_settings max length). Example:
 * [{"l":"General (in-person)","r":500},{"l":"Video consult","r":400}]
 */
interface CompactFeeRow {
  l?: string;
  label?: string;
  r?: number;
  fee_inr?: number;
  amount?: number;
  note?: string;
}

/** RBH-18: Fallback when `classifyIntent` omits `is_fee_question` / `topics`; prefer model signal in `intentSignalsFeeOrPricing`. */
const PRICING_KEYWORDS =
  /\b(fee|fees|price|prices|pricing|cost|costs|charge|charges|pay|paid|payment|payments|paying|how\s+much|kitna|kitni|kitne|कितना|rupee|rupees|paise|paisa|rs\.?|inr|₹|consultation\s+fee|doctor\s+fee|appointment\s+fee)\b/i;

/**
 * Normalize common patient typos before keyword / regex fee heuristics.
 * Keeps a **single** place for this (avoid divergent copies in triage vs fees).
 */
export function normalizePricingKeywordTypos(text: string): string {
  return text
    .replace(/\bpayemnt\b/gi, 'payment')
    .replace(/\bpaymnt\b/gi, 'payment')
    .replace(/\bpament\b/gi, 'payment')
    // Common truncations so `isPricingInquiryMessage` / amount-seeking still match (reason-first snippet omission).
    .replace(/\bhow\s+muc\b/gi, 'how much')
    .replace(/\bhow\s+mch\b/gi, 'how much');
}

/**
 * e-task-dm-06: single entry for patient text before pricing/fee heuristics (trim + typo normalization).
 */
export function normalizePatientPricingText(text: string): string {
  return normalizePricingKeywordTypos(text.trim());
}

/**
 * One-line fee facts for OpenAI system prompt (authoritative; from DB only).
 * Used so the model never claims “fee not in system” when Booking Rules has a value.
 */
export function formatAppointmentFeeForAiContext(
  settings: {
    appointment_fee_minor?: number | null;
    appointment_fee_currency?: string | null;
  },
  opts?: { teleconsultCatalogPresent?: boolean }
): string | null {
  const minor = settings.appointment_fee_minor;
  if (minor == null || minor <= 0) return null;
  const cur = (settings.appointment_fee_currency || 'INR').toUpperCase();
  const sup = opts?.teleconsultCatalogPresent === true;
  if (cur === 'INR') {
    const amt = `₹${Math.round(minor / 100)} (INR)`;
    if (sup) {
      return `Legacy flat appointment fee on file (separate from teleconsult catalog modality prices above): ${amt}. Prefer catalog lines for text/voice/video; do not describe this as an in-person visit type unless the practice explicitly enables in-clinic booking.`;
    }
    return `Standard appointment / consultation fee on file: ${amt}. This is what patients pay when booking unless a different per–visit-type amount is listed under consultation types.`;
  }
  const num = (minor / 100).toFixed(2);
  if (sup) {
    return `Legacy flat appointment fee on file (separate from teleconsult catalog modality prices above): ${num} ${cur}. Prefer catalog lines for text/voice/video; do not describe this as in-clinic unless the practice explicitly enables in-clinic booking.`;
  }
  return `Standard appointment / consultation fee on file: ${num} ${cur}.`;
}

/** User message looks like a pricing question (EN + common Roman Hindi). */
export function isPricingInquiryMessage(text: string): boolean {
  const t = normalizePatientPricingText(text);
  if (t.length < 3) return false;
  return PRICING_KEYWORDS.test(t);
}

/** User is asking for an amount / rate, not merely whether payment applies. */
const AMOUNT_SEEKING_PRICING_RE =
  /\b(how\s+much|how\s+many\s+rupees|what\s*('|’)?s\s+the\s+(fee|price|cost|charge|amount|payment\b)|what\s+(is|are)\s+the\s+(fee|fees|price|prices|charges)|kitna|kitne|kitni|कितना|exact(\s+(fee|price|amount))?|breakdown|quote|fee\s+for|price\s+for)\b/i;

/** Amount-seeking during reason-first triage — route to narrow fee, not ask-more patience loop (e-task-dm-05). */
export function isAmountSeekingPricingQuestion(text: string): boolean {
  const t = normalizePatientPricingText(text);
  if (t.length < 3) return false;
  return AMOUNT_SEEKING_PRICING_RE.test(t);
}

/**
 * Strong booking intent - user wants to start scheduling, not only clarify visit type for fees.
 */
/** Short reply that clarifies visit/channel while discussing fees (not explicit book). RBH-14. */
const CONSULTATION_OR_CHANNEL_CLARIFY_RE =
  /\b(general|video|online|offline|in-?person|physical|virtual|tele-?consult|follow\s*-?\s*up|first\s+visit|new\s+patient|consultation\b|opd|check-?up|check\s*up)\b/i;

export function isConsultationTypePricingFollowUp(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 160) return false;
  return CONSULTATION_OR_CHANNEL_CLARIFY_RE.test(t);
}

export function userExplicitlyWantsToBookNow(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  if (isAmountSeekingPricingQuestion(t)) return false;
  return (
    /\b(book|schedule)\s+(?:an\s+)?(?:appointment|visit|consultation)\b/i.test(t) ||
    /\bbook\s+(?:a\s+)?(video|voice|text)\b/i.test(t) ||
    /\b(video|voice|text)\s+(consult|appointment|slot)\b/i.test(t) ||
    /\b(want|need|would\s+like)\s+to\s+book\b/i.test(t) ||
    /\bbook\s+(?:me|us|an\s+appointment|a\s+slot)\b/i.test(t) ||
    /\b(start|begin)\ba?\s+booking\b/i.test(t) ||
    /\bplease\s+book\b/i.test(t) ||
    /\b(do\s+it|go\s+with|go\s+for|let'?s?\s+do|i'?ll?\s+take|i\s+choose|i\s+pick|i\s+want)\s+(video|voice|text)\b/i.test(t) ||
    /^(video|voice|text)\s*(please|pls)?\s*$/i.test(t) ||
    /\b(ok(ay)?|sure|yes)\s*,?\s*book\b/i.test(t) ||
    /\blet'?s?\s+go\b/i.test(t) ||
    /\bgo\s+ahead\b/i.test(t) ||
    /\bproceed\b/i.test(t)
  );
}

/** User says they're only asking fees / not booking (meta-clarification). */
export function userDeclinesBookingIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/\bnot\s+booking\b/.test(t)) return true;
  if (/\bonly\s+asking\s+(about\s+)?(fee|fees|price)\b/.test(t)) return true;
  return /\b(just|only)\s+(want|need)\b/.test(t) && /\b(fee|fees|price|cost|info)\b/.test(t);
}

function parseCompactFeeJson(raw: string): CompactFeeRow[] | null {
  const t = raw.trim();
  if (!t.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(t) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as CompactFeeRow[];
  } catch {
    return null;
  }
}

function normalizeRow(row: CompactFeeRow): { label: string; inr?: number; note?: string } | null {
  const label = (row.label ?? row.l ?? '').trim();
  if (!label) return null;
  const inr =
    typeof row.fee_inr === 'number' && row.fee_inr >= 0
      ? row.fee_inr
      : typeof row.amount === 'number' && row.amount >= 0
        ? row.amount
        : typeof row.r === 'number' && row.r >= 0
          ? row.r
          : undefined;
  const note = typeof row.note === 'string' ? row.note.trim() : undefined;
  return { label, inr, note: note || undefined };
}

/** Settings row fields used for DM fee copy (+ optional platform appointment fee in paise). */
export interface ConsultationFeesDmSettings {
  consultation_types?: string | null;
  practice_name?: string | null;
  business_hours_summary?: string | null;
  appointment_fee_minor?: number | null;
  appointment_fee_currency?: string | null;
  /** SFU-08: when valid v1 catalog present, DM uses `formatServiceCatalogForDm` first */
  service_offerings_json?: DoctorSettingsRow['service_offerings_json'];
}

/** Shape is valid "empty shelf" but Zod catalog schema requires ≥1 service — treat as explicit empty (e-task-2). */
function isExplicitlyEmptyServiceCatalogJson(raw: unknown): boolean {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  if (Number(o.version) !== SERVICE_CATALOG_VERSION) return false;
  const s = o.services;
  if (!Array.isArray(s)) return false;
  return s.length === 0;
}

/** User asked for the full price sheet — bypass clinical-led staff defer (e-task-dm-05; mirror reason-first-triage). */
function isExplicitFullFeeListUserText(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  return /\b(all\s+(your\s+)?(fees|prices|services|consultation\s+types|consultation\s+fees|consultation\s+prices)|every\s+(fee|price|service)|full\s+(fee\s+)?list|complete\s+(price|fee)|what\s+are\s+all\s+(the\s+)?(your\s+)?(fees|prices|services))\b/i.test(
    t
  );
}

/**
 * e-task-dm-05: teleconsult catalog row count (0 if missing / empty / invalid).
 * Used to gate LLM multi-tier suppression and clinical-led defer.
 */
export function teleconsultCatalogServiceRowCount(
  service_offerings_json: DoctorSettingsRow['service_offerings_json'] | null | undefined
): number {
  if (service_offerings_json == null) return 0;
  if (isExplicitlyEmptyServiceCatalogJson(service_offerings_json)) return 0;
  const catalog = safeParseServiceCatalogV1FromDb(service_offerings_json as unknown);
  return catalog?.services.length ?? 0;
}

/** Instagram DM soft limit — trim + ellipsis when catalog is large (SFU-08 §5). */
export const CONSULTATION_FEE_DM_MAX_CHARS = 3200;

/** LLM system-prompt catalog block — keep bounded for token cost (e-task-2). */
const SERVICE_CATALOG_AI_CONTEXT_MAX_CHARS = 7200;

/** ARM-02: cap matcher hint text per offering inside the LLM catalog line. */
const MATCHER_HINTS_AI_PER_SERVICE_MAX = 420;

function truncateForAiContext(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Compact matcher metadata for system prompt only (not for patient DMs). */
export function formatMatcherHintsForAiContext(hints: ServiceMatcherHintsV1 | undefined): string {
  if (!hints) return '';
  const parts: string[] = [];
  if (hints.keywords?.trim()) {
    parts.push(`keywords=${truncateForAiContext(hints.keywords, 140)}`);
  }
  if (hints.include_when?.trim()) {
    parts.push(`include_when=${truncateForAiContext(hints.include_when, 220)}`);
  }
  if (hints.exclude_when?.trim()) {
    parts.push(`exclude_when=${truncateForAiContext(hints.exclude_when, 220)}`);
  }
  if (parts.length === 0) return '';
  const joined = parts.join('; ');
  if (joined.length <= MATCHER_HINTS_AI_PER_SERVICE_MAX) return joined;
  return `${joined.slice(0, MATCHER_HINTS_AI_PER_SERVICE_MAX - 1).trimEnd()}…`;
}

// Modality labels (Text/Voice/Video) shown on /book page only, not in DM fee table.

function formatMinorCurrencyDm(minor: number, currency: string | null | undefined): string {
  const cur = (currency || 'INR').toUpperCase();
  const main = minor / 100;
  if (cur === 'INR') {
    return Number.isInteger(main) ? `₹${main}` : `₹${main.toFixed(2)}`;
  }
  return `${main.toFixed(2)} ${cur}`;
}

/** Compact follow-up policy hint for catalog lines (amounts from DB only). */
export function formatFollowUpPolicyHint(
  policy: FollowUpPolicyV1 | null | undefined,
  currency: string | null | undefined
): string | null {
  if (!policy || !policy.enabled) return null;
  const cur = (currency || 'INR').toUpperCase();
  const parts: string[] = [];
  if (policy.discount_tiers?.length) {
    parts.push('tiered follow-up discounts by visit #');
  } else {
    const dt = policy.discount_type;
    const dv = policy.discount_value;
    if (dt === 'free') parts.push('follow-ups free');
    else if (dt === 'none') parts.push('no follow-up discount');
    else if (dt === 'percent' && dv != null) parts.push(`${dv}% off eligible follow-ups`);
    else if (dt === 'flat_off' && dv != null) parts.push(`${formatMinorCurrencyDm(dv, cur)} off follow-ups`);
    else if (dt === 'fixed_price' && dv != null) parts.push(`follow-ups at ${formatMinorCurrencyDm(dv, cur)}`);
    else parts.push('follow-up pricing per practice settings');
  }
  parts.push(`max ${policy.max_followups} follow-up(s) within ${policy.eligibility_window_days} days`);
  return parts.join('; ');
}

function localizeCatalogIntro(practiceName: string, locale: SafetyMessageLocale): string {
  if (locale === 'hi') {
    return `**${practiceName}** ke **online / teleconsult fees** (hamare record ke mutabik):\n\n`;
  }
  if (locale === 'pa') {
    return `**${practiceName}** de **online / teleconsult fees** (sade record mutabik):\n\n`;
  }
  return `**Teleconsult (online) fees** on file for **${practiceName}**:\n\n`;
}

/** e-task-dm-04: intro when exactly one catalog row is shown (reason-first / narrowed thread). */
function localizeNarrowFeeCatalogIntro(
  practiceName: string,
  locale: SafetyMessageLocale,
  withSilentPromise: boolean
): string {
  const p = practiceName.trim() || 'the practice';
  /** e-task-dm-05: promise paragraph skipped when clinical-led (already shown in triage / payment ack). */
  if (locale === 'hi') {
    const promise =
      'Hum **ki visit type** sahi hai yeh practice aapke concern ke hisaab se **khud match** karti hai — chat mein alag-alag fee options **choose** karne ki zaroorat nahi.\n\n';
    const head = `**${p}** — aapne jo bataya uske hisaab se **online / teleconsult** fee (hamare record ke mutabik):\n\n`;
    return withSilentPromise ? `${promise}${head}` : head;
  }
  if (locale === 'pa') {
    const promise =
      '**Visit type** practice tere concern de mutabik **khud match** kardi — chat vich fee tiers **chun**n di lorh nahi.\n\n';
    const head = `**${p}** — jo tu dassya us hisaab naal **online / teleconsult** fee (sade record mutabik):\n\n`;
    return withSilentPromise ? `${promise}${head}` : head;
  }
  const promise =
    'We match what you describe to the **right visit type** for the practice — you **don’t need to pick fee options** in chat.\n\n';
  const head = `Based on what you shared, **teleconsult (online) fees** on file for **${p}** for this visit type:\n\n`;
  return withSilentPromise ? `${promise}${head}` : head;
}

/** Patient-visible: competing NCD vs acute/general signals — staff assigns visit type (no fee-tier choice). */
function formatCompetingVisitTypeDeferToStaffDm(
  practiceName: string,
  locale: SafetyMessageLocale,
  hasDevanagari: boolean,
  hasGurmukhi: boolean,
  hoursSummary: string
): string {
  const p = practiceName.trim() || 'the clinic';
  const hoursSuffix = formatHoursHintLine(locale, hoursSummary, hasDevanagari, hasGurmukhi);
  const tail = hoursSuffix ? `\n\n${hoursSuffix}` : '';

  if (locale === 'hi' && !hasDevanagari) {
    return (
      `Aapne jo bataya usse **${p}** ko pehle **visit type confirm** karna hoga, uske baad exact fee / booking — aapki baat **ek se zyada consult bucket** mein fit ho sakti hai, isliye hum fee options patient se **choose** nahi karwate.\n\n` +
      `Team **jaldi** yahan reply karegi. **Abhi payment ki zaroorat nahi.** Visit type clear hote hi aage badhenge.${tail}`
    );
  }
  if (locale === 'hi' && hasDevanagari) {
    return (
      `आपने जो बताया, **${p}** को पहले **विज़िट टाइप तय** करना होगा, फिर सटीक फी / बुकिंग — कारण **एक से ज़्यादा प्रकार** से मेल खा सकते हैं; हम चैट में फी विकल्प **चुनने** नहीं कहते।\n\n` +
      `टीम **जल्द** यहाँ जवाब देगी। **अभी भुगतान की ज़रूरत नहीं।**${tail}`
    );
  }
  if (locale === 'pa' && !hasGurmukhi) {
    return (
      `Jo tu dassya, **${p}** nu pehlan **visit type fix** karna paina — tere reasons **ek ton wadh consult bucket** vich ja sakde ne, asi patient kolon fee **choose** nahi karaunde.\n\n` +
      `Team **jaldi** ithe reply karegi. **Hun payment di lorh nahi.**${tail}`
    );
  }
  if (locale === 'pa' && hasGurmukhi) {
    return (
      `ਜੋ ਤੁਸੀਂ ਦੱਸਿਆ, **${p}** ਨੂੰ ਪਹਿਲਾਂ **ਵਿਜ਼ਿਟ ਟਾਈਪ ਤੈਯ** ਕਰਨਾ ਪਵੇਗਾ — ਕਾਰਨ **ਇੱਕ ਤੋਂ ਵੱਧ ਕਿਸਮ** ਨਾਲ ਮੇਲ ਖਾ ਸਕਦੇ ਹਨ; ਅਸੀਂ ਮਰੀਜ਼ ਨੂੰ ਫੀ **ਚੁਣੋ** ਨਹੀਂ ਕਹਿੰਦੇ।\n\n` +
      `ਟੀਮ **ਜਲਦੀ** ਇੱਥੇ ਜਵਾਬ ਦੇਵੇਗੀ। **ਹੁਣ ਭੁਗਤਾਨ ਦੀ ਲੋੜ ਨਹੀਂ।**${tail}`
    );
  }
  return (
    `Thanks for sharing what you're dealing with. **${p}** needs to **confirm which visit type applies** before we quote an exact fee or open scheduling — what you described could fit **more than one kind of consult**, and we **don't ask patients to pick between fee options** in chat.\n\n` +
    `Our team will review and reply here **soon**. **You don't need to pay yet.** We'll message you when visit type is set so you can continue.${tail}`
  );
}

/**
 * Pick a single service if the user message clearly names one (label or service_key). SFU-08 optional narrow.
 */
export function pickCatalogServicesMatchingUserText(
  catalog: ServiceCatalogV1,
  userText: string
): ServiceCatalogV1['services'] {
  const t = userText.trim().toLowerCase();
  if (t.length < 2) {
    return catalog.services;
  }
  const hits = catalog.services.filter((s) => {
    const key = s.service_key.toLowerCase();
    const lab = s.label.toLowerCase();
    return t.includes(key) || (lab.length >= 3 && t.includes(lab));
  });
  return hits.length === 1 ? hits : catalog.services;
}

/** e-task-dm-02: Bound merged thread + current line used for catalog narrowing (no logging here). */
export const FEE_CATALOG_MATCH_TEXT_MAX_CHARS = 2600;

/**
 * Merge current DM line with optional pre-redacted thread (prior patient lines). Used only for
 * catalog row narrowing — locale/footer still use `userText` alone.
 */
export function mergeFeeCatalogMatchText(userText: string, catalogMatchText?: string): string {
  const u = userText.trim();
  const c = catalogMatchText?.trim() ?? '';
  if (!c) return u;
  if (!u) return c.length > FEE_CATALOG_MATCH_TEXT_MAX_CHARS ? c.slice(-FEE_CATALOG_MATCH_TEXT_MAX_CHARS) : c;
  if (c === u || c.endsWith(`\n${u}`) || c.includes(`\n${u}\n`)) {
    return c.length > FEE_CATALOG_MATCH_TEXT_MAX_CHARS ? c.slice(-FEE_CATALOG_MATCH_TEXT_MAX_CHARS) : c;
  }
  if (u.includes(c) && u.length >= c.length) {
    return u.length > FEE_CATALOG_MATCH_TEXT_MAX_CHARS ? u.slice(-FEE_CATALOG_MATCH_TEXT_MAX_CHARS) : u;
  }
  const combined = `${c}\n${u}`;
  return combined.length > FEE_CATALOG_MATCH_TEXT_MAX_CHARS
    ? combined.slice(-FEE_CATALOG_MATCH_TEXT_MAX_CHARS)
    : combined;
}

/**
 * Current inbound line is only pricing/booking-cost wording (no clinical cues in the same line).
 * Used to prefer prior-thread text for catalog Stage-A when the user pivots "do I pay?" after symptoms.
 */
function isPricingOnlyLineForFeeMatcher(userLine: string): boolean {
  const t = userLine.trim();
  if (t.length < 3 || !isPricingInquiryMessage(t)) return false;
  return !FEE_MATCHER_LINE_HAS_CLINICAL_CUE_RE.test(t);
}

/** If this matches the pricing line itself, merged(thread+line) is a better matcher input than thread alone. */
const FEE_MATCHER_LINE_HAS_CLINICAL_CUE_RE =
  /\b(blood\s*sugar|glucose|fasting|diabet|insulin|hypert|blood\s*pressure|\bbp\b|fever|pain|ache|rash|skin|symptom|cough|bleed|medi(cine|cations?)|reading|nausea|vomit|dizzy|headache|chest|stomach|hurt|throat|ear|eye|uti|burning)\b/i;

/**
 * Redacted thread suggests chronic / metabolic (NCD-style) teleconsult — Stage-A may be null when matcher_hints are unset.
 * Excludes primary dermatology-style concerns so we do not swap a skin thread to NCD.
 */
function threadTextSuggestsNcdConsultBucket(text: string): boolean {
  const s = text.trim();
  if (s.length < 4) return false;
  if (/\b(rash|skin\s+problem|acne|eczema|mole|dermat|wart|itching|melasma|psoriasis|hair\s*fall)\b/i.test(s)) {
    return false;
  }
  return FEE_MATCHER_NCD_BUCKET_RE.test(s);
}

const FEE_MATCHER_NCD_BUCKET_RE =
  /\b(blood\s*sugar|glucose|fasting|pp\s*sugar|hba1c|hb\s*a1c|\ba1c\b|diabet|thyroid|hypothyroid|hyperthyroid|cholesterol|lipid|hypert|blood\s*pressure|\bbp\b|heart\s*disease|cardiac|stroke|copd|asthma|kidney|renal|liver|hepatitis|cirrhosis|obesity|overweight|chronic|metabolic|pcos|anemia|sugar\s*level)\b/i;

/**
 * Acute / primary-care style concerns that often map to a different catalog row than NCD follow-ups.
 * Used with {@link threadTextSuggestsNcdConsultBucket} to detect competing visit-type signals (staff must assign).
 */
const FEE_MATCHER_NON_NCD_ACUTE_OR_GENERAL_RE =
  /\b(cough|coughing|colds?|cold\s+and|flu|fever|throat|sore\s+throat|runny\s+nose|congestion|blocked\s+nose|sneez|stomach\s+pain|tummy|gastric|gastritis|heartburn|burning|acidity|indigestion|acid\s+reflux|reflux|loose\s+motion|diarrhoea|diarrhea|vomit|vomiting|nausea|headache|migraine|uti|ear\s*ache|general\s+check|check\s*up|checkup|opd)\b/i;

/** True when thread also suggests an acute/general consult bucket (not only chronic/NCD). Exported for tests. */
export function threadTextSuggestsNonNcdAcuteOrGeneralConsultBucket(text: string): boolean {
  const s = text.trim();
  if (s.length < 4) return false;
  return FEE_MATCHER_NON_NCD_ACUTE_OR_GENERAL_RE.test(s);
}

/**
 * Patient thread fits both NCD-style and acute/general buckets — do not ask them to pick a fee tier; staff assigns.
 */
export function feeThreadHasCompetingVisitTypeBuckets(text: string): boolean {
  return (
    threadTextSuggestsNcdConsultBucket(text) &&
    threadTextSuggestsNonNcdAcuteOrGeneralConsultBucket(text)
  );
}

function pickNcdBucketOffering(
  catalog: ServiceCatalogV1
): ServiceCatalogV1['services'][number] | null {
  const services = catalog.services.filter(
    (x) => x.service_key.trim().toLowerCase() !== CATALOG_CATCH_ALL_SERVICE_KEY
  );
  const exact = services.find(
    (s) => s.service_key.trim().toLowerCase() === 'non_communicable_diseases'
  );
  if (exact) return exact;
  const byHeuristic = services.filter((s) => {
    const k = s.service_key.trim().toLowerCase();
    const lab = s.label.trim().toLowerCase();
    return (
      k === 'ncd' ||
      k.includes('non_communicable') ||
      /\bnon[-\s]?communicable\b/i.test(lab) ||
      (k.includes('ncd') && !k.includes('skin') && !k.includes('no_ncd'))
    );
  });
  if (byHeuristic.length === 1) return byHeuristic[0]!;
  return null;
}

/** Fee-path catalog selection (idle/mid-fee); high = narrow match, medium = practice preference / Stage A medium. */
export interface ConsultationFeeQuoteMatcherFinalize {
  matcherProposedCatalogServiceKey: string;
  matcherProposedCatalogServiceId: string;
  matcherProposedConsultationModality?: 'text' | 'voice' | 'video';
  serviceCatalogMatchConfidence: ServiceCatalogMatchConfidence;
  serviceCatalogMatchReasonCodes: string[];
}

/** Matcher proposal that opens ARM-05 staff review without showing competing fee tiers to the patient. */
export interface ConsultationFeeAmbiguousStaffReview {
  matcherProposedCatalogServiceKey: string;
  matcherProposedCatalogServiceId: string;
  serviceCatalogMatchConfidence: 'low';
  serviceCatalogMatchReasonCodes: string[];
}

export function pickCatalogServicesForFeeDm(
  catalog: ServiceCatalogV1,
  userText: string,
  catalogMatchText?: string,
  opts?: { clinicalLedFeeThread?: boolean }
): {
  services: ServiceCatalogV1['services'];
  feeQuoteMatcherFinalize?: ConsultationFeeQuoteMatcherFinalize;
  competingBucketsDeferToStaff?: boolean;
  clinicalLedAmbiguousDeferToStaff?: boolean;
  staffPlaceholderOffering?: ServiceCatalogV1['services'][number];
} {
  const merged = mergeFeeCatalogMatchText(userText, catalogMatchText);

  if (catalog.services.length > 1 && feeThreadHasCompetingVisitTypeBuckets(merged)) {
    const placeholder = catalog.services.find(
      (s) => s.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY
    );
    if (placeholder) {
      return {
        services: [],
        competingBucketsDeferToStaff: true,
        staffPlaceholderOffering: placeholder,
      };
    }
  }

  const reasonFocusForStageA =
    isPricingOnlyLineForFeeMatcher(userText) && catalogMatchText?.trim()
      ? catalogMatchText.trim()
      : merged;

  let rows = pickCatalogServicesMatchingUserText(catalog, merged);

  const makeFinalize = (
    offering: ServiceCatalogV1['services'][number],
    reasonCodes: string[]
  ): ConsultationFeeQuoteMatcherFinalize => ({
    matcherProposedCatalogServiceKey: offering.service_key,
    matcherProposedCatalogServiceId: offering.service_id,
    matcherProposedConsultationModality: pickSuggestedModality(offering),
    serviceCatalogMatchConfidence: 'high',
    serviceCatalogMatchReasonCodes: reasonCodes,
  });

  if (rows.length === 1) {
    return {
      services: rows,
      feeQuoteMatcherFinalize: makeFinalize(rows[0]!, [
        SERVICE_CATALOG_MATCH_REASON_CODES.CATALOG_ALLOWLIST_MATCH,
      ]),
    };
  }

  // e-task-dm-05: symptom-led / clinical thread — never show a partial multi-row “menu”; narrow or staff.
  if (
    rows.length > 1 &&
    opts?.clinicalLedFeeThread === true &&
    !isExplicitFullFeeListUserText(userText) &&
    catalog.services.length > 1
  ) {
    let stageA = runDeterministicServiceCatalogMatchStageA(catalog, reasonFocusForStageA);
    if (!stageA && reasonFocusForStageA !== merged) {
      stageA = runDeterministicServiceCatalogMatchStageA(catalog, merged);
    }
    if (stageA) {
      const o = stageA.offering;
      if (stageA.confidence === 'high' && stageA.autoFinalize) {
        return {
          services: [o],
          feeQuoteMatcherFinalize: makeFinalize(o, stageA.reasonCodes),
        };
      }
      return { services: [o] };
    }
    const ncdPick = pickNcdBucketOffering(catalog);
    if (ncdPick && threadTextSuggestsNcdConsultBucket(reasonFocusForStageA)) {
      return {
        services: [ncdPick],
        feeQuoteMatcherFinalize: makeFinalize(ncdPick, [
          SERVICE_CATALOG_MATCH_REASON_CODES.KEYWORD_HINT_MATCH,
          SERVICE_CATALOG_MATCH_REASON_CODES.CATALOG_ALLOWLIST_MATCH,
        ]),
      };
    }
    const placeholder = catalog.services.find(
      (s) => s.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY
    );
    if (placeholder) {
      return {
        services: [],
        clinicalLedAmbiguousDeferToStaff: true,
        staffPlaceholderOffering: placeholder,
      };
    }
  }

  if (rows.length === catalog.services.length && catalog.services.length > 1) {
    let stageA = runDeterministicServiceCatalogMatchStageA(catalog, reasonFocusForStageA);
    if (!stageA && reasonFocusForStageA !== merged) {
      stageA = runDeterministicServiceCatalogMatchStageA(catalog, merged);
    }
    if (stageA) {
      const o = stageA.offering;
      if (stageA.confidence === 'high' && stageA.autoFinalize) {
        return {
          services: [o],
          feeQuoteMatcherFinalize: makeFinalize(o, stageA.reasonCodes),
        };
      }
      return { services: [o] };
    }

    const ncdPick = pickNcdBucketOffering(catalog);
    if (ncdPick && threadTextSuggestsNcdConsultBucket(reasonFocusForStageA)) {
      return {
        services: [ncdPick],
        feeQuoteMatcherFinalize: makeFinalize(ncdPick, [
          SERVICE_CATALOG_MATCH_REASON_CODES.KEYWORD_HINT_MATCH,
          SERVICE_CATALOG_MATCH_REASON_CODES.CATALOG_ALLOWLIST_MATCH,
        ]),
      };
    }
  }

  return { services: rows };
}

function truncateIfNeededDm(text: string, maxLen: number, locale: SafetyMessageLocale): string {
  if (text.length <= maxLen) {
    return text;
  }
  const cut = maxLen - 80;
  const base = text.slice(0, cut).trimEnd();
  if (locale === 'hi') {
    return `${base}\n\n…(yahan list shorten ki gayi — poori jankari ke liye clinic se puchein.)`;
  }
  if (locale === 'pa') {
    return `${base}\n\n…(list shorten hai — poori info layi clinic nu puchho.)`;
  }
  return `${base}\n\n…(list shortened here — ask the clinic for the full fee sheet.)`;
}

/**
 * SFU-08: Human-readable teleconsult fee block from `service_offerings_json` (₹ from JSON only).
 * @param catalogMatchText Optional redacted thread (prior patient turns) for row narrowing (e-task-dm-02).
 */
export function formatServiceCatalogForDm(
  catalog: ServiceCatalogV1,
  settings: ConsultationFeesDmSettings,
  userText: string = '',
  catalogMatchText?: string,
  opts?: { clinicalLedFeeThread?: boolean }
): string {
  return formatServiceCatalogForDmWithMeta(catalog, settings, userText, catalogMatchText, opts).markdown;
}

/** Options for teleconsult fee catalog DM; `llmNarrow` is used only by the async formatter. */
export type ServiceCatalogDmFormatOpts = {
  clinicalLedFeeThread?: boolean;
  showModalityBreakdown?: boolean;
  llmNarrow?: {
    correlationId: string;
    recentUserMessages?: string[];
    doctorProfile?: MatchServiceCatalogDoctorProfile | null;
  };
};

type PickCatalogForFeeDmResult = ReturnType<typeof pickCatalogServicesForFeeDm>;

function buildServiceCatalogFeeDmResultFromPick(
  settings: ConsultationFeesDmSettings,
  userText: string,
  pick: PickCatalogForFeeDmResult,
  opts?: { clinicalLedFeeThread?: boolean; showModalityBreakdown?: boolean }
): {
  markdown: string;
  feeQuoteMatcherFinalize?: ConsultationFeeQuoteMatcherFinalize;
  feeAmbiguousStaffReview?: ConsultationFeeAmbiguousStaffReview;
} {
  const practiceName = settings.practice_name?.trim() || 'the practice';
  const locale = detectSafetyMessageLocale(userText || '');
  const hasDevanagari = /[\u0900-\u097F]/.test(userText || '');
  const hasGurmukhi = /[\u0A00-\u0A7F]/.test(userText || '');
  const hoursSummary = settings.business_hours_summary?.trim() ?? '';
  const hoursSuffix = formatHoursHintLine(locale, hoursSummary, hasDevanagari, hasGurmukhi);
  const cur = settings.appointment_fee_currency;
  if (pick.competingBucketsDeferToStaff && pick.staffPlaceholderOffering) {
    const o = pick.staffPlaceholderOffering;
    return {
      markdown: truncateIfNeededDm(
        formatCompetingVisitTypeDeferToStaffDm(
          practiceName,
          locale,
          hasDevanagari,
          hasGurmukhi,
          hoursSummary
        ),
        CONSULTATION_FEE_DM_MAX_CHARS,
        locale
      ),
      feeAmbiguousStaffReview: {
        matcherProposedCatalogServiceKey: o.service_key,
        matcherProposedCatalogServiceId: o.service_id,
        serviceCatalogMatchConfidence: 'low',
        serviceCatalogMatchReasonCodes: [
          SERVICE_CATALOG_MATCH_REASON_CODES.AMBIGUOUS_COMPLAINT,
          SERVICE_CATALOG_MATCH_REASON_CODES.COMPETING_VISIT_TYPE_BUCKETS,
        ],
      },
    };
  }
  if (pick.clinicalLedAmbiguousDeferToStaff && pick.staffPlaceholderOffering) {
    const o = pick.staffPlaceholderOffering;
    return {
      markdown: truncateIfNeededDm(
        formatCompetingVisitTypeDeferToStaffDm(
          practiceName,
          locale,
          hasDevanagari,
          hasGurmukhi,
          hoursSummary
        ),
        CONSULTATION_FEE_DM_MAX_CHARS,
        locale
      ),
      feeAmbiguousStaffReview: {
        matcherProposedCatalogServiceKey: o.service_key,
        matcherProposedCatalogServiceId: o.service_id,
        serviceCatalogMatchConfidence: 'low',
        serviceCatalogMatchReasonCodes: [
          SERVICE_CATALOG_MATCH_REASON_CODES.AMBIGUOUS_COMPLAINT,
          SERVICE_CATALOG_MATCH_REASON_CODES.CLINICAL_LED_VISIT_TYPE_UNCLEAR,
        ],
      },
    };
  }
  const rows = pick.services;
  const feeQuoteMatcherFinalize = pick.feeQuoteMatcherFinalize;
  const clinicalNarrowSingle =
    opts?.clinicalLedFeeThread === true &&
    rows.length === 1 &&
    rows[0] != null;
  const lines: string[] = [];

  const MODALITY_LABEL: Record<string, string> = { text: 'Text', voice: 'Voice', video: 'Video' };

  for (const s of rows) {
    const enabledSlots: { mod: string; price: number; followup: string | null }[] = [];
    const modalityOrder: readonly ('text' | 'voice' | 'video')[] = ['text', 'voice', 'video'];
    for (const mod of modalityOrder) {
      const slot = s.modalities[mod];
      if (slot?.enabled === true) {
        enabledSlots.push({
          mod,
          price: slot.price_minor,
          followup: formatFollowUpPolicyHint(slot.followup_policy ?? null, cur),
        });
      }
    }
    if (enabledSlots.length === 0) continue;

    const anyFollowUp = enabledSlots.find((sl) => sl.followup)?.followup ?? null;

    if (opts?.showModalityBreakdown === true && enabledSlots.length > 1) {
      let line = `**${s.label}**:`;
      for (const sl of enabledSlots) {
        line += `\n  - **${MODALITY_LABEL[sl.mod] ?? sl.mod}**: ${formatMinorCurrencyDm(sl.price, cur)}`;
      }
      if (anyFollowUp) {
        line += `\n  - Follow-ups (on file): ${anyFollowUp}`;
      }
      lines.push(line);
    } else {
      const prices = enabledSlots.map((sl) => sl.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceStr = minPrice === maxPrice
        ? formatMinorCurrencyDm(minPrice, cur)
        : `${formatMinorCurrencyDm(minPrice, cur)} – ${formatMinorCurrencyDm(maxPrice, cur)}`;

      let line = `**${s.label}**: ${priceStr}`;
      if (anyFollowUp) {
        line += `\n  - Follow-ups (on file): ${anyFollowUp}`;
      }
      lines.push(line);
    }
  }

  if (lines.length === 0) {
    return { markdown: localizeJsonUnreadable(practiceName, locale, hoursSuffix) };
  }

  const intro =
    rows.length === 1
      ? localizeNarrowFeeCatalogIntro(
          practiceName,
          locale,
          opts?.clinicalLedFeeThread !== true
        )
      : localizeCatalogIntro(practiceName, locale);
  let body = `${intro}${lines.join('\n\n')}`;

  /** Catalog path lists text/voice/video only — do not append legacy “in-clinic” flat fee (misleading when teleconsult-only). */

  body += `\n\n${localizeFeeListFooter(locale, hoursSuffix, {
    omitUnlistedVisitTypeCaveat: clinicalNarrowSingle === true,
  })}`;
  return {
    markdown: truncateIfNeededDm(body, CONSULTATION_FEE_DM_MAX_CHARS, locale),
    feeQuoteMatcherFinalize,
  };
}

export function formatServiceCatalogForDmWithMeta(
  catalog: ServiceCatalogV1,
  settings: ConsultationFeesDmSettings,
  userText: string = '',
  catalogMatchText?: string,
  opts?: { clinicalLedFeeThread?: boolean; showModalityBreakdown?: boolean }
): {
  markdown: string;
  feeQuoteMatcherFinalize?: ConsultationFeeQuoteMatcherFinalize;
  feeAmbiguousStaffReview?: ConsultationFeeAmbiguousStaffReview;
} {
  const pick = pickCatalogServicesForFeeDm(catalog, userText, catalogMatchText, opts);
  return buildServiceCatalogFeeDmResultFromPick(settings, userText, pick, opts);
}

/**
 * Like `formatServiceCatalogForDmWithMeta`, but when clinical-led narrowing would defer to staff,
 * optionally runs allowlist LLM match once (`FEE_DM_CATALOG_LLM_NARROW_ENABLED`, default on).
 */
export async function formatServiceCatalogForDmWithMetaAsync(
  catalog: ServiceCatalogV1,
  settings: ConsultationFeesDmSettings,
  userText: string = '',
  catalogMatchText?: string,
  opts?: ServiceCatalogDmFormatOpts
): Promise<{
  markdown: string;
  feeQuoteMatcherFinalize?: ConsultationFeeQuoteMatcherFinalize;
  feeAmbiguousStaffReview?: ConsultationFeeAmbiguousStaffReview;
}> {
  let pick = pickCatalogServicesForFeeDm(catalog, userText, catalogMatchText, opts);
  const tryLlm =
    env.FEE_DM_CATALOG_LLM_NARROW_ENABLED &&
    Boolean(opts?.llmNarrow?.correlationId) &&
    opts?.clinicalLedFeeThread === true &&
    pick.clinicalLedAmbiguousDeferToStaff === true &&
    Boolean(pick.staffPlaceholderOffering);

  if (tryLlm && opts?.llmNarrow) {
    const merged = mergeFeeCatalogMatchText(userText, catalogMatchText).trim();
    if (merged.length >= 3) {
      const { matchServiceCatalogOffering } = await import('../services/service-catalog-matcher');
      const match = await matchServiceCatalogOffering(
        {
          catalog,
          reasonForVisitText: merged,
          recentUserMessages: opts.llmNarrow.recentUserMessages,
          correlationId: opts.llmNarrow.correlationId,
          doctorProfile: opts.llmNarrow.doctorProfile ?? null,
        },
        {}
      );
      if (match && match.source !== 'fallback') {
        const offering = catalog.services.find((s) => s.service_key === match.catalogServiceKey);
        if (offering) {
          const makeFinalize = (
            o: ServiceCatalogV1['services'][number],
            reasonCodes: string[]
          ): ConsultationFeeQuoteMatcherFinalize => ({
            matcherProposedCatalogServiceKey: o.service_key,
            matcherProposedCatalogServiceId: o.service_id,
            matcherProposedConsultationModality: pickSuggestedModality(o),
            serviceCatalogMatchConfidence: 'high',
            serviceCatalogMatchReasonCodes: reasonCodes,
          });
          if (match.confidence === 'high' && match.autoFinalize) {
            pick = {
              services: [offering],
              feeQuoteMatcherFinalize: makeFinalize(offering, match.reasonCodes),
            };
          } else {
            pick = { services: [offering] };
          }
        }
      }
    }
  }

  return buildServiceCatalogFeeDmResultFromPick(settings, userText, pick, opts);
}

/**
 * SFU-08: One compact block for LLM system prompt (amounts verbatim from catalog JSON).
 */
export function formatServiceCatalogForAiContext(settings: {
  service_offerings_json?: DoctorSettingsRow['service_offerings_json'] | null;
  appointment_fee_currency?: string | null;
}): string | null {
  if (settings.service_offerings_json == null) {
    return null;
  }
  const catalog = safeParseServiceCatalogV1FromDb(settings.service_offerings_json as unknown);
  if (!catalog || catalog.services.length === 0) {
    return null;
  }
  const cur = (settings.appointment_fee_currency || 'INR').toUpperCase();
  const chunks: string[] = [];
  for (const s of catalog.services) {
    const mods: string[] = [];
    for (const mod of ['text', 'voice', 'video'] as const) {
      const slot = s.modalities[mod];
      if (slot?.enabled === true) {
        const amt =
          cur === 'INR'
            ? `₹${slot.price_minor / 100}`
            : `${(slot.price_minor / 100).toFixed(2)} ${cur}`;
        const fu = formatFollowUpPolicyHint(slot.followup_policy ?? null, cur);
        mods.push(
          fu ? `${mod} ${amt} [follow-ups: ${fu}]` : `${mod} ${amt}`
        );
      }
    }
    if (mods.length > 0) {
      const mh = formatMatcherHintsForAiContext(s.matcher_hints);
      const core = `${s.label} [service_key=${s.service_key}]: ${mods.join(', ')}`;
      chunks.push(mh ? `${core} [matcher: ${mh}]` : core);
    }
  }
  if (chunks.length === 0) {
    return null;
  }
  let out = chunks.join(' | ');
  if (out.length > SERVICE_CATALOG_AI_CONTEXT_MAX_CHARS) {
    const cut = SERVICE_CATALOG_AI_CONTEXT_MAX_CHARS - 32;
    out = `${out.slice(0, cut).trimEnd()} … [catalog truncated]`;
  }
  return out;
}

/**
 * Practice has a non-empty teleconsult catalog (text/voice/video rows). When true, legacy
 * `consultation_types` + physical-address booking hints should not drive the receptionist.
 */
export function isTeleconsultCatalogAuthoritative(settings: {
  service_offerings_json?: DoctorSettingsRow['service_offerings_json'] | null;
  appointment_fee_currency?: string | null;
}): boolean {
  return Boolean(
    formatServiceCatalogForAiContext({
      service_offerings_json: settings.service_offerings_json,
      appointment_fee_currency: settings.appointment_fee_currency,
    })?.trim()
  );
}

function lineHasRupeeAmount(line: string): boolean {
  return /₹\d+/.test(line);
}

function splitPlainConsultationSegments(raw: string): string[] {
  return raw
    .split(/\r?\n|;|•|\u2022|\||\s*,\s*/g)
    .map((s) => s.trim().replace(/^[\-\*•\u2022]+\s*/, ''))
    .filter(Boolean);
}

/** Try to read label + INR from one plain-text segment (doctor-entered, not invented). */
function tryExtractLabelAndInr(segment: string): { label: string; inr: number } | null {
  const s = segment.trim();
  if (!s) return null;

  const m1 = s.match(/^(.+?)\s*(?:₹|Rs\.?\s*|INR\s*|rupees?\s+)(\d{2,6})\b/i);
  if (m1) {
    const label = m1[1].replace(/[\s:–\-]+$/u, '').trim();
    const inr = parseInt(m1[2], 10);
    if (label && !Number.isNaN(inr)) return { label, inr };
  }

  const m2 = s.match(/^(.+?)[\s:–\-]+(\d{2,6})(?:\s*(?:₹|Rs\.?|\/-|\s*only))?\s*$/i);
  if (m2) {
    const label = m2[1].trim();
    const inr = parseInt(m2[2], 10);
    if (label && !Number.isNaN(inr)) return { label, inr };
  }

  const m3 = s.match(/^(\d{2,6})\s*(?:₹|Rs\.?)?\s+(.+)$/i);
  if (m3) {
    const inr = parseInt(m3[1], 10);
    const label = m3[2].trim();
    if (label && !Number.isNaN(inr)) return { label, inr };
  }

  return null;
}

function buildPlainTextFeeLines(raw: string): { lines: string[]; unmatchedLabels: string[] } {
  const segments = splitPlainConsultationSegments(raw);
  const lines: string[] = [];
  const unmatchedLabels: string[] = [];

  for (const seg of segments) {
    const pair = tryExtractLabelAndInr(seg);
    if (pair) {
      lines.push(`- **${pair.label}**: ₹${pair.inr}`);
      continue;
    }
    if (seg.length > 0 && seg.length < 120 && !/^\d+$/.test(seg)) {
      unmatchedLabels.push(seg);
    }
  }

  return { lines, unmatchedLabels };
}

function formatHoursHintLine(
  locale: SafetyMessageLocale,
  hours: string,
  hasDevanagari: boolean,
  hasGurmukhi: boolean
): string {
  const h = hours.trim();
  if (!h) return '';

  if (locale === 'pa' && !hasGurmukhi) {
    return ` Clinic hours (record): ${h}`;
  }
  if (locale === 'hi' && !hasDevanagari) {
    return ` Hamare record me clinic hours: ${h}`;
  }
  if (locale === 'hi' && hasDevanagari) {
    return ` रिकॉर्ड में क्लिनिक समय: ${h}`;
  }
  if (locale === 'pa' && hasGurmukhi) {
    return ` ਰਿਕਾਰਡ ਵਿੱਚ ਕਲੀਨਿਕ ਸਮਾਂ: ${h}`;
  }
  return ` Office hours on file: ${h}`;
}

function localizeEmptyTypes(
  practiceName: string,
  locale: SafetyMessageLocale,
  hoursSuffix: string
): string {
  if (locale === 'hi') {
    return (
      `**${practiceName}** ke liye abhi system me detailed **fee amount** save nahi hai.${hoursSuffix}\n\n` +
      `Pricing ke liye yahan team / clinic se confirm kar sakte hain, ya unki profile / website dekhein.`
    );
  }
  if (locale === 'pa') {
    return (
      `**${practiceName}** layi system vich haje tak detailed **fee amount** save nahi hai.${hoursSuffix}\n\n` +
      `Pricing layi clinic / team nu puchho, jaan ohna di profile / website dekho.`
    );
  }
  return (
    `I don't have detailed **fee amounts** on file for **${practiceName}** yet.${hoursSuffix}\n\n` +
    `For **pricing**, please ask here and the team can confirm, or check any fee information they've shared on their profile/website.`
  );
}

/** Services catalog JSON is valid but has no rows — do not imply a missing “flat fee” from booking rules (e-task-2). */
function localizeEmptyServiceCatalog(
  practiceName: string,
  locale: SafetyMessageLocale,
  hoursSuffix: string
): string {
  if (locale === 'hi') {
    return (
      `**${practiceName}** ka **Services catalog** abhi **khali** hai — system me koi saved teleconsult price nahi.${hoursSuffix}\n\n` +
      `Yeh booking rules wala purana “flat fee” field se link nahi hai. Exact amount ke liye clinic / team se confirm karein.`
    );
  }
  if (locale === 'pa') {
    return (
      `**${practiceName}** da **Services catalog** haje **khali** hai — system vich koi teleconsult price save nahi.${hoursSuffix}\n\n` +
      `Eh booking rules wala purana flat-fee field naal bandha nahi. Exact amount layi clinic nu puchho.`
    );
  }
  return (
    `The practice **Services catalog** is **empty** — there are no saved teleconsult prices in the system yet.${hoursSuffix}\n\n` +
    `This is **not** tied to an old “flat fee” from booking rules (that path is not used for pricing here). For amounts, the team can confirm.`
  );
}

function localizeJsonUnreadable(
  practiceName: string,
  locale: SafetyMessageLocale,
  hoursSuffix: string
): string {
  if (locale === 'hi') {
    return (
      `**${practiceName}** ne consultation types di hain, par fee format read nahi ho saka.${hoursSuffix}\n\n` +
      `Exact ₹ amount ke liye clinic se seedha puchhein.`
    );
  }
  if (locale === 'pa') {
    return (
      `**${practiceName}** ne consultation types dittian han, par fee format read nahi ho sakia.${hoursSuffix}\n\n` +
      `Exact rupaye layi clinic nu puchho.`
    );
  }
  return (
    `**${practiceName}** listed consultation types, but I couldn't read the fee format.${hoursSuffix}\n\n` +
    `Please ask the clinic directly for exact amounts.`
  );
}

function localizeFeeListIntro(practiceName: string, locale: SafetyMessageLocale): string {
  if (locale === 'hi') {
    return `**${practiceName}** ki **consultation fees** (hamare record ke mutabik) yeh hain:\n\n`;
  }
  if (locale === 'pa') {
    return `**${practiceName}** diyan **consultation fees** (sade record mutabik):\n\n`;
  }
  return `Here are the **consultation fees** we have on file for **${practiceName}**:\n\n`;
}

function localizeFeeListFooter(
  locale: SafetyMessageLocale,
  hoursSuffix: string,
  opts?: { omitUnlistedVisitTypeCaveat?: boolean }
): string {
  const hs = hoursSuffix ? `\n\n${hoursSuffix.trim()}` : '';
  if (opts?.omitUnlistedVisitTypeCaveat) {
    return hs ? hs.trimStart() : '';
  }
  if (locale === 'hi') {
    return `*Agar aapka visit type list me nahi hai, clinic se exact charge confirm karein.*${hs}`;
  }
  if (locale === 'pa') {
    return `*Jei visit type list vich nahi, clinic to exact charge puchho.*${hs}`;
  }
  return `*If your visit type isn't listed, message the clinic for the exact charge.*${hs}`;
}

function localizePlainEchoIntro(practiceName: string, locale: SafetyMessageLocale): string {
  if (locale === 'hi') {
    return `**${practiceName}** ke record me **consultation types / fees** ke taur par yeh likha hai:\n\n`;
  }
  if (locale === 'pa') {
    return `**${practiceName}** de record vich **consultation types / fees** vaste yeh likhya hai:\n\n`;
  }
  return `Here's what **${practiceName}** has on file for **consultation types & fees**:\n\n`;
}

function localizePlainEchoFooter(locale: SafetyMessageLocale, hoursSuffix: string): string {
  const hs = hoursSuffix ? ` ${hoursSuffix.trim()}` : '';
  if (locale === 'hi') {
    return `*Exact ₹ har case me alag ho sakta hai—agar unclear ho to clinic confirm kara legi.*${hs}`;
  }
  if (locale === 'pa') {
    return `*Exact rupaye har case vich alag ho sakde ne—agar unclear ho ta clinic confirm karegi.*${hs}`;
  }
  return `*Exact charges can vary - if anything is unclear, the clinic can confirm.*${hs}`;
}

function localizeNoPerTypeAmountNote(locale: SafetyMessageLocale): string {
  if (locale === 'hi') {
    return '\n\n*Line items par abhi exact amount clinic ne yahan add nahi kiya—neeche **on-record** fee (agar set hai) dekhein.*';
  }
  if (locale === 'pa') {
    return '\n\n*Line items utte haje exact amount clinic ne add nahi kita—thalle **record** fee (je set hai) vekho.*';
  }
  return '\n\n*Exact amounts for each line aren’t on file below—see the **on-record** fee if one is set.*';
}

function minorFeeLabel(locale: SafetyMessageLocale): string {
  if (locale === 'hi') return 'Consultation / appointment fee (system record)';
  if (locale === 'pa') return 'Consultation / appointment fee (system record)';
  return 'Consultation / appointment fee (on file)';
}

function appendMinorFeeLine(
  lines: string[],
  minor: number | null | undefined,
  currency: string | null | undefined,
  locale: SafetyMessageLocale
): void {
  if (minor == null || minor <= 0) return;
  lines.push(`- **${minorFeeLabel(locale)}**: ${formatMinorCurrencyDm(minor, currency)}`);
}

/**
 * Booking CTA after fee block — matches user locale when possible.
 */
export function formatFeeBookingCtaForDm(userText: string): string {
  const locale = detectSafetyMessageLocale(userText || '');
  const hasDevanagari = /[\u0900-\u097F]/.test(userText || '');
  const hasGurmukhi = /[\u0A00-\u0A7F]/.test(userText || '');

  if (locale === 'hi' && !hasDevanagari) {
    return 'Jab aap **appointment book** karna chahein, yahan **book appointment** likhein—hum aage help karenge.';
  }
  if (locale === 'hi' && hasDevanagari) {
    return 'जब आप तैयार हों, **book appointment** लिखें—हम आगे मदद करेंगे।';
  }
  if (locale === 'pa' && !hasGurmukhi) {
    return 'Jadon **appointment book** karna hove, **book appointment** likho—asin agge help karenge.';
  }
  if (locale === 'pa' && hasGurmukhi) {
    return 'ਜਦੋਂ ਤੁਸੀਂ ਤਿਆਰ ਹੋਵੋ, **book appointment** ਲਿਖੋ—ਅਸੀਂ ਅੱਗੇ ਮਦਦ ਕਰਾਂਗੇ.';
  }
  return "When you're ready to schedule, say **book appointment** and we'll take it from there.";
}

export interface ConsultationFeeDmWithMeta {
  markdown: string;
  feeQuoteMatcherFinalize?: ConsultationFeeQuoteMatcherFinalize;
  feeAmbiguousStaffReview?: ConsultationFeeAmbiguousStaffReview;
}

/**
 * Human-readable fee block for DM. Only shows ₹ from doctor data (JSON, plain text digits, or appointment_fee_minor).
 * @param catalogMatchText Redacted prior patient thread for teleconsult catalog narrowing (e-task-dm-02).
 */
export function formatConsultationFeesForDm(
  settings: ConsultationFeesDmSettings,
  userText: string = '',
  catalogMatchText?: string,
  catalogOpts?: { clinicalLedFeeThread?: boolean }
): string {
  return formatConsultationFeesForDmWithMeta(settings, userText, catalogMatchText, catalogOpts).markdown;
}

export function formatConsultationFeesForDmWithMeta(
  settings: ConsultationFeesDmSettings,
  userText: string = '',
  catalogMatchText?: string,
  catalogOpts?: { clinicalLedFeeThread?: boolean }
): ConsultationFeeDmWithMeta {
  const practiceName = settings.practice_name?.trim() || 'the practice';
  let serviceCatalogExplicitlyEmpty = false;
  if (settings.service_offerings_json != null) {
    if (isExplicitlyEmptyServiceCatalogJson(settings.service_offerings_json)) {
      serviceCatalogExplicitlyEmpty = true;
    } else {
      const catalog = safeParseServiceCatalogV1FromDb(
        settings.service_offerings_json as unknown
      );
      if (catalog && catalog.services.length > 0) {
        const catMeta = formatServiceCatalogForDmWithMeta(
          catalog,
          settings,
          userText,
          catalogMatchText,
          catalogOpts
        );
        return {
          markdown: catMeta.markdown,
          feeQuoteMatcherFinalize: catMeta.feeQuoteMatcherFinalize,
          feeAmbiguousStaffReview: catMeta.feeAmbiguousStaffReview,
        };
      }
    }
  }

  const raw = settings.consultation_types?.trim();
  const locale = detectSafetyMessageLocale(userText || '');
  const hasDevanagari = /[\u0900-\u097F]/.test(userText || '');
  const hasGurmukhi = /[\u0A00-\u0A7F]/.test(userText || '');

  const hoursSuffix = formatHoursHintLine(
    locale,
    settings.business_hours_summary?.trim() ?? '',
    hasDevanagari,
    hasGurmukhi
  );

  const minor = settings.appointment_fee_minor;
  const cur = settings.appointment_fee_currency;

  if (!raw) {
    const lines: string[] = [];
    appendMinorFeeLine(lines, minor, cur, locale);
    if (lines.length > 0) {
      const intro = localizeFeeListIntro(practiceName, locale);
      return {
        markdown: `${intro}${lines.join('\n')}\n\n${localizeFeeListFooter(locale, hoursSuffix)}`,
      };
    }
    return {
      markdown: serviceCatalogExplicitlyEmpty
        ? localizeEmptyServiceCatalog(practiceName, locale, hoursSuffix)
        : localizeEmptyTypes(practiceName, locale, hoursSuffix),
    };
  }

  const rows = parseCompactFeeJson(raw);
  if (rows) {
    const lines: string[] = [];
    for (const row of rows) {
      const n = normalizeRow(row);
      if (!n) continue;
      if (n.inr != null) {
        lines.push(`- **${n.label}**: ₹${n.inr}${n.note ? ` (${n.note})` : ''}`);
      } else {
        lines.push(`- **${n.label}**${n.note ? `: ${n.note}` : ''}`);
      }
    }
    if (lines.length === 0) {
      return { markdown: localizeJsonUnreadable(practiceName, locale, hoursSuffix) };
    }
    const hadRupeeFromRows = lines.some(lineHasRupeeAmount);
    if (!hadRupeeFromRows) {
      appendMinorFeeLine(lines, minor, cur, locale);
    }
    const intro = localizeFeeListIntro(practiceName, locale);
    let out = `${intro}${lines.join('\n')}\n\n${localizeFeeListFooter(locale, hoursSuffix)}`;
    if (!lines.some(lineHasRupeeAmount)) {
      out += localizeNoPerTypeAmountNote(locale);
    }
    return { markdown: out };
  }

  const { lines: plainLines, unmatchedLabels } = buildPlainTextFeeLines(raw);
  const hadPlainRupee = plainLines.some(lineHasRupeeAmount);

  if (hadPlainRupee) {
    for (const label of unmatchedLabels) {
      plainLines.push(`- **${label}**`);
    }
    const intro = localizeFeeListIntro(practiceName, locale);
    return {
      markdown: `${intro}${plainLines.join('\n')}\n\n${localizeFeeListFooter(locale, hoursSuffix)}`,
    };
  }

  const echoLines: string[] = [];
  for (const label of unmatchedLabels.length > 0 ? unmatchedLabels : [raw]) {
    echoLines.push(`- **${label}**`);
  }
  appendMinorFeeLine(echoLines, minor, cur, locale);

  const intro = localizePlainEchoIntro(practiceName, locale);
  let out = `${intro}${echoLines.join('\n')}\n\n${localizePlainEchoFooter(locale, hoursSuffix)}`;
  if (!echoLines.some(lineHasRupeeAmount)) {
    out += localizeNoPerTypeAmountNote(locale);
  }
  return { markdown: out };
}

/**
 * Async variant: teleconsult catalog fee DMs may call LLM narrowing when `catalogOpts.llmNarrow` is set.
 * Non-catalog paths delegate to the synchronous formatter (no extra API call).
 */
export async function formatConsultationFeesForDmWithMetaAsync(
  settings: ConsultationFeesDmSettings,
  userText: string = '',
  catalogMatchText?: string,
  catalogOpts?: ServiceCatalogDmFormatOpts
): Promise<ConsultationFeeDmWithMeta> {
  if (settings.service_offerings_json != null) {
    if (!isExplicitlyEmptyServiceCatalogJson(settings.service_offerings_json)) {
      const catalog = safeParseServiceCatalogV1FromDb(
        settings.service_offerings_json as unknown
      );
      if (catalog && catalog.services.length > 0) {
        const catMeta = await formatServiceCatalogForDmWithMetaAsync(
          catalog,
          settings,
          userText,
          catalogMatchText,
          catalogOpts
        );
        return {
          markdown: catMeta.markdown,
          feeQuoteMatcherFinalize: catMeta.feeQuoteMatcherFinalize,
          feeAmbiguousStaffReview: catMeta.feeAmbiguousStaffReview,
        };
      }
    }
  }
  return formatConsultationFeesForDmWithMeta(settings, userText, catalogMatchText, catalogOpts);
}

/**
 * RBH-13: Meta phrases about fees/booking - must not become `reason_for_visit` during intake.
 */
export function isMetaBookingOrFeeReasonText(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  if (isPricingInquiryMessage(t)) return true;
  if (userDeclinesBookingIntent(t)) return true;
  const low = t.toLowerCase();
  if (/\b(how\s+do\s+i|how\s+to)\s+(book|schedule)\b/.test(low)) return true;
  if (/^(book|schedule)\s+(an?\s+)?(appointment|visit)\??$/i.test(low)) return true;
  if (/\b(consultation|appointment)\s+fee(s)?\b/i.test(low)) return true;
  return false;
}
