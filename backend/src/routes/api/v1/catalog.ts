/**
 * Plan 02 / Task 06: Service catalog AI auto-fill endpoint.
 *
 * POST /api/v1/catalog/ai-suggest
 *
 * One endpoint, three modes:
 *   - mode: "single_card"  → AI suggests one card from a doctor-typed label/description
 *   - mode: "starter"      → AI suggests a 3–5 card starter catalog + the catch-all
 *   - mode: "review"       → AI audits the existing catalog and returns issues to fix
 *
 * Auth: doctor-only via authenticateToken.
 *
 * Errors:
 *   - 400 ValidationError                — payload failed Zod
 *   - 401 UnauthorizedError              — missing/invalid token
 *   - 422 AiSuggestProfileIncompleteError — doctor profile is missing the fields
 *                                           the AI needs (e.g. `specialty`)
 *   - 500 InternalError                  — LLM returned malformed/invalid output
 *   - 503 ServiceUnavailableError        — OpenAI client missing or threw
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { env } from '../../../config/env';
import { getOpenAIClient } from '../../../config/openai';
import { authenticateToken } from '../../../middleware/auth';
import { asyncHandler } from '../../../utils/async-handler';
import { successResponse } from '../../../utils/response';
import { UnauthorizedError, ValidationError } from '../../../utils/errors';
import {
  AI_SUGGEST_MODES,
  generateAiCatalogSuggestion,
  type AiSuggestRequest,
} from '../../../services/service-catalog-ai-suggest';
import {
  matchServiceCatalogOffering,
  type ServiceCatalogMatchResult,
} from '../../../services/service-catalog-matcher';
import { SERVICE_CATALOG_MATCH_REASON_CODES } from '../../../types/conversation';
import { serviceCatalogV1BaseSchema } from '../../../utils/service-catalog-schema';
import { findServiceOfferingByKey } from '../../../utils/service-catalog-helpers';

const router = Router();

const singleCardPayloadSchema = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
    freeformDescription: z.string().trim().min(1).max(500).optional(),
    existingHints: z
      .object({
        /**
         * Routing v2 (Task 06): primary patient-style phrase list. The frontend
         * sends this once a doctor has migrated the row to `examples`; the
         * backend prompt builder echoes it as `examples: …` so the LLM
         * refines/extends instead of regenerating from scratch. Kept loose
         * here (max 24 phrases × 200 chars) so a draft a hair over the
         * persisted schema bounds doesn't 400 the AI suggest call.
         */
        examples: z.array(z.string().trim().min(1).max(200)).max(24).optional(),
        keywords: z.string().trim().max(800).optional(),
        include_when: z.string().trim().max(800).optional(),
        exclude_when: z.string().trim().max(800).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * Optional unsaved-draft override the editor sends so the AI critiques the
 * current on-screen catalog instead of `service_offerings_json`. We use
 * `serviceCatalogV1BaseSchema` (no catch-all enforcement) on purpose —
 * an in-progress draft that's missing the catch-all is exactly the kind of
 * thing the deterministic review should flag (`missing_catchall`), so we
 * must let the request through. See `AiSuggestRequest.catalog`.
 */
const aiSuggestCatalogOverrideSchema = serviceCatalogV1BaseSchema;

const aiSuggestRequestSchema = z
  .object({
    mode: z.enum(AI_SUGGEST_MODES),
    payload: singleCardPayloadSchema.optional(),
    catalog: aiSuggestCatalogOverrideSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === 'single_card') {
      const p = value.payload;
      const hasInput =
        !!p &&
        ((p.label && p.label.length > 0) ||
          (p.freeformDescription && p.freeformDescription.length > 0) ||
          !!(p.existingHints &&
            ((p.existingHints.examples?.length ?? 0) > 0 ||
              (p.existingHints.keywords?.length ?? 0) > 0 ||
              (p.existingHints.include_when?.length ?? 0) > 0 ||
              (p.existingHints.exclude_when?.length ?? 0) > 0)));
      if (!hasInput) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payload'],
          message:
            'single_card mode requires at least one of payload.label, payload.freeformDescription, or payload.existingHints.*',
        });
      }
    } else if (value.payload !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payload'],
        message: `payload is only allowed when mode === "single_card"`,
      });
    }
  });

/** Exported so route tests can exercise validation in isolation. */
export const aiSuggestRequestSchemaForTests = aiSuggestRequestSchema;

const aiSuggestHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const parsed = aiSuggestRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first ? first.path.join('.') : 'body';
    const why = first?.message ?? 'invalid request';
    throw new ValidationError(`Invalid ai-suggest request at ${where}: ${why}`);
  }

  // Doctor scope: doctorId is the authenticated user. (No multi-tenant routing today;
  // mirrors getDoctorSettingsForUser semantics in service-staff-reviews / settings/doctor.)
  const result = await generateAiCatalogSuggestion(
    userId,
    userId,
    parsed.data as AiSuggestRequest,
    correlationId
  );

  res.status(200).json(successResponse(result, req));
});

router.post('/ai-suggest', authenticateToken, aiSuggestHandler);

