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

/** Default model when OPENAI_MODEL is not set (reply-tier: gpt-5.6-luna). */
const DEFAULT_OPENAI_MODEL = 'gpt-5.6-luna';

/** Default max tokens for completion when OPENAI_MAX_TOKENS is not set. */
const DEFAULT_OPENAI_MAX_TOKENS = 256;

/**
 * asmt-07: Tier-1 default for the diagnosis ICD-11 resolver — bounded JSON
 * term normalization; mini is sufficient because output is catalog-constrained
 * + suggestion-only (the server re-resolves every term against the catalog).
 */
const DEFAULT_OPENAI_DIAGNOSIS_RESOLVE_MODEL = 'gpt-4o-mini';

/** asmt-07: Room for a handful of short candidate terms + envelope overhead. */
const DEFAULT_OPENAI_DIAGNOSIS_RESOLVE_MAX_TOKENS = 400;

/**
 * inv-lib-04: Tier-1 default for the investigation order resolver — bounded JSON
 * term normalization. Mini is sufficient because the model only NORMALIZES text
 * into order terms; the frontend static catalog re-resolves every term (the model
 * can never inject an order the catalog does not know).
 */
const DEFAULT_OPENAI_INVESTIGATION_RESOLVE_MODEL = 'gpt-4o-mini';

/** inv-lib-04: Room for a handful of short candidate order terms + envelope overhead. */
const DEFAULT_OPENAI_INVESTIGATION_RESOLVE_MAX_TOKENS = 400;

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
 * lat-02: Tier-1 default for DM intent / booking-turn classification — bounded
 * JSON under a small token cap. Mini is sufficient; never inherit the flagship
 * `OPENAI_MODEL` default.
 */
const DEFAULT_OPENAI_INTENT_CLASSIFY_MODEL = 'gpt-4o-mini';

/** Room for small intent JSON (+ topics / fee flags). Matches INTENT_CLASSIFICATION_MAX_COMPLETION_TOKENS. */
const DEFAULT_OPENAI_INTENT_CLASSIFY_MAX_TOKENS = 160;

/**
 * rpt-05.6: lab-photo table extraction. Vision-capable and NOT mini — dense
 * multi-column lab tables are where mini misreads, and the reply-tier
 * `OPENAI_MODEL` default is not guaranteed to accept image input.
 */
const DEFAULT_OPENAI_LAB_VISION_MODEL = 'gpt-4o';

/** A full panel photo can yield ~60 rows of bounded JSON. */
const DEFAULT_OPENAI_LAB_VISION_MAX_TOKENS = 4000;

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

/**
 * GPT-5.6+ explicit prompt cache. Implicit mode writes a breakpoint on the
 * latest (volatile) message and bills 1.25× for that write. Explicit mode
 * caches only the block we mark. openai@6.14 types omit these fields; the
 * Chat Completions API accepts them. Do not send on pre-5.6 models (400).
 */
export type ExplicitPromptCacheParams = {
  prompt_cache_key: string;
  prompt_cache_options: { mode: 'explicit'; ttl: '30m' };
};

export function isGpt56Family(model: string): boolean {
  return model.startsWith('gpt-5.6');
}

export function replyPromptCacheParams(cacheKey: string): ExplicitPromptCacheParams {
  return {
    prompt_cache_key: cacheKey,
    prompt_cache_options: { mode: 'explicit', ttl: '30m' },
  };
}

export function cachedSystemTextPart(text: string): {
  type: 'text';
  text: string;
  prompt_cache_breakpoint: { mode: 'explicit' };
} {
  return {
    type: 'text',
    text,
    prompt_cache_breakpoint: { mode: 'explicit' },
  };
}

/** Which complaint-parse model tier to use (subj-14). */
export type ComplaintParseModelTier = 'default' | 'escalation';

/**
 * OpenAI config for complaint free-text parse (subj-14).
 * Separate from {@link getOpenAIConfig} so this small JSON task does not
 * inherit the reply-tier `OPENAI_MODEL` default.
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

/** Which diagnosis-resolver model tier to use (asmt-07 ICD-11 resolver). */
export type DiagnosisResolveModelTier = 'default' | 'escalation';

/**
 * OpenAI config for the diagnosis ICD-11 resolver (asmt-07). Separate from
 * {@link getOpenAIConfig} so this small JSON task does not inherit the flagship
 * `OPENAI_MODEL` default.
 */
export interface DiagnosisResolveOpenAIConfig {
  /** Model identifier (for API calls and audit). */
  model: string;
  /** Max completion tokens for the resolve response. */
  maxTokens: number;
  /** Tier that resolved `model` (for audit / telemetry). */
  tier: DiagnosisResolveModelTier;
}

/**
 * Returns diagnosis-resolver model config for the given tier.
 *
 * - **default** (Tier 1): auto-gated fallback — `OPENAI_DIAGNOSIS_RESOLVE_MODEL`
 *   or `gpt-4o-mini`. Cheap catalog-constrained term normalization.
 * - **escalation** (Tier 2): explicit "✨" refine / Tier-1 empty —
 *   `OPENAI_DIAGNOSIS_RESOLVE_ESCALATION_MODEL` or flagship `OPENAI_MODEL`.
 */
