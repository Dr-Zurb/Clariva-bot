/**
 * ARM-04: Deterministic-first, LLM-assisted service_key matcher against `service_offerings_json`.
 * Patient text is redacted before any LLM call. Logs only correlationId, keys, confidence, source.
 */

import { getOpenAIClient, getOpenAIConfig } from '../config/openai';
import { logger } from '../config/logger';
import type { ServiceCatalogMatchConfidence } from '../types/conversation';
import { SERVICE_CATALOG_MATCH_REASON_CODES } from '../types/conversation';
import type { CatalogMode } from '../types/doctor-settings';
import { redactPhiForAI } from './ai-service';
import { logAIClassification } from '../utils/audit-logger';
import { isSingleFeeMode, logSingleFeeSkip } from '../utils/catalog-mode-guard';
import { findServiceOfferingByKey } from '../utils/service-catalog-helpers';
import type { ServiceCatalogV1, ServiceOfferingV1 } from '../utils/service-catalog-schema';
import {
  CATALOG_CATCH_ALL_SERVICE_KEY,
  resolveServiceScopeMode,
} from '../utils/service-catalog-schema';
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
  /**
   * Task 05: LLM signal that the patient listed multiple clinically unrelated complaints
   * (e.g. "diabetes, cough, skin rash"). The handler decides whether to ask for clarification
   * based on confidence + catalog shape; this flag is advisory. Always `false` from the
   * deterministic / fallback paths (they never see the full LLM context).
   */
  mixedComplaints: boolean;

  /**
   * Task 09 (Plan 04 — Patient DM copy polish): short noun-phrase labels (≤ 40 chars each,
   * up to 5 items) that the LLM extracted for the distinct concerns it detected when
   * `mixedComplaints === true`. These are echoed back to the patient as a numbered list so
   * they can reply with a number (`"2"`) instead of re-typing their complaint. Always
   * `undefined` on deterministic / fallback / single-fee paths and on LLM paths where
   * `mixedComplaints === false`. Entries are already normalized (`normalizeLlmConcerns`):
   * trimmed, non-empty, deduped, each ≤ 40 chars, and capped at 5.
   */
  concerns?: string[];
}

/**
 * Task 09: render-safety cap on the matcher-emitted concerns list. Kept here (not in the
 * DM copy module) so every caller that consumes `ServiceCatalogMatchResult.concerns` sees
 * the same contract: at most 5 entries, each ≤ 40 chars. The copy builder then decides how
 * to present them; the handler decides how to persist them.
 */
export const SERVICE_MATCH_MAX_CONCERNS = 5;
export const SERVICE_MATCH_CONCERN_MAX_CHARS = 40;

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
  /**
   * Task 10 (Plan 03): doctor's `catalog_mode`. When `'single_fee'` the matcher short-circuits
   * before any deterministic or LLM work — the synthetic consultation catalog (Task 09) has a
   * single entry and no meaningful disambiguation to perform. `null`/`'multi_service'` run the
   * existing path unchanged.
   */
  catalogMode?: CatalogMode | null;
  /** Task 10: the doctor's `doctor_id`, used only for structured skip logs. Optional. */
  doctorId?: string | null;
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

