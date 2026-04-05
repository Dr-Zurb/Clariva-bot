/**
 * e-task-dm-04: Reason-first triage — defer full fee catalog until other reasons are confirmed.
 * Detection uses generic clinical / concern cues (no per-service labels in code).
 */

import type { ConversationState } from '../types/conversation';
import { isRecentMedicalDeflectionWindow } from '../types/conversation';
import { isPricingInquiryMessage, normalizePatientPricingText } from './consultation-fees';
import { detectSafetyMessageLocale } from './safety-messages';
import { POST_MEDICAL_PAYMENT_EXISTENCE_ACK_CANONICAL_EN } from './post-medical-ack-copy';

/** Roman + common message cues that the user is describing a health concern (not pure pricing). */
const CLINICAL_OR_CONCERN_RE =
  /\b(blood\s*sugar|glucose|diabet|hypert(?:ension)?|blood\s*pressure|\bbp\b|fever|temperature|pain|ache|hurt|hurts|cough|cold|flu|rash|skin|swelling|infection|symptom|nausea|vomit|dizzy|headache|migraine|chest|stomach|abdomen|loose\s*motion|constipat|uti|burning|bleed|wound|medicine|medication|dose|tablet|insulin|reading|test\s+result|lab\s+result|report|scan|x-?ray|feel\s+sick|unwell|worried\s+about|check\s+my|guide\s+me|what\s+should\s+i\s+do)\b/i;

const EXPLICIT_FULL_FEE_LIST_RE =
  /\b(all\s+(your\s+)?(fees|prices|services|consultation\s+types|consultation\s+fees|consultation\s+prices)|every\s+(fee|price|service)|full\s+(fee\s+)?list|complete\s+(price|fee)|what\s+are\s+all\s+(the\s+)?(your\s+)?(fees|prices|services))\b/i;

/** Last assistant/bot line in recent DM history (for anaphora). Not redacted here — use webhook redacted thread if logging. */
export function lastAssistantDmContent(
  recentMessages: { sender_type: string; content: string }[]
): string | undefined {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].sender_type === 'patient') continue;
    const c = (recentMessages[i].content ?? '').trim();
    if (c) return c;
  }
  return undefined;
}

const LAST_BOT_FEE_TOPIC_RE =
  /\b(fee|fees|price|prices|cost|pay|paid|payment|consult|consultation|amount|kitna|kitne|teleconsult|booking\s+fee|\u20b9|rupees?|rs\.?)\b/i;

/** e-task-dm-06: last assistant line discussed fees/pricing (for classifier fee-thread continuation gate). */
export function lastBotDiscussesFeesTopic(lastBotMessage: string | undefined): boolean {
  const bot = (lastBotMessage ?? '').trim();
  if (!bot) return false;
  return LAST_BOT_FEE_TOPIC_RE.test(bot);
}

/**
 * e-task-dm-05: short reply continuing a fee/payment turn (e.g. after post-medical ack) without pricing keywords.
 */
