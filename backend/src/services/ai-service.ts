/**
 * AI Service – Intent Detection & Response Generation
 *
 * Classifies user message text into intents and generates assistive bot replies using OpenAI.
 * PHI is redacted before sending to OpenAI; only metadata is audited (COMPLIANCE.md G).
 * Framework-agnostic: no Express; controllers call this service and use asyncHandler.
 */

import { getOpenAIClient, getOpenAIConfig } from '../config/openai';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { IntentDetectionResult, Intent } from '../types/ai';
import { toIntent } from '../types/ai';
import type { ConversationState } from '../types/conversation';
import type { Message } from '../types';
import { logAIClassification, logAIResponseGeneration, logAuditEvent } from '../utils/audit-logger';
import type { CollectedPatientData } from '../utils/validation';

// ============================================================================
// Constants
// ============================================================================

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

/** In-memory cache TTL (ms). Key = redacted text; cache hit = no OpenAI call, no audit. */
const INTENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
/** Max cache entries; evict oldest when full (Map insertion order). */
const INTENT_CACHE_MAX_SIZE = 500;

interface CacheEntry {
  result: IntentDetectionResult;
  expiresAt: number;
}

/** In-memory cache for intent by redacted input. Per-process; not shared across instances. */
const intentCache = new Map<string, CacheEntry>();

function getCachedIntent(redactedText: string): IntentDetectionResult | null {
  const entry = intentCache.get(redactedText);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) intentCache.delete(redactedText);
    return null;
  }
  return entry.result;
}

function setCachedIntent(redactedText: string, result: IntentDetectionResult): void {
  if (intentCache.size >= INTENT_CACHE_MAX_SIZE) {
    const firstKey = intentCache.keys().next().value;
    if (firstKey !== undefined) intentCache.delete(firstKey);
  }
  intentCache.set(redactedText, {
    result,
    expiresAt: Date.now() + INTENT_CACHE_TTL_MS,
  });
}

// ============================================================================
// Deterministic Intent Rules (before AI) - e-task-1 receptionist conversation rules
// ============================================================================

/** Simple greetings only (no mixed content). Match → greeting, skip AI. */
const SIMPLE_GREETING_REGEX = /^(hi|hello|hey|hiya|howdy|namaste|नमस्ते|good\s*morning|good\s*afternoon|good\s*evening|good\s*day)[\s!?.]*$/i;

/** e-task-4: Multi-person "me and my X". Must run before BOOK_FOR_SOMEONE_ELSE. */
const MULTI_PERSON_BOOKING_REGEX =
  /\b(?:book|schedule|appointment|want\s+to\s+book)\s+(?:an?\s+)?(?:appointment\s+)?(?:for\s+)?(?:me|myself|us)\s+and\s+(?:my\s+)?(mother|father|mom|dad|wife|husband|son|daughter|sister|brother|parent|spouse)\b/i;

/** Book for someone else (e.g. "book for my mother/sister"). Match → book_for_someone_else. */
const BOOK_FOR_SOMEONE_ELSE_REGEX =
  /\b(book|schedule|appointment|want\s+to\s+book)\s+(?:an?\s+)?(?:appointment\s+)?(?:for\s+)?(?:my\s+)?(mother|father|mom|dad|wife|husband|son|daughter|sister|brother|parent|spouse|someone\s+else|them)\b/i;

/** Payment done / check appointment status. Match → check_appointment_status. */
const CHECK_APPOINTMENT_REGEX =
  /\b(payment\s+done|paid|i\s+just\s+paid|what\s+about\s+(?:my\s+)?payment|check\s+my\s+(?:appointment|details)|is\s+it\s+confirmed|appointment\s+confirmed|did\s+payment\s+go\s+through)\b/i;

function isBookForSomeoneElse(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 120) return false;
  return MULTI_PERSON_BOOKING_REGEX.test(trimmed) || BOOK_FOR_SOMEONE_ELSE_REGEX.test(trimmed);
}

/**
 * e-task-4: Parse "book for me and my X" — returns relation when multi-person, null otherwise.
 * Use in webhook to distinguish multi-person from single-person book_for_someone_else.
 */
