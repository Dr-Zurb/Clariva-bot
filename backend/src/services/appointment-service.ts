/**
 * Appointment Service Functions
 *
 * Service functions for appointment-related database operations.
 * Appointments contain PHI (patient_name, patient_phone) which is encrypted at rest.
 */

import { supabase, getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import {
  Appointment,
  InsertAppointment,
  AppointmentStatus,
} from '../types';
import { BookAppointmentInput } from '../utils/validation';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '../utils/errors';
import { handleSupabaseError, validateOwnership } from '../utils/db-helpers';
import { logDataModification, logDataAccess, logAuditEvent } from '../utils/audit-logger';
import {
  createTwilioRoom,
  generateVideoAccessToken,
  isTwilioVideoConfigured,
} from './consultation-room-service';
import {
  generateConsultationToken,
  verifyConsultationToken,
} from '../utils/consultation-token';
import { sendConsultationLinkToPatient } from './notification-service';
import { logger } from '../config/logger';
import { getDoctorSettings } from './doctor-settings-service';
import { resolveOpdModeFromSettings } from './opd/opd-mode-service';
import {
  countActiveAppointmentsForSessionDay,
  createQueueEntryAfterBooking,
  deleteQueueEntryByAppointmentId,
  sessionDateFromAppointmentDate,
  syncOpdQueueEntryOnAppointmentStatus,
} from './opd/opd-queue-service';
import { assertSlotJoinAllowedForPatient } from './opd/opd-policy-service';
import { recordOpdBookingTotal } from './opd/opd-metrics';
import { syncCareEpisodeLifecycleOnAppointmentCompleted } from './care-episode-service';

const SLOT_INTERVAL_MS = env.SLOT_INTERVAL_MINUTES * 60 * 1000;

/**
 * Create a new appointment
 * 
 * Creates appointment record for a doctor.
 * 
 * @param data - Appointment data to insert
 * @param correlationId - Request correlation ID
 * @param userId - Authenticated user ID (doctor)
 * @returns Created appointment
 * 
 * @throws ValidationError if appointment date is in the past
 * @throws ForbiddenError if doctor_id doesn't match userId
 * @throws InternalError if database operation fails
 * 
 * Note: Uses user role client (respects RLS)
 */
export async function createAppointment(
  data: InsertAppointment,
  correlationId: string,
  userId: string
): Promise<Appointment> {
  // Validate ownership (defense in depth)
  validateOwnership(data.doctor_id, userId);

  // Validate business rules
  if (data.appointment_date < new Date()) {
    throw new ValidationError('Cannot book appointments in the past');
  }

  // Create appointment (user role - respects RLS)
  const { data: appointment, error } = await supabase
    .from('appointments')
    .insert(data)
    .select()
    .single();

  if (error || !appointment) {
    handleSupabaseError(error, correlationId);
  }

  // Audit log
  await logDataModification(
    correlationId,
    userId,
    'create',
    'appointment',
    appointment.id
  );

  return appointment as Appointment;
}

/**
 * Book an appointment with double-booking prevention.
 * Supports both authenticated doctor (userId) and webhook worker (no userId, uses service role).
 *
 * @param data - Book appointment input (camelCase from API)
 * @param correlationId - Request correlation ID
 * @param userId - Optional authenticated user ID (doctor); when omitted, uses service role (webhook worker)
 * @returns Created appointment
 * @throws ConflictError if slot already booked
 * @throws ValidationError if date in past
 * @throws ForbiddenError if userId provided and doctor_id doesn't match
 * @throws InternalError if database or service role unavailable
 */
export async function bookAppointment(
  data: BookAppointmentInput,
  correlationId: string,
  userId?: string
): Promise<Appointment> {
  const appointmentDate = new Date(data.appointmentDate);
  const status = data.freeOfCost ? 'confirmed' : 'pending';
  const insertData: InsertAppointment = {
    doctor_id: data.doctorId,
    patient_id: data.patientId ?? undefined,
    conversation_id: data.conversationId ?? undefined,
    patient_name: data.patientName,
    patient_phone: data.patientPhone,
    appointment_date: appointmentDate,
    status,
    reason_for_visit: data.reasonForVisit ?? 'Not provided',
    notes: data.notes ?? null,
    ...(data.consultationType && { consultation_type: data.consultationType }),
    ...(data.catalogServiceKey?.trim() && {
      catalog_service_key: data.catalogServiceKey.trim().toLowerCase(),
    }),
    ...(data.catalogServiceId?.trim() && {
      catalog_service_id: data.catalogServiceId.trim(),
    }),
    ...(data.episodeId && { episode_id: data.episodeId }),
  };

  if (appointmentDate < new Date()) {
    throw new ValidationError('Cannot book appointments in the past');
  }

  if (userId) {
    validateOwnership(data.doctorId, userId);
  }

  const settings = await getDoctorSettings(data.doctorId);
  const opdMode = resolveOpdModeFromSettings(settings);
  const timezone = settings?.timezone ?? 'Asia/Kolkata';

  logger.info(
    {
      correlationId,
      doctorId: data.doctorId,
      opd_mode: opdMode,
      context: 'opd_queue',
    },
    'booking_opd_mode'
  );

  if (opdMode === 'queue') {
    const sessionDateYmd = sessionDateFromAppointmentDate(appointmentDate, timezone);
    const dayCount = await countActiveAppointmentsForSessionDay(
      data.doctorId,
      sessionDateYmd,
      timezone,
      correlationId
    );
    const maxCap = settings?.max_appointments_per_day;
    if (maxCap != null && maxCap > 0 && dayCount >= maxCap) {
      throw new ConflictError('This doctor has reached the maximum appointments for that day');
    }
  } else {
    const slotEnd = new Date(appointmentDate.getTime() + SLOT_INTERVAL_MS);
    const hasConflict = await checkSlotConflict(data.doctorId, appointmentDate, slotEnd, correlationId);
    if (hasConflict) {
      throw new ConflictError('This time slot is no longer available');
    }
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for booking');
  }

  const { data: appointment, error } = await admin
    .from('appointments')
    .insert(insertData)
    .select()
    .single();

  if (error || !appointment) {
    handleSupabaseError(error, correlationId);
  }

  if (opdMode === 'queue') {
    try {
      await createQueueEntryAfterBooking(
        appointment.id,
        data.doctorId,
        appointmentDate,
        timezone,
        correlationId
      );
    } catch (queueErr) {
      await admin.from('appointments').delete().eq('id', appointment.id);
      throw queueErr;
    }
  }

  if (userId) {
    await logDataModification(
      correlationId,
      userId,
      'create',
      'appointment',
      appointment.id
    );
  } else {
    await logAuditEvent({
      correlationId,
      action: 'create_appointment',
      resourceType: 'appointment',
      resourceId: appointment.id,
      status: 'success',
    });
  }

  recordOpdBookingTotal(opdMode, correlationId);

  return appointment as Appointment;
}

/**
 * Get appointment by ID using service role (webhook worker only).
 * Returns doctor_id, patient_id, appointment_date for notifications.
 * Do not use for user-facing reads (no ownership check).
 *
 * @param appointmentId - Appointment UUID
 * @param correlationId - Request correlation ID
 * @returns Appointment with id, doctor_id, patient_id, appointment_date or null
 */
export async function getAppointmentByIdForWorker(
  appointmentId: string,
  correlationId: string
): Promise<{
  id: string;
  doctor_id: string;
  patient_id: string | null;
  appointment_date: Date | string;
} | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for fetch');
  }

  const { data: appointment, error } = await admin
    .from('appointments')
    .select('id, doctor_id, patient_id, appointment_date')
    .eq('id', appointmentId)
    .single();

  if (error || !appointment) {
    if (error?.code === 'PGRST116') return null;
    handleSupabaseError(error, correlationId);
  }

  return appointment as {
    id: string;
    doctor_id: string;
    patient_id: string | null;
    appointment_date: Date | string;
  };
}

