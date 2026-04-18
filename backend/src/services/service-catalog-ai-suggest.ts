/**
 * Plan 02 / Task 06: AI auto-fill for service cards.
 *
 * Single entry point — `generateAiCatalogSuggestion` — that takes a `mode` plus a
 * lightweight payload, hydrates non-PHI context from `doctor_settings`, builds a
 * mode-specific system prompt, calls the LLM, validates the LLM output through the
 * canonical `serviceOfferingV1Schema` (so a bad model response cannot poison the
 * draft), and returns either AI-generated drafts (`single_card`, `starter`) or a
 * structured issue list (`review`).
 *
 * Server-side guards (post LLM, regardless of model output):
 *   1. `serviceOfferingV1Schema.parse` on every returned card.
 *   2. The catch-all `'other'` row is force-set to `scope_mode: 'flexible'` —
 *      mirrors the persistence-time invariant in `frontend/lib/service-catalog-drafts.ts`
 *      and `service-catalog-normalize` so the matcher can always fall back.
 *   3. Modalities are filtered against the doctor's `consultation_types` string;
 *      AI cannot enable a channel the practice has not configured globally.
 *   4. Per-modality prices are clamped to `[0.3 * appointment_fee_minor, 1.5 * appointment_fee_minor]`.
 *      Anything outside that range is clamped + flagged in the response so the
 *      UI can warn ("AI suggestion was outside normal range, clamped to ₹X").
 *
 * PHI: only the authenticated doctor's own `doctor_settings` row is sent to the
 * LLM (specialty, practice name, address summary, country, consultation types,
 * appointment fee, existing service catalog). No patient data, no other doctors.
 *
 * @see ../routes/api/v1/catalog.ts
 * @see ../utils/service-catalog-schema.ts
 * @see ./service-catalog-matcher.ts (Plan 01 Task 04 — same `scope_mode` rule block)
 */

import { randomUUID } from 'crypto';

import { getOpenAIClient, getOpenAIConfig } from '../config/openai';
import { logger } from '../config/logger';
import {
  DEFAULT_SEVERITIES,
  DETERMINISTIC_ISSUE_TYPES,
  LLM_ISSUE_TYPES,
  qualityIssueSchema,
  sortQualityIssues,
  withAutoFixFlag,
  type QualityIssue,
} from '../types/catalog-quality-issues';
import { logAIClassification } from '../utils/audit-logger';
import {
  AppError,
  InternalError,
  ServiceUnavailableError,
  ValidationError,
} from '../utils/errors';
import { getDoctorSettingsForUser } from './doctor-settings-service';
import {
  CATALOG_CATCH_ALL_LABEL_DEFAULT,
  CATALOG_CATCH_ALL_SERVICE_KEY,
  resolveServiceScopeMode,
  safeParseServiceCatalogV1FromDb,
  scopeModeSchema,
  serviceOfferingV1Schema,
  type ScopeMode,
  type ServiceCatalogV1,
  type ServiceOfferingV1,
} from '../utils/service-catalog-schema';
import {
  deriveAllowedModalitiesFromConsultationTypes,
  type AllowedModalities,
} from '../utils/consultation-types';

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export const AI_SUGGEST_MODES = ['single_card', 'starter', 'review'] as const;
export type AiSuggestMode = (typeof AI_SUGGEST_MODES)[number];

export interface AiSuggestSingleCardPayload {
  /** Optional doctor-typed label for the new service (e.g. "Diabetes follow-up"). */
  label?: string;
  /** Optional free-form description in the doctor's own words. */
  freeformDescription?: string;
  /** Optional existing matcher hints (used by re-run / refine flow). */
  existingHints?: {
    keywords?: string;
    include_when?: string;
    exclude_when?: string;
  };
}

export interface AiSuggestRequest {
  mode: AiSuggestMode;
  /** Only set when mode === 'single_card'. Validated upstream by the route schema. */
  payload?: AiSuggestSingleCardPayload;
  /**
   * Optional unsaved-draft override of the doctor's `service_offerings_json`.
   *
   * Why: the editor mutates a local React draft (`add_card`, `switch_to_strict`,
   * sparkle fills, manual edits) without auto-saving to the DB. Before this
   * field existed, every review/single-card LLM call rehydrated the catalog
   * from `doctor_settings.service_offerings_json`, so the AI critiqued a
   * stale snapshot — re-running review after `add_card` would re-suggest the
   * same card, fill_with_ai couldn't see brand-new sibling cards, etc.
   *
   * Contract:
   *   - `undefined`              → fall back to DB (legacy behavior; used by
   *                                non-editor callers and integration smoke).
   *   - `null`                   → "the on-screen draft is empty" — equivalent
   *                                to a doctor with no catalog. Used so the
   *                                deterministic `missing_catchall` issue
   *                                still fires for an empty editor.
   *   - `ServiceCatalogV1`       → use exactly this. Route schema validates
   *                                it through `serviceCatalogV1BaseSchema`
   *                                (must be structurally valid + have unique
   *                                keys/ids; catch-all is checked by the
   *                                review itself, not by the schema, so an
   *                                in-progress draft missing the catch-all
   *                                still gets reviewed and surfaces the
   *                                deterministic issue).
   */
  catalog?: ServiceCatalogV1 | null;
}

/** Cards return one of these warnings; `kind` lets the UI render specific copy. */
export type AiSuggestWarning =
  | {
      kind: 'price_clamped';
      service_key: string;
      modality: 'text' | 'voice' | 'video';
      original_minor: number;
      clamped_minor: number;
      currency: string | null;
    }
  | {
      kind: 'modality_disabled_no_global_setup';
      service_key: string;
      modality: 'text' | 'voice' | 'video';
      reason: string;
    }
  | {
      kind: 'keyword_overlap_with_sibling';
      service_key: string;
      sibling_service_key: string;
      overlap_ratio: number;
    }
  | {
      kind: 'catch_all_scope_forced_flexible';
      service_key: string;
    };

export interface AiSuggestCardResponse {
  mode: 'single_card' | 'starter';
  cards: ServiceOfferingV1[];
  warnings: AiSuggestWarning[];
}

/**
 * Plan 02 / Task 07: review-mode response. `issues` is the merged + sorted list
 * of deterministic checks (`DETERMINISTIC_ISSUE_TYPES`) and LLM checks
 * (`LLM_ISSUE_TYPES`). Severity + type weight define the sort order — see
 * {@link ../types/catalog-quality-issues.ts#sortQualityIssues}.
 */
export interface AiSuggestReviewResponse {
  mode: 'review';
  issues: QualityIssue[];
  warnings: AiSuggestWarning[];
}

