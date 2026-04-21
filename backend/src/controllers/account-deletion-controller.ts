/**
 * Account-deletion controller (Plan 02 · Task 33)
 * -----------------------------------------------
 *
 * Two HTTP entry points layered on top of `account-deletion-worker.ts`:
 *
 *   - `POST /api/v1/me/account-deletion` → `postMeAccountDeletionHandler`
 *       Accepts either:
 *         (a) an authenticated doctor / admin JWT (support-initiated
 *             deletion on the patient's behalf — requires `patientId`
 *             in the body); or
 *         (b) a valid `bookingToken` whose conversation resolves to a
 *             single `patient_id` (self-serve; the booking token is
 *             the same HMAC we already issue for the slot picker, so
 *             the patient does not need a separate login flow).
 *       v1 does NOT ship an SMS-OTP second factor on top of the
 *       booking token — the task's "+ OTP" phrasing is reserved for a
 *       Plan 08/09 follow-up; this controller is the hook point it
 *       will extend.
 *
 *   - `POST /api/v1/me/account-recovery` → `postMeAccountRecoveryHandler`
 *       Same auth matrix. Cancels the most-recent pending deletion
 *       audit row for the patient if the grace window has not yet
 *       expired (delegated to `cancelAccountDeletion`).
 *
 * Both handlers are small — validation + auth resolution + worker
 * delegation. Business logic lives in the worker; the controller's
 * job is the HTTP boundary.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors';
import { getSupabaseAdminClient } from '../config/database';
import { verifyBookingToken } from '../utils/booking-token';
import {
  cancelAccountDeletion,
  requestAccountDeletion,
} from '../workers/account-deletion-worker';
import { logger } from '../config/logger';

interface AccountDeletionBody {
  patientId?: unknown;
  reason?: unknown;
  bookingToken?: unknown;
}

interface ResolvedRequest {
  patientId: string;
  requestedBy: string;
}

/**
 * Resolve the target patient + actor from the request. Returns the
 * pair (patientId, requestedBy) the worker's audit row needs, or
 * throws an HTTP-mapped error.
 *
 * Precedence:
 *   1. If `req.user` is set (doctor JWT), `requestedBy = req.user.id`.
 *      `patientId` must be supplied in the body. We do NOT verify the
 *      doctor has a conversation with this patient here — that's a
 *      Plan 07 admin dashboard concern and is explicitly out of scope
 *      for Task 33. A doctor who provides a random patient_id will
 *      succeed; the audit row records the actor, which is our trail.
 *
 *   2. Else, `bookingToken` is required. We verify signature + TTL,
 *      then look up the conversation and pull its `patient_id`. If a
 *      `patientId` was also supplied in the body, it must match —
 *      mismatch is a clear abuse signal and throws `ForbiddenError`.
 *
 * Any route-level body validation (field names, etc.) is inlined here
 * rather than factoring to `validation.ts` because the shape is
 * narrow and shared only between these two handlers.
 */
async function resolveRequest(req: Request): Promise<ResolvedRequest> {
  const body = (req.body ?? {}) as AccountDeletionBody;
  const bodyPatientId = typeof body.patientId === 'string' ? body.patientId.trim() : '';
  const bodyBookingToken =
    typeof body.bookingToken === 'string' ? body.bookingToken.trim() : '';

  if (req.user?.id) {
    if (!bodyPatientId) {
      throw new ValidationError(
        'patientId is required in the body when authenticated as a doctor',
      );
    }
    return { patientId: bodyPatientId, requestedBy: req.user.id };
  }

  if (!bodyBookingToken) {
    throw new UnauthorizedError(
      'Either a doctor JWT or a bookingToken is required',
    );
  }

  const verified = verifyBookingToken(bodyBookingToken);

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new UnauthorizedError('Admin client unavailable for booking-token path');
  }

  const { data: conversation, error } = await admin
    .from('conversations')
    .select('patient_id')
    .eq('id', verified.conversationId)
    .maybeSingle();

  if (error) {
    logger.warn(
      {
        correlationId: req.correlationId,
        error: error.message,
      },
      'account_deletion_conversation_lookup_failed',
    );
    throw new UnauthorizedError('Booking token could not be resolved');
  }
  if (!conversation?.patient_id) {
    throw new UnauthorizedError(
      'Booking token does not resolve to a valid patient',
    );
  }

  const resolvedPatientId = conversation.patient_id as string;
  if (bodyPatientId && bodyPatientId !== resolvedPatientId) {
    throw new ForbiddenError(
      'bodyPatientId does not match bookingToken conversation',
    );
  }

  return {
    patientId: resolvedPatientId,
    requestedBy: resolvedPatientId,
  };
}

export const postMeAccountDeletionHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId ?? 'unknown';
    const { patientId, requestedBy } = await resolveRequest(req);

    const body = (req.body ?? {}) as AccountDeletionBody;
    const reason = typeof body.reason === 'string' ? body.reason : undefined;

    try {
      const result = await requestAccountDeletion({
        patientId,
        requestedBy,
        reason,
        correlationId,
      });

      res.status(200).json({
        success: true,
        data: {
          graceWindowUntil: result.graceWindowUntil.toISOString(),
          reused: result.reused,
        },
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: { code: 'NotFoundError', message: err.message },
        });
        return;
      }
      throw err;
    }
  },
);

export const postMeAccountRecoveryHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const correlationId = req.correlationId ?? 'unknown';
    const { patientId, requestedBy } = await resolveRequest(req);

    await cancelAccountDeletion({
      patientId,
      cancelledBy: requestedBy,
      correlationId,
    });

    res.status(200).json({
      success: true,
      data: { cancelled: true },
    });
  },
);