/**
 * Check if patient already has an appointment on the given date (e-task-2 2026-03-18).
 * Enforces 1 appointment per patient per day limit.
 *
 * @param doctorId - Doctor UUID
 * @param patientId - Patient UUID when available; null for guest bookings
 * @param patientName - Patient name (required for guest lookup when patientId is null)
 * @param patientPhone - Patient phone (required for guest lookup when patientId is null)
 * @param dateStr - Date in YYYY-MM-DD format
 * @param correlationId - Request correlation ID
 * @returns true if patient has an appointment on that date (status pending or confirmed)
 */
export async function hasAppointmentOnDate(
  doctorId: string,
  patientId: string | null,
  patientName: string,
  patientPhone: string,
  dateStr: string,
  correlationId: string
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for limit check');
  }

  const rangeStart = `${dateStr}T00:00:00.000Z`;
  const [y, m, d] = dateStr.split('-').map(Number);
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
  const rangeEnd = nextDay.toISOString();

  let query = admin
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .in('status', ['pending', 'confirmed'])
    .gte('appointment_date', rangeStart)
    .lt('appointment_date', rangeEnd);

  if (patientId) {
    query = query.eq('patient_id', patientId);
  } else {
    query = query.is('patient_id', null).eq('patient_name', patientName).eq('patient_phone', patientPhone);
  }

  const { data: existing, error } = await query.limit(1);

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return (existing?.length ?? 0) > 0;
}

