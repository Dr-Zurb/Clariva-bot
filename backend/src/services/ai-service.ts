/**
 * AI Service - Intent Detection & Response Generation
 *
 * Classifies user message text into intents and generates assistive bot replies using OpenAI.
 * PHI is redacted before sending to OpenAI; only metadata is audited (COMPLIANCE.md G).
 * Framework-agnostic: no Express; controllers call this service and use asyncHandler.
 */

import { getOpenAIClient, getOpenAIConfig } from '../config/openai';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type {
  IntentDetectionResult,
  Intent,
  IntentTopic,
  CommentIntentDetectionResult,
} from '../types/ai';
import { toIntent, toCommentIntent, isIntentTopic, isPricingSignalKind } from '../types/ai';
import { isRecentMedicalDeflectionWindow, type ConversationState } from '../types/conversation';
import type { Message } from '../types';
import type { AIResponseWithActions, ToolCallFromAI } from '../types/system-actions';
import { logAIClassification, logAIResponseGeneration, logAuditEvent } from '../utils/audit-logger';
import {
  parseConsentReply,
  type ConsentParseResult,
} from './consent-service';
import type { CollectedPatientData } from '../utils/validation';
import {
  isConsultationTypePricingFollowUp,
  isPricingInquiryMessage,
  userExplicitlyWantsToBookNow,
} from '../utils/consultation-fees';
import {
  lastBotDiscussesFeesTopic,
  collectPatientReasonPartsForTriage,
  formatVisitReasonItemsForSnippet,
  truncateReasonSnippetToMax,
  buildConsolidatedReasonSnippetFromMessages,
  parseNothingElseOrSameOnly,
} from '../utils/reason-first-triage';
import {
  assistantMessageIsEmergencyEscalationCopy,
  EMERGENCY_RESPONSE_EN,
  isEmergencyUserMessage,
  MEDICAL_QUERY_RESPONSE_EN,
  messageHasHypertensiveCrisisBloodPressureReading,
  recentThreadHasAssistantEmergencyEscalation,
} from '../utils/safety-messages';
import { POST_MEDICAL_PAYMENT_EXISTENCE_ACK_CANONICAL_EN } from '../utils/post-medical-ack-copy';
import {
  isOptionalExtrasConsentPrompt,
  isSkipExtrasReply,
} from '../utils/booking-consent-context';
import { BOOKING_RELATION_KIN_PATTERN } from '../utils/booking-relation-terms';

// ============================================================================
// Constants
// ============================================================================

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

/** RBH-12: Intent output is small JSON; lower cap reduces generation latency vs full DM max_tokens. */
const INTENT_CLASSIFICATION_MAX_COMPLETION_TOKENS = 140;

/** Booking consent / detail-confirm classifiers — same small JSON shape. */
const BOOKING_TURN_CLASSIFICATION_MAX_COMPLETION_TOKENS = 160;

/** In-memory cache TTL (ms). Key = redacted text; cache hit = no OpenAI call, no audit. */
const INTENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
/** Max cache entries; evict oldest when full (Map insertion order). */
const INTENT_CACHE_MAX_SIZE = 500;
/**
 * RBH-18 + e-task-dm-06: bump prefix when classifier JSON schema changes (invalidates stale cache entries).
 * **Contract:** Entries apply only when `classifyIntent` does **not** set `skipIntentCache` (no thread / goal
 * context). When context is present, cache is skipped — same text can mean different intents per thread.
 */
const INTENT_CACHE_KEY_PREFIX = 'rbh18dm06:';

interface CacheEntry {
  result: IntentDetectionResult;
  expiresAt: number;
}

/** In-memory cache for intent by redacted input. Per-process; not shared across instances. */
const intentCache = new Map<string, CacheEntry>();

function getCachedIntent(redactedText: string): IntentDetectionResult | null {
  const key = INTENT_CACHE_KEY_PREFIX + redactedText;
  const entry = intentCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) intentCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCachedIntent(redactedText: string, result: IntentDetectionResult): void {
  if (intentCache.size >= INTENT_CACHE_MAX_SIZE) {
    const firstKey = intentCache.keys().next().value;
    if (firstKey !== undefined) intentCache.delete(firstKey);
  }
  intentCache.set(INTENT_CACHE_KEY_PREFIX + redactedText, {
    result,
    expiresAt: Date.now() + INTENT_CACHE_TTL_MS,
  });
}

/** Comment intent cache (separate from DM intent cache). */
const commentIntentCache = new Map<string, { result: CommentIntentDetectionResult; expiresAt: number }>();

function getCachedCommentIntent(redactedText: string): CommentIntentDetectionResult | null {
  const entry = commentIntentCache.get(redactedText);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) commentIntentCache.delete(redactedText);
    return null;
  }
  return entry.result;
}

function setCachedCommentIntent(redactedText: string, result: CommentIntentDetectionResult): void {
  if (commentIntentCache.size >= INTENT_CACHE_MAX_SIZE) {
    const firstKey = commentIntentCache.keys().next().value;
    if (firstKey !== undefined) commentIntentCache.delete(firstKey);
  }
  commentIntentCache.set(redactedText, {
    result,
    expiresAt: Date.now() + INTENT_CACHE_TTL_MS,
  });
}

// ============================================================================
// Deterministic Intent Rules (before AI) - e-task-1 receptionist conversation rules
// ============================================================================
//
// **Philosophy (AI_BOT_BUILDING_PHILOSOPHY.md §5):** These shortcuts are intentional:
// - **Latency / safety:** `isEmergencyUserMessage`, simple greeting regex — keep bounded.
// - **Product / closed menu:** `isBookForSomeoneElse`, `isCheckAppointmentStatus` — fast paths for clear UX.
// - **Kin phrasing:** terms live in `booking-relation-terms.ts`; for wording not in the list, use
//   `resolveBookingTargetRelationForDm` (LLM) when `BOOKING_RELATION_LLM_ENABLED` — do not grow regex lists
//   for every new kin term without product sign-off.
//
// ============================================================================

/** Simple greetings only (no mixed content). Match → greeting, skip AI. */
const SIMPLE_GREETING_REGEX = /^(hi|hello|hey|hiya|howdy|namaste|नमस्ते|good\s*morning|good\s*afternoon|good\s*evening|good\s*day)[\s!?.]*$/i;

/** e-task-4: Multi-person "me and my X". Must run before BOOK_FOR_SOMEONE_ELSE. */
const MULTI_PERSON_BOOKING_REGEX = new RegExp(
  '\\b(?:book|schedule|appointment|want\\s+to\\s+book)\\s+(?:an?\\s+)?(?:appointment\\s+)?(?:for\\s+)?(?:me|myself|us)\\s+and\\s+(?:my\\s+)?(' +
    BOOKING_RELATION_KIN_PATTERN +
    ')\\b',
  'i'
);

/** Book for someone else (e.g. "book for my mother/sister"). Match → book_for_someone_else. */
const BOOK_FOR_SOMEONE_ELSE_REGEX = new RegExp(
  '\\b(book|schedule|appointment|want\\s+to\\s+book)\\s+(?:an?\\s+)?(?:appointment\\s+)?(?:for\\s+)?(?:my\\s+)?(' +
    BOOKING_RELATION_KIN_PATTERN +
    '|someone\\s+else|them)\\b',
  'i'
);

/** Payment done / check appointment status. Match → check_appointment_status. */
const CHECK_APPOINTMENT_REGEX =
  /\b(payment\s+done|paid|i\s+just\s+paid|what\s+about\s+(?:my\s+)?payment|check\s+my\s+(?:appointment|details)|is\s+it\s+confirmed|appointment\s+confirmed|did\s+payment\s+go\s+through)\b/i;

function isBookForSomeoneElse(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 120) return false;
  return MULTI_PERSON_BOOKING_REGEX.test(trimmed) || BOOK_FOR_SOMEONE_ELSE_REGEX.test(trimmed);
}

/**
 * e-task-4: Parse "book for me and my X" - returns relation when multi-person, null otherwise.
 * Use in webhook to distinguish multi-person from single-person book_for_someone_else.
 */
export function parseMultiPersonBooking(text: string): { relation: string } | null {
  const trimmed = text.trim();
  if (trimmed.length > 120) return null;
  const match = trimmed.match(MULTI_PERSON_BOOKING_REGEX);
  if (!match) return null;
  return { relation: match[1]!.toLowerCase() };
}

const BOOKING_RELATION_KEYWORD_RE = new RegExp(
  '\\b(?:my\\s+)?(' + BOOKING_RELATION_KIN_PATTERN + ')\\b',
  'i'
);

/**
 * Deterministic kin/role capture for book_for_someone_else copy ("your mother").
 * Does not match "someone else" / bare "them" — handler treats those separately.
 */
export function extractBookForSomeoneElseRelationKeyword(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length > 200) return null;
  const m = trimmed.match(BOOKING_RELATION_KEYWORD_RE);
  return m ? m[1]!.toLowerCase() : null;
}

const BOOKING_RELATION_LLM_SYSTEM = `The user is booking a medical appointment on behalf of another person.
Extract who the appointment is for. Output JSON only, no markdown.
Schema: {"relation_en": string | null}

Rules:
- relation_en: short English in lowercase (one or two words): e.g. mother, father, grandmother, child, friend, boss, cousin, nani.
- Use common equivalents (mom -> mother, dad -> father) when obvious from context.
- null if you cannot tell a specific role/person from the message (e.g. only "book for someone" with no detail).

Never include diagnoses or symptoms. Never echo phone numbers or emails.`;

const BOOKING_RELATION_LLM_MAX_TOKENS = 120;

function parseBookingRelationJson(content: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const raw = (parsed as { relation_en?: unknown }).relation_en;
  if (raw === null) return null;
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/\s+/g, ' ').trim().toLowerCase();
  if (t.length < 2 || t.length > 48) return null;
  if (/[0-9=@]/.test(t)) return null;
  return t;
}

/**
 * LLM fallback for relation label when keyword lists miss the phrasing (Hinglish, rare kin terms).
 * Returns null when disabled, on failure, or when unclear.
 */
export async function resolveBookingTargetRelationForDm(
  messageText: string,
  correlationId: string
): Promise<string | null> {
  if (!env.BOOKING_RELATION_LLM_ENABLED) {
    return null;
  }
  const trimmed = messageText.trim();
  if (trimmed.length < 6 || trimmed.length > 280) {
    return null;
  }
  const client = getOpenAIClient();
  const config = getOpenAIConfig();
  if (!client) {
    return null;
  }

  const redacted = redactPhiForAI(trimmed);
  if (redacted.trim().length < 6) {
    return null;
  }

  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      max_completion_tokens: BOOKING_RELATION_LLM_MAX_TOKENS,
      temperature: 0.1,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: BOOKING_RELATION_LLM_SYSTEM },
        { role: 'user', content: redacted },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    const usage = completion.usage;
    if (!raw?.trim()) {
      await logAIClassification({
        correlationId,
        model: config.model,
        redactionApplied: true,
        status: 'failure',
        tokens: usage?.total_tokens,
        errorMessage: 'booking_relation_empty_completion',
      });
      return null;
    }
    const relation = parseBookingRelationJson(raw);
    if (!relation) {
      await logAIClassification({
        correlationId,
        model: config.model,
        redactionApplied: true,
        status: 'failure',
        tokens: usage?.total_tokens,
        errorMessage: 'booking_relation_invalid_json',
      });
      return null;
    }
    await logAIClassification({
      correlationId,
      model: config.model,
      redactionApplied: true,
      status: 'success',
      tokens: usage?.total_tokens,
    });
    return relation;
  } catch (err) {
    logger.warn({ correlationId, err }, 'booking_relation_llm_failed');
    await logAIClassification({
      correlationId,
      model: config.model,
      redactionApplied: true,
      status: 'failure',
      errorMessage: err instanceof Error ? err.message : 'request_failed',
    });
    return null;
  }
}

function isCheckAppointmentStatus(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 100) return false;
  return CHECK_APPOINTMENT_REGEX.test(trimmed);
}

function isSimpleGreeting(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 50) return false; // Long messages are not simple greetings
  return SIMPLE_GREETING_REGEX.test(trimmed);
}

/** Fixed English response for medical_query (RBH-15: use `resolveSafetyMessage` in DM for localized copy). */
export const MEDICAL_QUERY_RESPONSE = MEDICAL_QUERY_RESPONSE_EN;

/** Fixed English emergency line (RBH-15: use `resolveSafetyMessage` in DM for localized copy). */
export const EMERGENCY_RESPONSE = EMERGENCY_RESPONSE_EN;

// ============================================================================
// AI Prompts
// ============================================================================

