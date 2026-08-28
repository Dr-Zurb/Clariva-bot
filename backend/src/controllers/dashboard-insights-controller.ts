/**
 * Dashboard Insights Controller (insights-v1 · ins-01…05).
 *
 * Read-only endpoints for the Insights surface:
 *
 *   - `GET /api/v1/dashboard/insights/overview?from&to` — Tier-1
 *     practice-health aggregates.
 *   - `GET /api/v1/dashboard/insights/funnel?from&to` — Tier-2 booking
 *     funnel + booking-review SLA aggregates.
 *   - `GET /api/v1/dashboard/insights/clinical-mix?from&to&limit` — Tier-3
 *     de-identified top Dx / meds / investigations.
 *   - `GET /api/v1/dashboard/insights/telehealth?from&to` — Tier-4
 *     telehealth quality (modality mix, join success, call-quality percentiles).
 *
 * Auth is the standard `authenticateToken` middleware (doctor's Supabase
 * session). The doctor's `req.user.id` is the ONLY source of `doctor_id`
 * the service sees — a `doctor_id` in the body / query is never trusted.
 *
 * Orchestration only: validate (Zod) → service → respond. All business
 * logic + DB access lives in `dashboard-insights-service.ts`.
 *
 * @see backend/src/services/dashboard-insights-service.ts
 * @see backend/src/controllers/dashboard-events-controller.ts (pattern mirrored)
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { UnauthorizedError, ValidationError } from '../utils/errors';
import {
  CLINICAL_MIX_DEFAULT_LIMIT,
  CLINICAL_MIX_MAX_LIMIT,
  getBookingFunnel,
  getClinicalMix,
  getPracticeHealth,
  getTelehealthQuality,
} from '../services/dashboard-insights-service';

const MAX_RANGE_DAYS = 366;
const DEFAULT_RANGE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** An ISO calendar date, `YYYY-MM-DD`, that also parses to a real date. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00.000Z`)), {
    message: 'must be a valid calendar date (YYYY-MM-DD)',
  });

const rangeQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

const clinicalMixQuerySchema = rangeQuerySchema.extend({
  limit: z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined || raw === '') return CLINICAL_MIX_DEFAULT_LIMIT;
      const n = Number.parseInt(raw, 10);
      if (!Number.isInteger(n) || n < 1 || n > CLINICAL_MIX_MAX_LIMIT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `limit must be an integer between 1 and ${CLINICAL_MIX_MAX_LIMIT}`,
        });
        return z.NEVER;
      }
      return n;
    }),
});

/** Today as a UTC `YYYY-MM-DD` string. */
function todayYmdUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Subtract `days` from a `YYYY-MM-DD` string (UTC), returning `YYYY-MM-DD`. */
function ymdMinusDaysUtc(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Parse + default + validate the shared Insights `from`/`to` query.
 * Defaults: `to = today`, `from = today − 30d`. Rejects `from > to` and
 * spans > 366 days with `ValidationError`.
 */
function parseInsightsRange(query: unknown): { from: string; to: string } {
  const { from: fromRaw, to: toRaw } = rangeQuerySchema.parse(query);

  const today = todayYmdUtc();
  const to = toRaw ?? today;
  const from = fromRaw ?? ymdMinusDaysUtc(today, DEFAULT_RANGE_DAYS);

  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  if (fromMs > toMs) {
    throw new ValidationError('`from` must be on or before `to`');
  }
  const spanDays = Math.round((toMs - fromMs) / MS_PER_DAY);
  if (spanDays > MAX_RANGE_DAYS) {
    throw new ValidationError(`Range must not exceed ${MAX_RANGE_DAYS} days`);
  }

  return { from, to };
}

/**
 * GET /api/v1/dashboard/insights/overview
 *
 * Query params (both optional):
 *   - `from` — inclusive start day (`YYYY-MM-DD`). Default: today − 30d.
 *   - `to`   — inclusive end day (`YYYY-MM-DD`). Default: today.
 *
 * Returns the Tier-1 practice-health DTO.
 */
export const getInsightsOverviewHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { from, to } = parseInsightsRange(req.query);

    const overview = await getPracticeHealth({
      doctorId: userId,
      from,
      to,
      correlationId: req.correlationId ?? '',
    });

    res.status(200).json(successResponse(overview, req));
  }
);

/**
 * GET /api/v1/dashboard/insights/funnel
 *
 * Same `from`/`to` contract as overview. Returns the Tier-2 booking
 * funnel stages + booking-review SLA aggregates (counts only).
 */
export const getInsightsFunnelHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { from, to } = parseInsightsRange(req.query);

    const funnel = await getBookingFunnel({
      doctorId: userId,
      from,
      to,
      correlationId: req.correlationId ?? '',
    });

    res.status(200).json(successResponse(funnel, req));
  }
);

/**
 * GET /api/v1/dashboard/insights/clinical-mix
 *
 * Same `from`/`to` contract as overview, plus optional `limit` (1–50,
 * default 10). Returns de-identified top-N Dx / meds / investigations.
 */
export const getInsightsClinicalMixHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const parsed = clinicalMixQuerySchema.parse(req.query);
    const { from, to } = parseInsightsRange(parsed);
    const limit = parsed.limit ?? CLINICAL_MIX_DEFAULT_LIMIT;

    const mix = await getClinicalMix({
      doctorId: userId,
      from,
      to,
      limit,
      correlationId: req.correlationId ?? '',
    });

    res.status(200).json(successResponse(mix, req));
  }
);

/**
 * GET /api/v1/dashboard/insights/telehealth
 *
 * Same `from`/`to` contract as overview. Returns modality mix, mid-call
 * switches, join-success rate, and video/voice call-quality percentiles.
 */
export const getInsightsTelehealthHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { from, to } = parseInsightsRange(req.query);

    const telehealth = await getTelehealthQuality({
      doctorId: userId,
      from,
      to,
      correlationId: req.correlationId ?? '',
    });

    res.status(200).json(successResponse(telehealth, req));
  }
);