// ─────────────────────────────────────────────────────────────────────────────
// Plan service-catalog-matcher-routing-v2 / Task 10 (Phase 4 hybrid):
// dev-only "Try as patient" preview endpoint.
//
// POST /api/v1/catalog/preview-match
//
// Doctors paste a sample patient message and see what the matcher would
// return — including which Stage won (A = instant rules, B = LLM assistant)
// — without sending a real Instagram DM. This is the smallest useful slice
// of Phase 4: it reuses `matchServiceCatalogOffering` end-to-end (one call,
// not two) and translates `result.source` → `path` for the UI badge.
//
// The route is registered only when `isCatalogPreviewMatchEnabled()` returns
// true (default: enabled when `NODE_ENV !== 'production'`). When disabled the
// route is not mounted at all, so production traffic gets a clean 404 rather
// than a 403. PHI handling: the matcher already calls `redactPhiForAI` on
// `reasonForVisitText` before any LLM hop and never logs the raw input —
// this preview path inherits that contract.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolved gating decision (centralized so route registration + tests agree).
 * Pure: takes the env knobs as args so unit tests can pin every combination
 * without re-parsing `process.env`.
 */
export function resolveCatalogPreviewMatchEnabled(args: {
  flag: boolean | undefined;
  nodeEnv: 'development' | 'production' | 'test';
}): boolean {
  if (args.flag === true) return true;
  if (args.flag === false) return false;
  return args.nodeEnv !== 'production';
}

export function isCatalogPreviewMatchEnabled(): boolean {
  return resolveCatalogPreviewMatchEnabled({
    flag: env.CATALOG_PREVIEW_MATCH_ENABLED,
    nodeEnv: env.NODE_ENV,
  });
}

const previewMatchRequestSchema = z
  .object({
    catalog: serviceCatalogV1BaseSchema,
    reasonForVisitText: z.string().trim().min(1).max(2000),
    recentUserMessages: z.array(z.string().trim().min(1).max(2000)).max(8).optional(),
    doctorProfile: z
      .object({
        practiceName: z.string().trim().max(200).nullable().optional(),
        specialty: z.string().trim().max(200).nullable().optional(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

/** Exported so route tests can exercise validation in isolation. */
export const previewMatchRequestSchemaForTests = previewMatchRequestSchema;

export type PreviewMatchPath = 'stage_a' | 'stage_b' | 'fallback' | 'single_fee';

export interface PreviewMatchSummary {
  /**
   * Which routing path produced the result — drives the "Stage A (instant) vs
   * Stage B (assistant)" badge in the dev UI. `'single_fee'` is broken out
   * separately because the matcher short-circuits before either stage runs.
   */
  path: PreviewMatchPath;
  matchedServiceKey: string;
  matchedLabel: string;
  suggestedModality: 'text' | 'voice' | 'video' | null;
  confidence: ServiceCatalogMatchResult['confidence'];
  autoFinalize: boolean;
  mixedComplaints: boolean;
  reasonCodes: string[];
  /**
   * True when the matcher had a usable LLM client (or test override) at the
   * time of the call. False means Stage B was effectively unavailable, so
   * a `path === 'fallback'` may simply reflect "no OpenAI key in this env"
   * rather than a real no-match — surfaced so the UI can warn.
   */
  llmAvailable: boolean;
}

/**
 * Pure transformation: matcher result → preview summary. Exported for tests so
 * we can pin every (`source`, `reasonCodes`) combo to a stable `path` without
 * spinning up the full matcher.
 */
export function summarizePreviewMatchResult(
  result: ServiceCatalogMatchResult,
  matchedLabel: string,
  llmAvailable: boolean
): PreviewMatchSummary {
  let path: PreviewMatchPath;
  if (result.source === 'llm') {
    path = 'stage_b';
  } else if (result.source === 'fallback') {
    path = 'fallback';
  } else if (
    result.reasonCodes.includes(SERVICE_CATALOG_MATCH_REASON_CODES.SINGLE_FEE_MODE)
  ) {
    path = 'single_fee';
  } else {
    path = 'stage_a';
  }
  return {
    path,
    matchedServiceKey: result.catalogServiceKey,
    matchedLabel,
    suggestedModality: result.suggestedModality ?? null,
    confidence: result.confidence,
    autoFinalize: result.autoFinalize,
    mixedComplaints: result.mixedComplaints,
    reasonCodes: result.reasonCodes,
    llmAvailable,
  };
}

const previewMatchHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const parsed = previewMatchRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first ? first.path.join('.') : 'body';
    const why = first?.message ?? 'invalid request';
    throw new ValidationError(`Invalid preview-match request at ${where}: ${why}`);
  }

  const { catalog, reasonForVisitText, recentUserMessages, doctorProfile } = parsed.data;
  const llmAvailable = Boolean(getOpenAIClient());

  const result = await matchServiceCatalogOffering({
    catalog,
    reasonForVisitText,
    recentUserMessages,
    correlationId,
    doctorProfile: doctorProfile ?? null,
    doctorId: userId,
  });

  if (!result) {
    // Empty catalog / catalog === null. `previewMatchRequestSchema` requires a
    // non-null catalog so this is genuinely "no services defined yet" — surface
    // a friendly empty result so the UI doesn't have to special-case 500s.
    res.status(200).json(
      successResponse(
        {
          path: 'fallback' as PreviewMatchPath,
          matchedServiceKey: '',
          matchedLabel: '',
          suggestedModality: null,
          confidence: 'low' as const,
          autoFinalize: false,
          mixedComplaints: false,
          reasonCodes: [SERVICE_CATALOG_MATCH_REASON_CODES.NO_CATALOG_MATCH],
          llmAvailable,
        } satisfies PreviewMatchSummary,
        req
      )
    );
    return;
  }

  const offering = findServiceOfferingByKey(catalog, result.catalogServiceKey);
  const matchedLabel = offering?.label ?? result.catalogServiceKey;

  const summary = summarizePreviewMatchResult(result, matchedLabel, llmAvailable);
  res.status(200).json(successResponse(summary, req));
});

if (isCatalogPreviewMatchEnabled()) {
  router.post('/preview-match', authenticateToken, previewMatchHandler);
}

export default router;
