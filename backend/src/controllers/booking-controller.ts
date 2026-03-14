/**
 * Booking Controller (e-task-3)
 *
 * Handles slot picker API: day-slots, select-slot, slot-page-info.
 * Token-based auth (no user session).
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { verifyBookingToken } from '../utils/booking-token';
import {
  validateDaySlotsQuery,
  validateSelectSlotBody,
  validateSlotPageInfoQuery,
} from '../utils/validation';
import { getDaySlotsWithStatus } from '../services/availability-service';
import { processSlotSelection } from '../services/slot-selection-service';
import { getDoctorSettings } from '../services/doctor-settings-service';

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

  res.status(200).json(successResponse({ slots, timezone: tz }, req));
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
  const { conversationId, doctorId } = verifyBookingToken(token);

  const doctorSettings = await getDoctorSettings(doctorId);
  const practiceName = doctorSettings?.practice_name?.trim() || 'Clariva Care';

  res.status(200).json(
    successResponse(
      { doctorId, practiceName, conversationId },
      req
    )
  );
});
