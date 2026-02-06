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

const SYSTEM_PROMPT = `You are a medical receptionist intent classifier. Classify the user message into exactly one intent. Do not diagnose or give clinical advice.

Valid intents: book_appointment, ask_question, check_availability, greeting, cancel_appointment, revoke_consent, unknown.
revoke_consent: User wants to delete their data or revoke consent (e.g. "delete my data", "revoke consent", "remove my info").

Respond with a single JSON object: { "intent": "<one of the valid intents>", "confidence": <number 0.0 to 1.0> }.
Use "unknown" only when the message does not clearly match any other intent.`;

/** Receptionist-only system prompt for response generation (e-task-3). No medical advice. */
const RESPONSE_SYSTEM_PROMPT = `You are a friendly medical practice receptionist assistant. You help with scheduling, general questions, and directing patients. You do NOT diagnose, give medical advice, or interpret symptoms. Keep replies brief and helpful. If the user asks something outside your role, politely suggest they speak with the practice or their doctor.`;

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

  const cached = getCachedIntent(redactedText);
  if (cached !== null) {
    return cached;
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: config.model,
        max_tokens: config.maxTokens,
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

export interface GenerateResponseInput {
  conversationId: string;
  currentIntent: Intent;
  state: ConversationState;
  recentMessages: Message[];
  currentUserMessage: string;
  correlationId: string;
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
export async function generateResponse(input: GenerateResponseInput): Promise<string> {
  const {
    conversationId,
    currentIntent,
    state,
    recentMessages,
    currentUserMessage,
    correlationId,
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
  const collectionHint =
    state?.step?.startsWith('collecting_')
      ? ' If the step is collecting_<field>, ask the user for that field only (e.g. collecting_name -> ask for full name, collecting_phone -> ask for phone number). Keep the question brief. Do not ask for other fields.'
      : '';
  const consentHint =
    state?.step === 'consent'
      ? ' The user has provided their details. Ask for consent in plain language: explain we will store their name, phone, and other info for booking and care, per our privacy policy. Ask if they agree (yes/no).'
      : '';
  const systemContent =
    RESPONSE_SYSTEM_PROMPT +
    `\n\nCurrent detected intent for the latest user message: ${currentIntent}.${stepContext}${collectionHint}${consentHint}`;

  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
    { role: 'system', content: systemContent },
    ...historyMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: redactedCurrent },
  ];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: config.model,
        max_tokens: config.maxTokens,
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