export type AiSuggestResponse = AiSuggestCardResponse | AiSuggestReviewResponse;

/** Re-export {@link QualityIssue} so callers outside of this module don't need two imports. */
export type { QualityIssue } from '../types/catalog-quality-issues';

/** Doctor profile context sent to the LLM (no PHI; doctor's own row only). */
export interface AiSuggestContext {
  doctorId: string;
  specialty: string;
  practiceName: string | null;
  addressSummary: string | null;
  country: string | null;
  consultationTypes: string | null;
  appointmentFeeMinor: number | null;
  appointmentFeeCurrency: string | null;
  /** Sibling cards already in the catalog. Hydrated through {@link safeParseServiceCatalogV1FromDb}. */
  catalog: ServiceCatalogV1 | null;
}

/** Throwable: the doctor profile is missing fields the AI cannot work without. */
export class AiSuggestProfileIncompleteError extends AppError {
  public readonly missing: readonly string[];
  constructor(missing: readonly string[]) {
    super(
      `Doctor profile is missing required fields for AI suggestion: ${missing.join(', ')}`,
      422
    );
    this.missing = missing;
  }
}

// ----------------------------------------------------------------------------
// Constants — shared rule blocks
// ----------------------------------------------------------------------------

/**
 * SCOPE_MODE_RULE_BLOCK mirrors the policy already in
 * `service-catalog-matcher.ts`'s system prompt (Plan 01 Task 04). Keeping the
 * generation-side and matching-side rules in one constant prevents drift.
 */
export const SCOPE_MODE_RULE_BLOCK = `Scope mode rules (set "scope_mode" on every card):
- "strict" — pick ONLY when the card targets a specific clinical condition or workflow that the matcher should refuse to broaden (e.g. "Diabetes follow-up", "Acne consultation", "Post-op wound check"). Strict cards must always carry concrete keywords / include_when so the matcher has something to anchor to. New named services default to strict.
- "flexible" — pick for broad / general-category cards (e.g. "General consultation", "Internal medicine follow-up") OR the mandatory catch-all "Other" row. Flexible cards may match plausibly-related complaints even without exhaustive hints.
- The catch-all card with service_key "${CATALOG_CATCH_ALL_SERVICE_KEY}" MUST be "flexible" — it is the safety net.
- A strict card with empty matcher_hints is a configuration bug; if you produce strict, also produce non-empty keywords or include_when.`;

export const MODALITY_RULE_BLOCK = `Modality selection rules ("modalities.text|voice|video.enabled"):
- Use "text" for asynchronous chat-style follow-ups (medication adjustments, lab review questions, brief check-ins).
- Use "voice" for short triage-style calls or for patients who cannot or will not enable video.
- Use "video" for first consultations, anything visual (skin, wounds, mobility), and for any service where the doctor needs to see the patient.
- A card MUST enable at least one modality.
- Do not enable a channel that does not match the doctor's actual setup. The server will further filter against the doctor's globally configured "consultation_types" — so if the doctor only listed "Video", do not enable text or voice.`;

export const PRICING_RULE_BLOCK = `Pricing rules (per-modality "price_minor", integer in the smallest currency unit):
- Always: text price <= voice price <= video price for the same card. Video is the most resource-intensive channel.
- Anchor every card to the doctor's base "appointment_fee_minor". Suggested per-modality prices SHOULD fall in [0.3 * base, 1.5 * base]. The server will hard-clamp anything outside this range and flag it for the doctor.
- Specialty-aware: a long-form initial consultation (cardiology workup, dermatology biopsy review) trends toward the upper end of the range; a routine follow-up trends toward the lower end.
- Region-aware: when the doctor's country indicates higher cost-of-living (e.g. US, UK, AE, SG), keep prices closer to the upper part of the range; when it indicates lower (e.g. IN, BD, NG), keep them closer to the middle. Do NOT invent prices in a different currency than the doctor's "appointment_fee_currency".`;

export const REGIONAL_TERMINOLOGY_RULE_BLOCK = `Regional terminology and teleconsultation rules:
- Use the patient-facing terminology common in the doctor's country: e.g. "blood pressure" in US/UK; "BP / hypertension" is fine in IN; "diabetes" not "DM" for patients.
- Where the country has clear teleconsult restrictions (e.g. India: prescription rules per Telemedicine Practice Guidelines 2020; US: state-specific telehealth licensure), bias the cards toward consultations that are unambiguously allowed remotely (follow-ups, chronic care reviews, lab interpretation, second opinions). Avoid suggesting cards that imply in-person procedures, controlled prescriptions, or services that typically require physical examination.
- For the catch-all "${CATALOG_CATCH_ALL_SERVICE_KEY}" row, the description should make clear it covers visits that do not fit named services and is not a substitute for emergency care.`;

const ALL_RULE_BLOCKS = [
  SCOPE_MODE_RULE_BLOCK,
  MODALITY_RULE_BLOCK,
  PRICING_RULE_BLOCK,
  REGIONAL_TERMINOLOGY_RULE_BLOCK,
];

const SCHEMA_BLOCK_FOR_CARDS = `Output schema (JSON only, no markdown):
{
  "cards": [
    {
      "service_key": "<lowercase slug, a-z0-9_-, max 64 chars>",
      "label": "<short display name, max 200 chars>",
      "description": "<optional short description, max 500 chars>",
      "scope_mode": "strict" | "flexible",
      "matcher_hints": {
        "keywords": "<comma-separated synonyms patients actually type>",
        "include_when": "<short phrases of when to pick this card>",
        "exclude_when": "<short phrases of when NOT to pick this card>"
      },
      "modalities": {
        "text":  { "enabled": true|false, "price_minor": <integer> },
        "voice": { "enabled": true|false, "price_minor": <integer> },
        "video": { "enabled": true|false, "price_minor": <integer> }
      }
    }
  ]
}
- "service_key" MUST be a stable lowercase slug (e.g. "diabetes_followup", "skin_consult"). Reserved key "${CATALOG_CATCH_ALL_SERVICE_KEY}" is for the catch-all.
- Always include at least one enabled modality per card.
- Do NOT include any "service_id" field — the server assigns UUIDs.`;

/**
 * Plan 02 / Task 07: the LLM only emits `overlap | gap | contradiction |
 * modality_mismatch | service_suggestion`. Deterministic kinds
 * (`strict_empty_hints`, `strict_thin_keywords`, `flexible_should_be_strict`,
 * `empty_hints`, `missing_catchall`, `pricing_anomaly`) are produced locally by
 * `runDeterministicCatalogReview` — the prompt below tells the LLM NOT to emit
 * them so we don't pay tokens twice.
 */