async function checkSlotConflict(
  doctorId: string,
  slotStart: Date,
  slotEnd: Date,
  correlationId: string,
  excludeAppointmentId?: string
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;

  const rangeStart = new Date(slotStart.getTime() - SLOT_INTERVAL_MS);

  let query = admin
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .in('status', ['pending', 'confirmed'])
    .gt('appointment_date', rangeStart.toISOString())
    .lt('appointment_date', slotEnd.toISOString());

  if (excludeAppointmentId) {
    query = query.neq('id', excludeAppointmentId);
  }

  const { data: existing, error } = await query;

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return (existing?.length ?? 0) > 0;
}

/**
 * Get a single appointment by ID.
 * Requires authenticated doctor (userId); returns 404 if not found or not owner.
 *
 * @param id - Appointment ID
 * @param correlationId - Request correlation ID
 * @param userId - Authenticated user ID (doctor, must match appointment's doctor_id)
 * @returns Appointment if found and owned
 * @throws NotFoundError if not found or not owner (don't leak existence)
 * @throws UnauthorizedError if userId not provided (caller responsibility to enforce)
 */
export async function getAppointmentById(
  id: string,
  correlationId: string,
  userId: string
): Promise<Appointment> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for fetch');
  }

  const { data: appointment, error } = await admin
    .from('appointments')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !appointment) {
    throw new NotFoundError('Appointment not found');
  }

  if (appointment.doctor_id !== userId) {
    throw new NotFoundError('Appointment not found');
  }

  await logDataAccess(correlationId, userId, 'appointment', id);

  return appointment as Appointment;
}

/**
 * Get all appointments for a doctor
 * 
 * Retrieves appointments for a specific doctor, with optional filters.
 * 
 * @param doctorId - Doctor ID
 * @param correlationId - Request correlation ID
 * @param userId - Authenticated user ID (must match doctorId)
 * @param filters - Optional filters (status, startDate, endDate)
 * @returns Array of appointments
 * 
 * @throws ForbiddenError if doctor_id doesn't match userId
 * @throws InternalError if database operation fails
 * 
 * Note: Uses user role client (respects RLS)
 */
