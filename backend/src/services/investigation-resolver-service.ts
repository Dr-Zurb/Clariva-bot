/**
 * AI investigation order resolver (plan-investigations-library · inv-lib-04).
 *
 * Gated, server-side, **suggestion-only** safety net behind the deterministic
 * frontend catalog autocomplete + local fuzzy suggest. It fires only on the
 * free-text path (no local catalog match), taking the doctor's messy /
 * vernacular / mis-spelled order text and NORMALIZING it into clean lab /
 * imaging order term(s) in English.
 *
 * Guarantees (same contract as the diagnosis resolver, asmt-07):
 *  - **Catalog-constrained on the client (the safety spine).** The order catalog
 *    is a FRONTEND static library, not a DB table, so — unlike diagnosis — this
 *    service does NOT resolve against a catalog. It returns candidate TERMS only;
 *    the frontend re-resolves each term against its static catalog. The model can
 *    never inject an order the catalog does not know.
 *  - **PHI redacted** before the prompt (`redactPhiForAI`); audit is metadata-only.
 *  - **Fail soft** — empty / truncated / malformed model output degrades to an
 *    empty candidate list (never throws at the doctor). Only an unconfigured
 *    client or a hard SDK/network failure throws `ServiceUnavailableError`.
 *  - **Model tiering** — `getOpenAIInvestigationResolveConfig(tier)`: Tier 1 mini
 *    for auto-gate, Tier 2 flagship on explicit refine / retry.
 *
 * The LLM runner is injectable so the validation logic is unit-tested without a
 * network call.
 */

import {
  getOpenAIClient,
  getOpenAIInvestigationResolveConfig,
} from '../config/openai';
import type { InvestigationResolveModelTier } from '../config/openai';
import { logger } from '../config/logger';
import { logAIClassification } from '../utils/audit-logger';
import { redactPhiForAI } from './ai-service';
import { ServiceUnavailableError } from '../utils/errors';
import type {
  InvestigationResolveCandidate,
  InvestigationResolveRequest,
  InvestigationResolveResult,
} from '../types/investigation-resolve';

// Server-side bounds (defensive — independent of the request).
const MAX_MODEL_CANDIDATES = 6;
const MAX_CANDIDATES = 5;
const MAX_TERM_LEN = 120;

// ---------------------------------------------------------------------------
// Seams (injectable for tests)
// ---------------------------------------------------------------------------

export interface InvestigationResolveRunLlmArgs {
  systemPrompt: string;
  userPrompt: string;
  tier: InvestigationResolveModelTier;
  correlationId: string;
}

export interface InvestigationResolveRunLlmResult {
  content: string | null;
  model: string;
  tokens?: number;
  finishReason?: string | null;
}

/** Returns the raw model result, or `null` when the OpenAI client is unconfigured. */
export type InvestigationResolveRunLlm = (
  args: InvestigationResolveRunLlmArgs,
) => Promise<InvestigationResolveRunLlmResult | null>;

export interface ResolveInvestigationDeps {
  /** Injectable for tests; defaults to the real OpenAI call. */
  runLlm?: InvestigationResolveRunLlm;
}

