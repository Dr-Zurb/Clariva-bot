/**
 * Front-desk vitals after check-in.
 *
 * Reuses patient_vitals (one row per appointment). Staff write via
 * allowStaff + acting doctor. No PHI in logs.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/database';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess, logDataModification } from '../utils/audit-logger';
import { InternalError, NotFoundError, ValidationError } from '../utils/errors';
import type { CreatePatientVitalsInput, PatientVitalsReading } from '../types/patient-chart';

export type DeskVitalsInput = Omit<
  CreatePatientVitalsInput,
  'appointmentId' | 'bmi' | 'recordedAt'
>;

function deskNoteValue(note: string | null | undefined): string | null | undefined {
  if (note === undefined) return undefined;
  const trimmed = note?.trim();
  return trimmed ? trimmed : null;
}

function admin(): SupabaseClient {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new InternalError('Service role client not available');
  }
  return client;
}

type DeskAppointmentRow = {
  id: string;
  doctor_id: string;
  patient_id: string;
  status: string;
  patient_checked_in_at: string | null;
};

async function loadCheckedInAppointment(
  appointmentId: string,
  doctorId: string,
  correlationId: string
): Promise<DeskAppointmentRow> {
  const { data, error } = await admin()
    .from('appointments')
    .select('id, doctor_id, patient_id, status, patient_checked_in_at')
    .eq('id', appointmentId)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);
  if (!data || data.doctor_id !== doctorId) {
    throw new NotFoundError('Appointment not found');
  }

  if (data.status === 'cancelled') {
    throw new ValidationError('Cannot record vitals on a cancelled appointment');
  }

  if (!data.patient_checked_in_at) {
    throw new ValidationError('Record vitals after check-in');
  }

  if (!data.patient_id) {
    throw new ValidationError('Appointment has no patient');
  }

  return data as DeskAppointmentRow;
}

async function findDeskVitalsRow(
  appointmentId: string,
  doctorId: string,
  correlationId: string
): Promise<PatientVitalsReading | null> {
  const { data, error } = await admin()
    .from('patient_vitals')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('appointment_id', appointmentId)
    .is('archived_at', null)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);
  return (data as PatientVitalsReading | null) ?? null;
}

export async function getDeskVitals(
  appointmentId: string,
  doctorId: string,
  correlationId: string,
  actorId: string
): Promise<PatientVitalsReading | null> {
  const appointment = await loadCheckedInAppointment(appointmentId, doctorId, correlationId);
  const row = await findDeskVitalsRow(appointmentId, doctorId, correlationId);
  await logDataAccess(correlationId, actorId, 'patient_vitals', appointment.patient_id);
  return row;
}

export async function upsertDeskVitals(
  appointmentId: string,
  doctorId: string,
  input: DeskVitalsInput,
  correlationId: string,
  actorId: string
): Promise<PatientVitalsReading> {
  const appointment = await loadCheckedInAppointment(appointmentId, doctorId, correlationId);
  const existing = await findDeskVitalsRow(appointmentId, doctorId, correlationId);
  const nowIso = new Date().toISOString();
  const onBehalf = actorId !== doctorId ? doctorId : undefined;

  if (existing) {
    const update: Record<string, unknown> = { recorded_at: nowIso };
    if (input.bpSystolic !== undefined) update.bp_systolic = input.bpSystolic;
    if (input.bpDiastolic !== undefined) update.bp_diastolic = input.bpDiastolic;
    if (input.heartRate !== undefined) update.heart_rate = input.heartRate;
    if (input.temperatureC !== undefined) update.temperature_c = input.temperatureC;
    if (input.spo2 !== undefined) update.spo2 = input.spo2;
    if (input.weightKg !== undefined) update.weight_kg = input.weightKg;
    if (input.heightCm !== undefined) update.height_cm = input.heightCm;
    const note = deskNoteValue(input.note);
    if (note !== undefined) update.note = note;

    const { data, error } = await admin()
      .from('patient_vitals')
      .update(update)
      .eq('id', existing.id)
      .eq('doctor_id', doctorId)
      .select('*')
      .single();

    if (error || !data) handleSupabaseError(error, correlationId);
    const row = data as PatientVitalsReading;
    await logDataModification(
      correlationId,
      actorId,
      'update',
      'patient_vitals',
      row.id,
      Object.keys(update),
      onBehalf
    );
    return row;
  }

  const insert: Record<string, unknown> = {
    doctor_id: doctorId,
    patient_id: appointment.patient_id,
    appointment_id: appointmentId,
    bp_systolic: input.bpSystolic ?? null,
    bp_diastolic: input.bpDiastolic ?? null,
    heart_rate: input.heartRate ?? null,
    temperature_c: input.temperatureC ?? null,
    spo2: input.spo2 ?? null,
    weight_kg: input.weightKg ?? null,
    height_cm: input.heightCm ?? null,
    note: deskNoteValue(input.note) ?? null,
    recorded_at: nowIso,
  };

  const { data, error } = await admin().from('patient_vitals').insert(insert).select('*').single();

  if (error || !data) handleSupabaseError(error, correlationId);
  const row = data as PatientVitalsReading;
  await logDataModification(
    correlationId,
    actorId,
    'create',
    'patient_vitals',
    row.id,
    undefined,
    onBehalf
  );
  return row;
}
