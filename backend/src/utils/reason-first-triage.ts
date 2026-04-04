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

export function shouldDeferIdleFeeForReasonFirstTriage(params: {
  state: ConversationState;
  text: string;
  recentMessages: { sender_type: string; content: string }[];
}): boolean {
  const { state, text, recentMessages } = params;
  if (state.reasonFirstTriagePhase) return false;
  if (userWantsExplicitFullFeeList(text)) return false;
  // This turn is about money — answer with fee copy, not reason-first ask_more.
  if (isPricingInquiryMessage(text)) return false;
  const threadClinical = recentPatientThreadHasClinicalReason(recentMessages);
  const currentClinical = userMessageSuggestsClinicalReason(text);
  const postDeflect = isRecentMedicalDeflectionWindow(state);
  return postDeflect || threadClinical || currentClinical;
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
    if (c && !parts.includes(c)) parts.push(c);
  }
  const cur = currentText.trim();
  if (cur && !parts.includes(cur)) parts.push(cur);
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