export async function getDoctorAppointments(
  doctorId: string,
  correlationId: string,
  userId: string,
  filters?: {
    status?: AppointmentStatus;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<Appointment[]> {
  // Validate ownership (defense in depth)
  validateOwnership(doctorId, userId);

  let query = supabase
    .from('appointments')
    .select('*')
    .eq('doctor_id', doctorId);

  // Apply filters
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.startDate) {
    query = query.gte('appointment_date', filters.startDate.toISOString());
  }
  if (filters?.endDate) {
    query = query.lte('appointment_date', filters.endDate.toISOString());
  }

  const { data: appointments, error } = await query.order('appointment_date', {
    ascending: true,
  });

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  // Audit log (read access)
  await logDataAccess(correlationId, userId, 'appointment', undefined);

  return (appointments || []) as Appointment[];
}

/**
 * List appointments for a patient (webhook worker context).
 * Uses admin client; no user JWT. For check_appointment_status intent.
 *
 * @param patientId - Patient UUID
 * @param doctorId - Doctor UUID
 * @param correlationId - Request correlation ID
 * @returns Array of appointments (patient_id + doctor_id match), ordered by appointment_date ascending
 */
export async function listAppointmentsForPatient(
  patientId: string,
  doctorId: string,
  correlationId: string
): Promise<Appointment[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for list');
  }

  const { data: appointments, error } = await admin
    .from('appointments')
    .select('*')
    .eq('patient_id', patientId)
    .eq('doctor_id', doctorId)
    .order('appointment_date', { ascending: true });

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  return (appointments || []) as Appointment[];
}

/**
 * List appointments for the authenticated doctor (API list endpoint).
 * Uses admin client with explicit doctor_id filter; no PHI in logs.
 *
 * @param userId - Authenticated user ID (doctor)
 * @param correlationId - Request correlation ID
 * @returns Array of appointments for the doctor
 */
export async function listAppointmentsForDoctor(
  userId: string,
  correlationId: string
): Promise<Appointment[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for list');
  }

  const { data: appointments, error } = await admin
    .from('appointments')
    .select('*')
    .eq('doctor_id', userId)
    .order('appointment_date', { ascending: true });

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  await logDataAccess(correlationId, userId, 'appointment', undefined);

  return (appointments || []) as Appointment[];
}

/**
 * Update appointment status
 * 
 * Updates appointment status (e.g., pending, confirmed, cancelled, completed).
 * 
 * @param id - Appointment ID
 * @param status - New appointment status
 * @param correlationId - Request correlation ID
 * @param userId - Authenticated user ID (doctor)
 * @returns Updated appointment
 * 
 * @throws ForbiddenError if appointment doesn't belong to user
 * @throws InternalError if database operation fails
 * 
 * Note: Uses user role client (respects RLS)
 */
export async function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  correlationId: string,
  userId: string
): Promise<Appointment> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: existing, error: fetchError } = await admin
    .from('appointments')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    handleSupabaseError(fetchError, correlationId);
  }

  validateOwnership(existing!.doctor_id, userId);

  const previousStatus = (existing as Appointment).status;

  const { data: updated, error } = await admin
    .from('appointments')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  // Audit log
  await logDataModification(correlationId, userId, 'update', 'appointment', id, ['status']);

  await syncOpdQueueEntryOnAppointmentStatus(id, status, correlationId);

  const updatedAppt = updated as Appointment;
  if (status === 'completed' && previousStatus !== 'completed') {
    await syncCareEpisodeLifecycleOnAppointmentCompleted(admin, updatedAppt, previousStatus, correlationId);
  }

  return updatedAppt;
}

/** Max length for clinical_notes (COMPLIANCE) */
const CLINICAL_NOTES_MAX_LEN = 5000;

export interface UpdateAppointmentInput {
  status?: AppointmentStatus;
  clinical_notes?: string | null;
}

/**
 * Update appointment with partial fields (PATCH).
 * Validates ownership; updates only provided fields.
 *
 * @param id - Appointment ID
 * @param updates - Partial updates: status?, clinical_notes?
 * @param correlationId - Request correlation ID
 * @param userId - Authenticated user ID (doctor)
 * @returns Updated appointment
 */