export function parseMultiPersonBooking(text: string): { relation: string } | null {
  const trimmed = text.trim();
  if (trimmed.length > 120) return null;
  const match = trimmed.match(MULTI_PERSON_BOOKING_REGEX);
  if (!match) return null;
  return { relation: match[1].toLowerCase() };
}

function isCheckAppointmentStatus(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 100) return false;
  return CHECK_APPOINTMENT_REGEX.test(trimmed);
}

/** Emergency keywords/phrases. Match → emergency, skip AI. */
const EMERGENCY_PATTERNS = [
  /\b(chest\s+pain|can'?t\s+breathe|cannot\s+breathe|difficulty\s+breathing)\b/i,
  /\b(heart\s+attack|stroke|unconscious)\b/i,
  /\b(emergency|urgent|accident|bleeding)\b/i,
  /\b(severe\s+pain|critical)\b/i,
];

function isSimpleGreeting(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 50) return false; // Long messages are not simple greetings
  return SIMPLE_GREETING_REGEX.test(trimmed);
}

function isEmergency(text: string): boolean {
  return EMERGENCY_PATTERNS.some((p) => p.test(text));
}

/** Fixed response for medical_query intent. No AI-generated medical advice. */
export const MEDICAL_QUERY_RESPONSE =
  "I'm the scheduling assistant. For medical questions, please speak with the doctor during your appointment or call the clinic directly.";

/** Fixed response for emergency intent. */
export const EMERGENCY_RESPONSE =
  "Please call emergency services or go to the nearest hospital immediately.";

// ============================================================================
// AI Prompts
// ============================================================================

const SYSTEM_PROMPT = `You are a medical receptionist intent classifier. Classify the user message into exactly one intent. Do not diagnose or give clinical advice.
Classify intent regardless of language. User may write in English, Hindi, Hinglish, or transliterated Hindi.

Valid intents: book_appointment, book_for_someone_else, ask_question, check_availability, greeting, cancel_appointment, revoke_consent, medical_query, emergency, check_appointment_status, unknown.

Intent rules:
- greeting: Use when message is ONLY a greeting with no explicit request (e.g. "hello", "hi", "good morning"). NEVER classify simple greetings as book_appointment.
- book_for_someone_else: Use when user wants to book for ANOTHER person (e.g. "book for my mother", "schedule appointment for my wife", "I want to book for my dad", "book for someone else").
- book_appointment: Use when user explicitly asks to book for THEMSELVES (e.g. "book", "schedule", "I want an appointment", "can I book"). NOT when they say "for my mother" etc.
- medical_query: User describes symptoms, chief complaints, or asks for medical advice/prescription. Redirect to doctor/clinic; never diagnose.
- emergency: Urgent/emergency language (chest pain, can't breathe, accident). Redirect to emergency services.
- ask_question: General questions (price, timings, location, consultation type). Answer from practice info.
- revoke_consent: User wants to delete data or revoke consent (e.g. "delete my data", "revoke consent").
- check_appointment_status: User asks if appointment is confirmed, when is visit.
- unknown: Spam, vulgar, meaningless, or unclear. Polite deflection.

Examples: "hello" → greeting; "book appointment" → book_appointment; "book for my mother" → book_for_someone_else; "I have fever" → medical_query; "chest pain" → emergency.

Respond with a single JSON object: { "intent": "<one of the valid intents>", "confidence": <number 0.0 to 1.0> }.
Use "unknown" only when the message does not clearly match any other intent.`;