const SYSTEM_PROMPT = `You are a medical receptionist intent classifier. Classify the user message into exactly one intent. Do not diagnose or give clinical advice.
Classify intent regardless of language. User may write in English, Hindi, Hinglish, or transliterated Hindi.

Valid intents: book_appointment, book_for_someone_else, ask_question, check_availability, greeting, cancel_appointment, reschedule_appointment, revoke_consent, medical_query, emergency, check_appointment_status, unknown.

Intent rules:
- greeting: Use when message is ONLY a greeting with no explicit request (e.g. "hello", "hi", "good morning"). NEVER classify simple greetings as book_appointment.
- book_for_someone_else: Use when user wants to book for ANOTHER person (e.g. "book for my mother", "schedule appointment for my wife", "I want to book for my dad", "book for someone else").
- book_appointment: Use when user explicitly asks to book for THEMSELVES (e.g. "book", "schedule", "I want an appointment", "can I book"). NOT when they say "for my mother" etc.
- medical_query: User describes symptoms, asks for advice, **or** (with **thread context**) a situation that is **not** an **immediate** EMS/hospital crisis **right now** — e.g. **follow-up after** a crisis was discussed, **improved or controlled** vitals, **stable** state, routine guidance, booking/fees, or non–acute readings. Use **conversation history** to tell **past** vs **present** vs **resolved**.
- emergency: **Immediate** EMS/hospital crisis **in the current situation** (acute symptoms, severe danger, **or** life-threatening vitals such as **hypertensive crisis–level BP** when that is what the patient is **currently** reporting as their state). **You must interpret the full thread:** e.g. first message "BP 200/100 this morning" may be **emergency**; a **later** message "I'm stable now, 150/90" means the **current** situation is **not** an ongoing same-turn crisis → **medical_query** (safe to move toward teleconsult/booking), **not** emergency. If the **latest** vitals in the **current** message are clearly **below** common crisis thresholds and the user describes **stability/improvement**, prefer **medical_query**. If **[Assistant_context]** says 112/108 was already sent and the patient **only** reports **non-crisis** readings or stability — **medical_query**, not emergency — unless **new** acute crisis wording or **new** crisis-level vitals appear in the **current** message.
- ask_question: General questions (price, timings, location, consultation type). Answer from practice info. Use ask_question for fee/pricing/cost questions even if the user mentions "consultation" or "appointment" without clearly asking to schedule (e.g. "how much is consultation fee", "what are your charges").
- revoke_consent: User wants to delete data or revoke consent (e.g. "delete my data", "revoke consent").
- check_appointment_status: User asks if appointment is confirmed, when is visit.
- unknown: Spam, vulgar, meaningless, or unclear. Polite deflection.

After the user asked about fees/pricing, a short follow-up like "general consultation" or "video consult" is still ask_question (clarifying visit type / pricing), NOT book_appointment, unless they clearly ask to book (e.g. "book appointment", "schedule me").

Examples: "hello" → greeting; "book appointment" → book_appointment; "book for my mother" → book_for_someone_else; "I have fever" → medical_query; "chest pain" → emergency; "my BP was 200/100 earlier today" (no prior context) → emergency; after that thread, "I'm stable now BP 150/90" → medical_query; "how much is the consultation fee" → ask_question; "general consultation" (right after a fee discussion) → ask_question.

Multi-turn input: You may receive a [Conversation context] block and/or "Recent conversation (redacted)" lines followed by "Current user message:". **Situational assessment is required:** use prior turns to decide whether the patient describes an **ongoing emergency now** vs **recovery/stability** vs **routine** questions — not keyword matching alone. Classify **only** the current user message, but **ground** it in the thread (e.g. after a fee reply, "general consultation please" → ask_question, not book_appointment). If **[Assistant_context]** says the assistant already sent an emergency escalation (112/108), and the patient **only** updates with **improved/non-crisis** vitals, says they are stable, or seeks booking/guidance without new acute crisis — classify **medical_query**, not emergency, unless they add **new** acute crisis symptoms or **new** crisis-level vitals in the **current** message.

Respond with a single JSON object (required keys):
- "intent": one of the valid intent strings
- "confidence": number from 0.0 to 1.0
- "topics": array (may be empty) of zero or more of exactly these strings: "pricing", "hours", "location", "booking_howto"
  - Include "pricing" when the user asks about cost, fees, charges, money, payment, insurance, cash, card, discount, "kitna"/"kitne" in a money sense, paise, rupaye, consultation/visit/video/phone/online appointment price, etc., in **any** language.
  - "hours" = opening times / when open / availability in general; "location" = address / where / directions; "booking_howto" = how to book / process (not asking to book right now).
- "is_fee_question": boolean — true if the message is partly or wholly asking what they pay / fee amount / price to consult or book; false otherwise. If "pricing" is in topics, set this to true.
- "pricing_signal": exactly one of: "amount_seeking", "payment_existence", "generic_fee_interest", "none"
  - "amount_seeking": they want a **number/rate** (how much, exact fee, kitna in money sense, breakdown).
  - "payment_existence": **whether** payment applies / is it paid / is there a charge — **not** primarily asking for the amount.
  - "generic_fee_interest": fee/pricing/money topic without a clear amount vs existence split.
  - "none": not about fees/payment/pricing **unless** other keys already set pricing (then prefer the more specific signal).
- "fee_thread_continuation": boolean — true only if conversation context shows the assistant was discussing fees/pricing and the current message is a **short follow-up** in that thread (e.g. clarifying visit type, "what about video", anaphoric "how much is it"); false otherwise.
- "reason_first_done_adding": boolean — true only when the assistant asked whether **anything else** should be addressed at the visit (or similar) **before sharing the fee**, and the user is **only** signaling they are finished listing concerns — no new symptoms, no amount-seeking fee question. Natural paraphrases: "that's it", "thats it thanks", "nothing else", "I'm good", "nahi aur", "bas", "all set". false when they add symptoms, ask how much the fee is, or ask a new pricing question. **If true, set "fee_thread_continuation" to false** (wrap-up overrides fee-thread continuation).

Example: {"intent":"ask_question","confidence":0.92,"topics":["pricing"],"is_fee_question":true,"pricing_signal":"amount_seeking","fee_thread_continuation":false,"reason_first_done_adding":false}

Use "unknown" for intent only when the message does not clearly match any other intent.`;

/** e-task-6: Comment intent classifier. Short comments (1-20 words), emojis, @mentions, mixed language. */
const COMMENT_INTENT_SYSTEM_PROMPT = `You are an intent classifier for Instagram post comments on a medical practice's posts. Classify each comment into exactly one intent. Comments are short (1-20 words), may have emojis, @mentions, typos, and mixed language (English, Hindi, Hinglish).

Valid intents: book_appointment, check_availability, pricing_inquiry, general_inquiry, medical_query, greeting, praise, spam, joke, unrelated, vulgar, other.

HIGH-INTENT (genuine medical/practice interest): book_appointment, check_availability, pricing_inquiry, general_inquiry, medical_query
- book_appointment: Directly asking to book or schedule ("how to book?", "book me", "schedule appointment", "want to book")
- check_availability: Asking about slots, timing ("available tomorrow?", "any slots?", "when can I come?")
- pricing_inquiry: Asking about cost, fees ("price?", "how much?", "consultation fees?")
- general_inquiry: General questions about practice or doctor ("more info?", "interested", "tell me more", "how does it work?")
- medical_query: User shares symptoms or medical concern ("I have stomach pain", "pain in stomach", "i have pain in stomach", "suffering from diabetes", "my mother has fever", "headache for 3 days"). Symptom phrases (pain, ache, fever, etc.) are medical_query, NOT spam.

LOW-INTENT: greeting, praise, other
- greeting: Just hi/hello with no inquiry ("hi", "hello")
- praise: Pure compliments, no question ("great post!", "helpful", "👍")
- other: Unclear or borderline; not clearly high-intent or skip

SKIP (never reply or store): spam, joke, unrelated, vulgar
- spam: Promotional, bots, links ("DM for deals", "check out my page", link spam). NOT symptom-sharing - "pain", "ache", "fever" = medical_query.
- joke: Humor, puns, memes ("lol", "haha", "😂", sarcastic jokes)
- unrelated: Off-topic ("follow for follow", "check my profile", random topics)
- vulgar: Profanity, insults, harassment

Classify intent regardless of language. Handle emojis and @mentions - "interested 👍" = general_inquiry; "lol" = joke.
When uncertain, prefer "other" over falsely classifying as high-intent. Err on the side of not replying.

Respond with a single JSON object: { "intent": "<one of the valid intents>", "confidence": <number 0.0 to 1.0> }.`;

/** Base receptionist system prompt (e-task-3). Practice name injected dynamically (e-task-4). e-task-2: Acknowledge, relation, conversational tone. */
const RESPONSE_SYSTEM_PROMPT_BASE = `You are a warm, friendly medical practice receptionist. You help with scheduling and general questions. You do NOT diagnose or give medical advice.

HOW YOU WORK (architecture): You are the conversational layer — understand any human language or mix (English, Hindi, Hinglish, transliteration, casual spelling). No rigid keyword rules are needed for language choice: mirror the user's style. For FACTS about this practice (fees, hours, location, cancellation rules, consultation types), use ONLY the "Practice info" and "SYSTEM FACTS — FEES" blocks injected into this prompt from our live database. Those blocks are the source of truth. Never contradict them. Never tell the patient that fee or pricing information is "not in the system", "not visible", or "missing" when those blocks list an amount or note. If a block is empty for a detail, say the clinic can confirm — do not invent rupee amounts.

LANGUAGE: Respond in the SAME language the user writes in. If they write in Hindi, Hinglish, or Hindi written in English (e.g. "kya aap available ho", "yar kitne paise", "goli bata do"), respond in that same Roman Hindi / Hinglish style—not formal English—unless their message is clearly English-only. If they use Devanagari Hindi, reply in Devanagari. Match their tone and script. STABILITY: If the conversation has been in clear English so far, stay in English—do not switch to Hinglish for flair, for the practice name, or because of fee keywords. Only mirror Hinglish when the user's actual messages use it.

GREETING: When currentIntent is greeting, greet back warmly, introduce yourself as the practice's assistant, and ask how you can help (e.g. book appointment, check availability, ask a question). Do NOT start collecting name, phone, or other booking details on greeting alone.

IMPORTANT - Our booking flow collects: full name, age, gender, phone number, reason for visit (required); email (optional). Then we confirm details, get consent, and show a link to pick a slot. Keep replies brief and natural.

CRITICAL - When currentIntent is book_appointment, the user has ALREADY chosen to book. NEVER ask "would you like to book or ask a question?" - go straight to the current step. Never repeat that choice prompt. If state shows collecting_all, ALWAYS ask for ALL fields at once (full name, age, gender, mobile, reason for visit; email optional). NEVER ask for one field, wait for reply, then ask for the next - that wastes time. If the user asks "what's YOUR name" (to the bot), say you're the practice's assistant and ask for THEIR details - one brief reply only.

NEVER ask "what date/time?" or "share two date/time options" - we use a slot-selection flow. When we need date/time, the system shows numbered slots; the user picks 1, 2, 3. Your job is only to collect name, phone, or handle consent/other questions.

CRITICAL - NEVER output placeholder text like "[Slot selection link]", "[link]", or "**[Slot selection link]**". The system injects the real URL when needed. You do not have access to it. If you mention a link, do not invent one - the system handles it.

CRITICAL - When state shows collecting_all or confirm_details with collectedFields, the user has ALREADY shared details. NEVER repeat "Please share: Full name, Age, Mobile, Reason for visit". Acknowledge what they said, ask for missing fields only, or move to confirmation. If they refine the reason (e.g. "i wanna get her checked for diabetes"), treat it as updating the reason - do NOT start over.

VISIT TYPE / PRICING — Do **not** ask the patient to **choose between two or more priced consultation categories** (e.g. different teleconsult service rows or fee tiers) when their reasons could reasonably fit **more than one** category (for example chronic/metabolic concerns together with acute symptoms). The clinic assigns the correct visit type. Do not present side-by-side fee menus for competing categories so the patient can pick the cheaper option—defer to staff confirmation when ambiguous.

ACKNOWLEDGE FIRST - ALWAYS acknowledge what the user just said before asking for more. Examples: "Got it, your sister." / "Thanks for clarifying." / "Understood." Do not repeat the same prompt verbatim when the user has already responded.

RELATION - When Context says "Booking for user's [relation]" (e.g. sister, mother), use the relation in your reply. Say "your sister" or "for your mother" not "them" when known. When the user clarifies (e.g. "my sister?", "sister first"), acknowledge the clarification and continue with the flow. Do not start over.

TONE - Be warm and natural. Match the user's energy. Avoid robotic repetition. When step is collecting_all, ALWAYS ask for ALL required fields at once - never one by one. Do not repeat the same prompt verbatim when the user has already responded. If the user asks something outside your role, politely suggest they speak with the practice.`;

