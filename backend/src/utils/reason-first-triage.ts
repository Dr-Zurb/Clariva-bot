/**
 * e-task-dm-04: Reason-first triage — defer full fee catalog until other reasons are confirmed.
 * Detection uses generic clinical / concern cues (no per-service labels in code).
 */

import type { ConversationState } from '../types/conversation';
import { isRecentMedicalDeflectionWindow } from '../types/conversation';
import { isPricingInquiryMessage } from './consultation-fees';
import { detectSafetyMessageLocale } from './safety-messages';

/** Roman + common message cues that the user is describing a health concern (not pure pricing). */
const CLINICAL_OR_CONCERN_RE =
  /\b(blood\s*sugar|glucose|diabet|hypert|blood\s*pressure|\bbp\b|fever|temperature|pain|ache|hurt|hurts|cough|cold|flu|rash|skin|swelling|infection|symptom|nausea|vomit|dizzy|headache|migraine|chest|stomach|abdomen|loose\s*motion|constipat|uti|burning|bleed|wound|medicine|medication|dose|tablet|insulin|reading|test\s+result|lab\s+result|report|scan|x-?ray|feel\s+sick|unwell|worried\s+about|check\s+my|guide\s+me|what\s+should\s+i\s+do)\b/i;

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

/**
 * e-task-dm-05: short reply continuing a fee/payment turn (e.g. after post-medical ack) without pricing keywords.
 */
