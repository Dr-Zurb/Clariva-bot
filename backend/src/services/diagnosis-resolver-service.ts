/**
 * AI ICD-11 diagnosis resolver (assessment-tab · asmt-07).
 *
 * Gated, server-side, **suggestion-only** safety net behind the deterministic
 * `diagnosis_catalog` autocomplete. It fires only on the free-text path (the
 * autocomplete found no catalog match), taking the doctor's messy / vernacular
 * / mis-spelled diagnosis text and proposing the correct ICD-11 term(s) + code.
 *
 * Guarantees (same contract as the subj-14 complaint parse + medicine parse):
 *  - **Catalog-constrained (the safety spine).** The model only NORMALIZES text
 *    into a clinical TERM; it never chooses the code. Every term is re-resolved
 *    against `diagnosis_catalog` via {@link searchDiagnosisCatalog}, so a
 *    surfaced `{code, title}` is ALWAYS a real catalog row for that term. The
 *    model's code is advisory only — it floats to the top when it agrees with
 *    the term's matches, but can never introduce a row the term didn't find.
 *    (A mini model reliably names conditions but hallucinates codes, e.g.
 *    "Headache" → MG30 "Chronic pain"; resolving by term avoids that trap.)
 *  - **PHI redacted** before the prompt (`redactPhiForAI`); audit is metadata-only.
 *  - **Fail soft** — empty / truncated / malformed model output degrades to an
 *    empty suggestion list (never throws at the doctor). Only an unconfigured
 *    client or a hard SDK/network failure throws `ServiceUnavailableError`.
 *  - **Model tiering** — `getOpenAIDiagnosisResolveConfig(tier)`: Tier 1 mini
 *    for auto-gate, Tier 2 flagship on explicit refine / retry.
 *
 * Both the LLM runner and the catalog search are injectable so the validation /
 * catalog-constraint logic is unit-tested without a network or DB call.
 */

import {
  getOpenAIClient,
  getOpenAIDiagnosisResolveConfig,
} from '../config/openai';
import type { DiagnosisResolveModelTier } from '../config/openai';
import { logger } from '../config/logger';
import { logAIClassification } from '../utils/audit-logger';
import { redactPhiForAI } from './ai-service';
import { ServiceUnavailableError } from '../utils/errors';
import { searchDiagnosisCatalog } from './diagnosis-catalog-service';
import type {
  DiagnosisCatalogSearchResult,
  DiagnosisResolveRequest,
  DiagnosisResolveResult,
  DiagnosisResolveSuggestion,
} from '../types/diagnosis-catalog';

// Server-side bounds (defensive — independent of the request).
const MAX_MODEL_CANDIDATES = 6;
const MAX_SUGGESTIONS = 5;
const MAX_TERM_LEN = 120;
const MAX_CODE_LEN = 32;

// ---------------------------------------------------------------------------
// Seams (injectable for tests)
// ---------------------------------------------------------------------------

export interface DiagnosisResolveRunLlmArgs {
  systemPrompt: string;
  userPrompt: string;
  tier: DiagnosisResolveModelTier;
  correlationId: string;
}

export interface DiagnosisResolveRunLlmResult {
  content: string | null;
  model: string;
  tokens?: number;
  finishReason?: string | null;
}

/** Returns the raw model result, or `null` when the OpenAI client is unconfigured. */
export type DiagnosisResolveRunLlm = (
  args: DiagnosisResolveRunLlmArgs,
) => Promise<DiagnosisResolveRunLlmResult | null>;

/** The catalog search seam — defaults to the real `searchDiagnosisCatalog`. */
export type DiagnosisCatalogSearchFn = (
  query: string,
  limit?: number,
) => Promise<DiagnosisCatalogSearchResult[]>;

export interface ResolveDiagnosisDeps {
  /** Injectable for tests; defaults to the real OpenAI call. */
  runLlm?: DiagnosisResolveRunLlm;
  /** Injectable for tests; defaults to the real catalog search. */
  searchCatalog?: DiagnosisCatalogSearchFn;
}

async function defaultRunLlm(
  args: DiagnosisResolveRunLlmArgs,
): Promise<DiagnosisResolveRunLlmResult | null> {
  const client = getOpenAIClient();
  if (!client) {
    logger.warn({ correlationId: args.correlationId }, 'diagnosis_resolve: no OpenAI client');
    return null;
  }
  const config = getOpenAIDiagnosisResolveConfig(args.tier);
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
                ? 'diagnosis_resolve_truncated'
                : 'diagnosis_resolve_empty_completion',
          }),
    });

    return { content, model: config.model, tokens, finishReason };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_openai_error';
    logger.warn(
      { correlationId: args.correlationId, err: message },
      'diagnosis_resolve: openai call failed',
    );
    await logAIClassification({
      correlationId: args.correlationId,
      model: config.model,
      redactionApplied: true,
      status: 'failure',
      errorMessage: 'diagnosis_resolve_openai_error',
    });
    throw new ServiceUnavailableError('Diagnosis suggestions are unavailable. Please try again.');
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return [
    "You normalize a doctor's shorthand, vernacular, or misspelled diagnosis text",
    'into standard clinical diagnosis names (ICD-11 style, English).',
    '',
    'Output ONLY a JSON object, no markdown, of shape:',
    '  {"candidates":[{"term":string,"code":string|null,"confidence":number}]}',
    '',
    'Rules:',
    '- "term" is the SPECIFIC clinical diagnosis or symptom name in plain English (e.g. "sugar" -> "Type 2 diabetes mellitus", "BP high" -> "Essential hypertension", "head ache" -> "Headache", "TB" -> "Tuberculosis"). Translate Hinglish/vernacular and correct spelling.',
    '- Name the entity FAITHFULLY. Do NOT substitute a broad parent category (e.g. never turn "headache" into "Chronic pain"). Keep the same specificity the doctor typed.',
    '- "code": your best-guess ICD-11 MMS stem code ONLY if you are certain, else null. It is a weak HINT — the server ignores it unless it matches the term, so prefer null over a guess.',
    '- "confidence": 0.0–1.0, how sure you are this is the intended diagnosis.',
    '- Return the 1–3 MOST LIKELY diagnoses, best first. Prefer a single strong answer over many weak guesses.',
    '- Only real, codeable clinical diagnoses. If the text is not a diagnosis or you cannot map it, return {"candidates":[]}.',
    '- Never invent a diagnosis that the text does not clearly imply.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Output parsing + catalog constraint
// ---------------------------------------------------------------------------

interface ModelCandidate {
  term: string;
  code: string | null;
  confidence: number | undefined;
}

function safeParseJson(content: string, correlationId: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    logger.warn({ correlationId, len: content.length }, 'diagnosis_resolve: malformed JSON');
    return null;
  }
}