const SCHEMA_BLOCK_FOR_REVIEW = `Output schema (JSON only, no markdown):
{
  "issues": [
    {
      "type": "overlap" | "gap" | "contradiction" | "modality_mismatch" | "service_suggestion",
      "severity": "error" | "warning" | "suggestion",
      "services": ["<service_key>", "..."],
      "message": "<single doctor-facing sentence, no PHI, max 400 chars>",
      "suggestion": "<optional longer explanation, max 800 chars>",
      "suggestions": [
        { "action": "fill_with_ai" | "switch_to_strict" | "switch_to_flexible" | "apply_exclude_when_suggestion" | "add_card" | "enable_modality" | "reprice", "label": "<optional override>" }
      ],
      "suggestedCard": {
        "service_key": "<only for type='gap'>",
        "label": "...",
        "description": "...",
        "scope_mode": "strict" | "flexible",
        "matcher_hints": { "keywords": "...", "include_when": "...", "exclude_when": "..." },
        "modalities": { "text": {"enabled":true,"price_minor":0}, "voice": {"enabled":false,"price_minor":0}, "video": {"enabled":true,"price_minor":0} }
      },
      "autoFixAvailable": true | false
    }
  ]
}

- "type" rules:
  - "overlap": two existing cards share too many keywords / include_when phrases — the matcher will be ambiguous. "services" MUST list both affected service_keys.
  - "gap": a common complaint pattern for this specialty is not represented anywhere in the catalog. "services" is []; include a "suggestedCard" so the UI can drop it into drafts.
  - "contradiction": a card's include_when and exclude_when contradict each other (or contradict another card's stated scope).
  - "modality_mismatch": a card enables a clinically inappropriate modality (e.g. "Skin biopsy review" on text-only; "Long-term follow-up" on video only).
  - "service_suggestion": a common service for this specialty + country that is worth recommending; "services" is []; include "suggestedCard".
- Do NOT emit these deterministic kinds (the server already computes them): "strict_empty_hints", "strict_thin_keywords", "flexible_should_be_strict", "empty_hints", "missing_catchall", "pricing_anomaly".
- The catch-all "${CATALOG_CATCH_ALL_SERVICE_KEY}" card is ALWAYS flexible — never flag its scope_mode.
- "severity" defaults: overlap=warning, gap=suggestion, contradiction=warning, modality_mismatch=warning, service_suggestion=suggestion.
- Set "autoFixAvailable" = true iff "suggestions" has at least one entry.
- Each issue's "message" must be a single doctor-facing sentence with no PHI and no patient text.
- If the catalog is healthy, return { "issues": [] }. Do not invent issues to look useful.`;

// ----------------------------------------------------------------------------
// Context hydration
// ----------------------------------------------------------------------------

const SAFE_INPUT_LABEL_MAX = 200;
const SAFE_INPUT_DESC_MAX = 500;
const SAFE_INPUT_HINT_MAX = 800;

