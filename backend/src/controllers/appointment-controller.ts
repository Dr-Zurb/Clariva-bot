/**
 * Appointment Controller
 *
 * Handles HTTP requests for appointment-related endpoints.
 * GET /api/v1/appointments/available-slots - Returns available time slots for a doctor on a date.
 * POST /api/v1/appointments/book - Books an appointment (webhook worker or doctor).
 * GET /api/v1/appointments/:id - Returns appointment by ID (doctor-only, requires auth).
 *
 * Auth: available-slots unauthenticated; book unauthenticated (webhook) or doctor; getById doctor-only.
 * Webhook worker calls availability-service and bookAppointment directly (no HTTP).
 *
 * MUST: Use asyncHandler and successResponse - see STANDARDS.md
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import { getAvailableSlots } from '../services/availability-service';
import { bookAppointment, getAppointmentById, listAppointmentsForDoctor } from '../services/appointment-service';
import {
  validateAvailableSlotsQuery,
  validateBookAppointment,
  validateGetAppointmentParams,
} from '../utils/validation';
import { UnauthorizedError } from '../utils/errors';

/**
 * Get available slots
 * GET /api/v1/appointments/available-slots?doctorId=...&date=YYYY-MM-DD
 *
 * Returns available time slots for a doctor on a date.
 * Excludes blocked times and booked appointments (pending/confirmed).
 */
export const getAvailableSlotsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const query = req.query as Record<string, string | string[] | undefined>;

  const normalized: Record<string, string | undefined> = {
    doctorId: typeof query.doctorId === 'string' ? query.doctorId : Array.isArray(query.doctorId) ? String(query.doctorId[0]) : undefined,
    date: typeof query.date === 'string' ? query.date : Array.isArray(query.date) ? String(query.date[0]) : undefined,
  };

  const { doctorId, date } = validateAvailableSlotsQuery(normalized);
  const slots = await getAvailableSlots(doctorId, date, correlationId);

  res.status(200).json(successResponse({ slots }, req));
});

/**
 * Book appointment
 * POST /api/v1/appointments/book
 *
 * Body: doctorId, patientName, patientPhone, appointmentDate (ISO), notes (optional)
 * Auth: Phase 0 - Unauthenticated (webhook worker or doctor dashboard). userId from req.user if present.
 */
export const bookAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  const data = validateBookAppointment(req.body);
  const appointment = await bookAppointment(data, correlationId, userId);

  res.status(201).json(successResponse({ appointment }, req));
});

/**
 * List appointments for the authenticated doctor
 * GET /api/v1/appointments
 *
 * Auth: Requires authenticated doctor (req.user). Returns 401 if unauthenticated.
 * Response: { success: true, data: { appointments: Appointment[] }, meta }
 */
export const listAppointmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const appointments = await listAppointmentsForDoctor(userId, correlationId);

  res.status(200).json(successResponse({ appointments }, req));
});

/**
 * Get appointment by ID
 * GET /api/v1/appointments/:id
 *
 * Auth: Requires authenticated doctor (req.user). Returns 401 if unauthenticated.
 */
export const getAppointmentByIdHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { id } = validateGetAppointmentParams(req.params);
  const appointment = await getAppointmentById(id, correlationId, userId);

  res.status(200).json(successResponse({ appointment }, req));
});