/** Base receptionist system prompt (e-task-3). Practice name injected dynamically (e-task-4). e-task-2: Acknowledge, relation, conversational tone. */
const RESPONSE_SYSTEM_PROMPT_BASE = `You are a warm, friendly medical practice receptionist. You help with scheduling and general questions. You do NOT diagnose or give medical advice.

LANGUAGE: Respond in the SAME language the user writes in. If they write in Hindi, Hinglish, or Hindi written in English (e.g. "kya aap available ho"), respond in that style. If they write in English, respond in English. Match their tone and script.

GREETING: When currentIntent is greeting, greet back warmly, introduce yourself as the practice's assistant, and ask how you can help (e.g. book appointment, check availability, ask a question). Do NOT start collecting name, phone, or other booking details on greeting alone.

IMPORTANT - Our booking flow collects: full name, age, gender, phone number, reason for visit (required); email (optional). Then we confirm details, get consent, and show a link to pick a slot. Keep replies brief and natural.

CRITICAL - When currentIntent is book_appointment, the user has ALREADY chosen to book. NEVER ask "would you like to book or ask a question?"—go straight to the current step (e.g. ask for full name). Never repeat that choice prompt. If state shows collecting_name, collecting_phone, consent, or selecting_slot, proceed with the current step only. If the user asks "what's YOUR name" (to the bot), say you're the practice's assistant and ask for THEIR name—one brief reply only.

NEVER ask "what date/time?" or "share two date/time options"—we use a slot-selection flow. When we need date/time, the system shows numbered slots; the user picks 1, 2, 3. Your job is only to collect name, phone, or handle consent/other questions.

CRITICAL - NEVER output placeholder text like "[Slot selection link]", "[link]", or "**[Slot selection link]**". The system injects the real URL when needed. You do not have access to it. If you mention a link, do not invent one—the system handles it.

CRITICAL - When state shows collecting_all or confirm_details with collectedFields, the user has ALREADY shared details. NEVER repeat "Please share: Full name, Age, Mobile, Reason for visit". Acknowledge what they said, ask for missing fields only, or move to confirmation. If they refine the reason (e.g. "i wanna get her checked for diabetes"), treat it as updating the reason—do NOT start over.

ACKNOWLEDGE FIRST - ALWAYS acknowledge what the user just said before asking for more. Examples: "Got it, your sister." / "Thanks for clarifying." / "Understood." Do not repeat the same prompt verbatim when the user has already responded.

RELATION - When Context says "Booking for user's [relation]" (e.g. sister, mother), use the relation in your reply. Say "your sister" or "for your mother" not "them" when known. When the user clarifies (e.g. "my sister?", "sister first"), acknowledge the clarification and continue with the flow. Do not start over.

TONE - Be warm and natural. Match the user's energy. Avoid robotic repetition. When collecting info, ask for one thing at a time per the current step. Do not repeat the same prompt verbatim when the user has already responded. If the user asks something outside your role, politely suggest they speak with the practice.`;

/** Safe fallback when response generation fails (no PHI, no medical advice). */
const FALLBACK_RESPONSE =
  "I didn't quite get that. Could you rephrase? Or say 'book appointment', 'check availability', or 'cancel appointment' if that's what you need.";

/** e-task-5: Max message pairs (user+assistant) for AI context. Trade-off: more context vs token cost. */
const MAX_HISTORY_PAIRS = env.AI_MAX_HISTORY_PAIRS;

/** Exported for webhook: fetch at least 2 * MAX_HISTORY_PAIRS messages. */
export const AI_RECENT_MESSAGES_LIMIT = MAX_HISTORY_PAIRS * 2;

// ============================================================================
// PHI Redaction (COMPLIANCE.md G – redact before sending to OpenAI)
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

/** e-task-6: Prompt for AI-assisted field extraction when regex fails. No PHI in prompt. */
const EXTRACTION_SYSTEM_PROMPT = `You extract patient booking fields from a user message. Return ONLY a JSON object with the fields you can clearly identify. Extract only what is explicitly stated; do not infer or guess.

Valid fields: name, phone, age, gender, reason_for_visit, email.
- reason_for_visit: chief complaint, symptom, or reason (e.g. "diabetes check", "stomach pain", "get her checked for X"). NEVER use symptom/reason as name.
- name: person's name only. NEVER use phrases like "i have stomach pain" or "she has diabetes" as name.
- phone: digits only, 10+ digits
- age: number 1-120
- gender: male, female, or other
- email: valid email format

If the message says "i wanna get her checked for diabetes" or "she has stomach pain", extract reason_for_visit (e.g. "diabetes check" or "stomach pain"), NOT name.
Return empty object {} if nothing can be extracted. Output format: { "name": "...", "phone": "...", "age": N, "gender": "...", "reason_for_visit": "...", "email": "..." } with only the fields you found.`;