export async function updateAppointment(
  id: string,
  updates: UpdateAppointmentInput,
  correlationId: string,
  userId: string
): Promise<Appointment> {
  if (!updates.status && updates.clinical_notes === undefined) {
    throw new ValidationError('At least one field (status or clinical_notes) is required');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: existing, error: fetchError } = await admin
    .from('appointments')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    handleSupabaseError(fetchError, correlationId);
  }

  validateOwnership(existing!.doctor_id, userId);

  const previousStatus = (existing as Appointment).status;

  const dbUpdates: Record<string, unknown> = {};
  if (updates.status !== undefined) {
    dbUpdates.status = updates.status;
  }
  if (updates.clinical_notes !== undefined) {
    const notes =
      updates.clinical_notes === null || updates.clinical_notes === ''
        ? null
        : String(updates.clinical_notes).trim();
    if (notes !== null && notes.length > CLINICAL_NOTES_MAX_LEN) {
      throw new ValidationError(`clinical_notes must be at most ${CLINICAL_NOTES_MAX_LEN} characters`);
    }
    dbUpdates.clinical_notes = notes;
  }

  if (Object.keys(dbUpdates).length === 0) {
    return getAppointmentById(id, correlationId, userId);
  }

  const { data: updated, error } = await admin
    .from('appointments')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  await logDataModification(correlationId, userId, 'update', 'appointment', id, Object.keys(dbUpdates) as string[]);

  if (updates.status !== undefined) {
    await syncOpdQueueEntryOnAppointmentStatus(id, updates.status, correlationId);
  }

  const updatedAppt = updated as Appointment;
  if (
    updates.status !== undefined &&
    updates.status === 'completed' &&
    previousStatus !== 'completed'
  ) {
    await syncCareEpisodeLifecycleOnAppointmentCompleted(admin, updatedAppt, previousStatus, correlationId);
  }

  return updatedAppt;
}

/**
 * Cancel appointment for patient (webhook worker context).
 * Uses admin client; no user JWT. Validates appointment belongs to (doctorId, patientId).
 *
 * @param appointmentId - Appointment UUID
 * @param patientId - Patient UUID (must match appointment.patient_id)
 * @param doctorId - Doctor UUID (must match appointment.doctor_id)
 * @param correlationId - Request correlation ID
 * @returns Updated appointment
 * @throws NotFoundError if appointment not found or ownership mismatch
 * @throws ValidationError if status is already cancelled/completed
 */
export async function cancelAppointmentForPatient(
  appointmentId: string,
  patientId: string,
  doctorId: string,
  correlationId: string
): Promise<Appointment> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for cancel');
  }

  const { data: existing, error: fetchError } = await admin
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .single();

  if (fetchError || !existing) {
    handleSupabaseError(fetchError, correlationId);
  }

  if (existing.doctor_id !== doctorId || existing.patient_id !== patientId) {
    throw new NotFoundError('Appointment not found');
  }

  if (
    existing.status === 'cancelled' ||
    existing.status === 'completed' ||
    existing.status === 'no_show'
  ) {
    throw new ValidationError('Appointment is already cancelled, completed, or marked no-show');
  }

  const { data: updated, error } = await admin
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appointmentId)
    .select()
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  await logDataModification(
    correlationId,
    undefined as any, // System operation (webhook processing)
    'update',
    'appointment',
    appointmentId,
    ['status']
  );

  await syncOpdQueueEntryOnAppointmentStatus(appointmentId, 'cancelled', correlationId);

  return updated as Appointment;
}