export function getOpenAIDiagnosisResolveConfig(
  tier: DiagnosisResolveModelTier = 'default',
): DiagnosisResolveOpenAIConfig {
  const flagship = env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  const model =
    tier === 'escalation'
      ? (env.OPENAI_DIAGNOSIS_RESOLVE_ESCALATION_MODEL ?? flagship)
      : (env.OPENAI_DIAGNOSIS_RESOLVE_MODEL ?? DEFAULT_OPENAI_DIAGNOSIS_RESOLVE_MODEL);

  return {
    model,
    maxTokens:
      env.OPENAI_DIAGNOSIS_RESOLVE_MAX_TOKENS ?? DEFAULT_OPENAI_DIAGNOSIS_RESOLVE_MAX_TOKENS,
    tier,
  };
}

export type InvestigationResolveModelTier = 'default' | 'escalation';

/**
 * OpenAI config for the investigation order resolver (inv-lib-04). Separate from
 * {@link getOpenAIConfig} so this small JSON task does not inherit the flagship
 * `OPENAI_MODEL` default.
 */
export interface InvestigationResolveOpenAIConfig {
  /** Model identifier (for API calls and audit). */
  model: string;
  /** Max completion tokens for the resolve response. */
  maxTokens: number;
  /** Tier that resolved `model` (for audit / telemetry). */
  tier: InvestigationResolveModelTier;
}

/**
 * Returns investigation-resolver model config for the given tier.
 *
 * - **default** (Tier 1): auto-gated fallback — `OPENAI_INVESTIGATION_RESOLVE_MODEL`
 *   or `gpt-4o-mini`. Cheap catalog-constrained order-term normalization.
 * - **escalation** (Tier 2): explicit "✨" refine / Tier-1 empty —
 *   `OPENAI_INVESTIGATION_RESOLVE_ESCALATION_MODEL` or flagship `OPENAI_MODEL`.
 */
export function getOpenAIInvestigationResolveConfig(
  tier: InvestigationResolveModelTier = 'default',
): InvestigationResolveOpenAIConfig {
  const flagship = env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  const model =
    tier === 'escalation'
      ? (env.OPENAI_INVESTIGATION_RESOLVE_ESCALATION_MODEL ?? flagship)
      : (env.OPENAI_INVESTIGATION_RESOLVE_MODEL ??
        DEFAULT_OPENAI_INVESTIGATION_RESOLVE_MODEL);

  return {
    model,
    maxTokens:
      env.OPENAI_INVESTIGATION_RESOLVE_MAX_TOKENS ??
      DEFAULT_OPENAI_INVESTIGATION_RESOLVE_MAX_TOKENS,
    tier,
  };
}

/**
 * OpenAI config for DM intent classification and booking-turn classifiers (lat-02).
 * Separate from {@link getOpenAIConfig} so this small JSON task does not
 * inherit the reply-tier `OPENAI_MODEL` default.
 */
export interface IntentClassifyOpenAIConfig {
  /** Model identifier (for API calls and audit). */
  model: string;
  /** Max completion tokens for the classification JSON. */
  maxTokens: number;
}

/**
 * Returns intent-classification model config.
 *
 * Default: `OPENAI_INTENT_CLASSIFY_MODEL` or `gpt-4o-mini`. Never falls through
 * to the flagship — a mispriced intent call was paying ~2s per DM turn.
 */
export function getOpenAIIntentClassifyConfig(): IntentClassifyOpenAIConfig {
  return {
    model: env.OPENAI_INTENT_CLASSIFY_MODEL ?? DEFAULT_OPENAI_INTENT_CLASSIFY_MODEL,
    maxTokens:
      env.OPENAI_INTENT_CLASSIFY_MAX_TOKENS ?? DEFAULT_OPENAI_INTENT_CLASSIFY_MAX_TOKENS,
  };
}

/**
 * rpt-05.6: whether lab-report PHOTO extraction may call out at all.
 *
 * This is a PHI-egress switch, not a feature toggle. A lab-report photo cannot
 * be redacted before it is sent (the patient's identifiers are printed on it),
 * so the call is gated on an explicit opt-in that stays off until the
 * data-processor decision is recorded. Having `OPENAI_API_KEY` set is NOT
 * sufficient — every other AI feature here sends redacted text and must keep
 * working without implying consent for images.
 */
export function isLabVisionExtractEnabled(): boolean {
  return env.OPENAI_LAB_VISION_ENABLED === true;
}

/** rpt-05.6: model config for lab-photo extraction. */
export interface LabVisionOpenAIConfig {
  /** Model identifier (for API calls and audit). */
  model: string;
  /** Max completion tokens for the extracted-row JSON. */
  maxTokens: number;
}

/**
 * Returns lab-photo extraction model config.
 *
 * Default: `OPENAI_LAB_VISION_MODEL` or `gpt-4o`. Unlike the text parses there
 * is no mini tier — this task reads numbers off a photograph, so the cheap tier
 * would trade the one thing that must not be wrong.
 */
export function getOpenAILabVisionConfig(): LabVisionOpenAIConfig {
  return {
    model: env.OPENAI_LAB_VISION_MODEL ?? DEFAULT_OPENAI_LAB_VISION_MODEL,
    maxTokens: env.OPENAI_LAB_VISION_MAX_TOKENS ?? DEFAULT_OPENAI_LAB_VISION_MAX_TOKENS,
  };
}