/** Safe fallback when response generation fails (no PHI, no medical advice). */
const FALLBACK_RESPONSE =
  "I didn't quite get that. Could you rephrase? Or say 'book appointment', 'check availability', 'cancel appointment', or 'reschedule appointment' if that's what you need.";

/** e-task-5: Max message pairs (user+assistant) for AI context. Trade-off: more context vs token cost. */
const MAX_HISTORY_PAIRS = env.AI_MAX_HISTORY_PAIRS;

/** Exported for webhook: fetch at least 2 * MAX_HISTORY_PAIRS messages. */
export const AI_RECENT_MESSAGES_LIMIT = MAX_HISTORY_PAIRS * 2;

// ============================================================================
// PHI Redaction (COMPLIANCE.md G - redact before sending to OpenAI)
// ============================================================================

/**
 * Redacts PHI from text before sending to OpenAI.
 * Replaces email and phone patterns with placeholders. No raw PHI in prompts.
 */
export function redactPhiForAI(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let out = text;
  // Email (simple pattern)
  out = out.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi,
    '[REDACTED_EMAIL]'
  );
  // US/international phone: digits with optional spaces/dots/dashes/parens
  out = out.replace(
    /(\+?1?[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    '[REDACTED_PHONE]'
  );
  return out;
}

function normalizeIntentAuxFields(
  parsed: Record<string, unknown>
): Pick<IntentDetectionResult, 'topics' | 'is_fee_question'> {
  const topics: IntentTopic[] = [];
  if (Array.isArray(parsed.topics)) {
    for (const x of parsed.topics) {
      if (typeof x === 'string' && isIntentTopic(x)) topics.push(x);
    }
  }
  let isFee = parsed.is_fee_question === true;
  if (!isFee && topics.includes('pricing')) isFee = true;

  const out: Pick<IntentDetectionResult, 'topics' | 'is_fee_question'> = {};
  if (topics.length > 0) out.topics = topics;
  if (isFee) out.is_fee_question = true;
  else if (parsed.is_fee_question === false) out.is_fee_question = false;
  return out;
}

/** e-task-dm-06: optional structured pricing sub-signals from model JSON (backward compatible if omitted). */
function mergeClassifierPricingSubsignals(
  parsed: Record<string, unknown>,
  base: IntentDetectionResult
): void {
  const raw = parsed.pricing_signal;
  if (typeof raw === 'string' && isPricingSignalKind(raw)) {
    base.pricing_signal_kind = raw;
    if (raw !== 'none') {
      base.is_fee_question = true;
      const topicSet = new Set(base.topics ?? []);
      topicSet.add('pricing');
      base.topics = [...topicSet];
    }
  }
  if (parsed.fee_thread_continuation === true) {
    base.fee_thread_continuation = true;
  }
  if (parsed.reason_first_done_adding === true) {
    base.reason_first_done_adding = true;
    base.fee_thread_continuation = false;
  }
}

function pricingSubsignalConfidenceTrusted(confidence: number): boolean {
  return confidence >= env.DM_CLASSIFIER_PRICING_SIGNAL_MIN_CONFIDENCE;
}

/** e-task-dm-06: trusted classifier — user asking if payment/fee applies (yes/no), not amount. */
export function classifierSignalsPaymentExistence(result: IntentDetectionResult): boolean {
  return (
    pricingSubsignalConfidenceTrusted(result.confidence) &&
    result.pricing_signal_kind === 'payment_existence'
  );
}

/** e-task-dm-06: trusted classifier — user wants amount/rate. */
export function classifierSignalsAmountSeeking(result: IntentDetectionResult): boolean {
  return (
    pricingSubsignalConfidenceTrusted(result.confidence) &&
    result.pricing_signal_kind === 'amount_seeking'
  );
}

/**
 * e-task-dm-06: model judges short fee-thread follow-up; requires recent bot line about fees (no orphan triggers).
 */
export function classifierSignalsFeeThreadContinuation(
  result: IntentDetectionResult,
  lastBotMessage: string | undefined
): boolean {
  if (!pricingSubsignalConfidenceTrusted(result.confidence) || result.fee_thread_continuation !== true) {
    return false;
  }
  return lastBotDiscussesFeesTopic(lastBotMessage);
}

/**
 * e-task-dm-07: Classifier says user finished listing concerns before fee (trusted confidence).
 */
export function classifierSignalsReasonFirstDoneAdding(result: IntentDetectionResult): boolean {
  return (
    pricingSubsignalConfidenceTrusted(result.confidence) &&
    result.reason_first_done_adding === true
  );
}

/**
 * Wrap-up before fee: structured classifier and/or closed regex fallback (see reason-first-triage).
 */
export function userSignalsReasonFirstWrapUp(text: string, result: IntentDetectionResult): boolean {
  return parseNothingElseOrSameOnly(text) || classifierSignalsReasonFirstDoneAdding(result);
}

/**
 * RBH-18: Use classifier topics / is_fee_question first; fall back to keyword helper when missing
 * (e.g. cache hit from older process, or edge parser omission).
 */
export function intentSignalsFeeOrPricing(
  result: IntentDetectionResult,
  messageText: string
): boolean {
  if (result.is_fee_question === true) return true;
  if (result.topics?.includes('pricing')) return true;
  if (isPricingInquiryMessage(messageText)) {
    logger.debug(
      {
        intent_fee_pricing_keyword_fallback: true,
        intent: result.intent,
        has_topics: Boolean(result.topics?.length),
      },
      'intentSignalsFeeOrPricing: keyword fallback (classifier omitted fee flags)'
    );
    return true;
  }
  return false;
}

/**
 * Clamps a number to [0, 1]. Returns 0 for NaN.
 */
function clampConfidence(n: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** e-task-6 + AI Receptionist: Prompt for AI-assisted field extraction. No PHI in prompt.
 * Phone/email appear as [REDACTED_PHONE]/[REDACTED_EMAIL] - we extract those separately. Focus on name, age, gender, reason. */
const EXTRACTION_SYSTEM_PROMPT = `You are a smart extractor for patient booking. Understand context and natural language. Extract patient fields from the user's message.

Valid fields to extract: name, age, gender, reason_for_visit.
- name: Person's full name only. "Ramesh Masih 60 Y M" → name is "Ramesh Masih" (60 Y M = age+gender, not part of name).
- age: Number 1-120. "60 Y M" or "60 years male" → age is 60.
- gender: male, female, or other. "60 Y M" or "M" → male; "60 Y F" → female.
- reason_for_visit: Chief complaint, symptom, or reason. "diabetic checkup", "stomach pain", "get her checked for diabetes" → extract as reason. NEVER use name/age/gender as reason.
- Medication / intake phrases ("i took amlodipine", "i have metformin", "started taking X") → reason_for_visit (clinical reason), NOT name.
- NEVER set reason_for_visit for meta questions about fees, price, or how to book (e.g. "how much is consultation", "what is the fee", "how do I book") - return {} for those.
- Pure confirmations ("yes confirm that", "yes that's correct", "correct", "ok") contain NO new patient fields — return {}.

IGNORE: [REDACTED_PHONE] and [REDACTED_EMAIL] - we extract those separately. Do not include phone or email in your output.

CRITICAL - Use conversation context: If we asked for a specific field (e.g. gender) and the user said "he is my father he is male obviously", extract ONLY gender. Do NOT use relationship/gender clarifications as name or reason.
If the message says "i wanna get her checked for diabetes", extract reason_for_visit, NOT name.
Return empty object {} if nothing can be extracted. Output format: { "name": "...", "age": N, "gender": "...", "reason_for_visit": "..." } with only the fields you found.`;

/** AI Receptionist: Context for conversation-aware extraction. No PHI. */
export interface ExtractionContext {
  lastBotMessage?: string;
  missingFields: string[];
  collectedSummary?: string;
  relation?: string;
  recentTurns?: { role: 'user' | 'assistant'; content: string }[];
}

/**
 * e-task-6 + AI Receptionist: AI-assisted extraction. Redacted input only; output is PHI - store only, never log.
 * When context is provided, AI uses it to understand (e.g. "we asked for gender" → extract only gender).
 * On failure returns {}; caller merges with existing and validates.
 */
export async function extractFieldsWithAI(
  redactedText: string,
  missingFields: string[],
  correlationId: string,
  context?: Partial<ExtractionContext>
): Promise<Partial<CollectedPatientData>> {
  const client = getOpenAIClient();
  const config = getOpenAIConfig();
  if (!client || !redactedText?.trim()) {
    return {};
  }

  const lastBotMessage = context?.lastBotMessage?.trim();
  const collectedSummary = context?.collectedSummary?.trim();
  const relation = context?.relation?.trim();
  const recentTurns = context?.recentTurns;

  const parts: string[] = [];
  if (collectedSummary) parts.push(`We have: ${collectedSummary}.`);
  parts.push(`Still need: ${missingFields.length ? missingFields.join(', ') : 'none'}.`);
  if (lastBotMessage && missingFields.length > 0) {
    parts.push(`Last thing we asked: "${lastBotMessage.slice(0, 200)}".`);
  }
  if (relation) parts.push(`Booking for user's ${relation}.`);
  if (recentTurns && recentTurns.length > 0) {
    const turnsStr = recentTurns
      .slice(-4)
      .map((t) => `${t.role}: "${t.content.slice(0, 80)}${t.content.length > 80 ? '...' : ''}"`)
      .join('; ');
    parts.push(`Recent exchange: ${turnsStr}.`);
  }
  parts.push(`Extract only fields relevant to what we asked. If we asked for gender and they gave a long reply, extract only gender.`);

  const userPrompt = `Message: "${redactedText.trim()}"

${parts.join(' ')}

Return JSON only.`;

  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      max_completion_tokens: 256,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    const content = completion.choices[0]?.message?.content?.trim();
    const usage = completion.usage;

    if (!content) {
      await logAuditEvent({
        correlationId,
        action: 'ai_extraction',
        resourceType: 'ai',
        status: 'failure',
        errorMessage: 'empty_completion',
        metadata: { model: config.model, redactionApplied: true },
      });
      return {};
    }

    const parsed = JSON.parse(content) as Record<string, unknown>;
    const result: Partial<CollectedPatientData> = {};

    if (typeof parsed.name === 'string' && parsed.name.trim().length >= 2) {
      const name = parsed.name.trim();
      if (!/^\s*(i\s+have|i\s+took|i've\s+got|she\s+has|he\s+has|having|suffering)\b/i.test(name)) {
        result.name = name;
      }
    }
    if (typeof parsed.phone === 'string' && /^\d{10,15}$/.test(parsed.phone.replace(/\D/g, ''))) {
      result.phone = parsed.phone.replace(/\D/g, '').slice(-10);
    }
    if (typeof parsed.age === 'number' && parsed.age >= 1 && parsed.age <= 120) {
      result.age = parsed.age;
    }
    if (typeof parsed.gender === 'string' && ['male', 'female', 'other'].includes(parsed.gender.toLowerCase())) {
      result.gender = parsed.gender.toLowerCase();
    }
    if (typeof parsed.reason_for_visit === 'string' && parsed.reason_for_visit.trim().length >= 2) {
      result.reason_for_visit = parsed.reason_for_visit.trim().slice(0, 500);
    }
    if (typeof parsed.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.email.trim())) {
      result.email = parsed.email.trim().toLowerCase();
    }

    await logAuditEvent({
      correlationId,
      action: 'ai_extraction',
      resourceType: 'ai',
      status: 'success',
      metadata: {
        model: config.model,
        redactionApplied: true,
        extractedFields: Object.keys(result),
        tokens: usage?.total_tokens,
      },
    });

    return result;
  } catch (err) {
    logger.warn(
      { correlationId, error: err instanceof Error ? err.message : String(err) },
      'AI extraction failed; returning empty'
    );
    await logAuditEvent({
      correlationId,
      action: 'ai_extraction',
      resourceType: 'ai',
      status: 'failure',
      errorMessage: 'extraction_failed',
      metadata: { model: config.model, redactionApplied: true },
    });
    return {};
  }
}

// ============================================================================
// RBH-14: Context-aware intent classification (multi-turn, fee thread)
// ============================================================================

/** Optional dialogue context - all strings must already be PHI-redacted. */
export interface ClassifyIntentContext {
  /** assistant | user turns, oldest first */
  recentTurns?: { role: 'user' | 'assistant'; content: string }[];
  /** Active sub-flow from conversation metadata */
  conversationGoal?: 'fee_quote' | 'post_medical_deflection' | 'reason_first_triage';
}

const CLASSIFY_INTENT_MAX_PRIOR_TURNS = 6;
const CLASSIFY_INTENT_MAX_CHARS_PER_TURN = 450;

/**
 * Build redacted, capped prior turns + optional fee-thread hint for `classifyIntent`.
 */
export function buildClassifyIntentContext(
  state: ConversationState,
  recentMessages: { sender_type: string; content: string }[],
  options?: { maxTurns?: number }
): ClassifyIntentContext | undefined {
  const maxTurns = options?.maxTurns ?? CLASSIFY_INTENT_MAX_PRIOR_TURNS;
  const reasonFirst = state.reasonFirstTriagePhase !== undefined;
  const feeThread =
    state.activeFlow === 'fee_quote' || state.lastPromptKind === 'fee_quote';
  const postMedical = !feeThread && !reasonFirst && isRecentMedicalDeflectionWindow(state);
  const conversationGoal = reasonFirst
    ? ('reason_first_triage' as const)
    : feeThread
      ? ('fee_quote' as const)
      : postMedical
        ? ('post_medical_deflection' as const)
        : undefined;
  const turns = recentMessages
    .slice(-maxTurns)
    .map((m) => ({
      role: (m.sender_type === 'patient' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: redactPhiForAI(m.content ?? '')
        .slice(0, CLASSIFY_INTENT_MAX_CHARS_PER_TURN)
        .trim(),
    }))
    .filter((t) => t.content.length > 0);
  if (!conversationGoal && turns.length === 0) return undefined;
  return {
    conversationGoal,
    recentTurns: turns.length > 0 ? turns : undefined,
  };
}

function buildIntentClassificationUserContent(
  redactedCurrent: string,
  ctx?: ClassifyIntentContext
): string {
  if (
    !ctx ||
    (!ctx.recentTurns?.length &&
      ctx.conversationGoal !== 'fee_quote' &&
      ctx.conversationGoal !== 'post_medical_deflection' &&
      ctx.conversationGoal !== 'reason_first_triage')
  ) {
    return redactedCurrent;
  }
  const blocks: string[] = [];
  if (ctx.conversationGoal === 'reason_first_triage') {
    blocks.push(
      '[Conversation context: The assistant is asking whether anything else should be addressed at the visit and/or confirming a short summary of concerns before quoting fees. Set "reason_first_done_adding" true when the user only signals they are done (any natural wording). Set "fee_thread_continuation" false when they are done. Replies like "nothing else", "that\'s it thanks", "yes", small corrections, or brief add-ons fit this flow; pure pricing clarification may be ask_question unless the user explicitly starts booking.]'
    );
  }
  if (ctx.conversationGoal === 'fee_quote') {
    blocks.push(
      '[Conversation context: The assistant is discussing consultation fees or pricing with this user. Short follow-ups that only name a visit type (e.g. "general consultation") are ask_question. However, if the user picks a modality (e.g. "video", "do it video", "text please", "voice") after fees were shown, treat it as book_appointment — they are choosing how to consult and want to proceed.]'
    );
  }
  if (ctx.conversationGoal === 'post_medical_deflection') {
    blocks.push(
      '[Conversation context: The user recently received a brief safety message that specific health questions cannot be diagnosed in chat. Follow-ups about booking, fees, hours, or general practice logistics are appropriate; do not give diagnoses, treatment advice, or triage as if you were a clinician.]'
    );
  }
  if (ctx.recentTurns?.length) {
    const assistantEmergencyFollowUp = [...ctx.recentTurns]
      .reverse()
      .find((t) => t.role === 'assistant' && assistantMessageIsEmergencyEscalationCopy(t.content));
    if (assistantEmergencyFollowUp) {
      blocks.push(
        '[Assistant_context: The assistant already sent a standard emergency escalation message (e.g. call 112/108 or go to hospital). Read the **whole thread**: if the patient\'s **current** message indicates **resolved/improved** situation, **stable** vitals, **non-crisis** readings, or they want **booking/fees/guidance** without reporting a **new** ongoing crisis — classify **medical_query**, not emergency. If they still describe **immediate** danger or **crisis-level** vitals as their **present** state, **emergency** may still apply. Do not repeat emergency for a **pure** stability/update turn.]'
      );
    }
    blocks.push(
      `Recent conversation (redacted, oldest first):\n${ctx.recentTurns.map((t) => `${t.role}: ${t.content}`).join('\n')}`
    );
  }
  blocks.push(`Current user message: ${redactedCurrent}`);
  return blocks.join('\n\n');
}

function classifyIntentUsesContext(ctx: ClassifyIntentContext | undefined): boolean {
  if (!ctx) return false;
  return (
    ctx.conversationGoal === 'fee_quote' ||
    ctx.conversationGoal === 'post_medical_deflection' ||
    ctx.conversationGoal === 'reason_first_triage' ||
    (ctx.recentTurns !== undefined && ctx.recentTurns.length > 0)
  );
}

/**
 * RBH-14: If the model returns book_appointment during a fee thread but the message is fee/clarification, not a booking request, downgrade to ask_question.
 */
export function applyIntentPostClassificationPolicy(
  result: IntentDetectionResult,
  messageText: string,
  state: Pick<ConversationState, 'activeFlow' | 'lastPromptKind' | 'reasonFirstTriagePhase'>
): IntentDetectionResult {
  if (result.intent !== 'book_appointment') return result;
  const feeThread =
    state.activeFlow === 'fee_quote' ||
    state.lastPromptKind === 'fee_quote' ||
    state.reasonFirstTriagePhase !== undefined;
  if (!feeThread) return result;
  if (userExplicitlyWantsToBookNow(messageText)) return result;
  const t = messageText.trim();
  const digits = t.replace(/\D/g, '');
  if (digits.length >= 10 && /^[6-9]/.test(digits)) return result;
  if (t.length > 220) return result;
  const looksFeeRelated =
    isPricingInquiryMessage(t) || isConsultationTypePricingFollowUp(t);
  if (!looksFeeRelated) return result;
  const topicSet = new Set(result.topics ?? []);
  topicSet.add('pricing');
  return {
    intent: 'ask_question',
    confidence: Math.min(result.confidence, 0.88),
    is_fee_question: true,
    topics: [...topicSet],
    ...(result.pricing_signal_kind !== undefined
      ? { pricing_signal_kind: result.pricing_signal_kind }
      : {}),
    ...(result.fee_thread_continuation === true ? { fee_thread_continuation: true } : {}),
  };
}

/**
 * e-task-dm-08: After the assistant sent canonical emergency escalation, do not repeat the same
 * emergency branch when the model wrongly keeps returning emergency on **stability** follow-ups.
 * **Primary** disambiguation is the classifier + thread context (LLM). The BP helper below is only a
 * narrow guard so we do not downgrade when **crisis-level vitals** are still present in the message.
 */
export function applyEmergencyIntentPostPolicy(
  result: IntentDetectionResult,
  messageText: string,
  recentMessages: { sender_type: string; content: string }[]
): IntentDetectionResult {
  if (result.intent !== 'emergency') return result;
  if (!recentThreadHasAssistantEmergencyEscalation(recentMessages)) return result;
  if (
    isEmergencyUserMessage(messageText) ||
    messageHasHypertensiveCrisisBloodPressureReading(messageText)
  ) {
    return result;
  }
  return {
    ...result,
    intent: 'medical_query',
    confidence: Math.min(result.confidence, 0.9),
  };
}

const POST_MED_ACK_LOCALIZE_MAX_COMPLETION_TOKENS = 400;

const POST_MED_ACK_LOCALIZE_SYSTEM = `You localize fixed patient-facing chat copy for a medical practice.

Adapt SOURCE into the language and register that best match USER_MESSAGE_REDACTED (any language or mixed register, e.g. English, Hindi, Hinglish, Punjabi in Latin script).

Output ONLY the localized message. No preamble, labels, or surrounding quotes.

Rules:
- Preserve **double-asterisk bold** around the same ideas; adjust spans so they read naturally in the target language.
- NEVER add currency symbols, ₹, dollar signs, or digits used as prices or fees. NEVER invent amounts.
- NEVER add medical advice, diagnoses, guarantees, or policies not stated in SOURCE.
- Keep the same paragraph structure as SOURCE: same number of blocks separated by one blank line (two newlines).
- If USER_MESSAGE_REDACTED is empty or clearly English-only, output natural English faithful to SOURCE (light polish ok).`;

function stripPostMedAckLocalizeWrapper(text: string): string {
  let t = text.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('“') && t.endsWith('”'))) {
    t = t.slice(1, -1).trim();
  }
  if (t.startsWith('```')) {
    const lines = t.split('\n');
    if (lines.length >= 2) {
      lines.shift();
      const last = lines[lines.length - 1]?.trim();
      if (last === '```') lines.pop();
      t = lines.join('\n').trim();
    }
  }
  return t;
}

