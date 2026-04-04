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
  SERVICE_CATALOG_VERSION,
  safeParseServiceCatalogV1FromDb,
} from './service-catalog-schema';
import type { DoctorSettingsRow } from '../types/doctor-settings';

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
  /\b(fee|fees|price|prices|pricing|cost|costs|charge|charges|how\s+much|kitna|kitni|kitne|कितना|rupee|rupees|paise|paisa|rs\.?|inr|₹|consultation\s+fee|doctor\s+fee|appointment\s+fee)\b/i;

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
  const t = text.trim();
  if (t.length < 3) return false;
  return PRICING_KEYWORDS.test(t);
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
  return (
    /\b(book|schedule)\s+(?:an\s+)?(?:appointment|visit|consultation)\b/i.test(t) ||
    /\b(want|need|would\s+like)\s+to\s+book\b/i.test(t) ||
    /\bbook\s+(?:me|us|an\s+appointment|a\s+slot)\b/i.test(t) ||
    /\b(start|begin)\ba?\s+booking\b/i.test(t) ||
    /\bplease\s+book\b/i.test(t)
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

const MODALITY_DM_LABEL: Record<'text' | 'voice' | 'video', string> = {
  text: 'Text',
  voice: 'Voice',
  video: 'Video',
};

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
 */
export function formatServiceCatalogForDm(
  catalog: ServiceCatalogV1,
  settings: ConsultationFeesDmSettings,
  userText: string = ''
): string {
  const practiceName = settings.practice_name?.trim() || 'the practice';
  const locale = detectSafetyMessageLocale(userText || '');
  const hasDevanagari = /[\u0900-\u097F]/.test(userText || '');
  const hasGurmukhi = /[\u0A00-\u0A7F]/.test(userText || '');
  const hoursSuffix = formatHoursHintLine(
    locale,
    settings.business_hours_summary?.trim() ?? '',
    hasDevanagari,
    hasGurmukhi
  );
  const cur = settings.appointment_fee_currency;
  const rows = pickCatalogServicesMatchingUserText(catalog, userText);
  const lines: string[] = [];

  for (const s of rows) {
    const modParts: string[] = [];
    for (const mod of ['text', 'voice', 'video'] as const) {
      const slot = s.modalities[mod];
      if (slot?.enabled === true) {
        const price = `**${MODALITY_DM_LABEL[mod]}**: ${formatMinorCurrencyDm(slot.price_minor, cur)}`;
        const fu = formatFollowUpPolicyHint(slot.followup_policy ?? null, cur);
        modParts.push(
          fu ? `${price}\n  - Follow-ups (on file): ${fu}` : price
        );
      }
    }
    if (modParts.length === 0) {
      continue;
    }
    lines.push(`**${s.label}** (\`${s.service_key}\`)\n${modParts.map((p) => `- ${p}`).join('\n')}`);
  }

  if (lines.length === 0) {
    return localizeJsonUnreadable(practiceName, locale, hoursSuffix);
  }

  const intro = localizeCatalogIntro(practiceName, locale);
  let body = `${intro}${lines.join('\n\n')}`;

  /** Catalog path lists text/voice/video only — do not append legacy “in-clinic” flat fee (misleading when teleconsult-only). */

  body += `\n\n${localizeFeeListFooter(locale, hoursSuffix)}`;
  return truncateIfNeededDm(body, CONSULTATION_FEE_DM_MAX_CHARS, locale);
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

function localizeFeeListFooter(locale: SafetyMessageLocale, hoursSuffix: string): string {
  const hs = hoursSuffix ? `\n\n${hoursSuffix.trim()}` : '';
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

/**
 * Human-readable fee block for DM. Only shows ₹ from doctor data (JSON, plain text digits, or appointment_fee_minor).
 */
export function formatConsultationFeesForDm(
  settings: ConsultationFeesDmSettings,
  userText: string = ''
): string {
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
        return formatServiceCatalogForDm(catalog, settings, userText);
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
      return `${intro}${lines.join('\n')}\n\n${localizeFeeListFooter(locale, hoursSuffix)}`;
    }
    return serviceCatalogExplicitlyEmpty
      ? localizeEmptyServiceCatalog(practiceName, locale, hoursSuffix)
      : localizeEmptyTypes(practiceName, locale, hoursSuffix);
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
      return localizeJsonUnreadable(practiceName, locale, hoursSuffix);
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
    return out;
  }

  const { lines: plainLines, unmatchedLabels } = buildPlainTextFeeLines(raw);
  const hadPlainRupee = plainLines.some(lineHasRupeeAmount);

  if (hadPlainRupee) {
    for (const label of unmatchedLabels) {
      plainLines.push(`- **${label}**`);
    }
    const intro = localizeFeeListIntro(practiceName, locale);
    return `${intro}${plainLines.join('\n')}\n\n${localizeFeeListFooter(locale, hoursSuffix)}`;
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
  return out;
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
