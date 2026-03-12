/**
 * AI Service – Intent Detection & Response Generation
 *
 * Classifies user message text into intents and generates assistive bot replies using OpenAI.
 * PHI is redacted before sending to OpenAI; only metadata is audited (COMPLIANCE.md G).
 * Framework-agnostic: no Express; controllers call this service and use asyncHandler.
 */

import { getOpenAIClient, getOpenAIConfig } from '../config/openai';
import { logger } from '../config/logger';
import type { IntentDetectionResult, Intent } from '../types/ai';
import { toIntent } from '../types/ai';
import type { ConversationState } from '../types/conversation';
import type { Message } from '../types';
import { logAIClassification, logAIResponseGeneration } from '../utils/audit-logger';

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

Valid intents: book_appointment, ask_question, check_availability, greeting, cancel_appointment, revoke_consent, medical_query, emergency, check_appointment_status, unknown.

Intent rules:
- greeting: Use when message is ONLY a greeting with no explicit request (e.g. "hello", "hi", "good morning"). NEVER classify simple greetings as book_appointment.
- book_appointment: Use ONLY when user explicitly asks to book, schedule, or make an appointment (e.g. "book", "schedule", "I want an appointment", "can I book").
- medical_query: User describes symptoms, chief complaints, or asks for medical advice/prescription. Redirect to doctor/clinic; never diagnose.
- emergency: Urgent/emergency language (chest pain, can't breathe, accident). Redirect to emergency services.
- ask_question: General questions (price, timings, location, consultation type). Answer from practice info.
- revoke_consent: User wants to delete data or revoke consent (e.g. "delete my data", "revoke consent").
- check_appointment_status: User asks if appointment is confirmed, when is visit.
- unknown: Spam, vulgar, meaningless, or unclear. Polite deflection.

Examples: "hello" → greeting; "book appointment" → book_appointment; "I have fever" → medical_query; "chest pain" → emergency.

Respond with a single JSON object: { "intent": "<one of the valid intents>", "confidence": <number 0.0 to 1.0> }.
Use "unknown" only when the message does not clearly match any other intent.`;

/** Base receptionist system prompt (e-task-3). Practice name injected dynamically (e-task-4). */
const RESPONSE_SYSTEM_PROMPT_BASE = `You are a warm, friendly medical practice receptionist. You help with scheduling and general questions. You do NOT diagnose or give medical advice.

LANGUAGE: Respond in the SAME language the user writes in. If they write in Hindi, Hinglish, or Hindi written in English (e.g. "kya aap available ho"), respond in that style. If they write in English, respond in English. Match their tone and script.

GREETING: When currentIntent is greeting, greet back warmly, introduce yourself as the practice's assistant, and ask how you can help (e.g. book appointment, check availability, ask a question). Do NOT start collecting name, phone, or other booking details on greeting alone.

IMPORTANT - Our booking flow collects: full name, phone number; then we show numbered slots for date/time (user picks 1, 2, 3). We do NOT ask for ZIP code, "new or established patient", or free-text "what date/time?". Keep replies brief and natural.

CRITICAL - When currentIntent is book_appointment, the user has ALREADY chosen to book. NEVER ask "would you like to book or ask a question?"—go straight to the current step (e.g. ask for full name). Never repeat that choice prompt. If state shows collecting_name, collecting_phone, consent, or selecting_slot, proceed with the current step only. If the user asks "what's YOUR name" (to the bot), say you're the practice's assistant and ask for THEIR name—one brief reply only.

NEVER ask "what date/time?" or "share two date/time options"—we use a slot-selection flow. When we need date/time, the system shows numbered slots; the user picks 1, 2, 3. Your job is only to collect name, phone, or handle consent/other questions.

Tone: Conversational. When collecting info, ask for one thing at a time per the current step. If the user asks something outside your role, politely suggest they speak with the practice.`;

/** Safe fallback when response generation fails (no PHI, no medical advice). */
const FALLBACK_RESPONSE =
  "I didn't quite get that. Could you rephrase? Or say 'book appointment', 'check availability', or 'cancel appointment' if that's what you need.";

/** Max message pairs (user+assistant) to include in history for token control. */
const MAX_HISTORY_PAIRS = 5;

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
}

export interface GenerateResponseInput {
  conversationId: string;
  currentIntent: Intent;
  state: ConversationState;
  recentMessages: Message[];
  currentUserMessage: string;
  correlationId: string;
  doctorContext?: DoctorContext;
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
  const collectionHint =
    state?.step?.startsWith('collecting_')
      ? ' If the step is collecting_<field>, ask the user for that field only (e.g. collecting_name -> ask for full name, collecting_phone -> ask for phone number, collecting_consultation_type -> ask "Would you prefer Video or In-clinic consultation?"). Keep the question brief. Do not ask for other fields.'
      : '';
  const consentHint =
    state?.step === 'consent'
      ? ' The user has provided their details. Use a combined consent message: thank them by name, say we\'ll use their phone number to confirm the appointment by call or text, and ask "Ready to pick a time?" (e.g. "Thanks, [Name]. We\'ll use [phone] to confirm your appointment. Ready to pick a time?"). Do NOT ask "Do I have your permission to use this number?"—providing the number implies consent.'
      : '';
  const systemPrompt = buildResponseSystemPrompt(doctorContext);
  const systemContent =
    systemPrompt +
    `\n\nCurrent detected intent for the latest user message: ${currentIntent}.${stepContext}${collectedContext}${collectionHint}${consentHint}`;

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