/**
 * Returns the post–medical-deflection payment-existence ack: canonical English, or AI-localized
 * when POST_MEDICAL_ACK_AI_LOCALIZE is enabled and OpenAI is available. Redacts PHI from the
 * user text before using it as a language hint only.
 */
export async function resolvePostMedicalPaymentExistenceAck(
  messageText: string,
  correlationId: string
): Promise<string> {
  const fallback = POST_MEDICAL_PAYMENT_EXISTENCE_ACK_CANONICAL_EN;
  if (!env.POST_MEDICAL_ACK_AI_LOCALIZE) {
    return fallback;
  }
  const client = getOpenAIClient();
  const config = getOpenAIConfig();
  if (!client) {
    logger.warn(
      { correlationId },
      'Post-med payment-existence ack localize skipped: no OpenAI client'
    );
    return fallback;
  }

  const redactedHint = redactPhiForAI(messageText).trim().slice(0, 280);
  const userPayload =
    `SOURCE:\n"""\n${fallback}\n"""\n\n` +
    `USER_MESSAGE_REDACTED (language/register hint only):\n"""\n${redactedHint || '(none)'}\n"""`;

  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      max_completion_tokens: POST_MED_ACK_LOCALIZE_MAX_COMPLETION_TOKENS,
      temperature: 0.25,
      messages: [
        { role: 'system', content: POST_MED_ACK_LOCALIZE_SYSTEM },
        { role: 'user', content: userPayload },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    const content = raw ? stripPostMedAckLocalizeWrapper(raw) : '';
    const usage = completion.usage;

    if (!content || content.length < 20) {
      logger.warn(
        { correlationId, len: content?.length ?? 0 },
        'Post-med ack localize: empty or too short; using canonical EN'
      );
      await logAuditEvent({
        correlationId,
        action: 'ai_post_med_ack_localize',
        resourceType: 'ai',
        status: 'failure',
        errorMessage: 'empty_or_short_completion',
        metadata: {
          model: config.model,
          redactionApplied: true,
          tokens: usage?.total_tokens,
        },
      });
      return fallback;
    }

    await logAuditEvent({
      correlationId,
      action: 'ai_post_med_ack_localize',
      resourceType: 'ai',
      status: 'success',
      metadata: {
        model: config.model,
        redactionApplied: true,
        tokens: usage?.total_tokens,
      },
    });
    return content;
  } catch (err) {
    logger.warn(
      { correlationId, err },
      'Post-med ack localize failed; using canonical EN'
    );
    await logAuditEvent({
      correlationId,
      action: 'ai_post_med_ack_localize',
      resourceType: 'ai',
      status: 'failure',
      errorMessage: err instanceof Error ? err.message : 'request_failed',
      metadata: { model: config.model, redactionApplied: true },
    });
    return fallback;
  }
}

// ============================================================================
// Reason-first triage: AI visit-reason snippet (canonical path)
// Fallback: buildConsolidatedReasonSnippetFromMessages — best-effort only; do not duplicate
// open-ended extraction there (see docs/Reference/AI_BOT_BUILDING_PHILOSOPHY.md).
// ============================================================================

const VISIT_REASON_SNIPPET_MAX_COMPLETION_TOKENS = 500;