function clampString(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  const t = value.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

/**
 * Optional knob for {@link loadAiSuggestContext} so the editor can hand the
 * AI its current on-screen draft instead of the persisted catalog. See
 * {@link AiSuggestRequest.catalog} for the contract. Logged at info so we
 * can spot when the editor stops sending the override unexpectedly.
 */
export interface LoadAiSuggestContextOptions {
  /**
   * Three-state override:
   *   - `undefined`        → use DB (legacy default).
   *   - `null`             → treat the catalog as empty without touching the DB.
   *   - `ServiceCatalogV1` → use this exact catalog.
   */
  catalogOverride?: ServiceCatalogV1 | null;
}

/**
 * Pull the doctor's settings via the existing service (RLS-validated by `validateOwnership`)
 * and project only the AI-relevant fields. Throws {@link AiSuggestProfileIncompleteError}
 * when essentials are missing — the route maps that to 422.
 *
 * When `options.catalogOverride` is set (including `null`), the catalog field
 * comes from the caller instead of `service_offerings_json`. This is how the
 * services-catalog editor keeps the LLM critique aligned with the on-screen
 * draft after `add_card` / sparkle / manual edits — see the field doc on
 * {@link AiSuggestRequest.catalog}.
 */
export async function loadAiSuggestContext(
  doctorId: string,
  userId: string,
  correlationId: string,
  options: LoadAiSuggestContextOptions = {}
): Promise<AiSuggestContext> {
  const settings = await getDoctorSettingsForUser(doctorId, userId, correlationId);

  const specialty = settings.specialty?.trim();
  const missing: string[] = [];
  if (!specialty) missing.push('specialty');
  if (missing.length > 0) {
    throw new AiSuggestProfileIncompleteError(missing);
  }

  const usingOverride = options.catalogOverride !== undefined;
  const catalog = usingOverride
    ? options.catalogOverride ?? null
    : safeParseServiceCatalogV1FromDb(settings.service_offerings_json, doctorId);

  // Telemetry: distinguish editor-driven (client_draft) from DB-loaded reviews
  // so we can confirm the editor is sending the override and spot regressions
  // (e.g. a future caller forgetting it). PHI-safe — only counts and the
  // service_keys, no patient text.
  logger.info(
    {
      correlationId,
      doctorId,
      catalogSource: usingOverride ? 'client_draft' : 'db',
      serviceCount: catalog?.services.length ?? 0,
    },
    'service_catalog_ai_suggest: catalog source resolved'
  );

  return {
    doctorId,
    specialty: specialty as string,
    practiceName: settings.practice_name?.trim() || null,
    addressSummary: settings.address_summary?.trim() || null,
    country: settings.country?.trim() || null,
    consultationTypes: settings.consultation_types?.trim() || null,
    appointmentFeeMinor: settings.appointment_fee_minor,
    appointmentFeeCurrency: settings.appointment_fee_currency?.trim() || null,
    catalog,
  };
}

// ----------------------------------------------------------------------------
// Prompt builders
// ----------------------------------------------------------------------------

function summarizeContextForLlm(ctx: AiSuggestContext): string {
  const parts: string[] = [];
  parts.push(`Specialty: ${ctx.specialty}`);
  if (ctx.practiceName) parts.push(`Practice: ${ctx.practiceName}`);
  if (ctx.country) parts.push(`Country: ${ctx.country}`);
  if (ctx.addressSummary) parts.push(`Location: ${ctx.addressSummary}`);
  if (ctx.consultationTypes) {
    parts.push(`Doctor-configured consultation channels (free text): "${ctx.consultationTypes}"`);
  }
  if (ctx.appointmentFeeMinor != null) {
    const cur = ctx.appointmentFeeCurrency ?? 'INR';
    parts.push(
      `Base appointment fee: ${ctx.appointmentFeeMinor} (smallest unit, currency ${cur})`
    );
  } else {
    parts.push(`Base appointment fee: not set — pick prices that look reasonable for the specialty/region.`);
  }
  return parts.join('\n');
}

function summarizeExistingCatalogForLlm(catalog: ServiceCatalogV1 | null): string {
  if (!catalog || catalog.services.length === 0) {
    return 'Existing catalog: (empty)';
  }
  const lines = catalog.services.map((s) => {
    const scope = resolveServiceScopeMode(s.scope_mode);
    const mods = (['text', 'voice', 'video'] as const)
      .filter((m) => s.modalities[m]?.enabled === true)
      .join(',');
    const kw = s.matcher_hints?.keywords?.trim() ?? '';
    return `- ${s.service_key} [scope:${scope}] label="${s.label}" modalities=${mods || 'none'} keywords="${kw.slice(0, 120)}"`;
  });
  return `Existing catalog (do NOT duplicate these unless explicitly asked):\n${lines.join('\n')}`;
}

export function buildSingleCardPrompt(
  ctx: AiSuggestContext,
  payload: AiSuggestSingleCardPayload | undefined
): string {
  const label = clampString(payload?.label, SAFE_INPUT_LABEL_MAX) ?? '(not provided)';
  const desc = clampString(payload?.freeformDescription, SAFE_INPUT_DESC_MAX) ?? '(not provided)';
  const existingHintsLines: string[] = [];
  if (payload?.existingHints) {
    const kw = clampString(payload.existingHints.keywords, SAFE_INPUT_HINT_MAX);
    const iw = clampString(payload.existingHints.include_when, SAFE_INPUT_HINT_MAX);
    const ew = clampString(payload.existingHints.exclude_when, SAFE_INPUT_HINT_MAX);
    if (kw) existingHintsLines.push(`  keywords: ${kw}`);
    if (iw) existingHintsLines.push(`  include_when: ${iw}`);
    if (ew) existingHintsLines.push(`  exclude_when: ${ew}`);
  }
  const existingHintsBlock =
    existingHintsLines.length > 0
      ? `Doctor's existing hints for this card (refine or extend; do not silently drop them):\n${existingHintsLines.join('\n')}`
      : 'Doctor has not entered any matcher hints for this card yet.';

  return `You generate ONE service card for a doctor's teleconsultation catalog.

${summarizeContextForLlm(ctx)}

${summarizeExistingCatalogForLlm(ctx.catalog)}

Doctor's input for the new card:
- Label: ${label}
- Free-form description: ${desc}
${existingHintsBlock}

Hard constraints:
- Output JSON only, exactly one card in "cards".
- Do NOT invent additional services or conditions the doctor did not mention.
- Do NOT use service_key "${CATALOG_CATCH_ALL_SERVICE_KEY}" (that key is reserved for the catch-all row).
- Do NOT duplicate an existing service_key.

${ALL_RULE_BLOCKS.join('\n\n')}

${SCHEMA_BLOCK_FOR_CARDS}`;
}

export function buildStarterCatalogPrompt(ctx: AiSuggestContext): string {
  return `You generate a starter teleconsultation catalog for a doctor with no services yet.

${summarizeContextForLlm(ctx)}

${summarizeExistingCatalogForLlm(ctx.catalog)}

Hard constraints:
- Output JSON only.
- Generate 3 to 5 named cards typical for this specialty in this country, plus the mandatory catch-all card with service_key "${CATALOG_CATCH_ALL_SERVICE_KEY}" (label may be "${CATALOG_CATCH_ALL_LABEL_DEFAULT}").
- Each named card must be specific enough to be useful (avoid one giant "Consultation" card).
- Each named card defaults to "strict" with concrete matcher_hints — flexible is reserved for broad/general cards and the catch-all.
- Do NOT generate duplicate service_key values.

${ALL_RULE_BLOCKS.join('\n\n')}

${SCHEMA_BLOCK_FOR_CARDS}`;
}

export function buildReviewPrompt(ctx: AiSuggestContext): string {
  return `You audit a doctor's existing teleconsultation catalog and emit issues the doctor should fix.

${summarizeContextForLlm(ctx)}

${summarizeExistingCatalogForLlm(ctx.catalog)}

What to look for:
- Strict cards with empty matcher_hints → "strict_with_empty_hints" (the matcher will route NOTHING to them).
- Cards marked flexible whose label/description is actually a specific clinical condition → "flexible_should_be_strict".
- Two cards with very similar keywords / include_when → "overlap".
- Common complaint patterns for this specialty + country that the catalog has no card for → "gap".
- Pricing that violates text<=voice<=video for a single card, or is wildly outside [0.3x, 1.5x] of the base appointment fee → "pricing_anomaly".

Hard constraints:
- Output JSON only matching the schema below.
- The catch-all "${CATALOG_CATCH_ALL_SERVICE_KEY}" card is ALWAYS flexible — never flag its scope_mode.
- If the catalog is healthy, return { "issues": [] }. Do not invent issues to look useful.
- Each issue's "message" must be a single doctor-facing sentence with no PHI and no patient text.

${ALL_RULE_BLOCKS.join('\n\n')}

${SCHEMA_BLOCK_FOR_REVIEW}`;
}

// ----------------------------------------------------------------------------
// LLM call
// ----------------------------------------------------------------------------

const AI_SUGGEST_MAX_COMPLETION_TOKENS = 1500;

export interface AiSuggestRunLlmParams {
  systemPrompt: string;
  correlationId: string;
}

export type AiSuggestRunLlm = (params: AiSuggestRunLlmParams) => Promise<string | null>;

async function defaultRunAiSuggestLlm(params: AiSuggestRunLlmParams): Promise<string | null> {
  const client = getOpenAIClient();
  if (!client) {
    logger.warn(
      { correlationId: params.correlationId },
      'service_catalog_ai_suggest: no OpenAI client'
    );
    return null;
  }
  const config = getOpenAIConfig();
  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      max_completion_tokens: AI_SUGGEST_MAX_COMPLETION_TOKENS,
      response_format: { type: 'json_object' as const },
      messages: [{ role: 'system', content: params.systemPrompt }],
    });
    const content = completion.choices[0]?.message?.content ?? null;
    const usage = completion.usage;

    await logAIClassification({
      correlationId: params.correlationId,
      model: config.model,
      redactionApplied: false,
      status: content ? 'success' : 'failure',
      tokens: usage?.total_tokens,
      ...(content ? {} : { errorMessage: 'service_catalog_ai_suggest_empty_completion' }),
    });

    return content;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_openai_error';
    logger.warn(
      { correlationId: params.correlationId, err: message },
      'service_catalog_ai_suggest: openai call failed'
    );
    await logAIClassification({
      correlationId: params.correlationId,
      model: config.model,
      redactionApplied: false,
      status: 'failure',
      errorMessage: 'service_catalog_ai_suggest_openai_error',
    });
    throw new ServiceUnavailableError('AI suggestion service is unavailable. Please try again.');
  }
}

