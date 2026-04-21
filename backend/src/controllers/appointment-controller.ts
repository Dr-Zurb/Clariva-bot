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
import {
  bookAppointment,
  getAppointmentById,
  listAppointmentsForDoctor,
  updateAppointment,
} from '../services/appointment-service';
import {
  validateAvailableSlotsQuery,
  validateBookAppointment,
  validateDoctorCreateAppointment,
  validateGetAppointmentParams,
  validatePatchAppointmentBody,
  validateRecordingConsentBody,
} from '../utils/validation';
import { NotFoundError, UnauthorizedError } from '../utils/errors';
import { getPatientForDoctor } from '../services/patient-service';
import { captureBookingConsent } from '../services/recording-consent-service';
import { verifyBookingToken } from '../utils/booking-token';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';

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
 * Body: doctorId, patientName, patientPhone, appointmentDate (ISO), reasonForVisit (required), notes (optional)
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
 * Create appointment (doctor-only)
 * POST /api/v1/appointments
 *
 * Body: patientId? (existing patient), patientName, patientPhone (required for walk-in), appointmentDate, reasonForVisit, notes?, freeOfCost?
 * Auth: Requires authenticated doctor. doctorId derived from req.user.id.
 */
export const createAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const data = validateDoctorCreateAppointment(req.body);
  const doctorId = userId;

  let patientName: string;
  let patientPhone: string;
  let patientId: string | undefined;

  if (data.patientId) {
    const patient = await getPatientForDoctor(data.patientId, doctorId, correlationId);
    patientName = patient.name;
    patientPhone = patient.phone;
    patientId = data.patientId;
  } else {
    patientName = data.patientName!;
    patientPhone = data.patientPhone!;
  }

  const bookData = {
    doctorId,
    patientId,
    patientName,
    patientPhone,
    appointmentDate: data.appointmentDate,
    reasonForVisit: data.reasonForVisit,
    notes: data.notes,
    freeOfCost: data.freeOfCost,
  };

  const appointment = await bookAppointment(bookData, correlationId, userId);

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

/**
 * Patch appointment by ID
 * PATCH /api/v1/appointments/:id
 *
 * Body: { status?, clinical_notes? } - at least one required
 * Auth: Requires authenticated doctor (req.user).
 */
export const patchAppointmentByIdHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { id } = validateGetAppointmentParams(req.params);
  const updates = validatePatchAppointmentBody(req.body);
  const appointment = await updateAppointment(id, updates, correlationId, userId);

  res.status(200).json(successResponse({ appointment }, req));
});

/**
 * Record recording-consent decision for an appointment (Plan 02 · Task 27).
 * POST /api/v1/appointments/:id/recording-consent
 *
 * Body: { decision: boolean, consentVersion: string, bookingToken?: string }
 * Auth: Either (a) authenticated doctor who owns the appointment, OR
 *       (b) valid booking token whose conversation owns the appointment
 *           (public /book page flow — patients are not logged in).
 *
 * Response: 204 No Content.
 */
export const postRecordingConsentHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { id: appointmentId } = validateGetAppointmentParams(req.params);
  const { decision, consentVersion, bookingToken } = validateRecordingConsentBody(req.body);

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new UnauthorizedError('Recording consent capture not available');
  }

  const { data: apptRow, error: apptErr } = await admin
    .from('appointments')
    .select('id, doctor_id, conversation_id')
    .eq('id', appointmentId)
    .maybeSingle();

  if (apptErr) {
    logger.error(
      { correlationId, appointmentId, error: apptErr.message },
      'recording_consent_appointment_lookup_failed'
    );
    throw new NotFoundError('Appointment not found');
  }
  if (!apptRow) {
    throw new NotFoundError('Appointment not found');
  }

  const authedUserId = req.user?.id;
  let authorized = false;

  if (authedUserId && apptRow.doctor_id === authedUserId) {
    authorized = true;
  } else if (bookingToken) {
    try {
      const verified = verifyBookingToken(bookingToken);
      if (
        apptRow.conversation_id &&
        verified.conversationId === apptRow.conversation_id &&
        verified.doctorId === apptRow.doctor_id
      ) {
        authorized = true;
      }
    } catch (err) {
      logger.warn(
        {
          correlationId,
          appointmentId,
          error: err instanceof Error ? err.message : String(err),
        },
        'recording_consent_booking_token_rejected'
      );
    }
  }

  if (!authorized) {
    throw new UnauthorizedError('Not authorized to set consent for this appointment');
  }

  await captureBookingConsent({
    appointmentId,
    decision,
    consentVersion,
    correlationId,
  });

  res.status(204).send();
});