const VISIT_REASON_SNIPPET_SYSTEM = `You extract distinct visit reasons for a doctor consult. Output ONLY valid JSON — no markdown code fences, no preamble.

Required shape: {"reasons": string[]}

Each string is ONE concise, patient-facing reason — a **short clinical phrase**, not a chatty sentence.

STYLE (mandatory):
- Aim for **about 3–14 words** per item (hard max ~18 words). Do not cram several complaints into one item; **split** into separate reasons.
- **Strip** discourse filler and meta talk: e.g. "uh yes", "I would like to discuss", "please guide", "I want to", "there is", redundant "I also".
- **Keep** clinically useful qualifiers: fasting, often, sometimes, today, numeric readings, body locations.
- Use **plain clinical wording** when clearly implied (e.g. hypertension / high blood pressure; lethargy / fatigue / feeling lethargic compressed to "Lethargy (often)" if they said often). Do not invent symptoms.
- **Sentence case**; no trailing period.
- Preserve **Hinglish or other languages in Latin script** when the patient used them, but still **compress** filler.

INCLUDE: symptoms, concerns, numbers they gave, chronic issues, side effects they describe.
EXCLUDE: scheduling, fees, payment, "how much", greetings, pure small talk to the bot.
NEVER invent diagnoses or advice. Never add reasons not supported by the messages.

Order: same order as the patient raised them when clear; otherwise main concern first.
At most 12 strings; merge duplicates.

**Vital-sign updates (mandatory):** If the patient sent **multiple readings of the same vital** in the thread (e.g. several blood pressure values like 200/100, then 160/80, then 140/80), output **one** reason line — use the **latest** reading and optionally one short parenthetical for context (e.g. "High blood pressure — 140/80 today (earlier readings were higher)"). Do **not** list each reading as a separate array item.

**Meta + same topic:** If the patient asked whether a reading is an emergency and also gave vitals, **merge** into that one hypertension/BP line — do **not** add a separate bullet that only restates the question.

If nothing clinical remains after exclusions, return {"reasons": []}.`;

function parseVisitReasonSnippetJson(content: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const raw = (parsed as { reasons?: unknown }).reasons;
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    let t = x.replace(/\s+/g, ' ').trim();
    if (t.length < 2) continue;
    if (t.length > 280) t = `${t.slice(0, 277).trimEnd()}…`;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= 12) break;
  }
  return out.length > 0 ? out : null;
}

/**
 * Patient-facing reason summary for reason-first triage bridges / confirm / reasonForVisit seed.
 * Uses OpenAI JSON extraction when enabled and client available; otherwise deterministic distillation.
 */
export async function resolveVisitReasonSnippetForTriage(
  recentMessages: { sender_type: string; content: string }[],
  currentText: string,
  correlationId: string
): Promise<string> {
  const fallback = buildConsolidatedReasonSnippetFromMessages(recentMessages, currentText);

  if (!env.VISIT_REASON_SNIPPET_AI_ENABLED) {
    return fallback;
  }

  const client = getOpenAIClient();
  const config = getOpenAIConfig();
  if (!client) {
    return fallback;
  }

  const parts = collectPatientReasonPartsForTriage(recentMessages, currentText);
  if (parts.length === 0) {
    return fallback;
  }

  const redactedLines = parts.map((p) => redactPhiForAI(p).trim()).filter(Boolean);
  if (redactedLines.length === 0) {
    return fallback;
  }

  const userPayload = JSON.stringify({ patient_messages: redactedLines });

  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      max_completion_tokens: VISIT_REASON_SNIPPET_MAX_COMPLETION_TOKENS,
      temperature: 0.2,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: VISIT_REASON_SNIPPET_SYSTEM },
        { role: 'user', content: userPayload },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    const usage = completion.usage;

    if (!raw?.trim()) {
      await logAuditEvent({
        correlationId,
        action: 'ai_visit_reason_snippet',
        resourceType: 'ai',
        status: 'failure',
        errorMessage: 'empty_completion',
        metadata: { model: config.model, redactionApplied: true, tokens: usage?.total_tokens },
      });
      return fallback;
    }

    const reasons = parseVisitReasonSnippetJson(raw);
    if (!reasons) {
      logger.warn({ correlationId }, 'visit_reason_snippet: invalid JSON or empty reasons');
      await logAuditEvent({
        correlationId,
        action: 'ai_visit_reason_snippet',
        resourceType: 'ai',
        status: 'failure',
        errorMessage: 'invalid_or_empty_reasons_json',
        metadata: { model: config.model, redactionApplied: true, tokens: usage?.total_tokens },
      });
      return fallback;
    }

    const snippet = truncateReasonSnippetToMax(formatVisitReasonItemsForSnippet(reasons));

    await logAuditEvent({
      correlationId,
      action: 'ai_visit_reason_snippet',
      resourceType: 'ai',
      status: 'success',
      metadata: { model: config.model, redactionApplied: true, tokens: usage?.total_tokens },
    });

    return snippet;
  } catch (err) {
    logger.warn({ correlationId, err }, 'visit_reason_snippet: OpenAI failed; using deterministic');
    await logAuditEvent({
      correlationId,
      action: 'ai_visit_reason_snippet',
      resourceType: 'ai',
      status: 'failure',
      errorMessage: err instanceof Error ? err.message : 'request_failed',
      metadata: { model: config.model, redactionApplied: true },
    });
    return fallback;
  }
}

export interface ClassifyIntentOptions {
  /** RBH-14: prior turns + goal; skips intent cache when set */
  classifyContext?: ClassifyIntentContext;
}

/**
 * Classify user message text into intent + confidence.
 * - Redacts PHI before sending to OpenAI.
 * - Returns { intent: 'unknown', confidence: 0 } when API key is missing, on failure, or on invalid response.
 * - Audits every AI call with metadata only (no raw prompt/response with PHI).
 *
 * @param messageText - Raw user message (may contain PHI)
 * @param correlationId - Request correlation ID for audit and logging
 * @param options - Optional RBH-14 multi-turn context (redacted transcript + fee-thread hint)
 * @returns Intent and confidence (0-1)
 */
export async function classifyIntent(
  messageText: string,
  correlationId: string,
  options?: ClassifyIntentOptions
): Promise<IntentDetectionResult> {
  const config = getOpenAIConfig();
  const client = getOpenAIClient();

  if (!client) {
    logger.warn(
      { correlationId },
      'Intent classification skipped: OPENAI_API_KEY not set'
    );
    return { intent: 'unknown', confidence: 0 };
  }

  const redactedText = redactPhiForAI(messageText);
  const classifyContext = options?.classifyContext;
  const userContent = buildIntentClassificationUserContent(redactedText, classifyContext);
  const skipIntentCache = classifyIntentUsesContext(classifyContext);

  // Deterministic rules (e-task-1): run before AI to avoid misclassification - current message only
  if (isEmergencyUserMessage(redactedText)) {
    return { intent: 'emergency', confidence: 1 };
  }
  if (isSimpleGreeting(redactedText)) {
    return { intent: 'greeting', confidence: 1 };
  }
  if (isBookForSomeoneElse(redactedText)) {
    return { intent: 'book_for_someone_else', confidence: 1 };
  }
  if (isCheckAppointmentStatus(redactedText)) {
    return { intent: 'check_appointment_status', confidence: 1 };
  }

  if (!skipIntentCache) {
    const cached = getCachedIntent(redactedText);
    if (cached !== null) {
      return cached;
    }
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: config.model,
        max_completion_tokens: INTENT_CLASSIFICATION_MAX_COMPLETION_TOKENS,
        response_format: { type: 'json_object' as const },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      });

      const content = completion.choices[0]?.message?.content;
      const usage = completion.usage;

      if (!content) {
        logger.warn(
          { correlationId, attempt: attempt + 1 },
          'Intent classification: empty completion content'
        );
        await logAIClassification({
          correlationId,
          model: config.model,
          redactionApplied: true,
          status: 'failure',
          tokens: usage?.total_tokens ?? undefined,
          errorMessage: 'empty_completion',
        });
        return { intent: 'unknown', confidence: 0 };
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(content) as Record<string, unknown>;
      } catch {
        logger.warn(
          { correlationId, attempt: attempt + 1 },
          'Intent classification: invalid JSON in completion'
        );
        await logAIClassification({
          correlationId,
          model: config.model,
          redactionApplied: true,
          status: 'failure',
          tokens: usage?.total_tokens ?? undefined,
          errorMessage: 'invalid_json',
        });
        return { intent: 'unknown', confidence: 0 };
      }

      const intent = toIntent(
        typeof parsed.intent === 'string' ? parsed.intent : ''
      );
      const confidence = clampConfidence(
        typeof parsed.confidence === 'number' ? parsed.confidence : 0
      );
      const aux = normalizeIntentAuxFields(parsed);
      const result: IntentDetectionResult = { intent, confidence, ...aux };
      mergeClassifierPricingSubsignals(parsed, result);

      await logAIClassification({
        correlationId,
        model: config.model,
        redactionApplied: true,
        status: 'success',
        tokens: usage?.total_tokens ?? undefined,
        intentTopics: result.topics,
        isFeeQuestion: result.is_fee_question === true,
        pricingSignalKind: result.pricing_signal_kind,
      });

      if (!skipIntentCache) {
        setCachedIntent(redactedText, result);
      }
      return result;
    } catch (err) {
      const isLastAttempt = attempt === MAX_RETRIES - 1;
      logger.warn(
        {
          correlationId,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          err: err instanceof Error ? err.message : 'unknown',
        },
        'Intent classification attempt failed'
      );

      if (isLastAttempt) {
        await logAIClassification({
          correlationId,
          model: config.model,
          redactionApplied: true,
          status: 'failure',
          errorMessage: 'classification_failed_after_retries',
        });
        return { intent: 'unknown', confidence: 0 };
      }

      const delayMs = RETRY_DELAYS_MS[attempt] ?? 4000;
      await sleep(delayMs);
    }
  }

  return { intent: 'unknown', confidence: 0 };
}

// ---------------------------------------------------------------------------
// Booking flow: semantic consent + detail confirmation (LLM, JSON)
// ---------------------------------------------------------------------------

const CONSENT_REPLY_SEMANTIC_SYSTEM = `You classify whether the patient is granting or denying consent to use their contact details for appointment scheduling.

The assistant asked them to agree to share details / consent (any language: English, Hindi, Punjabi, etc.).

IMPORTANT — Read the assistant message context:
- If the assistant asked ONLY for **optional** extras (e.g. special notes for the doctor — allergies, medications, preferences — "optional" / "say Yes to continue") and the patient says they have nothing to add ("no", "no that's it", "nothing else", "that's all"), that means they are **continuing** — classify as **granted** (they are not refusing data consent).
- If they clearly refuse consent to use their details for scheduling ("don't use my number", "I don't consent", "delete my data"), classify as **denied**.

Return JSON only: {"decision":"granted"|"denied"|"unclear","confidence":0-1}

- granted: they agree — yes, okay, sure, proceed, I consent, go ahead, haan, ji, theek hai, ठीक है, हाँ, etc.
- denied: they refuse consent to share contact details — not "no extra notes" when the question was optional.
- unclear: unrelated question, or not answering the consent question

Short affirmatives after a consent question count as granted.`;

const CONFIRM_DETAILS_SEMANTIC_SYSTEM = `You classify the patient's reply to a summary of their booking details (name, phone, reason for visit, etc.).

The assistant asked them to confirm the summary is correct before scheduling.

Return JSON only: {"decision":"confirm"|"correction"|"unclear","confidence":0-1}

- confirm: they confirm the summary is accurate — yes, correct, yes correct, that's right, haan, sahi hai, ठीक है, etc.
- correction: they want to change something — no, wrong, actually my name is..., incorrect
- unclear: off-topic, asking a different question, or ambiguous`;

async function callBookingTurnClassifier(
  systemPrompt: string,
  userContent: string,
  correlationId: string
): Promise<Record<string, unknown> | null> {
  const config = getOpenAIConfig();
  const client = getOpenAIClient();
  if (!client) {
    logger.warn({ correlationId }, 'Booking turn classification skipped: OPENAI_API_KEY not set');
    return null;
  }
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: config.model,
        max_completion_tokens: BOOKING_TURN_CLASSIFICATION_MAX_COMPLETION_TOKENS,
        response_format: { type: 'json_object' as const },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      });
      const content = completion.choices[0]?.message?.content;
      const usage = completion.usage;
      if (!content) {
        await logAIClassification({
          correlationId,
          model: config.model,
          redactionApplied: true,
          status: 'failure',
          tokens: usage?.total_tokens ?? undefined,
          errorMessage: 'booking_turn_empty_completion',
        });
        return null;
      }
      const parsed = JSON.parse(content) as Record<string, unknown>;
      await logAIClassification({
        correlationId,
        model: config.model,
        redactionApplied: true,
        status: 'success',
        tokens: usage?.total_tokens ?? undefined,
      });
      return parsed;
    } catch (err) {
      const isLast = attempt === MAX_RETRIES - 1;
      logger.warn(
        { correlationId, attempt: attempt + 1, err: err instanceof Error ? err.message : 'unknown' },
        'Booking turn classification attempt failed'
      );
      if (isLast) {
        await logAIClassification({
          correlationId,
          model: config.model,
          redactionApplied: true,
          status: 'failure',
          errorMessage: 'booking_turn_classification_failed',
        });
        return null;
      }
      const delayMs = RETRY_DELAYS_MS[attempt] ?? 4000;
      await sleep(delayMs);
    }
  }
  return null;
}

