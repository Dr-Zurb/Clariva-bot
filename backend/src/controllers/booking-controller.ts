/**
 * Booking Controller (e-task-3)
 *
 * Handles slot picker API: day-slots, select-slot, slot-page-info.
 * Token-based auth (no user session).
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { verifyBookingToken, verifyBookingTokenAllowExpired } from '../utils/booking-token';
import {
  validateDaySlotsQuery,
  validateSelectSlotBody,
  validateSlotPageInfoQuery,
} from '../utils/validation';
import { getDaySlotsWithStatus } from '../services/availability-service';
import {
  processRescheduleSlotSelection,
  processSlotSelection,
  processSlotSelectionAndPay,
  getRedirectUrlForDoctor,
} from '../services/slot-selection-service';
import { getDoctorSettings } from '../services/doctor-settings-service';
import { ConflictError } from '../utils/errors';
import { errorResponse } from '../utils/response';

/**
 * GET /api/v1/bookings/day-slots?token=X&date=YYYY-MM-DD
 *
 * Returns all slots for the day with status (available | booked).
 */
export const getDaySlotsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const query = req.query as Record<string, string | string[] | undefined>;
  const normalized: Record<string, string | undefined> = {
    token: typeof query.token === 'string' ? query.token : Array.isArray(query.token) ? query.token[0] : undefined,
    date: typeof query.date === 'string' ? query.date : Array.isArray(query.date) ? query.date[0] : undefined,
  };

  const { token, date } = validateDaySlotsQuery(normalized);
  const { doctorId } = verifyBookingToken(token);

  const doctorSettings = await getDoctorSettings(doctorId);
  const timezone = doctorSettings?.timezone ?? 'Asia/Kolkata';
  const slotInterval = doctorSettings?.slot_interval_minutes;
  const minAdvanceHours = doctorSettings?.min_advance_hours ?? 0;

  const { slots, timezone: tz } = await getDaySlotsWithStatus(
    doctorId,
    date,
    correlationId,
    { timezone, slotIntervalMinutes: slotInterval, minAdvanceHours }
  );

  const opdMode = doctorSettings?.opd_mode ?? 'slot';

  res.status(200).json(successResponse({ slots, timezone: tz, opdMode }, req));
});

/**
 * POST /api/v1/bookings/select-slot
 *
 * Body: { token, slotStart }
 * Saves selection, sends proactive message, returns redirectUrl.
 */
export const selectSlotHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const body = validateSelectSlotBody(req.body);

  const result = await processSlotSelection(body.token, body.slotStart, correlationId);

  res.status(200).json(
    successResponse({ redirectUrl: result.redirectUrl }, req)
  );
});

/**
 * GET /api/v1/bookings/slot-page-info?token=X
 *
 * Returns doctorId and practiceName for the slot picker page header.
 */
export const getSlotPageInfoHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as Record<string, string | string[] | undefined>;
  const normalized: Record<string, string | undefined> = {
    token: typeof query.token === 'string' ? query.token : Array.isArray(query.token) ? query.token[0] : undefined,
  };

  const { token } = validateSlotPageInfoQuery(normalized);
  const { conversationId, doctorId, appointmentId } = verifyBookingToken(token);

  const doctorSettings = await getDoctorSettings(doctorId);
  const practiceName = doctorSettings?.practice_name?.trim() || 'Clariva Care';
  const mode = appointmentId ? 'reschedule' as const : 'book' as const;
  const opdMode = doctorSettings?.opd_mode ?? 'slot';

  res.status(200).json(
    successResponse(
      {
        doctorId,
        practiceName,
        conversationId,
        mode,
        appointmentId: appointmentId ?? undefined,
        opdMode,
      },
      req
    )
  );
});

/**
 * POST /api/v1/bookings/select-slot-and-pay
 *
 * Body: { token, slotStart }
 * Creates appointment + payment link in one call. Returns paymentUrl (or null when fee=0) and redirectUrl.
 */
export const selectSlotAndPayHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const body = validateSelectSlotBody(req.body);
  const { appointmentId } = verifyBookingToken(body.token);

  try {
    if (appointmentId) {
      const result = await processRescheduleSlotSelection(body.token, body.slotStart, correlationId);
      res.status(200).json(
        successResponse(
          {
            paymentUrl: null,
            redirectUrl: result.redirectUrl,
            appointmentId: result.appointmentId,
            mode: 'reschedule',
          },
          req
        )
      );
    } else {
      const result = await processSlotSelectionAndPay(body.token, body.slotStart, correlationId);
      res.status(200).json(
        successResponse(
          {
            paymentUrl: result.paymentUrl,
            redirectUrl: result.redirectUrl,
            appointmentId: result.appointmentId,
            mode: 'book',
            opdMode: result.opdMode,
            ...(result.tokenNumber != null ? { tokenNumber: result.tokenNumber } : {}),
          },
          req
        )
      );
    }
  } catch (err) {
    if (err instanceof ConflictError) {
      const message =
        err.message && err.message.trim().length > 0
          ? err.message
          : 'This slot was just taken. Please pick another.';
      const isSessionCap =
        message.toLowerCase().includes('maximum appointments') ||
        message.toLowerCase().includes('reached the maximum');
      res.status(409).json(
        errorResponse(
          {
            code: isSessionCap ? 'OPD_SESSION_FULL' : 'CONFLICT',
            message,
            statusCode: 409,
          },
          req
        )
      );
      return;
    }
    throw err;
  }
});

/**
 * GET /api/v1/bookings/redirect-url?token=X
 *
 * Returns Instagram DM redirect URL for success page. Allows expired token (user may have paid after token expiry).
 */
export const getRedirectUrlHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as Record<string, string | string[] | undefined>;
  const normalized: Record<string, string | undefined> = {
    token: typeof query.token === 'string' ? query.token : Array.isArray(query.token) ? query.token[0] : undefined,
  };

  const { token } = validateSlotPageInfoQuery(normalized);
  const { doctorId } = verifyBookingTokenAllowExpired(token);

  const redirectUrl = await getRedirectUrlForDoctor(doctorId);
  res.status(200).json(successResponse({ redirectUrl }, req));
});
