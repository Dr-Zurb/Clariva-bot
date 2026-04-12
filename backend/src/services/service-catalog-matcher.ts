/**
 * ARM-04: Deterministic-first, LLM-assisted service_key matcher against `service_offerings_json`.
 * Patient text is redacted before any LLM call. Logs only correlationId, keys, confidence, source.
 */

import { getOpenAIClient, getOpenAIConfig } from '../config/openai';
import { logger } from '../config/logger';
import type { ServiceCatalogMatchConfidence } from '../types/conversation';
import { SERVICE_CATALOG_MATCH_REASON_CODES } from '../types/conversation';
import { redactPhiForAI } from './ai-service';
import { logAIClassification } from '../utils/audit-logger';
import { feeThreadHasCompetingVisitTypeBuckets } from '../utils/consultation-fees';
import { findServiceOfferingByKey } from '../utils/service-catalog-helpers';
import type { ServiceCatalogV1, ServiceOfferingV1 } from '../utils/service-catalog-schema';
import { CATALOG_CATCH_ALL_SERVICE_KEY } from '../utils/service-catalog-schema';
import {
  MODALITIES,
  pickSuggestedModality,
  runDeterministicServiceCatalogMatchStageA,
  type DeterministicMatchInner,
} from '../utils/service-catalog-deterministic-match';

const LLM_MAX_RETRIES = 2;
const LLM_RETRY_DELAYS_MS = [800, 2000];
const USER_CONTEXT_MAX_CHARS = 1800;
const SERVICE_MATCH_MAX_COMPLETION_TOKENS = 180;

export type { DeterministicMatchInner };
export { pickSuggestedModality, runDeterministicServiceCatalogMatchStageA };

export interface ServiceCatalogMatchResult {
  catalogServiceKey: string;
  catalogServiceId: string;
  suggestedModality?: 'text' | 'voice' | 'video';
  confidence: ServiceCatalogMatchConfidence;
  reasonCodes: string[];
  /** Top labels for inbox / staff UI — no PHI */
  candidateLabels: Array<{ service_key: string; label: string }>;
  source: 'deterministic' | 'llm' | 'fallback';
  pendingStaffReview: boolean;
  autoFinalize: boolean;
}

/** Non-PHI practice context for smarter routing (LLM + prompt only). */
export interface MatchServiceCatalogDoctorProfile {
  practiceName?: string | null;
  specialty?: string | null;
}

export interface MatchServiceCatalogInput {
  catalog: ServiceCatalogV1 | null;
  /** Raw reason for visit — redacted inside this service before LLM */
  reasonForVisitText: string;
  recentUserMessages?: string[];
  correlationId: string;
  /** Optional; when set, included in the LLM system prompt so specialty informs classification. */
  doctorProfile?: MatchServiceCatalogDoctorProfile | null;
}

export interface ServiceCatalogMatchMetricEvent {
  correlationId: string;
  source: ServiceCatalogMatchResult['source'];
  confidence: ServiceCatalogMatchConfidence;
  fallbackToOther: boolean;
  llmParseFailed: boolean;
}

export interface MatchServiceCatalogOptions {
  /** Skip OpenAI (deterministic + catch-all fallback only). */
  skipLlm?: boolean;
  /** In tests, mock the LLM JSON completion. */
  runLlm?: (params: {
    systemPrompt: string;
    userContent: string;
    correlationId: string;
  }) => Promise<string | null>;
  metrics?: (evt: ServiceCatalogMatchMetricEvent) => void;
}

