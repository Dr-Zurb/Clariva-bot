/**
 * RBH-13: Structured consultation / fee copy for Instagram DM (no invented amounts).
 * Supports plain text from doctor_settings.consultation_types or optional compact JSON.
 * Localized intro/footer via detectSafetyMessageLocale(userText). Falls back to appointment_fee_minor (INR) when no ₹ in consultation_types.
 */

import {
  type SafetyMessageLocale,
  detectSafetyMessageLocale,
} from './safety-messages';
import type { ServiceCatalogV1 } from './service-catalog-schema';
import { safeParseServiceCatalogV1FromDb } from './service-catalog-schema';
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
export function formatAppointmentFeeForAiContext(settings: {
  appointment_fee_minor?: number | null;
  appointment_fee_currency?: string | null;
}): string | null {
  const minor = settings.appointment_fee_minor;
  if (minor == null || minor <= 0) return null;
  const cur = (settings.appointment_fee_currency || 'INR').toUpperCase();
  if (cur === 'INR') {
    return `Standard appointment / consultation fee on file: ₹${Math.round(minor / 100)} (INR). This is what patients pay when booking unless a different per–visit-type amount is listed under consultation types.`;
  }
  return `Standard appointment / consultation fee on file: ${(minor / 100).toFixed(2)} ${cur}.`;
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

/** Instagram DM soft limit — trim + ellipsis when catalog is large (SFU-08 §5). */
export const CONSULTATION_FEE_DM_MAX_CHARS = 3200;

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

function localizeCatalogIntro(practiceName: string, locale: SafetyMessageLocale): string {
  if (locale === 'hi') {
    return `**${practiceName}** ke **online / teleconsult fees** (hamare record ke mutabik):\n\n`;
  }
  if (locale === 'pa') {
    return `**${practiceName}** de **online / teleconsult fees** (sade record mutabik):\n\n`;
  }
  return `**Teleconsult (online) fees** on file for **${practiceName}**:\n\n`;
}

function localizeInClinicFlatLine(
  minor: number,
  currency: string | null | undefined,
  locale: SafetyMessageLocale
): string {
  const amt = formatMinorCurrencyDm(minor, currency);
  if (locale === 'hi') {
    return `- **Clinic / in-person (standard fee on file)**: ${amt}`;
  }
  if (locale === 'pa') {
    return `- **Clinic / in-person (standard fee on file)**: ${amt}`;
  }
  return `- **In-clinic / standard appointment fee (on file)**: ${amt}`;
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
        modParts.push(
          `**${MODALITY_DM_LABEL[mod]}**: ${formatMinorCurrencyDm(slot.price_minor, cur)}`
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

  const minor = settings.appointment_fee_minor;
  if (minor != null && minor > 0 && isInrFeeCurrency(cur)) {
    body += `\n\n${localizeInClinicFlatLine(minor, cur, locale)}`;
  }

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
        mods.push(`${mod} ${amt}`);
      }
    }
    if (mods.length > 0) {
      chunks.push(`${s.label} [service_key=${s.service_key}]: ${mods.join(', ')}`);
    }
  }
  return chunks.length > 0 ? chunks.join(' | ') : null;
}

function isInrFeeCurrency(currency: string | null | undefined): boolean {
  if (currency == null || currency === '') return true;
  return currency.toUpperCase() === 'INR';
}

function rupeesFromMinor(minor: number): number {
  return Math.round(minor / 100);
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
    return '\n\n*Line items par abhi exact ₹ amount clinic ne yahan add nahi kiya—neeche **on-record** fee (agar set hai) dekhein.*';
  }
  if (locale === 'pa') {
    return '\n\n*Line items utte haje exact amount clinic ne add nahi kita—thalle **record** fee (je set hai) vekho.*';
  }
  return '\n\n*Exact rupee amounts for each line aren’t on file below—see the **on-record** fee if one is set.*';
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
  if (minor == null || minor <= 0 || !isInrFeeCurrency(currency)) return;
  const r = rupeesFromMinor(minor);
  lines.push(`- **${minorFeeLabel(locale)}**: ₹${r}`);
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
  if (settings.service_offerings_json != null) {
    const catalog = safeParseServiceCatalogV1FromDb(
      settings.service_offerings_json as unknown
    );
    if (catalog && catalog.services.length > 0) {
      return formatServiceCatalogForDm(catalog, settings, userText);
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
    return localizeEmptyTypes(practiceName, locale, hoursSuffix);
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