/** learn-05: deterministic candidate keys for pattern_key (full catalog slice; PHI-free). */
export function candidateLabelsForCatalog(catalog: ServiceCatalogV1): ServiceCatalogMatchResult['candidateLabels'] {
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
    /** SFU-18: annotate each row so the LLM can honor strict vs flexible routing per service. */
    const scopeSeg = ` [scope: ${resolveServiceScopeMode(s.scope_mode)}]`;
    lines.push(
      `- ${s.service_key}: ${JSON.stringify(s.label)}${scopeSeg}${descSeg}${hintSeg} [modalities enabled: ${mods || 'none'}]`
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

  return `You map a patient's reason for visit to ONE teleconsult service_key from the practice catalog.
${contextBlock}
Output rules:
- Output JSON only, no markdown.
- service_key MUST be copied exactly from the allowed list below.
- modality must be one of the enabled modalities for that service, or null if unsure.

Matching policy (apply in order):
1. Each allowed row may optionally carry doctor_matcher_hints (keywords, include_when, exclude_when). These are the practice's own routing notes and are NOT shown to patients.
2. When a row HAS doctor_matcher_hints: follow them strictly. include_when defines what belongs; exclude_when defines what does not. Only map the patient to that row if their complaint aligns with the hints and does not hit exclude_when. Do not guess beyond the hints.
3. Each row also declares a scope mode via a "[scope: strict]" or "[scope: flexible]" tag in its allowlist entry:
   - [scope: strict] — map a patient to this row ONLY when their complaint directly matches the row's keywords or include_when hints (or is an unambiguous synonym). Do not generalize from the label, description, or doctor specialty. If the complaint is outside the listed items, pick a different row or "other". Rule 2's exclude_when still applies.
   - [scope: flexible] — broader category matching is allowed: the row may cover complaints that plausibly fit the service's general category, even if not explicitly listed in the hints. Rules 2 and 4 still constrain it; the scope tag only loosens rule 5 for this row.
4. When a row has NO doctor_matcher_hints: match only if the service label (and doctor_note, if present) is an unambiguous, specific fit for the patient's primary complaint. Do NOT infer a broader scope from the label name alone (e.g. a row titled "NCD follow-up" without hints is not a catch-all for every chronic symptom). When in doubt, use "other". If that row is also [scope: strict], prefer "other" unless the complaint is a clear synonym of the label itself.
5. If the patient lists multiple unrelated complaints, match based on the single most prominent or first-mentioned complaint, not the union of the list. Never stretch one row to cover an unrelated symptom just because it appears in the same message.
6. Specialty-aware defaults:
   - If specialty suggests broad primary or general care (general medicine, family medicine, internal medicine, GP), nonspecific acute complaints (headache, fever, cold, fatigue, general pain, "not feeling well", routine checkup) usually belong in a general consult or checkup row if one exists — not "other". A [scope: strict] row does not count as such a general row unless its hints explicitly cover the complaint.
   - If specialty is narrow (e.g. dermatology, cardiology), match chief complaints to that scope first; use "other" when the complaint is clearly outside it and no listed row fits.
7. Use service_key "other" when no non-other row plausibly fits after applying rules 1–6, or the visit is clearly outside every listed service. Do NOT force-fit a complaint into a named row just to avoid "other".

Confidence calibration:
- "high": only when the chosen row HAS doctor_matcher_hints AND the patient's complaint is corroborated by those hints (keywords or include_when). A label-only match — however intuitive — is not sufficient for "high".
- "medium": the row is a reasonable fit by label/description but there are no hints to corroborate, or hints are only partially aligned.
- "low": the fit is weak, unclear, the patient text is vague, or the match would require stretching the label beyond its stated scope.

Mixed-complaint flag:
- Set "mixed_complaints": true ONLY when the patient text lists two or more clinically UNRELATED conditions that would normally be handled in separate consultations (e.g. "diabetes" + "cough" + "skin rash", or "hypertension" + "headache" + "stomach pain").
- Set "mixed_complaints": false for related symptom clusters (e.g. "cough + fever + sore throat" are all respiratory; "BP 160/100 and headache" is one hypertension thread).
- This flag is advisory only. Still choose the best service_key for the primary/first-mentioned complaint per rule 5; the flag tells the downstream system the patient may need a clarifying question.

Concerns list (only when mixed_complaints is true):
- Include a "concerns": ["...","..."] array with 2–5 short English noun-phrase labels, one per distinct clinically UNRELATED concern the patient mentioned, in the order the patient listed them. These are echoed back verbatim to the patient as a numbered pick-list, so keep each label short, specific, and free of sentence structure.
- Each label MUST be ≤ 40 characters. Prefer 2–4 words. Examples of good labels: "Headache", "Diabetes follow-up", "Knee pain", "Skin rash", "Chest pain". Bad labels: full sentences, punctuation-laden fragments, or generic placeholders like "issue 1".
- Do NOT include narrative sentences, dates, names, medications, dosages, numbers, or any other PHI beyond the concern noun phrase itself.
- When "mixed_complaints" is false, OMIT the "concerns" field entirely (or set it to an empty array). Never invent concerns to pad the list.

Schema:
{"service_key":"<slug>","modality":"text"|"voice"|"video"|null,"match_confidence":"high"|"medium"|"low","mixed_complaints":true|false,"concerns":["<label1>","<label2>",...]}

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
  mixed_complaints?: unknown;
  concerns?: unknown;
} | null {
  try {
    return JSON.parse(content) as {
      service_key?: string;
      modality?: string | null;
      match_confidence?: string;
      mixed_complaints?: unknown;
      concerns?: unknown;
    };
  } catch {
    return null;
  }
}

/** Task 05: be tolerant of "true"/"false" strings; default to false when absent or malformed. */
function normalizeLlmMixedComplaints(raw: unknown): boolean {
  if (raw === true) return true;
  if (typeof raw === 'string') {
    return raw.trim().toLowerCase() === 'true';
  }
  return false;
}

/**
 * Task 09: accept the LLM `concerns` field only when it's an array of non-empty strings. Each
 * entry is trimmed, clamped to `SERVICE_MATCH_CONCERN_MAX_CHARS` (40) with a trailing ellipsis
 * when truncation is needed, deduped case-insensitively (first occurrence wins), and the
 * overall list is capped at `SERVICE_MATCH_MAX_CONCERNS` (5). Returns `undefined` when the
 * input isn't an array, when it has < 2 valid entries (single-entry lists are indistinguishable
 * from "no mixed complaints" for UX purposes), or when every entry ends up blank after
 * normalization — the caller should then render the existing open-ended clarification copy.
 *
 * We DO NOT attempt semantic merging here (e.g. "headache" + "migraine" stay separate). That's
 * a matcher-quality concern, not a rendering concern, and the gating predicate already prevents
 * clarification from firing when the matcher is confident enough to collapse them upstream.
 */
function normalizeLlmConcerns(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    let trimmed = entry.trim();
    if (!trimmed) continue;
    if (trimmed.length > SERVICE_MATCH_CONCERN_MAX_CHARS) {
      // Leave room for the ellipsis inside the 40-char budget so the rendered label stays within cap.
      trimmed = `${trimmed.slice(0, SERVICE_MATCH_CONCERN_MAX_CHARS - 1).trimEnd()}…`;
    }
    const dedupKey = trimmed.toLowerCase();
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    out.push(trimmed);
    if (out.length >= SERVICE_MATCH_MAX_CONCERNS) break;
  }
  if (out.length < 2) return undefined;
  return out;
}

function normalizeLlmConfidence(raw: string | undefined): ServiceCatalogMatchConfidence {
  const c = raw?.toLowerCase().trim();
  if (c === 'high' || c === 'medium' || c === 'low') {
    return c;
  }
  return 'low';
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

  /**
   * Task 10 (Plan 03): single-fee short-circuit. When the doctor's `catalog_mode === 'single_fee'`
   * the Task-09 synthetic catalog contains exactly one entry (`service_key = 'consultation'`),
   * every patient complaint trivially maps to it. Skip the deterministic + LLM stages entirely:
   * no OpenAI call, no Stage A regex work, no catch-all bookkeeping. Returns `high` confidence so
   * the downstream handler auto-finalizes without a staff review row. Strict `=== 'single_fee'`
   * so `null` (undecided) keeps today's multi-service behavior.
   */
  if (isSingleFeeMode(input.catalogMode)) {
    const offering = catalog.services[0]!;
    const result: ServiceCatalogMatchResult = {
      catalogServiceKey: offering.service_key,
      catalogServiceId: offering.service_id,
      suggestedModality: pickSuggestedModality(offering),
      confidence: 'high',
      reasonCodes: [SERVICE_CATALOG_MATCH_REASON_CODES.SINGLE_FEE_MODE],
      candidateLabels: candidateLabelsForCatalog(catalog),
      source: 'deterministic',
      pendingStaffReview: false,
      autoFinalize: true,
      mixedComplaints: false,
    };
    logSingleFeeSkip('matcher', {
      doctorId: input.doctorId ?? null,
      correlationId,
      serviceKey: offering.service_key,
      serviceId: offering.service_id,
    });
    emit({
      source: 'deterministic',
      confidence: 'high',
      fallbackToOther: false,
      llmParseFailed: false,
    });
    return result;
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
      mixedComplaints: false,
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
    const result: ServiceCatalogMatchResult = {
      catalogServiceKey: fb.service_key,
      catalogServiceId: fb.service_id,
      suggestedModality: pickSuggestedModality(fb.offering),
      confidence: 'low',
      reasonCodes: [SERVICE_CATALOG_MATCH_REASON_CODES.NO_CATALOG_MATCH],
      candidateLabels: candidates,
      source: 'fallback',
      pendingStaffReview: true,
      autoFinalize: false,
      mixedComplaints: false,
    };
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
    const result: ServiceCatalogMatchResult = {
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
      mixedComplaints: false,
    };
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
  const mixedComplaints = normalizeLlmMixedComplaints(parsed!.mixed_complaints);
  // Task 09: only surface `concerns` when the LLM itself flagged mixed complaints.
  // If the model sends a list alongside `mixed_complaints:false` we treat it as a hallucination
  // and drop it silently — the gating predicate wouldn't fire clarification in that case anyway.
  const concerns = mixedComplaints ? normalizeLlmConcerns(parsed!.concerns) : undefined;

  const result: ServiceCatalogMatchResult = {
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
    mixedComplaints,
    concerns,
  };

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