export function feeFollowUpAnaphora(userText: string, lastBotMessage: string | undefined): boolean {
  if (!lastBotDiscussesFeesTopic(lastBotMessage)) return false;
  const t = userText.trim();
  if (t.length < 2 || t.length > 96) return false;
  if (/^what\s+is\s+(it|that)\??\s*$/i.test(t)) return true;
  if (/^what'?s\s+(it|that)\??\s*$/i.test(t)) return true;
  if (/^how\s+much(\s+(is\s+it|for\s+that))?\??\s*$/i.test(t)) return true;
  if (/^how\s+muc\??\s*$/i.test(t)) return true;
  if (/^(the\s+)?fee(s)?\??\s*$/i.test(t)) return true;
  if (/^kitna\??\s*$/i.test(t)) return true;
  if (/^what\s+about\s+(the\s+)?(fee|price|cost)\??\s*$/i.test(t)) return true;
  if (/\bwhat\s+is\s+it\b/i.test(t) && /\b(fee|fees|price|prices|cost|amount)\b/i.test(t)) return true;
  return false;
}

/**
 * e-task-dm-05: thread is “clinical-led” for fee policy — reason-first, deflection window, post-pay ack chain, or clinical cues in patient lines.
 */
export function clinicalLedFeeThread(params: {
  state: ConversationState;
  recentMessages: { sender_type: string; content: string }[];
}): boolean {
  const { state, recentMessages } = params;
  if (state.reasonFirstTriagePhase) return true;
  if (isRecentMedicalDeflectionWindow(state)) return true;
  if (recentPatientThreadHasClinicalReason(recentMessages)) return true;
  if (state.postMedicalConsultFeeAckSent) return true;
  return false;
}

const NOTHING_ELSE_RE =
  /^(no|nope|nothing\s+else|not\s+really|that's\s+all|thats\s+all|just\s+that|only\s+this|same\s+thing|only\s+what\s+i\s+said|bas|sirf\s+itna|nai|nahi\s+aur)\b/i;

const CONFIRM_YES_RE =
  /^(yes|yeah|yep|yup|ok|okay|sure|correct|right|exactly|confirmed|haan|haan\s*ji|han\s*ji|ji|theek|thik|sahi)\b/i;

export function userMessageSuggestsClinicalReason(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  return CLINICAL_OR_CONCERN_RE.test(t);
}

export function recentPatientThreadHasClinicalReason(
  recentMessages: { sender_type: string; content: string }[]
): boolean {
  for (const m of recentMessages) {
    if (m.sender_type !== 'patient') continue;
    if (userMessageSuggestsClinicalReason(m.content ?? '')) return true;
  }
  return false;
}

export function userWantsExplicitFullFeeList(text: string): boolean {
  return EXPLICIT_FULL_FEE_LIST_RE.test(text.trim());
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
 * “Do I have to pay?” style — **yes/no fee existence**, not “how much?” (handled by reason-first after ack).
 */
export function isVagueConsultationPaymentExistenceQuestion(text: string): boolean {
  const t = normalizePatientPricingText(text);
  if (t.length < 3) return false;
  if (userWantsExplicitFullFeeList(t)) return false;
  if (AMOUNT_SEEKING_PRICING_RE.test(t)) return false;

  const mentionsPaidVsFree =
    /\bno\s+free\s+(advice|consult(ation)?)\b/i.test(t) ||
    /\bis(n't| not)\s+(it|this)\s+free\b/i.test(t);

  const pricingish =
    isPricingInquiryMessage(t) ||
    mentionsPaidVsFree ||
    /\bfree\s+advice\b/i.test(t);

  if (!pricingish) return false;

  return (
    /\b(do\s+i\s+(have\s+)?(to|need\s+to)\s+pay|have\s+to\s+pay|need\s+to\s+pay|will\s+i\s+pay)\b/i.test(t) ||
    /\bso\s+i\s+have\s+to\s+pay\b/i.test(t) ||
    /\bso\s+i\s+pay\b/i.test(t) || // "oh/okay so i pay?" — existence, not amount
    /\b(is\s+there\s+(a\s+)?(fee|charge|payment)|is\s+it\s+(paid|free))\b/i.test(t) ||
    /\b(am\s+i\s+supposed\s+to\s+pay|do\s+i\s+pay)\b/i.test(t) ||
    /\b(oh\s+)?so\s+there\s+is\s+(a\s+)?(fee|charge|payment)\b/i.test(t) ||
    /\bthere\s+is\s+(a\s+)?(fee|charge|payment)\b/i.test(t) ||
    /\bthere'?s\s+(a\s+)?(fee|charge|payment)\b/i.test(t) ||
    mentionsPaidVsFree
  );
}

/**
 * Patient line should not inflate fee matcher / reason summary — pricing-only lines without clinical cues
 * in the same message (e.g. "how much do I pay?" after symptoms).
 */
export function shouldOmitPatientLineFromFeeCatalogMatchContent(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (userMessageSuggestsClinicalReason(t)) return false;
  if (isVagueConsultationPaymentExistenceQuestion(t)) return true;
  if (isPricingInquiryMessage(t)) return true;
  return false;
}

export function shouldDeferIdleFeeForReasonFirstTriage(params: {
  state: ConversationState;
  text: string;
  recentMessages: { sender_type: string; content: string }[];
}): boolean {
  const { state, text, recentMessages } = params;
  if (state.reasonFirstTriagePhase) return false;
  const tNorm = normalizePatientPricingText(text);
  if (userWantsExplicitFullFeeList(tNorm)) return false;

  const threadClinical = recentPatientThreadHasClinicalReason(recentMessages);
  const currentClinical = userMessageSuggestsClinicalReason(text);
  const postDeflect = isRecentMedicalDeflectionWindow(state);
  const clinicalContext = postDeflect || threadClinical || currentClinical;

  if (!clinicalContext) {
    if (isPricingInquiryMessage(tNorm)) return false;
    return false;
  }

  // Post-deflection / symptom-led: defer full catalog until reason-first triage + confirm.
  // Use typo-normalized line so "payemnt" still matches pricing keywords (e-task-dm-05).
  if (isPricingInquiryMessage(tNorm)) {
    if (!state.postMedicalConsultFeeAckSent && isVagueConsultationPaymentExistenceQuestion(text)) {
      return false;
    }
    return true;
  }

  return true;
}

export function parseNothingElseOrSameOnly(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  return NOTHING_ELSE_RE.test(t);
}

export function parseReasonTriageConfirmYes(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  if (isPricingInquiryMessage(t)) return false;
  if (isAmountSeekingPricingQuestion(t)) return false;
  return CONFIRM_YES_RE.test(t);
}

const NEGATION_CLARIFY_RE =
  /^(no|nope|nah|not\s+really|not\s+quite|wrong|incorrect|that's\s+wrong|thats\s+wrong|change\s+that|something\s+else)\b/i;

/** User is pushing back on the summarized reason — send correction prompt, stay in confirm. */
export function parseReasonTriageNegationForClarify(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  return NEGATION_CLARIFY_RE.test(t);
}

export const REASON_SNIPPET_MAX_LEN = 360;

/** Normalized key for deduping distilled reason lines. */
function normalizeReasonKey(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

const GREETING_PREFIX_RE =
  /^(?:(?:hello|hi|hey)\s*,?\s*(?:doc|doctor|dr\.?)\s*[,.]?\s+|(?:hello|hi|hey)\s*[,.]?\s+)/i;

/**
 * English glucose phrases — order matters: prefer the full “i checked my …” span so we do not
 * leave leading filler like “today i checked my” in the remainder.
 * Capture group 1 is the numeric reading.
 */
const BLOOD_SUGAR_PHRASE_RES: RegExp[] = [
  /(?:today\s+)?i\s+checked\s+my\s+blood\s+sugar\s+(?:today\s+)?(?:it\s+)?(?:came\s+out\s+to\s+be\s+|turned\s+out\s+to\s+be\s+|to\s+be\s+|is\s+|was\s+|at\s+)(\d+)/i,
  /blood\s+sugar\s+(?:today\s+)?(?:it\s+)?(?:came\s+out\s+to\s+be\s+|turned\s+out\s+to\s+be\s+|to\s+be\s+|is\s+|was\s+|at\s+)(\d+)/i,
  /(?:today\s+i\s+)?(?:checked\s+)?(?:my\s+)?blood\s+sugar\s+(?:to\s+be\s+|is\s+|was\s+|at\s+)?(\d+)/i,
];

/** Polite small talk — not visit reasons (strip only clear social openers). */
function stripSmallTalkPhrases(s: string): string {
  let t = s;
  t = t.replace(/\bhow\s+are\s+you\s*\?\s*/gi, ' ');
  t = t.replace(/\bhow\s+are\s+you\s*,\s*/gi, ' ');
  t = t.replace(/\bhow\s+are\s+you\s+(?=i\s+)/gi, ' ');
  t = t.replace(/\bhow\s+do\s+you\s+do\s*\?\s*/gi, ' ');
  t = t.replace(/\bgood\s+(?:morning|afternoon|evening)\s*[,.]?\s*/gi, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

function stripGreetingPrefix(s: string): string {
  let t = s;
  while (GREETING_PREFIX_RE.test(t)) {
    t = t.replace(GREETING_PREFIX_RE, '').trim();
  }
  return t;
}

/** Remove standalone “how much” / fee fragments (after typo normalize); avoids leaking pricing into clinical summaries. */
function stripStandalonePricingPhrases(s: string): string {
  let t = normalizePatientPricingText(s);
  t = t.replace(/\s*\bhow\s+much\b\??\s*/gi, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

function extractBloodSugarSummary(text: string): { summary: string; remainder: string } | null {
  const t = text.trim();
  const fasting =
    /\bfasting\b/i.test(t) ||
    /\bit\s+was\s+fasting\b/i.test(t) ||
    /\bwhile\s+fasting\b/i.test(t);

  for (const re of BLOOD_SUGAR_PHRASE_RES) {
    const m = re.exec(t);
    if (!m) continue;
    const n = m[1];
    const full = m[0];
    const idx = m.index ?? 0;
    let remainder = `${t.slice(0, idx)} ${t.slice(idx + full.length)}`;
    remainder = remainder.replace(/\b(?:it\s+was\s+)?fasting\b/gi, ' ');
    remainder = remainder.replace(/\s*,\s*\bit\s+was\s+fasting\b/gi, ' ');
    remainder = remainder.replace(/^\s*\bit\s+was\s+fasting\b\s*[,.]?\s*/i, '');
    remainder = remainder.replace(/\s*,\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const summary = fasting ? `fasting blood sugar - ${n}` : `blood sugar - ${n}`;
    return { summary, remainder };
  }
  return null;
}

function stripLeadingIHavePhrases(s: string): string {
  return s.replace(/^(i\s+also\s+have\s+|i\s+have\s+)/i, '').trim();
}

/** Leftovers from partial glucose regex matches — do not surface as visit reasons. */
function isJunkReasonFragment(t: string): boolean {
  const u = t.trim().toLowerCase().replace(/\s+/g, ' ');
  if (u.length < 2) return true;
  if (/^(today|yesterday|tomorrow)$/.test(u)) return true;
  if (/^it\s+was\s+fasting$/.test(u)) return true;
  if (/^i\s+checked\s+my$/.test(u)) return true;
  return false;
}

function splitCommaClinicalSegments(s: string): string[] {
  return s
    .split(/\s*,\s*/)
    .map((x) => x.trim())
    .filter((x) => {
      if (x.length < 2) return false;
      if (isPricingInquiryMessage(x) && !userMessageSuggestsClinicalReason(x)) return false;
      return true;
    });
}

function dedupePreserveOrderLocal(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const k = normalizeReasonKey(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item.replace(/\s+/g, ' ').trim());
  }
  return out;
}

/**
 * Distill one patient DM into discrete visit-reason lines: drop filler, keep wording where possible.
 * Exported for unit tests.
 */
export function distillPatientReasonLinesFromMessage(raw: string): string[] {
  let s = raw.trim();
  if (!s) return [];

  s = stripGreetingPrefix(s);
  s = stripSmallTalkPhrases(s);
  s = s.replace(/\bhow\s+do\s+i\s+fix\s+it\b[?.!]*\s*/gi, ' ');
  s = s.replace(/\s*,\s*how\s+do\s+i\s+fix\s+it\b[?.!]*/gi, ', ');
  s = stripStandalonePricingPhrases(s);

  const out: string[] = [];
  const bs = extractBloodSugarSummary(s);
  if (bs) {
    out.push(bs.summary);
    s = bs.remainder;
  }

  s = s.trim();
  if (!s) return dedupePreserveOrderLocal(out);

  const splitAlso = s.split(/\s+i\s+also\s+have\s+/i).map((x) => x.trim()).filter(Boolean);
  const toProcess = splitAlso.length ? splitAlso : [s];

  for (const seg of toProcess) {
    let piece = stripLeadingIHavePhrases(seg);
    if (!piece) continue;

    const commaParts = splitCommaClinicalSegments(piece);
    const chunks = commaParts.length ? commaParts : [piece];

    for (const ch of chunks) {
      const t = ch.trim();
      if (t.length < 2) continue;
      const bs2 = extractBloodSugarSummary(t);
      if (bs2 && !bs2.remainder.trim()) {
        out.push(bs2.summary);
        continue;
      }
      if (isJunkReasonFragment(t)) continue;
      if (isPricingInquiryMessage(t) && !userMessageSuggestsClinicalReason(t)) continue;
      if (!userMessageSuggestsClinicalReason(t) && !/\d/.test(t)) continue;
      out.push(t.replace(/\s+/g, ' ').trim());
    }
  }

  return dedupePreserveOrderLocal(out);
}

/** Format distilled reason lines for DM/staff preview (numbered when 2+ items). */
export function formatVisitReasonItemsForSnippet(items: string[]): string {
  const cleaned = items.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (cleaned.length === 0) return 'what you shared';
  if (cleaned.length === 1) return cleaned[0];
  return cleaned.map((t, i) => `${i + 1}) ${t}`).join('\n');
}

/** Apply max length for Instagram / DB preview fields. */
export function truncateReasonSnippetToMax(snippet: string): string {
  const s = (snippet || '').trim() || 'what you shared';
  if (s.length <= REASON_SNIPPET_MAX_LEN) return s;
  return `${s.slice(0, REASON_SNIPPET_MAX_LEN - 1).trimEnd()}…`;
}

/**
 * Patient DM lines that contribute to reason-first triage (before distillation / LLM).
 * Exported for AI snippet resolver + tests.
 */
export function collectPatientReasonPartsForTriage(
  recentMessages: { sender_type: string; content: string }[],
  currentText: string
): string[] {
  const parts: string[] = [];
  for (const m of recentMessages) {
    if (m.sender_type !== 'patient') continue;
    const c = (m.content ?? '').trim();
    if (!c || shouldOmitPatientLineFromFeeCatalogMatchContent(c)) continue;
    if (!parts.includes(c)) parts.push(c);
  }
  const cur = currentText.trim();
  if (
    cur &&
    !parseNothingElseOrSameOnly(cur) &&
    !shouldOmitPatientLineFromFeeCatalogMatchContent(cur) &&
    !parts.includes(cur)
  ) {
    parts.push(cur);
  }
  return parts;
}

/** Merge multiple patient turns into a patient-facing reason summary (numbered when 2+ items). */
export function distillReasonSnippetFromPatientParts(patientParts: string[]): string {
  const items: string[] = [];
  const seen = new Set<string>();
  for (const p of patientParts) {
    for (const line of distillPatientReasonLinesFromMessage(p)) {
      const k = normalizeReasonKey(line);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      items.push(line);
    }
  }
  return formatVisitReasonItemsForSnippet(items);
}

/** Patient-visible summary from prior patient lines — deterministic distillation only (fallback / tests). */
export function buildConsolidatedReasonSnippetFromMessages(
  recentMessages: { sender_type: string; content: string }[],
  currentText: string
): string {
  const parts = collectPatientReasonPartsForTriage(recentMessages, currentText);
  const out = distillReasonSnippetFromPatientParts(parts);
  return truncateReasonSnippetToMax(out || 'what you shared');
}

function askMoreEnglish(): string {
  return (
    "Thanks for sharing. **Is there anything else** you'd like the doctor to address at this visit, " +
    'or is it mainly what you already mentioned? You can say **nothing else** if that covers it.'
  );
}

function askMoreHi(): string {
  return (
    'Thanks for sharing. **Kya aur kuch** hai jise aap doctor se is visit mein discuss karna chahte hain, ' +
    'ya mainly jo aapne bataya wohi hai? Agar bas wahi hai to **nothing else** likh sakte hain.'
  );
}

function askMorePa(): string {
  return (
    'Thanks for sharing. **Hor kuj** hai jo tu doctor naal is visit te discuss karna chahe, ' +
    'ja sirf jo dasyaa ohi? Agar bas ohi hai ta **nothing else** likh sakde o.'
  );
}

export function formatReasonFirstAskMoreQuestion(userText: string): string {
  const loc = detectSafetyMessageLocale(userText || '');
  if (loc === 'hi') return askMoreHi();
  if (loc === 'pa') return askMorePa();
  return askMoreEnglish();
}

/**
 * After medical deflection: English canonical only (sync fallback).
 * Prefer `resolvePostMedicalPaymentExistenceAck` in ai-service for AI localization from this text.
 */
export function formatPostMedicalPaymentExistenceAck(_userText: string): string {
  return POST_MEDICAL_PAYMENT_EXISTENCE_ACK_CANONICAL_EN;
}

/** Optional thread + ack context for fee patience bridge (e-task-dm-08 natural triage copy). */
export interface FeePatienceBridgeOptions {
  /** From {@link buildConsolidatedReasonSnippetFromMessages} (e.g. current pricing line omitted). */
  reasonSnippet?: string;
  /** Patient already received post–medical payment-existence ack — shorten fee-timing preamble. */
  recentPostMedicalFeeAck?: boolean;
}

function usableReasonSnippetForBridge(raw: string | undefined): string | undefined {
  const t = (raw ?? '').trim();
  if (t.length < 4) return undefined;
  if (t === 'what you shared') return undefined;
  return t;
}

function bridgeClosingEnglish(snippet?: string): string {
  if (snippet) {
    const noted = snippet.includes('\n')
      ? `**So far we've noted:**\n\n${snippet}\n\n`
      : `**So far we've noted:** **${snippet}**.\n\n`;
    return (
      noted +
      "**Is there anything else** you'd like the doctor to address at this visit? Please let us know **before we share the fee** — you can say **nothing else** if that covers it."
    );
  }
  return askMoreEnglish();
}

function bridgeClosingHi(snippet?: string): string {
  if (snippet) {
    const noted = snippet.includes('\n')
      ? `**Ab tak note kiya:**\n\n${snippet}\n\n`
      : `**Ab tak note kiya:** **${snippet}**.\n\n`;
    return (
      noted +
      '**Kya aur kuch** hai jo aap is visit par doctor se discuss karna chahte hain? **Fee batane se pehle** bata dein — agar bas yahi hai to **nothing else** likh sakte hain.'
    );
  }
  return askMoreHi();
}

function bridgeClosingPa(snippet?: string): string {
  if (snippet) {
    const noted = snippet.includes('\n')
      ? `**Haje tak note kita:**\n\n${snippet}\n\n`
      : `**Haje tak note kita:** **${snippet}**.\n\n`;
    return (
      noted +
      '**Hor kuj** hai je tu is visit te doctor naal discuss karna chahe? **Fee dasan to pehla** das de — je bas ohi hai ta **nothing else** likh sakde o.'
    );
  }
  return askMorePa();
}

/** User asked pricing during ask_more (or defer-to-triage); keep fee table until confirm — natural, thread-aware copy. */
export function formatReasonFirstFeePatienceBridgeWhileAskMore(
  userText: string,
  options?: FeePatienceBridgeOptions
): string {
  const loc = detectSafetyMessageLocale(userText || '');
  const hasDe = /[\u0900-\u097F]/.test(userText || '');
  const hasPa = /[\u0A00-\u0A7F]/.test(userText || '');
  const snippet = usableReasonSnippetForBridge(options?.reasonSnippet);
  const postAck = options?.recentPostMedicalFeeAck === true;

  if (loc === 'hi' && !hasDe) {
    const head = snippet
      ? postAck
        ? '**Theek hai** — **exact fee** tab batayenge jab **saari baatein** clear hon.\n\n'
        : '**Bilkul** — **exact fee** tab batate hain jab **visit ka reason** aur **aur kuch discuss karna hai ya nahi** clear ho jaye. Yeh visit **paid** hai.\n\n'
      : postAck
        ? '**Theek hai** — **exact fee** tab batayenge jab **saari baatein** clear hon.\n\n'
        : '**Bilkul** — **exact fee** tabhi batate hain jab **visit ka reason** aur **aur kuch** clear ho. Yeh visit **paid** hai.\n\n';
    return head + bridgeClosingHi(snippet);
  }
  if (loc === 'pa' && !hasPa) {
    const head = snippet
      ? postAck
        ? '**Theek aa** — **exact fee** tab dasange jad **saari gallan** clear hon.\n\n'
        : '**Bilkul** — **exact fee** tab dasange jad **visit da reason** aur **hor kuj discuss karna hai ya nahi** clear ho jave. Eh visit **paid** hai.\n\n'
      : postAck
        ? '**Theek aa** — **exact fee** tab dasange jad **saari gallan** clear hon.\n\n'
        : '**Bilkul** — **exact fee** tab dasange jad **visit da reason** te **hor kuj** clear ho. Eh visit **paid** hai.\n\n';
    return head + bridgeClosingPa(snippet);
  }

  const headEn = snippet
    ? postAck
      ? "**Understood** — we'll share the **fee** once we know **everything** you want the doctor to address.\n\n"
      : "**Absolutely** — we share the **fee** as soon as we've **confirmed what you want the doctor to address** (fees follow what you're seeing them about).\n\n"
    : postAck
      ? "**Understood** — we'll share the **fee** once we've captured **everything** for this visit.\n\n"
      : "**Absolutely** — we share the **fee** as soon as we've **confirmed your reason for visit** and whether **there's anything else** you want the doctor to address (fees follow what you're seeing them about).\n\n";
  return headEn + bridgeClosingEnglish(snippet);
}

function confirmTemplateEnglish(snippet: string): string {
  if (snippet.includes('\n')) {
    return `So we're booking to discuss:\n\n${snippet}\n\n**Is that right?** Reply **yes** to continue, or tell me what to change.`;
  }
  return `So we're booking to discuss: **${snippet}** — **is that right?** Reply **yes** to continue, or tell me what to change.`;
}

function confirmTemplateHi(snippet: string): string {
  if (snippet.includes('\n')) {
    return `Toh is visit par discuss karne ke liye:\n\n${snippet}\n\n**sahi hai?** Aage badhne ke liye **yes** likhein, ya batayein kya change karna hai.`;
  }
  return `Toh is visit par discuss karne ke liye: **${snippet}** — **sahi hai?** Aage badhne ke liye **yes** likhein, ya batayein kya change karna hai.`;
}

function confirmTemplatePa(snippet: string): string {
  if (snippet.includes('\n')) {
    return `Is visit te discuss karan layi:\n\n${snippet}\n\n**theek hai?** Agge layi **yes** likho, ya daso ki badalna hai.`;
  }
  return `Is visit te discuss karan layi: **${snippet}** — **theek hai?** Agge layi **yes** likho, ya daso ki badalna hai.`;
}

export function formatReasonFirstConfirmQuestion(userText: string, snippet: string): string {
  const loc = detectSafetyMessageLocale(userText || '');
  if (loc === 'hi') return confirmTemplateHi(snippet);
  if (loc === 'pa') return confirmTemplatePa(snippet);
  return confirmTemplateEnglish(snippet);
}

export function formatReasonFirstConfirmClarify(userText: string): string {
  const loc = detectSafetyMessageLocale(userText || '');
  if (loc === 'hi') {
    return 'Samajh gaya. **Sahi reason** ek line mein likh dein — phir main dobara confirm karunga. Aap **yes** bol sakte hain agar pehli summary theek thi.';
  }
  if (loc === 'pa') {
    return 'Samajh aa gaya. **Sahi wajah** ek line vich likho — phir dubara confirm karunga. **yes** likh sakde ho je pehli summary theek si.';
  }
  return 'Got it. Please send a **short line** with the correct reason for the visit, and I will confirm again. Or reply **yes** if the earlier summary was fine.';
}