/** Pure: normalized key must exist in catalog or null (invalid / hallucinated keys). */
export function resolveCatalogOfferingByKey(
  catalog: ServiceCatalogV1,
  rawKey: string | null | undefined
): { service_key: string; service_id: string; offering: ServiceOfferingV1 } | null {
  if (rawKey == null || typeof rawKey !== 'string') {
    return null;
  }
  const offering = findServiceOfferingByKey(catalog, rawKey);
  if (!offering) {
    return null;
  }
  return {
    service_key: offering.service_key,
    service_id: offering.service_id,
    offering,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function candidateLabelsForCatalog(catalog: ServiceCatalogV1): ServiceCatalogMatchResult['candidateLabels'] {
  return [...catalog.services]
    .sort((a, b) => a.service_key.localeCompare(b.service_key))
    .map((s) => ({ service_key: s.service_key, label: s.label }));
}

function truncateForMatcherPrompt(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/** Non-PHI snippets from matcher_hints for LLM allowlist (Stage B sees practice "training" text). */
function matcherHintsSnippetForLlm(offering: ServiceOfferingV1): string {
  const h = offering.matcher_hints;
  if (!h) return '';
  const parts: string[] = [];
  if (h.keywords?.trim()) {
    parts.push(`keywords=${truncateForMatcherPrompt(h.keywords, 280)}`);
  }
  if (h.include_when?.trim()) {
    parts.push(`include_when=${truncateForMatcherPrompt(h.include_when, 400)}`);
  }
  if (h.exclude_when?.trim()) {
    parts.push(`exclude_when=${truncateForMatcherPrompt(h.exclude_when, 280)}`);
  }
  if (parts.length === 0) return '';
  return ` | doctor_matcher_hints: ${parts.join('; ')}`;
}

function buildAllowlistPromptLines(catalog: ServiceCatalogV1): string {
  const lines: string[] = [];
  for (const s of [...catalog.services].sort((a, b) => a.service_key.localeCompare(b.service_key))) {
    const mods = MODALITIES.filter((m) => s.modalities[m]?.enabled === true).join(', ');
    const desc = typeof s.description === 'string' ? s.description.trim() : '';
    const descSeg = desc ? ` | doctor_note: ${JSON.stringify(desc)}` : '';
    const hintSeg = matcherHintsSnippetForLlm(s);
    lines.push(
      `- ${s.service_key}: ${JSON.stringify(s.label)}${descSeg}${hintSeg} [modalities enabled: ${mods || 'none'}]`
    );
  }
  return lines.join('\n');
}

/** Exported for unit tests — full LLM system prompt (catalog allowlist + rules + optional profile). */
export function buildServiceCatalogLlmSystemPrompt(
  catalog: ServiceCatalogV1,
  doctorProfile?: MatchServiceCatalogDoctorProfile | null
): string {
  const practice = doctorProfile?.practiceName?.trim();
  const spec = doctorProfile?.specialty?.trim();
  const contextLines: string[] = [];
  if (practice) contextLines.push(`- Practice: ${practice}`);
  if (spec) contextLines.push(`- Doctor specialty: ${spec}`);
  const contextBlock =
    contextLines.length > 0
      ? `\nPractice context (use to interpret symptoms; do not invent services):\n${contextLines.join('\n')}\n`
      : '\nPractice context was not provided; use only the patient text and the catalog below.\n';

  const preferKey = catalog.competing_visit_type_prefer_service_key?.trim();
  const competingPreferLine =
    preferKey && preferKey.toLowerCase() !== CATALOG_CATCH_ALL_SERVICE_KEY
      ? `\n- When the patient text mixes chronic/metabolic follow-up signals (e.g. blood sugar, BP, thyroid) with acute or general symptoms (e.g. stomach pain, fever, check-up), prefer service_key "${preferKey}" if that row plausibly fits unless another non-other row is clearly better.\n`
      : '';

  return `You map a patient's reason for visit to ONE teleconsult service_key from the practice catalog.
${contextBlock}${competingPreferLine}
Rules:
- Output JSON only, no markdown.
- service_key MUST be copied exactly from the allowed list below.
- modality must be one of the enabled modalities for that service, or null if unsure.
- match_confidence: "high" if clear fit, "medium" if plausible, "low" if weak or unclear.
- Rows may include doctor_matcher_hints (keywords, include_when, exclude_when). These are the practice's own routing notes—follow them when they fit the patient text; they are not shown to patients.
- Prefer the best-fitting row other than "other" whenever it reasonably applies. Use service_key "other" only when no non-other row plausibly fits, or the visit is clearly outside every listed service.
- If specialty suggests broad primary or general care (e.g. general medicine, family medicine, internal medicine, GP), nonspecific acute complaints (headache, fever, cold, fatigue, general pain, "not feeling well", routine checkup) usually belong in a general consult or checkup row if one exists — not "other".
- If specialty is narrow (e.g. dermatology, cardiology), match chief complaints to that scope first; use "other" when the complaint is clearly outside it and no listed row fits.

Schema:
{"service_key":"<slug>","modality":"text"|"voice"|"video"|null,"match_confidence":"high"|"medium"|"low"}

Allowed service_key values:
${buildAllowlistPromptLines(catalog)}`;
}

function buildUserContentForLlm(redactedParts: string[]): string {
  const joined = redactedParts.filter(Boolean).join('\n---\n').slice(0, USER_CONTEXT_MAX_CHARS);
  return `Patient messages (redacted, most recent last):\n${joined}`;
}

async function defaultRunServiceMatchLlm(params: {
  systemPrompt: string;
  userContent: string;
  correlationId: string;
}): Promise<string | null> {
  const client = getOpenAIClient();
  if (!client) {
    logger.warn({ correlationId: params.correlationId }, 'service_catalog_match: no OpenAI client');
    return null;
  }
  const config = getOpenAIConfig();

  for (let attempt = 0; attempt < LLM_MAX_RETRIES; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: config.model,
        max_completion_tokens: SERVICE_MATCH_MAX_COMPLETION_TOKENS,
        response_format: { type: 'json_object' as const },
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userContent },
        ],
      });

      const content = completion.choices[0]?.message?.content ?? null;
      const usage = completion.usage;

      if (!content) {
        await logAIClassification({
          correlationId: params.correlationId,
          model: config.model,
          redactionApplied: true,
          status: 'failure',
          tokens: usage?.total_tokens,
          errorMessage: 'service_catalog_match_empty_completion',
        });
        return null;
      }

      await logAIClassification({
        correlationId: params.correlationId,
        model: config.model,
        redactionApplied: true,
        status: 'success',
        tokens: usage?.total_tokens,
      });

      return content;
    } catch (err) {
      const isLast = attempt === LLM_MAX_RETRIES - 1;
      logger.warn(
        {
          correlationId: params.correlationId,
          attempt: attempt + 1,
          err: err instanceof Error ? err.message : String(err),
        },
        'service_catalog_match_llm_attempt_failed'
      );
      if (isLast) {
        await logAIClassification({
          correlationId: params.correlationId,
          model: config.model,
          redactionApplied: true,
          status: 'failure',
          errorMessage: 'service_catalog_match_llm_failed_after_retries',
        });
        return null;
      }
      await sleep(LLM_RETRY_DELAYS_MS[attempt] ?? 1500);
    }
  }
  return null;
}