export function feeFollowUpAnaphora(userText: string, lastBotMessage: string | undefined): boolean {
  const bot = (lastBotMessage ?? '').trim();
  if (!bot || !LAST_BOT_FEE_TOPIC_RE.test(bot)) return false;
  const t = userText.trim();
  if (t.length < 2 || t.length > 96) return false;
  if (/^what\s+is\s+(it|that)\??\s*$/i.test(t)) return true;
  if (/^what'?s\s+(it|that)\??\s*$/i.test(t)) return true;
  if (/^how\s+much(\s+(is\s+it|for\s+that))?\??\s*$/i.test(t)) return true;
  if (/^(the\s+)?fee(s)?\??\s*$/i.test(t)) return true;
  if (/^kitna\??\s*$/i.test(t)) return true;
  if (/^what\s+about\s+(the\s+)?(fee|price|cost)\??\s*$/i.test(t)) return true;
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
  const t = text.trim();
  if (t.length < 3) return false;
  return AMOUNT_SEEKING_PRICING_RE.test(t);
}

/**
 * “Do I have to pay?” style — **yes/no fee existence**, not “how much?” (handled by reason-first after ack).
 */
export function isVagueConsultationPaymentExistenceQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length < 3) return false;
  if (userWantsExplicitFullFeeList(t)) return false;
  if (AMOUNT_SEEKING_PRICING_RE.test(t)) return false;
  if (!isPricingInquiryMessage(t)) return false;
  return (
    /\b(do\s+i\s+(have\s+)?(to|need\s+to)\s+pay|have\s+to\s+pay|need\s+to\s+pay|will\s+i\s+pay)\b/i.test(t) ||
    /\bso\s+i\s+have\s+to\s+pay\b/i.test(t) ||
    /\bso\s+i\s+pay\b/i.test(t) || // "oh/okay so i pay?" — existence, not amount
    /\b(is\s+there\s+(a\s+)?(fee|charge|payment)|is\s+it\s+(paid|free))\b/i.test(t) ||
    /\b(am\s+i\s+supposed\s+to\s+pay|do\s+i\s+pay)\b/i.test(t)
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
  if (userWantsExplicitFullFeeList(text)) return false;

  const threadClinical = recentPatientThreadHasClinicalReason(recentMessages);
  const currentClinical = userMessageSuggestsClinicalReason(text);
  const postDeflect = isRecentMedicalDeflectionWindow(state);
  const clinicalContext = postDeflect || threadClinical || currentClinical;

  if (!clinicalContext) {
    if (isPricingInquiryMessage(text)) return false;
    return false;
  }

  // Post-deflection / symptom-led: defer full catalog until reason-first triage + confirm.
  if (isPricingInquiryMessage(text)) {
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

const SNIPPET_MAX = 360;

/** Patient-visible summary from prior patient lines (no PHI logging here). */
export function buildConsolidatedReasonSnippetFromMessages(
  recentMessages: { sender_type: string; content: string }[],
  currentText: string
): string {
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
  let out = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (out.length > SNIPPET_MAX) out = `${out.slice(0, SNIPPET_MAX - 1).trimEnd()}…`;
  return out || 'what you shared';
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

/** After medical deflection: short “visits are paid” — **no** rupee amounts (e-task-dm-04b). */
export function formatPostMedicalPaymentExistenceAck(userText: string): string {
  const loc = detectSafetyMessageLocale(userText || '');
  const hasDe = /[\u0900-\u097F]/.test(userText || '');
  const hasPa = /[\u0A00-\u0A7F]/.test(userText || '');
  if (loc === 'hi' && !hasDe) {
    return (
      '**Haan** — doctor se **teleconsult / visit** paid hota hai. **Visit type** practice aapke concern ke hisaab **match** karti hai — chat mein fee tiers **choose** karne ki zaroorat nahi.\n\n' +
      'Jab aap **exact amount** jaanna chahein, **kitna** ya **fee kya hai** likhein — hum aapke visit reason ke hisaab se bata denge.'
    );
  }
  if (loc === 'hi' && hasDe) {
    return (
      '**हाँ** — डॉक्टर से **टेलीकंसल्ट / विज़िट** के लिए **शुल्क** लगता है। **विज़िट प्रकार** आपकी समस्या के अनुसार **प्रैक्टिस तय** करती है — चैट में फीस श्रेणी **चुनने** की ज़रूरत नहीं।\n\n' +
      'जब **सटीक राशि** जाननी हो, **कितना** या **फीस क्या है** लिखें — हम आपके विज़िट के कारण के अनुसार बताएँगे।'
    );
  }
  if (loc === 'pa' && !hasPa) {
    return (
      '**Haan ji** — doctor naal **visit / teleconsult** paid hunda hai. **Visit type** practice tere concern mutabik **match** kardi — chat vich fee tiers **chun**n di lorh nahi.\n\n' +
      'Jadon **exact paisa** pannaa hove, **kitna** ya **fee ki hai** likho — asi visit di wajah de hisaab naal dassaange.'
    );
  }
  if (loc === 'pa' && hasPa) {
    return (
      '**ਹਾਂ** — ਡਾਕਟਰ ਨਾਲ **ਵਿਜ਼ਿਟ / ਟੈਲੀਕੰਸਲਟ** ਲਈ **ਫੀਸ** ਲਗਦੀ ਹੈ। **ਵਿਜ਼ਿਟ ਟਾਈਪ** ਤੁਹਾਡੀ ਸਮਸਿਆ ਮੁਤਾਬਕ **ਪ੍ਰੈਕਟਿਸ ਤੈਅ** ਕਰਦੀ ਹੈ — ਚੈਟ ਵਿਚ ਫੀਸ **ਚੁਣੋ** ਨਹੀਂ ਕਹਿੰਦੇ।\n\n' +
      'ਜਦੋਂ **ਸਹੀ ਰਕਮ** ਚਾਹੀਦੀ ਹੋਵੇ, **kitna** ਜਾਂ **fee ki hai** ਲਿਖੋ — ਅਸੀਂ ਵਿਜ਼ਿਟ ਦੀ ਵਜ੍ਹਾ ਮੁਤਾਬਕ ਦੱਸਾਂਗੇ।'
    );
  }
  return (
    '**Yes**—**consultations with the doctor are paid.** We match what you describe to the **right visit type** — you **don’t need to pick fee options** in chat.\n\n' +
      'When you want the **exact fee**, ask **how much** or **what\'s the fee**, and we\'ll align it with what you\'re seeing the doctor for.'
  );
}

/** User asked pricing during ask_more; keep triage — no fee table until confirm. */
export function formatReasonFirstFeePatienceBridgeWhileAskMore(userText: string): string {
  const loc = detectSafetyMessageLocale(userText || '');
  const hasDe = /[\u0900-\u097F]/.test(userText || '');
  const hasPa = /[\u0A00-\u0A7F]/.test(userText || '');
  if (loc === 'hi' && !hasDe) {
    return (
      '**Haan**, yeh visit **paid** hai. Pehle confirm kar lein kya-kya discuss karna hai — phir **exact fee** aapke reason ke hisaab se bata dunga.\n\n' +
      askMoreHi()
    );
  }
  if (loc === 'pa' && !hasPa) {
    return (
      '**Haan ji**, eh visit **paid** hai. Pehla confirm kar lao ki ki-ki discuss karna hai — phir **exact fee** tere reason mutabik das ditta jaavega.\n\n' +
      askMorePa()
    );
  }
  return (
    "**Yes**—there's a **consultation fee**. I'll share the **exact amount** once we confirm what you'd like the doctor to address.\n\n" +
    askMoreEnglish()
  );
}

function confirmTemplateEnglish(snippet: string): string {
  return (
    `So we're booking to discuss: **${snippet}** — **is that right?** Reply **yes** to continue, or tell me what to change.`
  );
}

function confirmTemplateHi(snippet: string): string {
  return `Toh is visit par discuss karne ke liye: **${snippet}** — **sahi hai?** Aage badhne ke liye **yes** likhein, ya batayein kya change karna hai.`;
}

function confirmTemplatePa(snippet: string): string {
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