function extractRawCandidates(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.candidates)) return obj.candidates;
    if (Array.isArray(obj.diagnoses)) return obj.diagnoses;
    if (typeof obj.term === 'string') return [obj];
  }
  return [];
}

function boundConfidence(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

function boundCandidate(item: unknown): ModelCandidate | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const term = typeof obj.term === 'string' ? obj.term.trim().slice(0, MAX_TERM_LEN) : '';
  if (!term) return null;
  const code =
    typeof obj.code === 'string' && obj.code.trim()
      ? obj.code.trim().slice(0, MAX_CODE_LEN)
      : null;
  return { term, code, confidence: boundConfidence(obj.confidence) };
}

/** How many catalog matches to surface per model term (a short "did you mean"). */
const TERM_MATCH_LIMIT = 3;

/**
 * Resolve one model candidate to REAL catalog rows.
 *
 * The code comes from the CATALOG, never the model. A mini model reliably names
 * a condition ("head ache" → "Headache") but hallucinates ICD codes ("Headache"
 * → MG30 "Chronic pain"). Validating only that a code *exists* in the catalog
 * does not catch a real-but-wrong code, so we resolve the clinical TERM against
 * the catalog (deterministic ranking) and surface those matches. The model's
 * code is advisory: it only floats to the top when it AGREES with one of the
 * term's own matches — it can never introduce a row the term didn't already find.
 */
async function resolveCandidate(
  candidate: ModelCandidate,
  searchCatalog: DiagnosisCatalogSearchFn,
): Promise<DiagnosisCatalogSearchResult[]> {
  const rows = await searchCatalog(candidate.term, TERM_MATCH_LIMIT);
  if (rows.length === 0) return [];

  if (candidate.code) {
    const codeLower = candidate.code.toLowerCase();
    const idx = rows.findIndex((row) => row.code.toLowerCase() === codeLower);
    if (idx > 0) {
      const [agreed] = rows.splice(idx, 1);
      rows.unshift(agreed);
    }
  }
  return rows;
}

/**
 * Map the bounded model candidates onto catalog rows, dedupe by code, and cap.
 * Exported for unit tests (proves the catalog constraint + dedupe in isolation).
 */
export async function resolveCandidatesAgainstCatalog(
  candidates: ModelCandidate[],
  searchCatalog: DiagnosisCatalogSearchFn,
): Promise<DiagnosisResolveSuggestion[]> {
  const out: DiagnosisResolveSuggestion[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const rows = await resolveCandidate(candidate, searchCatalog);
    for (const row of rows) {
      const key = row.code.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        code: row.code,
        title: row.title,
        ...(candidate.confidence !== undefined ? { confidence: candidate.confidence } : {}),
      });
      if (out.length >= MAX_SUGGESTIONS) return out;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function resolveDiagnosisWithAI(
  request: DiagnosisResolveRequest,
  correlationId: string,
  deps: ResolveDiagnosisDeps = {},
): Promise<DiagnosisResolveResult> {
  const tier: DiagnosisResolveModelTier = request.tier ?? 'default';
  const run = deps.runLlm ?? defaultRunLlm;
  const searchCatalog = deps.searchCatalog ?? searchDiagnosisCatalog;

  const systemPrompt = buildSystemPrompt();
  const userPrompt = redactPhiForAI(request.text);

  const result = await run({ systemPrompt, userPrompt, tier, correlationId });
  if (!result) {
    // Client unconfigured — surface as 503; the frontend degrades silently.
    throw new ServiceUnavailableError('Diagnosis suggestions are unavailable.');
  }

  // Empty or truncated model output → no suggestions (already audited in runner).
  if (!result.content || result.finishReason === 'length') {
    return { suggestions: [] };
  }

  const raw = safeParseJson(result.content, correlationId);
  if (raw === null) return { suggestions: [] };

  const candidates: ModelCandidate[] = [];
  for (const item of extractRawCandidates(raw).slice(0, MAX_MODEL_CANDIDATES)) {
    const bounded = boundCandidate(item);
    if (bounded) candidates.push(bounded);
  }
  if (candidates.length === 0) return { suggestions: [] };

  return { suggestions: await resolveCandidatesAgainstCatalog(candidates, searchCatalog) };
}