// ----------------------------------------------------------------------------
// LLM output parsing + server-side guards
// ----------------------------------------------------------------------------

interface RawLlmCard {
  service_key?: unknown;
  label?: unknown;
  description?: unknown;
  scope_mode?: unknown;
  matcher_hints?: unknown;
  modalities?: unknown;
}

function parseLlmJson(content: string | null, mode: AiSuggestMode): unknown {
  if (!content) {
    throw new ServiceUnavailableError('AI returned an empty response. Please try again.');
  }
  try {
    return JSON.parse(content);
  } catch {
    logger.warn({ mode, len: content.length }, 'service_catalog_ai_suggest: malformed JSON');
    // Surface as 502-ish — operational, retryable, but not the doctor's fault.
    throw new InternalError('AI returned malformed JSON. Please try again.');
  }
}

function asCardArray(parsed: unknown): RawLlmCard[] {
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { cards?: unknown }).cards)) {
    return (parsed as { cards: unknown[] }).cards.filter(
      (c): c is RawLlmCard => typeof c === 'object' && c !== null
    );
  }
  throw new InternalError('AI response missing "cards" array.');
}

/**
 * Validate the LLM's issues array against {@link qualityIssueSchema}. The LLM
 * output frequently omits fields (e.g. missing `severity`, missing `autoFixAvailable`)
 * or emits deterministic kinds we told it to skip — so we:
 *
 *   1. Drop issues whose `type` is in {@link DETERMINISTIC_ISSUE_TYPES} (tokens we
 *      already produced locally).
 *   2. Fill in defaults for `severity`, `services`, and `autoFixAvailable`.
 *   3. Run each candidate through `qualityIssueSchema.safeParse`; reject
 *      individual invalid entries rather than failing the whole call — that
 *      way a single bad LLM item doesn't trash the whole review.
 *   4. If the top-level shape is wrong (no `issues` array), throw `InternalError`
 *      so the route surfaces a 500 + the OpenAI failure audit log.
 */
function parseLlmIssues(parsed: unknown): QualityIssue[] {
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { issues?: unknown }).issues)
  ) {
    throw new InternalError('AI response missing "issues" array.');
  }
  const out: QualityIssue[] = [];
  for (const raw of (parsed as { issues: unknown[] }).issues) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;

    if (typeof r.type !== 'string') continue;
    if (DETERMINISTIC_ISSUE_TYPES.includes(r.type as (typeof DETERMINISTIC_ISSUE_TYPES)[number])) {
      // LLM re-emitted a kind we already cover deterministically — drop silently.
      continue;
    }

    const candidate: Record<string, unknown> = { ...r };
    // Fill defaults the LLM routinely forgets.
    if (typeof candidate.severity !== 'string') {
      candidate.severity =
        DEFAULT_SEVERITIES[r.type as (typeof LLM_ISSUE_TYPES)[number]] ?? 'warning';
    }
    if (!Array.isArray(candidate.services)) candidate.services = [];
    if (typeof candidate.autoFixAvailable !== 'boolean') {
      candidate.autoFixAvailable = Array.isArray(candidate.suggestions)
        ? candidate.suggestions.length > 0
        : false;
    }

    const parsedIssue = qualityIssueSchema.safeParse(candidate);
    if (parsedIssue.success) {
      out.push(parsedIssue.data);
    } else {
      logger.warn(
        { type: r.type, issue: parsedIssue.error.issues[0]?.message },
        'service_catalog_ai_suggest: dropping invalid LLM issue'
      );
    }
  }
  return out;
}

function clampPrice(
  raw: number,
  base: number | null
): { value: number; clamped: boolean; from?: number } {
  const safeRaw = Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : 0;
  if (base == null || base <= 0) {
    return { value: safeRaw, clamped: false };
  }
  const lo = Math.round(base * 0.3);
  const hi = Math.round(base * 1.5);
  if (safeRaw < lo) return { value: lo, clamped: true, from: safeRaw };
  if (safeRaw > hi) return { value: hi, clamped: true, from: safeRaw };
  return { value: safeRaw, clamped: false };
}

interface NormalizedCardOutput {
  card: ServiceOfferingV1;
  warnings: AiSuggestWarning[];
}

/**
 * Apply guards 1–4 (schema, catch-all force-flexible, modality filter, price clamp)
 * to a single raw LLM card and return both the validated `ServiceOfferingV1` and a
 * list of warnings (price clamps, modalities forced off, scope coerced).
 *
 * Throws `InternalError` when the card cannot be salvaged (no enabled modality
 * survived filtering; required fields missing; final Zod parse fails).
 */