/**
 * LLM consent when keyword matching is unclear. PHI redacted.
 */
export async function classifyConsentReplySemantic(
  userMessage: string,
  lastAssistantMessage: string | undefined,
  correlationId: string
): Promise<ConsentParseResult> {
  const redactedUser = redactPhiForAI(userMessage);
  const redactedAssistant = lastAssistantMessage
    ? redactPhiForAI(lastAssistantMessage).slice(0, 1200)
    : '';
  const userContent = redactedAssistant
    ? `Last assistant message (context):\n${redactedAssistant}\n\nPatient reply:\n${redactedUser}`
    : `Patient reply:\n${redactedUser}`;
  const parsed = await callBookingTurnClassifier(
    CONSENT_REPLY_SEMANTIC_SYSTEM,
    userContent,
    correlationId
  );
  if (!parsed) return 'unclear';
  const d = typeof parsed.decision === 'string' ? parsed.decision.toLowerCase() : '';
  if (d === 'granted' || d === 'denied' || d === 'unclear') return d;
  return 'unclear';
}

/** Result of classifying a reply to "are these details correct?" */
export type ConfirmDetailsReplyResult = 'confirm' | 'correction' | 'unclear';

function confirmDetailsDeterministic(text: string): ConfirmDetailsReplyResult | null {
  const raw = text.trim();
  if (!raw) return 'unclear';
  const s = raw.toLowerCase();
  if (/^(no|nope|wrong|incorrect)\b/i.test(raw)) return 'correction';
  if (/^(actually|no,)\s+/i.test(raw)) return 'correction';
  if (/^(yes|yeah|yep|ok|okay|correct|looks good|confirmed)$/.test(s)) return 'confirm';
  if (
    /^(yes|yeah|yep|ok|okay)\s*[,!.]?\s*(correct|right|that'?s|that is|good|confirmed)\s*\.?$/i.test(s)
  ) {
    return 'confirm';
  }
  if (/^(correct|right|that'?s right|that is correct)\s*[!.]?\s*$/i.test(raw)) return 'confirm';
  return null;
}

/**
 * LLM when deterministic patterns do not match (multilingual / paraphrases).
 */
export async function classifyConfirmDetailsReplySemantic(
  userMessage: string,
  lastAssistantMessage: string | undefined,
  correlationId: string
): Promise<ConfirmDetailsReplyResult> {
  const redactedUser = redactPhiForAI(userMessage);
  const redactedAssistant = lastAssistantMessage
    ? redactPhiForAI(lastAssistantMessage).slice(0, 1200)
    : '';
  const userContent = redactedAssistant
    ? `Last assistant message (context):\n${redactedAssistant}\n\nPatient reply:\n${redactedUser}`
    : `Patient reply:\n${redactedUser}`;
  const parsed = await callBookingTurnClassifier(
    CONFIRM_DETAILS_SEMANTIC_SYSTEM,
    userContent,
    correlationId
  );
  if (!parsed) return 'unclear';
  const d = typeof parsed.decision === 'string' ? parsed.decision.toLowerCase() : '';
  if (d === 'confirm' || d === 'correction' || d === 'unclear') return d;
  return 'unclear';
}

/**
 * Context before keywords: optional-extras prompts must not treat "no / that's it" as consent denial.
 * Skip phrases → granted; clear "yes" → granted without LLM; else semantic when assistant asked optional extras.
 * Otherwise: keyword pass, then semantic LLM.
 */
export async function resolveConsentReplyForBooking(
  text: string,
  lastAssistantMessage: string | undefined,
  correlationId: string
): Promise<ConsentParseResult> {
  if (isOptionalExtrasConsentPrompt(lastAssistantMessage)) {
    if (isSkipExtrasReply(text)) return 'granted';
    const fastExtras = parseConsentReply(text);
    if (fastExtras === 'granted') return 'granted';
    return classifyConsentReplySemantic(text, lastAssistantMessage, correlationId);
  }
  const fast = parseConsentReply(text);
  if (fast !== 'unclear') return fast;
  return classifyConsentReplySemantic(text, lastAssistantMessage, correlationId);
}

/**
 * Deterministic patterns first; then semantic LLM for detail confirmation.
 */
export async function resolveConfirmDetailsReplyForBooking(
  text: string,
  lastAssistantMessage: string | undefined,
  correlationId: string
): Promise<ConfirmDetailsReplyResult> {
  const det = confirmDetailsDeterministic(text);
  if (det !== null) return det;
  return classifyConfirmDetailsReplySemantic(text, lastAssistantMessage, correlationId);
}

/**
 * Classify Instagram comment text into comment-specific intent + confidence.
 * Redacts PHI before sending to OpenAI. Returns { intent: 'other', confidence: 0 } on failure.
 *
 * @param commentText - Raw comment (may contain PHI)
 * @param correlationId - For audit and logging
 */
export async function classifyCommentIntent(
  commentText: string,
  correlationId: string
): Promise<CommentIntentDetectionResult> {
  const config = getOpenAIConfig();
  const client = getOpenAIClient();

  if (!client) {
    logger.warn(
      { correlationId },
      'Comment intent classification skipped: OPENAI_API_KEY not set'
    );
    return { intent: 'other', confidence: 0 };
  }

  const redactedText = redactPhiForAI(commentText);
  if (!redactedText.trim()) {
    return { intent: 'other', confidence: 0 };
  }

  const cached = getCachedCommentIntent(redactedText);
  if (cached !== null) {
    return cached;
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: config.model,
        max_completion_tokens: config.maxTokens,
        response_format: { type: 'json_object' as const },
        messages: [
          { role: 'system', content: COMMENT_INTENT_SYSTEM_PROMPT },
          { role: 'user', content: redactedText },
        ],
      });

      const content = completion.choices[0]?.message?.content;
      const usage = completion.usage;

      if (!content) {
        logger.warn(
          { correlationId, attempt: attempt + 1 },
          'Comment intent: empty completion content'
        );
        await logAIClassification({
          correlationId,
          model: config.model,
          redactionApplied: true,
          status: 'failure',
          tokens: usage?.total_tokens ?? undefined,
          errorMessage: 'comment_intent_empty_completion',
        });
        return { intent: 'other', confidence: 0 };
      }

      let parsed: { intent?: string; confidence?: number };
      try {
        parsed = JSON.parse(content) as { intent?: string; confidence?: number };
      } catch {
        logger.warn(
          { correlationId, attempt: attempt + 1 },
          'Comment intent: invalid JSON in completion'
        );
        await logAIClassification({
          correlationId,
          model: config.model,
          redactionApplied: true,
          status: 'failure',
          tokens: usage?.total_tokens ?? undefined,
          errorMessage: 'comment_intent_invalid_json',
        });
        return { intent: 'other', confidence: 0 };
      }

      const intent = toCommentIntent(typeof parsed.intent === 'string' ? parsed.intent : '');
      const confidence = clampConfidence(
        typeof parsed.confidence === 'number' ? parsed.confidence : 0
      );

      await logAIClassification({
        correlationId,
        model: config.model,
        redactionApplied: true,
        status: 'success',
        tokens: usage?.total_tokens ?? undefined,
      });

      const result: CommentIntentDetectionResult = { intent, confidence };
      setCachedCommentIntent(redactedText, result);
      return result;
    } catch (err) {
      const isLastAttempt = attempt === MAX_RETRIES - 1;
      logger.warn(
        {
          correlationId,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          err: err instanceof Error ? err.message : 'unknown',
        },
        'Comment intent classification attempt failed'
      );

      if (isLastAttempt) {
        await logAIClassification({
          correlationId,
          model: config.model,
          redactionApplied: true,
          status: 'failure',
          errorMessage: 'comment_intent_failed_after_retries',
        });
        return { intent: 'other', confidence: 0 };
      }

      const delayMs = RETRY_DELAYS_MS[attempt] ?? 4000;
      await sleep(delayMs);
    }
  }

  return { intent: 'other', confidence: 0 };
}

/** Minimal prompt for second-stage check: could skip-intent comment be medical? */
const MEDICAL_SECOND_STAGE_PROMPT = `Does this comment indicate someone seeking medical help (symptoms, health concern, medical advice)?
Reply only "yes" or "no".`;

/**
 * Second-stage AI check for comments initially classified as spam/joke/unrelated.
 * Option B: when Stage 1 returns skip intent, ask "could this be medical?" and override if yes.
 *
 * @param commentText - Raw comment (PHI will be redacted)
 * @param correlationId - For audit and logging
 * @returns true if the model says "yes" (possibly medical); false otherwise or on failure
 */
export async function isPossiblyMedicalComment(
  commentText: string,
  correlationId: string
): Promise<boolean> {
  const client = getOpenAIClient();
  if (!client) return false;

  const redactedText = redactPhiForAI(commentText);
  if (!redactedText.trim()) return false;

  try {
    const config = getOpenAIConfig();
    const completion = await client.chat.completions.create({
      model: config.model,
      max_completion_tokens: 10,
      messages: [
        { role: 'system', content: MEDICAL_SECOND_STAGE_PROMPT },
        { role: 'user', content: redactedText },
      ],
    });

    const content = completion.choices[0]?.message?.content?.trim().toLowerCase();
    if (!content) {
      logger.info({ correlationId, commentPreview: redactedText.slice(0, 50) }, 'Second-stage medical: empty response');
      return false;
    }

    const isYes = content.startsWith('yes');
    if (isYes) {
      await logAuditEvent({
        correlationId,
        action: 'comment_symptom_override',
        resourceType: 'comment',
        status: 'success',
        metadata: { commentPreview: redactedText.slice(0, 80), secondStageAnswer: content },
      });
    } else {
      logger.info(
        { correlationId, secondStageAnswer: content.slice(0, 30), commentPreview: redactedText.slice(0, 50) },
        'Second-stage medical: model said no'
      );
    }
    return isYes;
  } catch (err) {
    logger.warn(
      { correlationId, err: err instanceof Error ? err.message : String(err) },
      'Second-stage medical check failed, treating as non-medical'
    );
    return false;
  }
}

// ============================================================================
// Response Generation (e-task-3)
// ============================================================================

/** Optional doctor context for personalized AI responses (e-task-4) */
export interface DoctorContext {
  practice_name?: string | null;
  business_hours_summary?: string | null;
  welcome_message?: string | null;
  specialty?: string | null;
  address_summary?: string | null;
  cancellation_policy_hours?: number | null;
  /** e-task-2: e.g. "Video, In-clinic" - drives consultation type options */
  consultation_types?: string | null;
  /** Practice currency for teleconsult quotes (ISO 4217), e.g. INR / USD */
  appointment_fee_currency?: string | null;
  /** Pre-formatted line(s) from doctor_settings — must be passed through to the model verbatim when user asks fees. */
  appointment_fee_summary?: string | null;
  /** SFU-08: compact teleconsult fee schedule from service_offerings_json (amounts verbatim). */
  service_catalog_summary_for_ai?: string | null;
  /**
   * When true, scheduling offers are only text/voice/video per catalog — omit legacy in-clinic / address prompts.
   */
  teleconsultCatalogAuthoritative?: boolean;
}

/** Optional context for AI response generation (e-task-1 Bot Intelligence). No PHI. */
export interface GenerateResponseContext {
  /** Redacted summary, e.g. "name: [provided], phone: [provided], age: [missing]" */
  collectedDataSummary?: string;
  /** e.g. ["age", "reason_for_visit"] */
  missingFields?: string[];
  /** Last assistant message (redacted if contained PHI) */
  lastBotMessage?: string;
  /** When booking for someone else, e.g. "sister", "mother" */
  relation?: string;
  /** True when collecting for another person */
  bookingForSomeoneElse?: boolean;
  /**
   * e-task-dm-03: Idle-thread hint (pre-redacted / static). Appended to system context for
   * responded / fee / post-safety turns so the model keeps continuity without duplicating PHI.
   */
  idleDialogueHint?: string;
  /**
   * True when merged patient thread (incl. current line) matches both NCD-style and acute/general cues.
   * Suppresses multi-row fee catalog in the system prompt and blocks dual-tier pricing copy.
   */
  competingVisitTypeBuckets?: boolean;
  /**
   * e-task-dm-05: clinical-led thread + multi-row teleconsult catalog — same prompt suppression as competing buckets
   * (no verbatim multi-tier catalog; practice confirms visit type).
   */
  silentAssignmentStrict?: boolean;
  /**
   * When true, omit SYSTEM FACTS — FEES / catalog amounts for this turn (clinical thread before visit reason is finalized in metadata/extraction).
   */
  suppressConsultationFeeFacts?: boolean;
}