function parseLlmJson(content: string): {
  service_key?: string;
  modality?: string | null;
  match_confidence?: string;
} | null {
  try {
    return JSON.parse(content) as {
      service_key?: string;
      modality?: string | null;
      match_confidence?: string;
    };
  } catch {
    return null;
  }
}

function normalizeLlmConfidence(raw: string | undefined): ServiceCatalogMatchConfidence {
  const c = raw?.toLowerCase().trim();
  if (c === 'high' || c === 'medium' || c === 'low') {
    return c;
  }
  return 'low';
}

/**
 * When the thread has competing NCD vs acute/general signals and the catalog names a preferred
 * non-catch-all row, use it instead of `other` or weak LLM picks.
 */
function applyCompetingVisitTypeCatalogPreference(
  catalog: ServiceCatalogV1,
  mergedReasonText: string,
  result: ServiceCatalogMatchResult
): ServiceCatalogMatchResult {
  const prefKey = catalog.competing_visit_type_prefer_service_key?.trim();
  if (!prefKey || !feeThreadHasCompetingVisitTypeBuckets(mergedReasonText)) {
    return result;
  }
  const preferred = resolveCatalogOfferingByKey(catalog, prefKey);
  if (!preferred || preferred.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY) {
    return result;
  }
  const resKey = result.catalogServiceKey.trim().toLowerCase();
  const isOther = resKey === CATALOG_CATCH_ALL_SERVICE_KEY;
  const lowOrMed = result.confidence === 'low' || result.confidence === 'medium';
  if (!isOther && result.confidence === 'high') {
    return result;
  }
  if (!isOther && !lowOrMed) {
    return result;
  }
  const mod = pickSuggestedModality(preferred.offering);
  return {
    ...result,
    catalogServiceKey: preferred.service_key,
    catalogServiceId: preferred.service_id,
    suggestedModality: mod,
    confidence: 'medium',
    reasonCodes: [
      ...new Set([
        ...result.reasonCodes,
        SERVICE_CATALOG_MATCH_REASON_CODES.COMPETING_BUCKETS_PRACTICE_PREFERENCE,
      ]),
    ],
    pendingStaffReview: false,
    autoFinalize: true,
  };
}