function normalizeAndValidateCard(
  raw: RawLlmCard,
  ctx: AiSuggestContext,
  allowed: AllowedModalities
): NormalizedCardOutput {
  const warnings: AiSuggestWarning[] = [];
  const service_key =
    typeof raw.service_key === 'string'
      ? raw.service_key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 64) || 'service'
      : 'service';
  const isCatchAll = service_key === CATALOG_CATCH_ALL_SERVICE_KEY;

  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 200) : '';
  if (!label) {
    throw new InternalError(`AI card "${service_key}" missing a label.`);
  }

  let scopeMode: ScopeMode = 'flexible';
  if (typeof raw.scope_mode === 'string') {
    const sp = scopeModeSchema.safeParse(raw.scope_mode);
    if (sp.success) {
      scopeMode = sp.data;
    }
  }
  if (isCatchAll && scopeMode !== 'flexible') {
    warnings.push({ kind: 'catch_all_scope_forced_flexible', service_key });
    scopeMode = 'flexible';
  }

  const modalitiesRaw =
    raw.modalities && typeof raw.modalities === 'object'
      ? (raw.modalities as Record<string, unknown>)
      : {};
  const builtModalities: ServiceOfferingV1['modalities'] = {};
  for (const m of ['text', 'voice', 'video'] as const) {
    const slot = modalitiesRaw[m] as
      | { enabled?: unknown; price_minor?: unknown }
      | undefined;
    const wantedEnabled = slot && slot.enabled === true;
    if (!wantedEnabled) continue;

    if (!allowed[m]) {
      warnings.push({
        kind: 'modality_disabled_no_global_setup',
        service_key,
        modality: m,
        reason: 'doctor has not configured this channel globally',
      });
      continue;
    }
    const priceRaw =
      typeof slot?.price_minor === 'number'
        ? slot.price_minor
        : Number(slot?.price_minor ?? 0);
    const clamped = clampPrice(priceRaw, ctx.appointmentFeeMinor);
    if (clamped.clamped) {
      warnings.push({
        kind: 'price_clamped',
        service_key,
        modality: m,
        original_minor: clamped.from ?? priceRaw,
        clamped_minor: clamped.value,
        currency: ctx.appointmentFeeCurrency,
      });
    }
    builtModalities[m] = { enabled: true, price_minor: clamped.value };
  }

  // Every card must have at least one enabled modality. If filtering wiped them
  // all, we re-enable the most defensible default (video) so downstream Zod
  // validation does not fail — better to surface a working card with a warning
  // than throw and waste the LLM call.
  if (
    !builtModalities.text?.enabled &&
    !builtModalities.voice?.enabled &&
    !builtModalities.video?.enabled
  ) {
    const fallback: 'video' | 'voice' | 'text' = allowed.video
      ? 'video'
      : allowed.voice
        ? 'voice'
        : allowed.text
          ? 'text'
          : 'video';
    const base = ctx.appointmentFeeMinor ?? 50000; // ₹500 sane default if nothing else
    builtModalities[fallback] = {
      enabled: true,
      price_minor: clampPrice(base, ctx.appointmentFeeMinor).value,
    };
  }

  const matcherHintsRaw =
    raw.matcher_hints && typeof raw.matcher_hints === 'object'
      ? (raw.matcher_hints as Record<string, unknown>)
      : {};
  const keywords = typeof matcherHintsRaw.keywords === 'string' ? matcherHintsRaw.keywords.trim().slice(0, 400) : '';
  const include_when =
    typeof matcherHintsRaw.include_when === 'string'
      ? matcherHintsRaw.include_when.trim().slice(0, 800)
      : '';
  const exclude_when =
    typeof matcherHintsRaw.exclude_when === 'string'
      ? matcherHintsRaw.exclude_when.trim().slice(0, 800)
      : '';
  const matcher_hints =
    keywords || include_when || exclude_when
      ? {
          ...(keywords ? { keywords } : {}),
          ...(include_when ? { include_when } : {}),
          ...(exclude_when ? { exclude_when } : {}),
        }
      : undefined;

  const description =
    typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim().slice(0, 500)
      : undefined;

  const candidate: Omit<ServiceOfferingV1, 'service_id'> & { service_id: string } = {
    service_id: randomUUID(),
    service_key,
    label,
    scope_mode: scopeMode,
    modalities: builtModalities,
    ...(description ? { description } : {}),
    ...(matcher_hints ? { matcher_hints } : {}),
  };

  const parsed = serviceOfferingV1Schema.safeParse(candidate);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first ? first.path.join('.') : 'unknown';
    const why = first ? first.message : 'invalid card';
    throw new InternalError(`AI card "${service_key}" failed validation at ${where}: ${why}`);
  }

  return { card: parsed.data, warnings };
}

const KEYWORD_SPLIT_RE = /[\s,;]+/;

function tokenizeKeywords(s: string | undefined): Set<string> {
  if (!s) return new Set();
  return new Set(
    s
      .toLowerCase()
      .split(KEYWORD_SPLIT_RE)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3)
  );
}

function maxSiblingKeywordOverlap(
  card: ServiceOfferingV1,
  catalog: ServiceCatalogV1 | null
): { sibling_service_key: string; ratio: number } | null {
  if (!catalog) return null;
  const own = tokenizeKeywords(card.matcher_hints?.keywords);
  if (own.size === 0) return null;
  let best: { sibling_service_key: string; ratio: number } | null = null;
  for (const sib of catalog.services) {
    if (sib.service_key === card.service_key) continue;
    const sibTokens = tokenizeKeywords(sib.matcher_hints?.keywords);
    if (sibTokens.size === 0) continue;
    let inter = 0;
    for (const t of own) if (sibTokens.has(t)) inter += 1;
    const ratio = inter / own.size;
    if (!best || ratio > best.ratio) {
      best = { sibling_service_key: sib.service_key, ratio };
    }
  }
  return best;
}

// ----------------------------------------------------------------------------
// Mode dispatchers
// ----------------------------------------------------------------------------

async function generateSingleCard(
  ctx: AiSuggestContext,
  payload: AiSuggestSingleCardPayload | undefined,
  correlationId: string,
  runLlm: AiSuggestRunLlm
): Promise<AiSuggestCardResponse> {
  const systemPrompt = buildSingleCardPrompt(ctx, payload);
  const content = await runLlm({ systemPrompt, correlationId });
  const parsed = parseLlmJson(content, 'single_card');
  const rawCards = asCardArray(parsed);
  if (rawCards.length === 0) {
    throw new InternalError('AI returned no cards.');
  }
  const allowed = deriveAllowedModalitiesFromConsultationTypes(ctx.consultationTypes);
  const { card, warnings } = normalizeAndValidateCard(rawCards[0]!, ctx, allowed);
  // Force off catch-all key in single_card mode — that row is mandatory and managed elsewhere.
  if (card.service_key === CATALOG_CATCH_ALL_SERVICE_KEY) {
    throw new InternalError(
      `AI tried to generate the reserved catch-all key "${CATALOG_CATCH_ALL_SERVICE_KEY}" in single_card mode.`
    );
  }
  const overlap = maxSiblingKeywordOverlap(card, ctx.catalog);
  if (overlap && overlap.ratio > 0.7) {
    warnings.push({
      kind: 'keyword_overlap_with_sibling',
      service_key: card.service_key,
      sibling_service_key: overlap.sibling_service_key,
      overlap_ratio: Number(overlap.ratio.toFixed(2)),
    });
  }
  return { mode: 'single_card', cards: [card], warnings };
}