async function defaultRunLlm(
  args: InvestigationResolveRunLlmArgs,
): Promise<InvestigationResolveRunLlmResult | null> {
  const client = getOpenAIClient();
  if (!client) {
    logger.warn(
      { correlationId: args.correlationId },
      'investigation_resolve: no OpenAI client',
    );
    return null;
  }
  const config = getOpenAIInvestigationResolveConfig(args.tier);
  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      max_completion_tokens: config.maxTokens,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userPrompt },
      ],
    });
    const choice = completion.choices[0];
    const content = choice?.message?.content ?? null;
    const finishReason = choice?.finish_reason ?? null;
    const tokens = completion.usage?.total_tokens;

    const ok = Boolean(content) && finishReason !== 'length';
    await logAIClassification({
      correlationId: args.correlationId,
      model: config.model,
      redactionApplied: true,
      status: ok ? 'success' : 'failure',
      tokens,
      ...(ok
        ? {}
        : {
            errorMessage:
              finishReason === 'length'
                ? 'investigation_resolve_truncated'
                : 'investigation_resolve_empty_completion',
          }),
    });

    return { content, model: config.model, tokens, finishReason };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_openai_error';
    logger.warn(
      { correlationId: args.correlationId, err: message },
      'investigation_resolve: openai call failed',
    );
    await logAIClassification({
      correlationId: args.correlationId,
      model: config.model,
      redactionApplied: true,
      status: 'failure',
      errorMessage: 'investigation_resolve_openai_error',
    });
    throw new ServiceUnavailableError(
      'Investigation suggestions are unavailable. Please try again.',
    );
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return [
    "You normalize a doctor's shorthand, vernacular, or misspelled lab / imaging",
    'ORDER text into standard investigation names (English).',
    '',
    'Output ONLY a JSON object, no markdown, of shape:',
    '  {"candidates":[{"term":string,"confidence":number}]}',
    '',
    'Rules:',
    '- "term" is the SPECIFIC investigation / test / panel / imaging order name in plain English (e.g. "liver ka test" -> "Liver function test", "sugar" -> "Blood glucose", "cbc" -> "Complete blood count", "xray chest" -> "Chest X-ray", "usg abdo" -> "Ultrasound abdomen"). Translate Hinglish/vernacular and correct spelling.',
    '- Name the order FAITHFULLY at the specificity the doctor intended. Prefer the common panel/test name a lab would recognize.',
    '- "confidence": 0.0–1.0, how sure you are this is the intended order.',
    '- Return the 1–3 MOST LIKELY orders, best first. Prefer a single strong answer over many weak guesses.',
    '- Only real, orderable investigations (labs, panels, imaging, bedside tests). If the text is not an investigation or you cannot map it, return {"candidates":[]}.',
    '- Never invent an order that the text does not clearly imply.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------

function safeParseJson(content: string, correlationId: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    logger.warn(
      { correlationId, len: content.length },
      'investigation_resolve: malformed JSON',
    );
    return null;
  }
}

function extractRawCandidates(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.candidates)) return obj.candidates;
    if (Array.isArray(obj.orders)) return obj.orders;
    if (typeof obj.term === 'string') return [obj];
  }
  return [];
}

function boundConfidence(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

function boundCandidate(item: unknown): InvestigationResolveCandidate | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const term =
    typeof obj.term === 'string' ? obj.term.trim().slice(0, MAX_TERM_LEN) : '';
  if (!term) return null;
  const confidence = boundConfidence(obj.confidence);
  return { term, ...(confidence !== undefined ? { confidence } : {}) };
}

/**
 * Bound + dedupe (case-insensitive term) the model candidates and cap.
 * Exported for unit tests (proves the bounds + dedupe in isolation).
 */
export function boundModelCandidates(
  raw: unknown[],
): InvestigationResolveCandidate[] {
  const out: InvestigationResolveCandidate[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, MAX_MODEL_CANDIDATES)) {
    const bounded = boundCandidate(item);
    if (!bounded) continue;
    const key = bounded.term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(bounded);
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function resolveInvestigationWithAI(
  request: InvestigationResolveRequest,
  correlationId: string,
  deps: ResolveInvestigationDeps = {},
): Promise<InvestigationResolveResult> {
  const tier: InvestigationResolveModelTier = request.tier ?? 'default';
  const run = deps.runLlm ?? defaultRunLlm;

  const systemPrompt = buildSystemPrompt();
  const userPrompt = redactPhiForAI(request.text);

  const result = await run({ systemPrompt, userPrompt, tier, correlationId });
  if (!result) {
    // Client unconfigured — surface as 503; the frontend degrades silently.
    throw new ServiceUnavailableError('Investigation suggestions are unavailable.');
  }

  // Empty or truncated model output → no candidates (already audited in runner).
  if (!result.content || result.finishReason === 'length') {
    return { candidates: [] };
  }

  const raw = safeParseJson(result.content, correlationId);
  if (raw === null) return { candidates: [] };

  return { candidates: boundModelCandidates(extractRawCandidates(raw)) };
}
