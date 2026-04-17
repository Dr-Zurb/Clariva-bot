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

import { authenticateToken } from '../../../middleware/auth';
import { asyncHandler } from '../../../utils/async-handler';
import { successResponse } from '../../../utils/response';
import { UnauthorizedError, ValidationError } from '../../../utils/errors';
import {
  AI_SUGGEST_MODES,
  generateAiCatalogSuggestion,
  type AiSuggestRequest,
} from '../../../services/service-catalog-ai-suggest';

const router = Router();

const singleCardPayloadSchema = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
    freeformDescription: z.string().trim().min(1).max(500).optional(),
    existingHints: z
      .object({
        keywords: z.string().trim().max(800).optional(),
        include_when: z.string().trim().max(800).optional(),
        exclude_when: z.string().trim().max(800).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const aiSuggestRequestSchema = z
  .object({
    mode: z.enum(AI_SUGGEST_MODES),
    payload: singleCardPayloadSchema.optional(),
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
            ((p.existingHints.keywords?.length ?? 0) > 0 ||
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

export default router;
