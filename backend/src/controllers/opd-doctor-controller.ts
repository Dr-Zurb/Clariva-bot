/**
 * Doctor OPD dashboard API (e-task-opd-06).
 */

import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import {
  AdvisoryLockTimeoutError,
  ForbiddenError,
  InternalError,
  UnauthorizedError,
} from '../utils/errors';
import {
  doctorOfferEarlyJoin,
  doctorSetSessionDelay,
  doctorUpdateQueueEntryStatus,
  doctorMarkAppointmentNoShow,
  doctorRequeueQueueEntry,
} from '../services/opd-doctor-service';
import { loadOpdSessionPayloadForDoctor } from '../services/opd-session-service';
import { getSupabaseAdminClient } from '../config/database';
import {
  assertNotPastDate,
  convertSessionDayMode,
} from '../services/opd/opd-mode-conversion-service';
import {
  validateGetAppointmentParams,
  validateConvertSessionBody,
  validateOpdQueueSessionQuery,
  validateOpdSessionQuery,
  validateOpdSlotSessionQuery,
  validateOfferEarlyJoinBody,
  validateSessionDelayBody,
  validatePatchQueueEntryBody,
  validateQueueEntryParams,
  validateRequeueQueueEntryBody,
} from '../utils/validation';
import type { OpdQueueEntryStatus } from '../types/database';
import { setOpdLegacySessionDeprecationHeaders } from '../utils/opd-legacy-session-headers';
import { resolveSessionDayMode } from '../services/opd/opd-mode-service';
import { ValidationError } from '../utils/errors';
import { logger } from '../config/logger';
import {
  bulkResolveSessionOverrun,
  listSessionOverrunRows,
} from '../services/opd/opd-overrun-service';
import {
  validateBulkResolveSessionOverrunBody,
  validateOpdSessionOverrunQuery,
} from '../utils/validation';

/**
 * GET /api/v1/opd/mode-schedule/test-date?date=YYYY-MM-DD
 * Full cascade resolver for the mode-schedule settings test widget (pdm-08).
 */
export const getOpdModeScheduleTestDate = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = req.user?.id;
  if (!doctorId) {
    throw new UnauthorizedError('Authentication required');
  }
  const date = req.query.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ValidationError('Query param `date` (YYYY-MM-DD) is required.');
  }
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available');
  }
  const resolved = await resolveSessionDayMode(supabase, doctorId, date);
  res.status(200).json(
    successResponse(
      {
        date,
        mode: resolved.mode,
        source: resolved.source,
      },
      req
    )
  );
});

/**
 * GET /api/v1/opd/session?date=YYYY-MM-DD — unified fact-aware session snapshot (pdm-02).
 */
export const getOpdSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  const correlationId = req.correlationId || 'unknown';
  const { date } = validateOpdSessionQuery(req.query as Record<string, string | undefined>);
  const payload = await loadOpdSessionPayloadForDoctor(userId, date, correlationId);
  res.status(200).json(successResponse(payload, req));
});

/**
 * GET /api/v1/opd/queue-session?date=YYYY-MM-DD
 * @deprecated Use GET /api/v1/opd/session — forced queue shape for the deprecation window.
 */
export const getOpdQueueSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  const correlationId = req.correlationId || 'unknown';
  const { date } = validateOpdQueueSessionQuery(req.query as Record<string, string | undefined>);
  const payload = await loadOpdSessionPayloadForDoctor(userId, date, correlationId, {
    forceMode: 'queue',
  });
  setOpdLegacySessionDeprecationHeaders(res);
  res.status(200).json(
    successResponse({ entries: payload.entries, date: payload.date }, req)
  );
});

/**
 * GET /api/v1/opd/slot-session?date=YYYY-MM-DD
 * @deprecated Use GET /api/v1/opd/session — forced slot shape for the deprecation window.
 */
export const getOpdSlotSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  const correlationId = req.correlationId || 'unknown';
  const { date } = validateOpdSlotSessionQuery(req.query as Record<string, string | undefined>);
  const payload = await loadOpdSessionPayloadForDoctor(userId, date, correlationId, {
    forceMode: 'slot',
  });
  if (payload.mode !== 'slot') {
    throw new InternalError('Unexpected queue payload from forced slot session load');
  }
  setOpdLegacySessionDeprecationHeaders(res);
  res.status(200).json(
    successResponse(
      {
        entries: payload.entries,
        counts: payload.counts,
        snapshotAt: payload.snapshotAt,
        date: payload.date,
      },
      req
    )
  );
});

/**
 * POST /api/v1/opd/appointments/:id/offer-early-join
 */
export const postOfferEarlyJoinHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  const correlationId = req.correlationId || 'unknown';
  const { id } = validateGetAppointmentParams(req.params);
  const body = validateOfferEarlyJoinBody(req.body);
  const mins = body.expiresInMinutes ?? 15;
  await doctorOfferEarlyJoin(id, userId, mins, correlationId);
  res.status(200).json(successResponse({ offered: true, expiresInMinutes: mins }, req));
});

/**
 * POST /api/v1/opd/appointments/:id/session-delay
 */
export const postSessionDelayHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  const correlationId = req.correlationId || 'unknown';
  const { id } = validateGetAppointmentParams(req.params);
  const { delayMinutes } = validateSessionDelayBody(req.body);
  await doctorSetSessionDelay(id, userId, delayMinutes, correlationId);
  res.status(200).json(successResponse({ updated: true, delayMinutes }, req));
});

/**
 * PATCH /api/v1/opd/queue-entries/:entryId
 */