export interface GenerateResponseInput {
  conversationId: string;
  currentIntent: Intent;
  state: ConversationState;
  recentMessages: Message[];
  currentUserMessage: string;
  correlationId: string;
  doctorContext?: DoctorContext;
  /** e-task-1: Richer context for context-aware replies */
  context?: GenerateResponseContext;
  /** RBH-18: classifyIntent said fee/pricing — strengthens fee PRIORITY hint vs keywords-only */
  classifierSignalsFeeQuestion?: boolean;
}

/**
 * Generate assistive bot reply from conversation context (e-task-3).
 * - Redacts PHI from all message content before sending to OpenAI.
 * - Limits history to MAX_HISTORY_PAIRS to control tokens.
 * - Retries with exponential backoff; returns safe fallback on failure.
 * - Audits every call with logAIResponseGeneration (metadata only).
 *
 * @param input - Conversation context and current user message
 * @returns Generated reply text or fallback
 */
/** Options that tighten fee/catalog injection (visit-type ambiguity hardening). */
export type BuildResponseSystemPromptOptions = {
  competingVisitTypeBuckets?: boolean;
  silentAssignmentStrict?: boolean;
  suppressConsultationFeeFacts?: boolean;
};

function buildResponseSystemPrompt(
  doctorContext?: DoctorContext,
  promptOpts?: BuildResponseSystemPromptOptions
): string {
  const suppressAllConsultationFees = promptOpts?.suppressConsultationFeeFacts === true;
  const suppressMultiTierFeeCatalog =
    !suppressAllConsultationFees &&
    (promptOpts?.competingVisitTypeBuckets === true ||
      promptOpts?.silentAssignmentStrict === true);
  const practiceName = doctorContext?.practice_name?.trim() || 'Clariva Care';
  let prompt = RESPONSE_SYSTEM_PROMPT_BASE.replace(
    /practice's assistant/g,
    `${practiceName}'s assistant`
  );
  const parts: string[] = [];
  if (doctorContext?.business_hours_summary?.trim()) {
    parts.push(`We're open: ${doctorContext.business_hours_summary.trim()}.`);
  }
  if (doctorContext?.specialty?.trim()) {
    parts.push(`Our specialty: ${doctorContext.specialty.trim()}.`);
  }
  if (doctorContext?.address_summary?.trim()) {
    parts.push(`Location: ${doctorContext.address_summary.trim()}.`);
  }
  if (doctorContext?.cancellation_policy_hours != null && doctorContext.cancellation_policy_hours > 0) {
    parts.push(`Please cancel at least ${doctorContext.cancellation_policy_hours} hours in advance if you need to reschedule.`);
  }
  if (parts.length > 0) {
    prompt += `\n\nPractice info (use when relevant): ${parts.join(' ')}`;
  }

  const feeFacts: string[] = [];
  if (!suppressAllConsultationFees) {
    const catalogSummary = doctorContext?.service_catalog_summary_for_ai?.trim();
    const cur = (doctorContext?.appointment_fee_currency || 'INR').trim().toUpperCase() || 'INR';
    if (cur !== 'INR') {
      feeFacts.push(
        `Practice currency: ${cur}. Treat catalog and on-file amounts as being in this currency unless a line states otherwise.`
      );
    }
    if (catalogSummary) {
      if (suppressMultiTierFeeCatalog) {
        feeFacts.push(
          `Teleconsult catalog: this practice has multiple visit types and prices on file, but **this thread is flagged** — do **not** paste, list, or compare specific prices for different visit types; do **not** ask the patient to pick a fee tier or service row. Acknowledge warmly; if booking fields are missing, continue intake; for fee questions say **the practice will confirm the correct visit type** and then the exact fee — **no multi-tier amounts or comparisons in this reply**.`
        );
      } else {
        feeFacts.push(
          `Teleconsult fee schedule from practice catalog (verbatim; do not invent or change amounts): ${catalogSummary}`
        );
      }
    }
    const feeSummary = doctorContext?.appointment_fee_summary?.trim();
    if (feeSummary) feeFacts.push(feeSummary);
    const consultRaw = doctorContext?.consultation_types?.trim();
    if (consultRaw && !suppressMultiTierFeeCatalog) {
      const legacyNote = catalogSummary
        ? ' Supplemental notes only — teleconsult/modality prices in the catalog above take precedence when both apply.'
        : '';
      feeFacts.push(
        `Legacy consultation types / per-visit notes exactly as stored: ${consultRaw}.${legacyNote} Use any amounts or labels you find here verbatim; do not invent prices.`
      );
    }
  }
  if (suppressAllConsultationFees) {
    prompt += `\n\nPRICING (this turn — server rule): Do **not** quote specific consultation fees, paste the fee catalog, or give rupee amounts. The practice shares the exact fee after visit reasons are confirmed via the receptionist flow. Continue with booking intake (missing fields), modality choice if needed, or brief reassurance — without inventing prices. If the user asks "how much", say you'll confirm everything they want addressed first, then the practice will give the exact fee.`;
  } else if (feeFacts.length > 0) {
    const pricingGuardrails = suppressMultiTierFeeCatalog
      ? `CRITICAL pricing guardrails (this turn): Visit type must be **set by the practice** from what the patient described — do **not** quote, list, or compare prices for **different** visit types or ask the patient to choose a tier. Say **the practice will confirm the correct visit type** and then the exact fee. Do not invent rupee amounts. A single legacy flat fee line above (if any) is not a substitute for resolving which teleconsult row applies.`
      : `CRITICAL pricing guardrails: When the user asks about cost, fees, charges, money, paise, kitna/kitne, phone/video consult price, etc., quote the lines above exactly when they contain amounts. NEVER say the exact fee is missing, not visible, or not in the system when this block lists an amount. Prefer **catalog** modality lines for text/voice/video when present. If there is no matching amount for their exact scenario, say the clinic can confirm — but still state any on-file or catalog amount that does apply. Do not invent follow-up discounts beyond what the catalog follow-up hints say.`;
    prompt += `\n\nSYSTEM FACTS — FEES (practice database — must be treated as "in the system" for patients):
${feeFacts.join('\n')}

${pricingGuardrails}`;
  }

  if (
    doctorContext?.teleconsultCatalogAuthoritative &&
    doctorContext?.service_catalog_summary_for_ai?.trim() &&
    !suppressMultiTierFeeCatalog &&
    !suppressAllConsultationFees
  ) {
    prompt += `\n\nTELECONSULT-ONLY (product rule): This practice uses the **teleconsult catalog** above for visit types (text / voice / video only). Do **not** offer in-clinic or in-person appointments, do **not** quote a street address for booking, and do **not** invite users to visit the clinic physically—unless the Practice info block above explicitly states otherwise (it should not when this rule appears). Do **not** ask the user to choose between text, voice, or video in this chat — they will pick their consultation mode on the booking page when they select a slot.`;
  }
  if (doctorContext?.teleconsultCatalogAuthoritative && suppressMultiTierFeeCatalog) {
    prompt += `\n\nTELECONSULT-ONLY (product rule): This practice offers **text / voice / video** teleconsult only — do not offer in-clinic visits unless Practice info explicitly says otherwise. While visit type is ambiguous, do not steer the user using price differences between catalog rows. Do **not** ask the user to choose between text, voice, or video in this chat — they will pick their consultation mode on the booking page.`;
  }
  if (doctorContext?.teleconsultCatalogAuthoritative && suppressAllConsultationFees) {
    prompt += `\n\nTELECONSULT-ONLY (product rule): This practice offers **text / voice / video** teleconsult only — do not offer in-clinic visits unless Practice info explicitly says otherwise. Do **not** quote catalog prices this turn. Do **not** ask the user to choose between text, voice, or video in this chat — they will pick on the booking page.`;
  }

  return prompt;
}

export async function generateResponse(input: GenerateResponseInput): Promise<string> {
  const {
    conversationId,
    currentIntent,
    state,
    recentMessages,
    currentUserMessage,
    correlationId,
    doctorContext,
    context: aiContext,
    classifierSignalsFeeQuestion,
  } = input;

  const config = getOpenAIConfig();
  const client = getOpenAIClient();

  if (!client) {
    logger.warn(
      { correlationId, conversationId },
      'Response generation skipped: OPENAI_API_KEY not set'
    );
    await logAIResponseGeneration({
      correlationId,
      model: config.model,
      redactionApplied: true,
      status: 'failure',
      resourceId: conversationId,
      errorMessage: 'openai_client_not_available',
    });
    return FALLBACK_RESPONSE;
  }

  const redactedCurrent = redactPhiForAI(currentUserMessage);

  const historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  const pairs = recentMessages.slice(-MAX_HISTORY_PAIRS * 2);
  for (const msg of pairs) {
    const content = redactPhiForAI(msg.content);
    if (!content.trim()) continue;
    const role = msg.sender_type === 'patient' ? 'user' : 'assistant';
    historyMessages.push({ role, content });
  }

  const stepContext = state?.step ? ` Current step in flow: ${state.step}.` : '';
  const collectedContext =
    state?.collectedFields?.length
      ? ` Already collected: ${state.collectedFields.join(', ')}. Do not ask for these again.`
      : '';
  // e-task-1: Richer context for context-aware replies (no PHI)
  const contextParts: string[] = [];
  if (aiContext?.collectedDataSummary?.trim()) {
    contextParts.push(`Collected data summary: ${aiContext.collectedDataSummary.trim()}.`);
  }
  if (aiContext?.missingFields?.length) {
    contextParts.push(`Still missing: ${aiContext.missingFields.join(', ')}.`);
  }
  if (aiContext?.lastBotMessage?.trim()) {
    contextParts.push(`Last thing you asked: "${aiContext.lastBotMessage.trim()}".`);
  }
  if (aiContext?.bookingForSomeoneElse && aiContext?.relation) {
    contextParts.push(`Booking for user's ${aiContext.relation}. Use "your ${aiContext.relation}" or "for them" in replies.`);
  } else if (aiContext?.bookingForSomeoneElse) {
    contextParts.push(`Booking for someone else (relation not specified). Use "for them" in replies.`);
  }
  if (aiContext?.idleDialogueHint?.trim()) {
    contextParts.push(aiContext.idleDialogueHint.trim());
  }
  if (aiContext?.competingVisitTypeBuckets || aiContext?.silentAssignmentStrict) {
    contextParts.push(
      'CRITICAL (server flag): Visit type / fee tier must not be a patient-facing multi-option menu — do not output multiple priced consultation rows or ask the patient to pick a fee category. Practice confirms visit type; then exact fee.'
    );
  }
  const aiContextBlock = contextParts.length > 0 ? `\n\nContext: ${contextParts.join(' ')}` : '';
  const collectingAllHint =
    state?.step === 'collecting_all'
      ? aiContext?.missingFields?.length
        ? ' The user just shared some details. Acknowledge briefly, then ask for ALL remaining missing fields at once. Example: "Got it. Still need: age, reason for visit. Please share." If only one missing: "Just need your age." NEVER ask for one field, wait, then ask for the next - always list all missing at once.'
        : ' Ask for ALL details at once: Full name, Age, Gender, Mobile number, Reason for visit. Email optional. Example: "To book your appointment, please share: Full name, Age, Gender, Mobile number, Reason for visit. Email (optional) for receipts."'
      : '';
  const collectionHint =
    state?.step?.startsWith('collecting_') && state?.step !== 'collecting_all'
      ? ` Ask for ALL missing fields at once - never one by one.`
      : '';
  const confirmDetailsHint =
    state?.step === 'confirm_details'
      ? ' The user is confirming their details. The system will read back the summary. If they say Yes, proceed to consent. If they correct something, acknowledge and re-confirm.'
      : '';
  const consentHint =
    state?.step === 'consent'
      ? ' The user has provided their details. Use a combined consent message: thank them by name, say we\'ll use their phone number to confirm the appointment by call or text, and ask "Ready to pick a time?" (e.g. "Thanks, [Name]. We\'ll use [phone] to confirm your appointment. Ready to pick a time?"). Do NOT ask "Do I have your permission to use this number?" - providing the number implies consent. CRITICAL: NEVER output placeholder text like "[Slot selection link]" or "[link]" - the system injects the real URL. If the user says yes to consent, the system handles the link; you do not have access to it. Do not invent or fake a link.'
      : '';
  const systemPrompt = buildResponseSystemPrompt(doctorContext, {
    competingVisitTypeBuckets: aiContext?.competingVisitTypeBuckets === true,
    silentAssignmentStrict: aiContext?.silentAssignmentStrict === true,
    suppressConsultationFeeFacts: aiContext?.suppressConsultationFeeFacts === true,
  });
  const suppressFeeMenu =
    aiContext?.suppressConsultationFeeFacts === true ||
    aiContext?.competingVisitTypeBuckets === true ||
    aiContext?.silentAssignmentStrict === true;
  const pricingFocusHint =
    (classifierSignalsFeeQuestion === true || isPricingInquiryMessage(redactedCurrent)) &&
    !userExplicitlyWantsToBookNow(redactedCurrent)
      ? suppressFeeMenu
        ? ' PRIORITY: Latest turn may be about fees — **server flag: no multi-tier fee menu**. Do NOT quote or compare amounts for different visit types. Say the **practice will confirm visit type** and exact fee after; you may continue collecting any missing booking fields in the same reply, in the user’s language.'
        : ' PRIORITY: The latest user message is about pricing/fees (including paise/kitne/rupees). Lead with SYSTEM FACTS - FEES if any amount is listed; state the exact fee clearly. Never claim fees are missing from the system when that block includes an amount. If you are mid-booking flow, combine the fee answer with asking for any still-missing fields in one reply, in the user language.'
      : '';
  const systemContent =
    systemPrompt +
    `\n\nCurrent detected intent for the latest user message: ${currentIntent}.${stepContext}${collectedContext}${aiContextBlock}${collectingAllHint}${collectionHint}${confirmDetailsHint}${consentHint}${pricingFocusHint}`;

  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
    { role: 'system', content: systemContent },
    ...historyMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: redactedCurrent },
  ];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: config.model,
        max_completion_tokens: config.maxTokens,
        messages,
      });

      const content = completion.choices[0]?.message?.content?.trim();
      const usage = completion.usage;

      if (!content) {
        await logAIResponseGeneration({
          correlationId,
          model: config.model,
          redactionApplied: true,
          status: 'failure',
          resourceId: conversationId,
          tokens: usage?.total_tokens,
          errorMessage: 'empty_completion',
        });
        return FALLBACK_RESPONSE;
      }

      await logAIResponseGeneration({
        correlationId,
        model: config.model,
        redactionApplied: true,
        status: 'success',
        resourceId: conversationId,
        tokens: usage?.total_tokens,
      });

      return content;
    } catch (err) {
      const isLastAttempt = attempt === MAX_RETRIES - 1;
      logger.warn(
        {
          correlationId,
          conversationId,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          err: err instanceof Error ? err.message : 'unknown',
        },
        'Response generation attempt failed'
      );

      if (isLastAttempt) {
        await logAIResponseGeneration({
          correlationId,
          model: config.model,
          redactionApplied: true,
          status: 'failure',
          resourceId: conversationId,
          errorMessage: 'response_generation_failed_after_retries',
        });
        return FALLBACK_RESPONSE;
      }

      const delayMs = RETRY_DELAYS_MS[attempt] ?? 4000;
      await sleep(delayMs);
    }
  }

  return FALLBACK_RESPONSE;
}

