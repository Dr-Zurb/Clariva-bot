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
  checkInAppointment,
  getAppointmentById,
  getRecentDiagnosisTags,
  listAppointmentsForDoctor,
  updateAppointment,
  wrapUpAppointment,
} from '../services/appointment-service';
import {
  validateAvailableSlotsQuery,
  validateBookAppointment,
  validateDoctorCreateAppointment,
  validateGetAppointmentParams,
  validateListAppointmentsQuery,
  validatePatchAppointmentBody,
  validateRecentDiagnosesQuery,
  validateWrapUpBody,
} from '../utils/validation';
import { UnauthorizedError, ValidationError } from '../utils/errors';
import { requireResolvedDoctor } from '../middleware/resolve-acting-doctor';
import { getDeskPatientForBooking, getPatientForDoctor } from '../services/patient-service';
import { sendDeskBookingConfirmationToPatient } from '../services/notification-service';

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
  const { doctorId, actorId } = requireResolvedDoctor(req);

  const data = validateDoctorCreateAppointment(req.body);

  if (req.actorKind === 'staff') {
    if (data.walkin || !data.patientId) {
      throw new ValidationError('Desk bookings require a registered patient');
    }
  }

  let patientName: string;
  let patientPhone: string;
  let patientId: string | undefined;
  let notes: string | undefined = data.notes;
  let skipMrn = false;

  if (data.walkin) {
    // pf-16: walk-in fast path — no patient row required.
    const nameHint = data.patientNameHint?.trim();
    patientName = nameHint || 'Walk-in';
    patientPhone = '';
    // Surface the name hint in notes so cockpit header can display it.
    if (nameHint) {
      notes = notes ? `[Walk-in: ${nameHint}] ${notes}` : `Walk-in: ${nameHint}`;
    }
  } else if (data.patientId) {
    if (req.actorKind === 'staff') {
      const patient = await getDeskPatientForBooking(
        data.patientId,
        doctorId,
        correlationId,
        actorId
      );
      patientName = patient.name;
      patientPhone = patient.phone;
      patientId = data.patientId;
      skipMrn = Boolean(patient.medical_record_number);
    } else {
      const patient = await getPatientForDoctor(data.patientId, doctorId, correlationId);
      patientName = patient.name;
      patientPhone = patient.phone;
      patientId = data.patientId;
    }
  } else {
    patientName = data.patientName!;
    patientPhone = data.patientPhone!;
  }

  const bookingOrigin =
    data.bookingOrigin ??
    (data.walkin
      ? 'walk_in'
      : data.opdEventType === 'return_after_completed'
        ? 'return_after_completed'
        : 'booked');

  const bookData = {
    doctorId,
    patientId,
    patientName,
    patientPhone,
    appointmentDate: data.appointmentDate,
    reasonForVisit: data.reasonForVisit ?? (data.walkin ? 'Walk-in' : 'Not provided'),
    notes,
    // Walk-ins are always confirmed and free (doctor controls the flow).
    freeOfCost: req.actorKind === 'staff' ? true : data.walkin ? true : data.freeOfCost,
    bookingOrigin,
    ...(data.consultationType
      ? { consultationType: data.consultationType }
      : req.actorKind === 'staff'
        ? { consultationType: 'in_clinic' as const }
        : {}),
    ...(data.opdEventType && { opdEventType: data.opdEventType }),
    ...(data.relatedAppointmentId && { relatedAppointmentId: data.relatedAppointmentId }),
    ...(data.checkIn ? { checkIn: true } : {}),
    ...(skipMrn ? { skipMrn: true } : {}),
  };

  const actingFor =
    actorId !== doctorId ? { actingForDoctorId: doctorId } : undefined;
  const appointment = await bookAppointment(bookData, correlationId, actorId, actingFor);

  if (req.actorKind === 'staff' && bookingOrigin === 'booked') {
    await sendDeskBookingConfirmationToPatient(appointment.id, correlationId);
  }

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
  const { doctorId, actorId } = requireResolvedDoctor(req);

  const query = validateListAppointmentsQuery(
    req.query as Record<string, string | string[] | undefined>
  );
  const appointments = await listAppointmentsForDoctor(
    doctorId,
    correlationId,
    { patientId: query.patient_id, date: query.date },
    actorId
  );

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
 * Stamp arrival (receptionist-portal P4).
 * POST /api/v1/appointments/:id/check-in
 *
 * Auth: doctor or opted-in staff (allowStaff + resolveActingDoctor).
 * Idempotent. Does not expose or write clinical_notes.
 */
export const checkInAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const { doctorId, actorId } = requireResolvedDoctor(req);
  const { id } = validateGetAppointmentParams(req.params);
  const appointment = await checkInAppointment(id, doctorId, correlationId, actorId);
  res.status(200).json(successResponse({ appointment }, req));
});

/**
 * Wrap up an appointment (pf-02).
 * POST /api/v1/appointments/:id/wrap-up
 *
 * Body: { diagnosis_text?, diagnosis_tags?, followup_date?, followup_kind? }
 *   - diagnosis_text:  string (≤2000), optional/nullable
 *   - diagnosis_tags:  string[] (≤20 entries, ≤64 chars each), default []
 *   - followup_date:   YYYY-MM-DD, optional/nullable
 *   - followup_kind:   'none' | 'in_person' | 'tele', optional/nullable
 *
 * Auth: Authenticated doctor (req.user). Caller must own the appointment;
 * a non-owner gets 403 (not 404 — wrap-up is an explicit action and we
 * surface authorization errors clearly so the dashboard can show a
 * meaningful message).
 *
 * Idempotent: wrapping up an already-completed appointment returns the
 * existing row with no side-effects (no audit log, no `endSession`).
 */
export const wrapUpAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { id } = validateGetAppointmentParams(req.params);
  const body = validateWrapUpBody(req.body);

  const appointment = await wrapUpAppointment(id, body, correlationId, userId);

  res.status(200).json(successResponse({ appointment }, req));
});

/**
 * Recent diagnosis-tag autocomplete (pf-02).
 * GET /api/v1/diagnoses/recent?limit=20
 *
 * Returns the doctor's most-used diagnosis tags across `completed`
 * appointments in the last 90 days, sorted by usage descending.
 *
 * Auth: Authenticated doctor (req.user). Always scoped to the calling
 * doctor — there is no `doctorId` query param, ownership is implicit.
 *
 * Cache: `Cache-Control: private, max-age=60` — autocomplete fires on
 * every keystroke; a 60s client cache is plenty and doesn't leak across
 * tabs (private).
 */
export const getRecentDiagnosisTagsHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const query = req.query as Record<string, string | string[] | undefined>;
  const normalized = {
    limit: typeof query.limit === 'string' ? query.limit : Array.isArray(query.limit) ? query.limit[0] : undefined,
  };
  const { limit } = validateRecentDiagnosesQuery(normalized);

  const tags = await getRecentDiagnosisTags(userId, limit, correlationId);

  res.set('Cache-Control', 'private, max-age=60');
  res.status(200).json(successResponse({ tags }, req));
});