/**
 * Update appointment date for patient (webhook worker context).
 * Uses admin client. Validates appointment belongs to (doctorId, patientId).
 * Excludes current appointment from slot conflict check.
 *
 * @param appointmentId - Appointment UUID
 * @param newSlotStart - New appointment date/time
 * @param patientId - Patient UUID (must match appointment.patient_id)
 * @param doctorId - Doctor UUID (must match appointment.doctor_id)
 * @param correlationId - Request correlation ID
 * @returns Updated appointment
 * @throws NotFoundError if appointment not found or ownership mismatch
 * @throws ValidationError if status not pending/confirmed or slot in past
 * @throws ConflictError if new slot is already taken
 */
export async function updateAppointmentDateForPatient(
  appointmentId: string,
  newSlotStart: Date,
  patientId: string,
  doctorId: string,
  correlationId: string
): Promise<Appointment> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for reschedule');
  }

  const { data: existing, error: fetchError } = await admin
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .single();

  if (fetchError || !existing) {
    handleSupabaseError(fetchError, correlationId);
  }

  if (existing.doctor_id !== doctorId || existing.patient_id !== patientId) {
    throw new NotFoundError('Appointment not found');
  }

  if (existing.status !== 'pending' && existing.status !== 'confirmed') {
    throw new ValidationError('Only pending or confirmed appointments can be rescheduled');
  }

  if (newSlotStart < new Date()) {
    throw new ValidationError('Cannot reschedule to a slot in the past');
  }

  const settings = await getDoctorSettings(doctorId);
  const opdMode = resolveOpdModeFromSettings(settings);
  const timezone = settings?.timezone ?? 'Asia/Kolkata';

  if (opdMode === 'queue') {
    await deleteQueueEntryByAppointmentId(appointmentId, correlationId);
  } else {
    const slotEnd = new Date(newSlotStart.getTime() + SLOT_INTERVAL_MS);
    const hasConflict = await checkSlotConflict(
      doctorId,
      newSlotStart,
      slotEnd,
      correlationId,
      appointmentId
    );
    if (hasConflict) {
      throw new ConflictError('This time slot is no longer available');
    }
  }

  const { data: updated, error } = await admin
    .from('appointments')
    .update({ appointment_date: newSlotStart })
    .eq('id', appointmentId)
    .select()
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  await logDataModification(
    correlationId,
    undefined as any, // System operation (webhook processing)
    'update',
    'appointment',
    appointmentId,
    ['appointment_date']
  );

  if (opdMode === 'queue') {
    await createQueueEntryAfterBooking(appointmentId, doctorId, newSlotStart, timezone, correlationId);
  }

  return updated as Appointment;
}

// ============================================================================
// Consultation (e-task-3 - Teleconsultation)
// ============================================================================

export interface StartConsultationResult {
  roomSid: string;
  roomName: string;
  doctorToken: string;
  patientJoinUrl: string;
  patientJoinToken: string;
  expiresAt: string;
}

/**
 * Start a video consultation for an appointment.
 * Idempotent: if room already exists, returns existing room with fresh tokens.
 *
 * @param appointmentId - Appointment UUID
 * @param correlationId - Request correlation ID
 * @param userId - Authenticated user ID (doctor, must own appointment)
 * @returns Room info and tokens for doctor and patient join link
 */