// ============================================================================
// AI-to-System Instruction Layer (e-task-ai-system-instruction-layer)
// ============================================================================

/** Tool definitions for cancel/reschedule flows. Minimal to reduce tokens. */
const CONFIRM_CANCEL_TOOL = {
  type: 'function' as const,
  function: {
    name: 'confirm_cancel',
    description:
      'Call when user confirms they want to cancel (yes, yeah, go ahead, do it, 2737, etc.) or to keep (no, nope, don\'t).',
    parameters: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'true = cancel the appointment, false = keep it',
        },
      },
      required: ['confirm'],
    },
  },
};

const PICK_APPOINTMENT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'pick_appointment',
    description:
      'Call when user picks an appointment by number (e.g. "2" or "just #2 for me" when we listed 1, 2, 3).',
    parameters: {
      type: 'object',
      properties: {
        index: {
          type: 'number',
          description: '1-based index (1 = first, 2 = second, etc.)',
        },
      },
      required: ['index'],
    },
  },
};

export interface GenerateResponseWithActionsInput extends GenerateResponseInput {
  /** Tools to offer based on state. Empty = no tools, standard reply only. */
  availableTools: Array<'confirm_cancel' | 'pick_appointment'>;
}

/**
 * Generate reply with optional tool calls. When AI returns a tool call, caller
 * executes it and uses replyOverride from action executor.
 *
 * @param input - Same as generateResponse + availableTools
 * @returns { reply, toolCalls? }
 */
export async function generateResponseWithActions(
  input: GenerateResponseWithActionsInput
): Promise<AIResponseWithActions> {
  const {
    conversationId,
    currentIntent,
    state,
    recentMessages,
    currentUserMessage,
    correlationId,
    doctorContext,
    availableTools,
  } = input;

  const config = getOpenAIConfig();
  const client = getOpenAIClient();

  if (!client) {
    logger.warn(
      { correlationId, conversationId },
      'generateResponseWithActions skipped: OPENAI_API_KEY not set'
    );
    return { reply: FALLBACK_RESPONSE };
  }

  const redactedCurrent = redactPhiForAI(currentUserMessage);
  const historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  const pairs = recentMessages.slice(-MAX_HISTORY_PAIRS * 2);
  for (const msg of pairs) {
    const content = redactPhiForAI(msg.content);
    if (!content.trim()) continue;
    const role = msg.sender_type === 'patient' ? 'user' : 'assistant';
    historyMessages.push({ role, content });
  }

  const tools: Array<typeof CONFIRM_CANCEL_TOOL | typeof PICK_APPOINTMENT_TOOL> = [];
  if (availableTools.includes('confirm_cancel')) tools.push(CONFIRM_CANCEL_TOOL);
  if (availableTools.includes('pick_appointment')) tools.push(PICK_APPOINTMENT_TOOL);

  const stepContext = state?.step ? ` Current step: ${state.step}.` : '';
  const cancelContext =
    state.step === 'awaiting_cancel_confirmation' && state.cancelAppointmentId
      ? ' User is confirming cancel. You MUST call confirm_cancel with confirm=true (yes/yeah/go ahead/etc.) or confirm=false (no/nope/keep). Never reply with text only - always call the tool.'
      : '';
  const pickContext =
    (state.step === 'awaiting_cancel_choice' && state.pendingCancelAppointmentIds?.length) ||
    (state.step === 'awaiting_reschedule_choice' && state.pendingRescheduleAppointmentIds?.length)
      ? ' User is picking which appointment. Use pick_appointment tool.'
      : '';

  const systemPrompt = buildResponseSystemPrompt(doctorContext);
  const systemContent =
    systemPrompt +
    `\n\nIntent: ${currentIntent}.${stepContext}${cancelContext}${pickContext} If the user clearly confirms or picks, call the appropriate tool. Otherwise reply with a short clarification.`;

  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
    { role: 'system', content: systemContent },
    ...historyMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: redactedCurrent },
  ];

  const baseParams = {
    model: config.model,
    max_completion_tokens: config.maxTokens,
    messages,
    stream: false as const,
  };

  // Force tool call when only confirm_cancel - API guarantees a tool call, no text-only reply
  const forceConfirmCancel =
    availableTools.length === 1 &&
    availableTools[0] === 'confirm_cancel' &&
    state.step === 'awaiting_cancel_confirmation';
  const toolChoice = forceConfirmCancel
    ? ({ type: 'function' as const, function: { name: 'confirm_cancel' } })
    : 'auto';

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const completion =
        tools.length > 0
          ? await client.chat.completions.create({
              ...baseParams,
              tools,
              tool_choice: toolChoice,
            })
          : await client.chat.completions.create(baseParams);

      const msg = completion.choices[0]?.message;
      const usage = completion.usage;

      const toolCalls: ToolCallFromAI[] = [];
      if (msg?.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          const fn = 'function' in tc ? tc.function : undefined;
          if (fn?.name && typeof fn.arguments === 'string') {
            toolCalls.push({
              id: tc.id ?? '',
              name: fn.name,
              arguments: fn.arguments,
            });
          }
        }
      }

      const content = msg?.content?.trim();
      const reply = content || (toolCalls.length > 0 ? '' : FALLBACK_RESPONSE);

      await logAIResponseGeneration({
        correlationId,
        model: config.model,
        redactionApplied: true,
        status: 'success',
        resourceId: conversationId,
        tokens: usage?.total_tokens,
      });

      return {
        reply,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      };
    } catch (err) {
      const isLastAttempt = attempt === MAX_RETRIES - 1;
      logger.warn(
        {
          correlationId,
          conversationId,
          attempt: attempt + 1,
          err: err instanceof Error ? err.message : 'unknown',
        },
        'generateResponseWithActions attempt failed'
      );
      if (isLastAttempt) {
        await logAIResponseGeneration({
          correlationId,
          model: config.model,
          redactionApplied: true,
          status: 'failure',
          resourceId: conversationId,
          errorMessage: 'response_with_actions_failed_after_retries',
        });
        return { reply: FALLBACK_RESPONSE };
      }
      const delayMs = RETRY_DELAYS_MS[attempt] ?? 4000;
      await sleep(delayMs);
    }
  }

  return { reply: FALLBACK_RESPONSE };
}

// ============================================================================
// RBH-19 Phase 2 — optional short LLM line after deterministic blocks (mid-collection fee)
// ============================================================================

const DM_REPLY_BRIDGE_MAX_COMPLETION_TOKENS = 120;

const DM_REPLY_BRIDGE_SYSTEM = `You write a very short follow-up for a clinic assistant on Instagram DM.
The patient already sees another block with exact consultation fees and booking steps (rupee amounts are there only — not in your text).

Write 1–2 short sentences that acknowledge their message in a natural, warm tone. Match the user's language style (e.g. Hinglish when they use Hinglish).

STRICT RULES:
- Do NOT state prices, fees, rupees, INR, amounts, or any digits that could be read as a price.
- Do NOT invent or repeat URLs, booking links, or phone numbers.
- If costs matter, refer only to "the details above" / "jo upar diya hai" — never quote numbers.
- Plain text only (no markdown headings, no bullet lists).`;

/**
 * When `AI_DM_REPLY_BRIDGE_ENABLED`, appends a short OpenAI completion after `baseReply`.
 * User/PHI content is redacted per COMPLIANCE.md G. On failure or disabled flag, returns `baseReply` unchanged.
 */
export async function appendOptionalDmReplyBridge(params: {
  correlationId: string;
  userText: string;
  baseReply: string;
}): Promise<string> {
  const { correlationId, userText, baseReply } = params;
  if (!env.AI_DM_REPLY_BRIDGE_ENABLED) {
    return baseReply;
  }
  const client = getOpenAIClient();
  const config = getOpenAIConfig();
  if (!client) {
    return baseReply;
  }
  const redacted = redactPhiForAI(userText);
  if (!redacted.trim()) {
    return baseReply;
  }

  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      max_completion_tokens: DM_REPLY_BRIDGE_MAX_COMPLETION_TOKENS,
      messages: [
        { role: 'system', content: DM_REPLY_BRIDGE_SYSTEM },
        {
          role: 'user',
          content: `Patient's latest message (redacted):\n${redacted.slice(0, 500)}\n\nWrite only the brief acknowledgment (1–2 sentences).`,
        },
      ],
    });

    const bridge = completion.choices[0]?.message?.content?.trim() ?? '';
    const usage = completion.usage;

    if (!bridge) {
      await logAuditEvent({
        correlationId,
        action: 'ai_dm_reply_bridge',
        resourceType: 'ai',
        status: 'failure',
        errorMessage: 'empty_completion',
        metadata: { model: config.model, redactionApplied: true },
      });
      return baseReply;
    }

    await logAuditEvent({
      correlationId,
      action: 'ai_dm_reply_bridge',
      resourceType: 'ai',
      status: 'success',
      metadata: {
        model: config.model,
        redactionApplied: true,
        tokens: usage?.total_tokens,
      },
    });

    return `${baseReply}\n\n${bridge}`;
  } catch (err) {
    logger.warn(
      { correlationId, err: err instanceof Error ? err.message : String(err) },
      'appendOptionalDmReplyBridge failed; using deterministic reply only'
    );
    await logAuditEvent({
      correlationId,
      action: 'ai_dm_reply_bridge',
      resourceType: 'ai',
      status: 'failure',
      errorMessage: err instanceof Error ? err.message : 'unknown',
      metadata: { model: config.model, redactionApplied: true },
    });
    return baseReply;
  }
}
