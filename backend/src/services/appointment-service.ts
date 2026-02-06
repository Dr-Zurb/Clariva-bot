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
  const insertData: InsertAppointment = {
    doctor_id: data.doctorId,
    patient_id: data.patientId ?? undefined,
    patient_name: data.patientName,
    patient_phone: data.patientPhone,
    appointment_date: appointmentDate,
    status: 'pending',
    notes: data.notes,
  };

  if (appointmentDate < new Date()) {
    throw new ValidationError('Cannot book appointments in the past');
  }

  if (userId) {
    validateOwnership(data.doctorId, userId);
  }

  const slotEnd = new Date(appointmentDate.getTime() + SLOT_INTERVAL_MS);
  const hasConflict = await checkSlotConflict(data.doctorId, appointmentDate, slotEnd, correlationId);
  if (hasConflict) {
    throw new ConflictError('This time slot is no longer available');
  }

  if (userId) {
    return createAppointment(insertData, correlationId, userId);
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

  await logAuditEvent({
    correlationId,
    action: 'create_appointment',
    resourceType: 'appointment',
    resourceId: appointment.id,
    status: 'success',
  });

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

async function checkSlotConflict(
  doctorId: string,
  slotStart: Date,
  slotEnd: Date,
  correlationId: string
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;

  const rangeStart = new Date(slotStart.getTime() - SLOT_INTERVAL_MS);

  const { data: existing, error } = await admin
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .in('status', ['pending', 'confirmed'])
    .gt('appointment_date', rangeStart.toISOString())
    .lt('appointment_date', slotEnd.toISOString());

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
  // Get existing appointment (to validate ownership)
  const { data: existing, error: fetchError } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    handleSupabaseError(fetchError, correlationId);
  }

  // Validate ownership (defense in depth)
  validateOwnership(existing.doctor_id, userId);

  // Update appointment (user role - respects RLS)
  const { data: updated, error } = await supabase
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

  return updated as Appointment;
}