async function generateStarterCatalog(
  ctx: AiSuggestContext,
  correlationId: string,
  runLlm: AiSuggestRunLlm
): Promise<AiSuggestCardResponse> {
  const systemPrompt = buildStarterCatalogPrompt(ctx);
  const content = await runLlm({ systemPrompt, correlationId });
  const parsed = parseLlmJson(content, 'starter');
  const rawCards = asCardArray(parsed);
  if (rawCards.length === 0) {
    throw new InternalError('AI returned no cards.');
  }
  const allowed = deriveAllowedModalitiesFromConsultationTypes(ctx.consultationTypes);
  const cards: ServiceOfferingV1[] = [];
  const warnings: AiSuggestWarning[] = [];
  const seenKeys = new Set<string>();
  let hasCatchAll = false;
  for (const raw of rawCards) {
    let normalized: NormalizedCardOutput;
    try {
      normalized = normalizeAndValidateCard(raw, ctx, allowed);
    } catch (err) {
      // Skip a single bad card rather than fail the whole starter response.
      logger.warn(
        { err: err instanceof Error ? err.message : 'unknown' },
        'service_catalog_ai_suggest: dropping malformed starter card'
      );
      continue;
    }
    if (seenKeys.has(normalized.card.service_key)) {
      continue;
    }
    seenKeys.add(normalized.card.service_key);
    if (normalized.card.service_key === CATALOG_CATCH_ALL_SERVICE_KEY) {
      hasCatchAll = true;
    }
    cards.push(normalized.card);
    warnings.push(...normalized.warnings);
  }
  // Guarantee the mandatory catch-all row even if the LLM forgot it.
  if (!hasCatchAll) {
    const catchAll: ServiceOfferingV1 = {
      service_id: randomUUID(),
      service_key: CATALOG_CATCH_ALL_SERVICE_KEY,
      label: CATALOG_CATCH_ALL_LABEL_DEFAULT,
      scope_mode: 'flexible',
      modalities: {
        video: {
          enabled: true,
          price_minor: clampPrice(
            ctx.appointmentFeeMinor ?? 50000,
            ctx.appointmentFeeMinor
          ).value,
        },
      },
    };
    cards.push(catchAll);
  }
  return { mode: 'starter', cards, warnings };
}

// ----------------------------------------------------------------------------
// Review mode — deterministic + LLM checks
// ----------------------------------------------------------------------------

/** Heuristic: a label is a "narrow clinical condition" if it's short + has a
 *  recognizable condition noun and no broad qualifiers like "general",
 *  "consultation", "follow-up", "initial". Deliberately conservative — false
 *  positives here annoy the doctor. */
const NARROW_CLINICAL_NOUN_RE =
  /\b(acne|diabetes|hypertension|asthma|thyroid|psoriasis|eczema|arthritis|migraine|anxiety|depression|adhd|pcos|fertility|infertility|anemia|kidney|liver|cholesterol|obesity)\b/i;
const BROAD_LABEL_RE = /\b(general|consultation|consult|followup|follow-up|initial|visit|review|check-?up|check\s*up|teleconsult)\b/i;

function keywordTokenCount(keywords: string | undefined): number {
  if (!keywords) return 0;
  let c = 0;
  for (const raw of keywords.split(KEYWORD_SPLIT_RE)) {
    if (raw.trim().length >= 3) c += 1;
  }
  return c;
}

function hasEmptyMatcherHints(card: ServiceOfferingV1): boolean {
  const kw = card.matcher_hints?.keywords?.trim() ?? '';
  const iw = card.matcher_hints?.include_when?.trim() ?? '';
  return kw.length === 0 && iw.length === 0;
}

interface PriceAnomalyObservation {
  service_keys: string[];
  description: string;
}

function detectPriceAnomalies(catalog: ServiceCatalogV1): PriceAnomalyObservation[] {
  const out: PriceAnomalyObservation[] = [];
  for (const card of catalog.services) {
    const t = card.modalities.text?.enabled ? card.modalities.text.price_minor : null;
    const v = card.modalities.voice?.enabled ? card.modalities.voice.price_minor : null;
    const vid = card.modalities.video?.enabled ? card.modalities.video.price_minor : null;
    if (t != null && v != null && t > v) {
      out.push({
        service_keys: [card.service_key],
        description: `Text price (${t}) is higher than voice price (${v}) on "${card.label}" — the matcher's deterministic tier assumes text ≤ voice.`,
      });
    }
    if (t != null && vid != null && t > vid) {
      out.push({
        service_keys: [card.service_key],
        description: `Text price (${t}) is higher than video price (${vid}) on "${card.label}".`,
      });
    }
    if (v != null && vid != null && v > vid) {
      out.push({
        service_keys: [card.service_key],
        description: `Voice price (${v}) is higher than video price (${vid}) on "${card.label}".`,
      });
    }
  }
  // Cross-card: a labeled "follow-up" costs more than a labeled "initial" on the same modality.
  const followUps = catalog.services.filter((s) => /follow[\s-]?up/i.test(s.label));
  const initials = catalog.services.filter((s) => /\binitial\b/i.test(s.label));
  for (const fu of followUps) {
    for (const init of initials) {
      for (const m of ['text', 'voice', 'video'] as const) {
        const a = fu.modalities[m]?.enabled ? fu.modalities[m]!.price_minor : null;
        const b = init.modalities[m]?.enabled ? init.modalities[m]!.price_minor : null;
        if (a != null && b != null && a > b) {
          out.push({
            service_keys: [fu.service_key, init.service_key],
            description: `Follow-up "${fu.label}" ${m} price (${a}) is higher than initial "${init.label}" ${m} price (${b}).`,
          });
          break; // one anomaly per pair is plenty
        }
      }
    }
  }
  return out;
}

/**
 * Plan 02 / Task 07 — deterministic half of the review. Zero LLM cost. Emits
 * types listed in {@link DETERMINISTIC_ISSUE_TYPES}. The LLM is explicitly told
 * NOT to re-emit these (see `SCHEMA_BLOCK_FOR_REVIEW`).
 */