/**
 * Full matcher: Stage A (rules + ARM-02 hints), Stage B (LLM with allowlist), validated fallback to `other`.
 */
export async function matchServiceCatalogOffering(
  input: MatchServiceCatalogInput,
  options?: MatchServiceCatalogOptions
): Promise<ServiceCatalogMatchResult | null> {
  const { catalog, reasonForVisitText, recentUserMessages, correlationId, doctorProfile } = input;
  const metrics = options?.metrics;

  const emit = (partial: Omit<ServiceCatalogMatchMetricEvent, 'correlationId'>) => {
    metrics?.({ correlationId, ...partial });
  };

  if (!catalog || catalog.services.length === 0) {
    logger.warn({ correlationId }, 'service_catalog_match_skipped_empty_catalog');
    return null;
  }

  const candidates = candidateLabelsForCatalog(catalog);
  const catchAll = resolveCatalogOfferingByKey(catalog, CATALOG_CATCH_ALL_SERVICE_KEY);
  if (!catchAll) {
    logger.error(
      { correlationId },
      'service_catalog_match: catalog missing catch-all other — using first row (misconfigured)'
    );
  }

  const reasonRedacted = redactPhiForAI(reasonForVisitText);
  const recentRedacted = (recentUserMessages ?? []).map((m) => redactPhiForAI(m ?? '')).filter(Boolean);
  const mergedForCompetingBuckets = [...recentRedacted, reasonRedacted].filter(Boolean).join('\n');

  const stageA = runDeterministicServiceCatalogMatchStageA(catalog, reasonRedacted);
  if (stageA) {
    const mod = pickSuggestedModality(stageA.offering);
    const result: ServiceCatalogMatchResult = {
      catalogServiceKey: stageA.offering.service_key,
      catalogServiceId: stageA.offering.service_id,
      suggestedModality: mod,
      confidence: stageA.confidence,
      reasonCodes: stageA.reasonCodes,
      candidateLabels: candidates,
      source: 'deterministic',
      pendingStaffReview: !stageA.autoFinalize,
      autoFinalize: stageA.autoFinalize,
    };
    emit({
      source: 'deterministic',
      confidence: result.confidence,
      fallbackToOther: result.catalogServiceKey === CATALOG_CATCH_ALL_SERVICE_KEY,
      llmParseFailed: false,
    });
    return result;
  }

  const skipLlm = options?.skipLlm === true;
  const runLlm = options?.runLlm ?? defaultRunServiceMatchLlm;
  const canRunLlm = Boolean(options?.runLlm) || Boolean(getOpenAIClient());

  if (skipLlm || !canRunLlm) {
    const fb = catchAll ?? resolveCatalogOfferingByKey(catalog, catalog.services[0]!.service_key)!;
    const rawResult: ServiceCatalogMatchResult = {
      catalogServiceKey: fb.service_key,
      catalogServiceId: fb.service_id,
      suggestedModality: pickSuggestedModality(fb.offering),
      confidence: 'low',
      reasonCodes: [SERVICE_CATALOG_MATCH_REASON_CODES.NO_CATALOG_MATCH],
      candidateLabels: candidates,
      source: 'fallback',
      pendingStaffReview: true,
      autoFinalize: false,
    };
    const result = applyCompetingVisitTypeCatalogPreference(
      catalog,
      mergedForCompetingBuckets,
      rawResult
    );
    emit({
      source: result.source,
      confidence: result.confidence,
      fallbackToOther: result.catalogServiceKey === CATALOG_CATCH_ALL_SERVICE_KEY,
      llmParseFailed: false,
    });
    return result;
  }

  const systemPrompt = buildServiceCatalogLlmSystemPrompt(catalog, doctorProfile);
  const userContent = buildUserContentForLlm([...recentRedacted, reasonRedacted].filter(Boolean));

  const rawJson = await runLlm({ systemPrompt, userContent, correlationId });
  let llmParseFailed = false;

  if (!rawJson) {
    llmParseFailed = true;
  }

  const parsed = rawJson ? parseLlmJson(rawJson) : null;
  if (!parsed?.service_key) {
    llmParseFailed = true;
  }

  const resolved =
    parsed?.service_key != null ? resolveCatalogOfferingByKey(catalog, parsed.service_key) : null;

  if (!resolved) {
    llmParseFailed = true;
    const fb = catchAll ?? resolveCatalogOfferingByKey(catalog, catalog.services[0]!.service_key)!;
    const rawResult: ServiceCatalogMatchResult = {
      catalogServiceKey: fb.service_key,
      catalogServiceId: fb.service_id,
      suggestedModality: pickSuggestedModality(fb.offering),
      confidence: 'low',
      reasonCodes: llmParseFailed
        ? [SERVICE_CATALOG_MATCH_REASON_CODES.MATCHER_ERROR, SERVICE_CATALOG_MATCH_REASON_CODES.NO_CATALOG_MATCH]
        : [SERVICE_CATALOG_MATCH_REASON_CODES.NO_CATALOG_MATCH],
      candidateLabels: candidates,
      source: 'fallback',
      pendingStaffReview: true,
      autoFinalize: false,
    };
    const result = applyCompetingVisitTypeCatalogPreference(
      catalog,
      mergedForCompetingBuckets,
      rawResult
    );
    emit({
      source: result.source,
      confidence: result.confidence,
      fallbackToOther: result.catalogServiceKey === CATALOG_CATCH_ALL_SERVICE_KEY,
      llmParseFailed,
    });
    return result;
  }

  let modality: 'text' | 'voice' | 'video' | undefined;
  const modRaw = parsed!.modality;
  if (typeof modRaw === 'string') {
    const m = modRaw.toLowerCase().trim() as 'text' | 'voice' | 'video';
    if ((MODALITIES as readonly string[]).includes(m) && resolved.offering.modalities[m]?.enabled === true) {
      modality = m;
    } else {
      modality = pickSuggestedModality(resolved.offering);
    }
  } else {
    modality = pickSuggestedModality(resolved.offering);
  }

  const conf = normalizeLlmConfidence(parsed!.match_confidence);
  const autoFinalize = conf === 'high';

  const rawResult: ServiceCatalogMatchResult = {
    catalogServiceKey: resolved.service_key,
    catalogServiceId: resolved.service_id,
    suggestedModality: modality,
    confidence: conf,
    reasonCodes: [
      SERVICE_CATALOG_MATCH_REASON_CODES.SERVICE_MATCH_LLM,
      SERVICE_CATALOG_MATCH_REASON_CODES.CATALOG_ALLOWLIST_MATCH,
    ],
    candidateLabels: candidates,
    source: 'llm',
    pendingStaffReview: !autoFinalize,
    autoFinalize,
  };

  const result = applyCompetingVisitTypeCatalogPreference(
    catalog,
    mergedForCompetingBuckets,
    rawResult
  );

  logger.info(
    {
      correlationId,
      serviceCatalogMatchSource: result.source,
      serviceCatalogMatchConfidence: result.confidence,
      catalogServiceKey: result.catalogServiceKey,
      autoFinalize: result.autoFinalize,
    },
    'service_catalog_match'
  );

  emit({
    source: result.source,
    confidence: result.confidence,
    fallbackToOther: result.catalogServiceKey === CATALOG_CATCH_ALL_SERVICE_KEY,
    llmParseFailed: false,
  });

  return result;
}