export const patchQueueEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  const correlationId = req.correlationId || 'unknown';
  const { entryId } = validateQueueEntryParams(req.params);
  const { status } = validatePatchQueueEntryBody(req.body);
  await doctorUpdateQueueEntryStatus(entryId, userId, status as OpdQueueEntryStatus, correlationId);
  res.status(200).json(successResponse({ updated: true, status }, req));
});

/**
 * POST /api/v1/opd/appointments/:id/mark-no-show
 */
export const postMarkNoShowHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  const correlationId = req.correlationId || 'unknown';
  const { id } = validateGetAppointmentParams(req.params);
  await doctorMarkAppointmentNoShow(id, userId, correlationId);
  res.status(200).json(successResponse({ marked: true, status: 'no_show' }, req));
});

/**
 * POST /api/v1/opd/queue-entries/:entryId/requeue
 */
export const postRequeueQueueEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  const correlationId = req.correlationId || 'unknown';
  const { entryId } = validateQueueEntryParams(req.params);
  const { strategy } = validateRequeueQueueEntryBody(req.body);
  await doctorRequeueQueueEntry(entryId, userId, strategy, correlationId);
  res.status(200).json(successResponse({ requeued: true, strategy }, req));
});

// ============================================================================
// Conversion endpoints (pdm-04)
// ============================================================================

/**
 * Shared body handler for /opd/session/convert + /opd/session/preview-convert.
 * Validates auth, body, past-date guard, then dispatches to the orchestrator
 * with the requested `dryRun` flag.
 */
async function handleConvertSession(
  req: Request,
  res: Response,
  dryRun: boolean
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }
  const correlationId = req.correlationId || randomUUID();
  const body = validateConvertSessionBody(req.body);

  // DL-15 — past-date guard. Returns 403 with a stable error code so the
  // frontend can render the DL-15 tooltip on a server-side reject.
  try {
    await assertNotPastDate(userId, body.date);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      res.status(403).json({
        success: false,
        error: 'Past dates cannot be reconfigured.',
        error_code: 'PAST_DATE_PINNED',
        meta: { requestId: correlationId },
      });
      return;
    }
    throw err;
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available');
  }

  try {
    const result = await convertSessionDayMode(
      supabase,
      userId,
      body.date,
      body.toMode,
      {
        correlationId,
        triggeredBy: 'doctor',
        notes: body.notes,
        dryRun,
      }
    );
    res.status(200).json(successResponse(result, req));
  } catch (err) {
    if (err instanceof AdvisoryLockTimeoutError) {
      res.set('Retry-After', '2');
      res.status(409).json({
        success: false,
        error: err.message,
        error_code: 'CONVERSION_IN_PROGRESS',
        meta: { requestId: correlationId },
      });
      return;
    }
    throw err;
  }
}

/**
 * POST /api/v1/opd/session/convert
 * Body: { date: YYYY-MM-DD, toMode: 'slot' | 'queue', notes?: string }
 * Mutating. Doctor-only (auth = doctor; ownership is implicit since the
 * conversion writes against `req.user.id`).
 *
 * Responses:
 *   200 { success: true, data: ConvertSessionDayModeResult, meta: {...} }
 *   400 ValidationError (bad body)
 *   401 UnauthorizedError
 *   403 PAST_DATE_PINNED (DL-15)
 *   409 CONVERSION_IN_PROGRESS (AdvisoryLockTimeoutError; Retry-After header)
 */
export const postConvertSessionHandler = asyncHandler(
  async (req: Request, res: Response) => {
    await handleConvertSession(req, res, false);
  }
);

/**
 * POST /api/v1/opd/session/preview-convert
 * Same body / response shape as /convert but rolls back the mutation. Used
 * by the pdm-05 conversion preview dialog to render counts before commit.
 *
 * `data.snapshotAfter` reflects the simulated post-conversion state.
 */
export const postPreviewConvertSessionHandler = asyncHandler(
  async (req: Request, res: Response) => {
    await handleConvertSession(req, res, true);
  }
);

// ============================================================================
// Session overrun (pdm-09)
// ============================================================================

/**
 * GET /api/v1/opd/session/overrun?date=YYYY-MM-DD
 */
export const getOpdSessionOverrun = asyncHandler(async (req: Request, res: Response) => {
  const doctorId = req.user?.id;
  if (!doctorId) {
    throw new UnauthorizedError('Authentication required');
  }
  const { date } = validateOpdSessionOverrunQuery(
    req.query as Record<string, string | undefined>
  );
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new InternalError('Service role client not available');
  }
  const payload = await listSessionOverrunRows(supabase, doctorId, date);
  res.status(200).json(successResponse(payload, req));
});

/**
 * POST /api/v1/opd/session/overrun/bulk-resolve
 */
export const postOpdSessionOverrunBulkResolve = asyncHandler(
  async (req: Request, res: Response) => {
    const doctorId = req.user?.id;
    if (!doctorId) {
      throw new UnauthorizedError('Authentication required');
    }
    const correlationId = req.correlationId || randomUUID();
    const { date, action, perRowOverrides } = validateBulkResolveSessionOverrunBody(req.body);
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      throw new InternalError('Service role client not available');
    }
    try {
      const result = await bulkResolveSessionOverrun(
        supabase,
        doctorId,
        date,
        action,
        perRowOverrides,
        {
          triggeredBy: 'doctor',
          correlationId,
        }
      );
      res.status(200).json(successResponse(result, req));
    } catch (err) {
      logger.error({ err, doctorId, date, action }, 'bulkResolveSessionOverrun failed');
      throw err;
    }
  }
);