export function runDeterministicCatalogReview(
  catalog: ServiceCatalogV1 | null
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // --- missing_catchall (also covers empty-catalog case) -------------------
  const hasCatchAll =
    !!catalog &&
    catalog.services.some((s) => s.service_key === CATALOG_CATCH_ALL_SERVICE_KEY);
  if (!hasCatchAll) {
    issues.push(
      withAutoFixFlag({
        type: 'missing_catchall',
        severity: 'error',
        services: [],
        message:
          'Your catalog is missing the mandatory catch-all "Other / not listed" card — the matcher needs it as a safety net.',
        suggestion:
          'Add a flexible catch-all card so the matcher has somewhere to route complaints that don\'t fit a named service.',
        suggestions: [{ action: 'add_card' }],
        suggestedCard: {
          service_key: CATALOG_CATCH_ALL_SERVICE_KEY,
          label: CATALOG_CATCH_ALL_LABEL_DEFAULT,
          scope_mode: 'flexible',
          modalities: {
            video: { enabled: true, price_minor: 0 },
          },
        },
      })
    );
  }

  if (!catalog || catalog.services.length === 0) {
    return issues;
  }

  for (const card of catalog.services) {
    const isCatchAll = card.service_key === CATALOG_CATCH_ALL_SERVICE_KEY;
    if (isCatchAll) continue; // catch-all is forced flexible; no hint checks

    const scope = resolveServiceScopeMode(card.scope_mode);
    const kwCount = keywordTokenCount(card.matcher_hints?.keywords);
    const includeWhen = card.matcher_hints?.include_when?.trim() ?? '';
    const empty = hasEmptyMatcherHints(card);

    // --- strict_empty_hints -------------------------------------------------
    if (scope === 'strict' && empty) {
      issues.push(
        withAutoFixFlag({
          type: 'strict_empty_hints',
          severity: 'error',
          services: [card.service_key],
          message: `"${card.label}" is set to strict matching but has no routing hints — the bot will not route to this service.`,
          suggestion:
            'Fill in matching hints so the bot has something concrete to anchor on, or switch this card to flexible matching.',
          suggestions: [
            { action: 'fill_with_ai' },
            { action: 'switch_to_flexible' },
          ],
        })
      );
      continue; // don't also fire strict_thin_keywords on the same card
    }

    // --- strict_thin_keywords ----------------------------------------------
    if (scope === 'strict' && kwCount < 3 && includeWhen.length < 40) {
      issues.push(
        withAutoFixFlag({
          type: 'strict_thin_keywords',
          severity: 'warning',
          services: [card.service_key],
          message: `"${card.label}" is strict but has very few keywords — the bot will miss obvious synonyms patients actually type.`,
          suggestion:
            'Add more keywords (synonyms patients actually type) so the strict matcher has something to hit on.',
          suggestions: [{ action: 'fill_with_ai' }],
        })
      );
    }

    // --- empty_hints (flexible + completely empty) -------------------------
    if (scope === 'flexible' && empty) {
      issues.push(
        withAutoFixFlag({
          type: 'empty_hints',
          severity: 'suggestion',
          services: [card.service_key],
          message: `"${card.label}" has no routing hints — the bot may struggle to match patients correctly.`,
          suggestions: [{ action: 'fill_with_ai' }],
        })
      );
    }

    // --- flexible_should_be_strict -----------------------------------------
    if (
      scope === 'flexible' &&
      NARROW_CLINICAL_NOUN_RE.test(card.label) &&
      !BROAD_LABEL_RE.test(card.label) &&
      kwCount < 5
    ) {
      issues.push(
        withAutoFixFlag({
          type: 'flexible_should_be_strict',
          severity: 'warning',
          services: [card.service_key],
          message: `"${card.label}" reads like a specific condition but is set to flexible — it may absorb complaints that belong elsewhere.`,
          suggestion:
            'Switch this card to strict and let AI fill concrete keywords so it only matches its intended condition.',
          suggestions: [{ action: 'switch_to_strict_and_fill' }],
        })
      );
    }
  }

  // --- pricing_anomaly (per-card and cross-card) ---------------------------
  for (const obs of detectPriceAnomalies(catalog)) {
    issues.push(
      withAutoFixFlag({
        type: 'pricing_anomaly',
        severity: 'warning',
        services: obs.service_keys,
        message: obs.description,
        suggestions: [{ action: 'reprice' }],
      })
    );
  }

  return issues;
}

/**
 * Plan 02 / Task 07 — LLM half of the review. Always exactly one OpenAI call.
 * Emits only the types in {@link LLM_ISSUE_TYPES} — deterministic kinds are
 * filtered out in {@link parseLlmIssues}.
 */
export async function runLlmCatalogReview(
  ctx: AiSuggestContext,
  correlationId: string,
  runLlm: AiSuggestRunLlm
): Promise<QualityIssue[]> {
  if (!ctx.catalog || ctx.catalog.services.length === 0) {
    // Nothing for the LLM to audit — deterministic `missing_catchall` covers it.
    return [];
  }
  const systemPrompt = buildReviewPrompt(ctx);
  const content = await runLlm({ systemPrompt, correlationId });
  const parsed = parseLlmJson(content, 'review');
  return parseLlmIssues(parsed);
}

async function generateReview(
  ctx: AiSuggestContext,
  correlationId: string,
  runLlm: AiSuggestRunLlm
): Promise<AiSuggestReviewResponse> {
  const deterministic = runDeterministicCatalogReview(ctx.catalog);
  // Skip the LLM call when the catalog is empty — deterministic `missing_catchall`
  // carries enough signal and the LLM has nothing to audit.
  const llm =
    !ctx.catalog || ctx.catalog.services.length === 0
      ? []
      : await runLlmCatalogReview(ctx, correlationId, runLlm);
  const merged = sortQualityIssues([...deterministic, ...llm]);
  return { mode: 'review', issues: merged, warnings: [] };
}

// ----------------------------------------------------------------------------
// Public entry point
// ----------------------------------------------------------------------------

export interface GenerateAiCatalogSuggestionOptions {
  /** Inject a stubbed LLM in tests. */
  runLlm?: AiSuggestRunLlm;
}

export async function generateAiCatalogSuggestion(
  doctorId: string,
  userId: string,
  request: AiSuggestRequest,
  correlationId: string,
  options: GenerateAiCatalogSuggestionOptions = {}
): Promise<AiSuggestResponse> {
  if (!AI_SUGGEST_MODES.includes(request.mode)) {
    throw new ValidationError(`Unknown ai-suggest mode: ${String(request.mode)}`);
  }
  const ctx = await loadAiSuggestContext(doctorId, userId, correlationId, {
    // `request.catalog === undefined` keeps the DB path (legacy callers, smoke
    // tests). `null` and a populated catalog are both meaningful overrides and
    // are forwarded as-is — see {@link AiSuggestRequest.catalog}.
    ...(request.catalog !== undefined ? { catalogOverride: request.catalog } : {}),
  });
  const runLlm = options.runLlm ?? defaultRunAiSuggestLlm;

  switch (request.mode) {
    case 'single_card':
      return generateSingleCard(ctx, request.payload, correlationId, runLlm);
    case 'starter':
      return generateStarterCatalog(ctx, correlationId, runLlm);
    case 'review':
      return generateReview(ctx, correlationId, runLlm);
  }
}
