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
 * subj-14: Tier-1 default for complaint free-text parse — bounded JSON
 * slot-fill; mini is sufficient because output is schema-bounded + suggestion-only.
 */
const DEFAULT_OPENAI_COMPLAINT_PARSE_MODEL = 'gpt-4o-mini';

/** subj-14: Room for ~3 complaints × ~100 tokens + envelope overhead. */
const DEFAULT_OPENAI_COMPLAINT_PARSE_MAX_TOKENS = 500;

/**
 * Chart medicine free-text parse — Tier-1 default. Bounded JSON sig extraction;
 * a mini model is sufficient (schema-bounded + suggestion-only).
 */
const DEFAULT_OPENAI_MEDICINE_PARSE_MODEL = 'gpt-4o-mini';

/** Medicine parse can carry several drugs per line, each with many sig fields. */
const DEFAULT_OPENAI_MEDICINE_PARSE_MAX_TOKENS = 700;

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

/** Which complaint-parse model tier to use (subj-14). */
export type ComplaintParseModelTier = 'default' | 'escalation';

/**
 * OpenAI config for complaint free-text parse (subj-14).
 * Separate from {@link getOpenAIConfig} so this small JSON task does not
 * inherit the flagship `OPENAI_MODEL` default (`gpt-5.2`).
 */
export interface ComplaintParseOpenAIConfig {
  /** Model identifier (for API calls and audit). */
  model: string;
  /** Max completion tokens for the parse response. */
  maxTokens: number;
  /** Tier that resolved `model` (for audit / telemetry). */
  tier: ComplaintParseModelTier;
}

/**
 * Returns complaint-parse model config for the given tier.
 *
 * - **default** (Tier 1): auto-gated fallback — `OPENAI_COMPLAINT_PARSE_MODEL`
 *   or `gpt-4o-mini`. Cheap structured extraction.
 * - **escalation** (Tier 2): explicit refine / Tier-1 retry —
 *   `OPENAI_COMPLAINT_PARSE_ESCALATION_MODEL` or flagship `OPENAI_MODEL`.
 */
export function getOpenAIComplaintParseConfig(
  tier: ComplaintParseModelTier = 'default',
): ComplaintParseOpenAIConfig {
  const flagship = env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  const model =
    tier === 'escalation'
      ? (env.OPENAI_COMPLAINT_PARSE_ESCALATION_MODEL ?? flagship)
      : (env.OPENAI_COMPLAINT_PARSE_MODEL ?? DEFAULT_OPENAI_COMPLAINT_PARSE_MODEL);

  return {
    model,
    maxTokens:
      env.OPENAI_COMPLAINT_PARSE_MAX_TOKENS ?? DEFAULT_OPENAI_COMPLAINT_PARSE_MAX_TOKENS,
    tier,
  };
}

/** Which medicine-parse model tier to use (chart-med free-text fallback). */
export type MedicineParseModelTier = 'default' | 'escalation';

/**
 * OpenAI config for chart medicine free-text parse. Separate from
 * {@link getOpenAIConfig} so this small JSON task does not inherit the flagship
 * `OPENAI_MODEL` default.
 */
export interface MedicineParseOpenAIConfig {
  /** Model identifier (for API calls and audit). */
  model: string;
  /** Max completion tokens for the parse response. */
  maxTokens: number;
  /** Tier that resolved `model` (for audit / telemetry). */
  tier: MedicineParseModelTier;
}

/**
 * Returns medicine-parse model config for the given tier.
 *
 * - **default** (Tier 1): auto-gated fallback — `OPENAI_MEDICINE_PARSE_MODEL`
 *   or `gpt-4o-mini`.
 * - **escalation** (Tier 2): explicit "✨" refine / Tier-1 retry —
 *   `OPENAI_MEDICINE_PARSE_ESCALATION_MODEL` or flagship `OPENAI_MODEL`.
 */
export function getOpenAIMedicineParseConfig(
  tier: MedicineParseModelTier = 'default',
): MedicineParseOpenAIConfig {
  const flagship = env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  const model =
    tier === 'escalation'
      ? (env.OPENAI_MEDICINE_PARSE_ESCALATION_MODEL ?? flagship)
      : (env.OPENAI_MEDICINE_PARSE_MODEL ?? DEFAULT_OPENAI_MEDICINE_PARSE_MODEL);

  return {
    model,
    maxTokens:
      env.OPENAI_MEDICINE_PARSE_MAX_TOKENS ?? DEFAULT_OPENAI_MEDICINE_PARSE_MAX_TOKENS,
    tier,
  };
}