/**
 * e-task-6: AI-assisted extraction when regex returns empty. Redacted input only; output is PHI—store only, never log.
 * On failure returns {}; caller merges with existing and validates.
 */
export async function extractFieldsWithAI(
  redactedText: string,
  missingFields: string[],
  correlationId: string
): Promise<Partial<CollectedPatientData>> {
  const client = getOpenAIClient();
  const config = getOpenAIConfig();
  if (!client || !redactedText?.trim() || redactedText.length < 15) {
    return {};
  }

  const userPrompt = `Message: "${redactedText.trim()}"
Fields we still need: ${missingFields.length ? missingFields.join(', ') : 'none'}
Extract any of these fields from the message. Return JSON only.`;

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
      if (!/^\s*(i\s+have|i've\s+got|she\s+has|he\s+has|having|suffering)\b/i.test(name)) {
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

/**
 * Classify user message text into intent + confidence.
 * - Redacts PHI before sending to OpenAI.
 * - Returns { intent: 'unknown', confidence: 0 } when API key is missing, on failure, or on invalid response.
 * - Audits every AI call with metadata only (no raw prompt/response with PHI).
 *
 * @param messageText - Raw user message (may contain PHI)
 * @param correlationId - Request correlation ID for audit and logging
 * @returns Intent and confidence (0–1)
 */
export async function classifyIntent(
  messageText: string,
  correlationId: string
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

  // Deterministic rules (e-task-1): run before AI to avoid misclassification
  if (isEmergency(redactedText)) {
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

  const cached = getCachedIntent(redactedText);
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
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: redactedText },
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

      let parsed: { intent?: string; confidence?: number };
      try {
        parsed = JSON.parse(content) as { intent?: string; confidence?: number };
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

      await logAIClassification({
        correlationId,
        model: config.model,
        redactionApplied: true,
        status: 'success',
        tokens: usage?.total_tokens ?? undefined,
      });

      setCachedIntent(redactedText, { intent, confidence });
      return { intent, confidence };
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
  /** e-task-2: e.g. "Video, In-clinic" — drives consultation type options */
  consultation_types?: string | null;
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
function buildResponseSystemPrompt(doctorContext?: DoctorContext): string {
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
  const aiContextBlock = contextParts.length > 0 ? `\n\nContext: ${contextParts.join(' ')}` : '';
  const collectingAllHint =
    state?.step === 'collecting_all'
      ? ' Ask for ALL details at once: full name, age, gender, mobile number, reason for visit. Email is optional. Example: "To book your appointment, please share: Full name, Age, Gender, Mobile number, Reason for visit. Email (optional) for receipts."'
      : '';
  const collectionHint =
    state?.step?.startsWith('collecting_') && state?.step !== 'collecting_all'
      ? ` If the step is collecting_<field>, ask the user for that field only. Keep the question brief.`
      : '';
  const confirmDetailsHint =
    state?.step === 'confirm_details'
      ? ' The user is confirming their details. The system will read back the summary. If they say Yes, proceed to consent. If they correct something, acknowledge and re-confirm.'
      : '';
  const consentHint =
    state?.step === 'consent'
      ? ' The user has provided their details. Use a combined consent message: thank them by name, say we\'ll use their phone number to confirm the appointment by call or text, and ask "Ready to pick a time?" (e.g. "Thanks, [Name]. We\'ll use [phone] to confirm your appointment. Ready to pick a time?"). Do NOT ask "Do I have your permission to use this number?"—providing the number implies consent. CRITICAL: NEVER output placeholder text like "[Slot selection link]" or "[link]"—the system injects the real URL. If the user says yes to consent, the system handles the link; you do not have access to it. Do not invent or fake a link.'
      : '';
  const systemPrompt = buildResponseSystemPrompt(doctorContext);
  const systemContent =
    systemPrompt +
    `\n\nCurrent detected intent for the latest user message: ${currentIntent}.${stepContext}${collectedContext}${aiContextBlock}${collectingAllHint}${collectionHint}${confirmDetailsHint}${consentHint}`;

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
