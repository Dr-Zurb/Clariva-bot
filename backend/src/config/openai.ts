/**
 * OpenAI Client Configuration
 *
 * Provides OpenAI client instance and config from env (config/env only; no raw process.env).
 * Client is created only when OPENAI_API_KEY is set. Callers (e.g. ai-service in Task 2)
 * MUST fail fast if getOpenAIClient() returns null when they need to call the API.
 *
 * Config (model, maxTokens) is exposed for Task 2: cost tracking, token limits,
 * and audit metadata (COMPLIANCE.md section G, EXTERNAL_SERVICES.md).
 */

import OpenAI from 'openai';
import { env } from './env';

/** Default model when OPENAI_MODEL is not set (flagship: best quality, cost no issue). */
const DEFAULT_OPENAI_MODEL = 'gpt-5.2';

/** Default max tokens for completion when OPENAI_MAX_TOKENS is not set. */
const DEFAULT_OPENAI_MAX_TOKENS = 256;

/**
 * OpenAI client instance (lazy). Created once when key is present.
 * Do not call API methods when key is missing; getOpenAIClient() returns null in that case.
 */
let clientInstance: OpenAI | null | undefined = undefined;

/**
 * Returns the OpenAI client when OPENAI_API_KEY is set; otherwise null.
 * Callers that need to call the API MUST check for null and fail fast or use fallback
 * (e.g. return intent 'unknown' in intent detection).
 *
 * Uses config/env only (no raw process.env).
 */
export function getOpenAIClient(): OpenAI | null {
  if (clientInstance === undefined) {
    const apiKey = env.OPENAI_API_KEY;
    if (apiKey && apiKey.length > 0) {
      clientInstance = new OpenAI({ apiKey });
    } else {
      clientInstance = null;
    }
  }
  return clientInstance;
}

/**
 * OpenAI config for use in Task 2: model identifier and max tokens.
 * Used for audit metadata (model, token count) and for request options (max_tokens).
 */
export interface OpenAIConfig {
  /** Model identifier (for API calls and audit). */
  model: string;
  /** Max tokens for completion (for API calls and cost control). */
  maxTokens: number;
}

/**
 * Returns OpenAI config from env (model, maxTokens).
 * Always returns valid values (defaults when env vars not set).
 * Use when calling the API or recording audit metadata.
 */
export function getOpenAIConfig(): OpenAIConfig {
  return {
    model: env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
    maxTokens: env.OPENAI_MAX_TOKENS ?? DEFAULT_OPENAI_MAX_TOKENS,
  };
}