export async function startConsultation(
  appointmentId: string,
  correlationId: string,
  userId: string
): Promise<StartConsultationResult> {
  const appointment = await getAppointmentById(appointmentId, correlationId, userId);

  if (appointment.status !== 'pending' && appointment.status !== 'confirmed') {
    throw new ValidationError('Only pending or confirmed appointments can start a consultation');
  }

  if (!isTwilioVideoConfigured()) {
    throw new ValidationError('Video consultation is not configured');
  }

  const roomName = `appointment-${appointmentId}`;
  let roomSid = appointment.consultation_room_sid ?? null;

  // Idempotent: create room only if not already started
  if (!roomSid) {
    const createResult = await createTwilioRoom(roomName, correlationId);
    if (!createResult) {
      throw new InternalError('Failed to create video room');
    }
    roomSid = createResult.roomSid;

    const admin = getSupabaseAdminClient();
    if (!admin) {
      throw new InternalError('Service role client not available');
    }

    const startedAt = new Date().toISOString();
    const { error } = await admin
      .from('appointments')
      .update({
        consultation_room_sid: roomSid,
        consultation_started_at: startedAt,
      })
      .eq('id', appointmentId);

    if (error) {
      handleSupabaseError(error, correlationId);
    }

    await logDataModification(correlationId, userId, 'update', 'appointment', appointmentId, [
      'consultation_room_sid',
      'consultation_started_at',
    ]);
  }

  const doctorIdentity = `doctor-${appointment.doctor_id}`;
  const doctorToken = generateVideoAccessToken(doctorIdentity, roomName, correlationId);
  if (!doctorToken) {
    throw new InternalError('Failed to generate doctor token');
  }

  const patientJoinToken = generateConsultationToken(appointmentId);
  const baseUrl = env.CONSULTATION_JOIN_BASE_URL?.trim();
  const patientJoinUrl = baseUrl ? `${baseUrl}?token=${patientJoinToken}` : '';

  if (patientJoinUrl) {
    try {
      await sendConsultationLinkToPatient(appointmentId, patientJoinUrl, correlationId);
    } catch (err) {
      logger.warn(
        { correlationId, appointmentId, error: err instanceof Error ? err.message : String(err) },
        'Consultation link send failed (doctor can copy link)'
      );
    }
  }

  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  return {
    roomSid,
    roomName,
    doctorToken,
    patientJoinUrl,
    patientJoinToken,
    expiresAt,
  };
}

/**
 * Get a Twilio Video access token for joining a consultation.
 * Doctor path: auth required, ownership validated.
 * Patient path: token query param required, token verified.
 *
 * @param appointmentId - Appointment UUID
 * @param correlationId - Request correlation ID
 * @param options - { userId } for doctor path, or { patientToken } for patient path
 * @returns Twilio Video JWT
 */
export async function getConsultationToken(
  appointmentId: string,
  correlationId: string,
  options: { userId: string } | { patientToken: string }
): Promise<{ token: string; roomName: string }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: appointment, error } = await admin
    .from('appointments')
    .select('id, doctor_id, consultation_room_sid')
    .eq('id', appointmentId)
    .single();

  if (error || !appointment) {
    throw new NotFoundError('Appointment not found');
  }

  const roomSid = appointment.consultation_room_sid;
  if (!roomSid) {
    throw new ValidationError('Consultation has not been started yet');
  }

  const roomName = `appointment-${appointmentId}`;

  if ('userId' in options) {
    if (appointment.doctor_id !== options.userId) {
      throw new NotFoundError('Appointment not found');
    }
    const identity = `doctor-${options.userId}`;
    const token = generateVideoAccessToken(identity, roomName, correlationId);
    if (!token) {
      throw new InternalError('Failed to generate doctor token');
    }
    return { token, roomName };
  }

  const verified = verifyConsultationToken(options.patientToken);
  if (verified.appointmentId !== appointmentId) {
    throw new NotFoundError('Appointment not found');
  }

  await assertSlotJoinAllowedForPatient(appointmentId, correlationId);

  const identity = `patient-${appointmentId}`;
  const token = generateVideoAccessToken(identity, roomName, correlationId);
  if (!token) {
    throw new InternalError('Failed to generate patient token');
  }
  return { token, roomName };
}

/**
 * Get consultation token for patient using only the signed join token.
 * Verifies token to extract appointmentId, then returns Video access token.
 * Used by /consult/join page when patient has ?token=xxx in URL.
 */
export async function getConsultationTokenForPatient(
  patientToken: string,
  correlationId: string
): Promise<{ token: string; roomName: string }> {
  const verified = verifyConsultationToken(patientToken);
  return getConsultationToken(verified.appointmentId, correlationId, {
    patientToken,
  });
}
