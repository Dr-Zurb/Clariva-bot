/**
 * Doctor OPD operations: queue session list, early invite, delay broadcast, queue entry updates (e-task-opd-06).
 * Service role; ownership validated per call.
 */

import { getSupabaseAdminClient } from '../config/database';
import type { OpdQueueEntryStatus } from '../types/database';
import { handleSupabaseError, validateOwnership } from '../utils/db-helpers';
import { InternalError, NotFoundError, ValidationError } from '../utils/errors';
import { updateAppointmentStatus } from './appointment-service';
import { getDoctorSettings } from './doctor-settings-service';
import { requeueEntryAfterCurrentPatient, requeueEntryToEndOfSession } from './opd/opd-queue-service';
import { getActiveServiceCatalog } from '../utils/service-catalog-helpers';
import type { DoctorQueueSessionRow } from '../types/opd-doctor-queue';

export type { DoctorQueueSessionRow } from '../types/opd-doctor-queue';

/** Compute integer years from `date_of_birth` (YYYY-MM-DD). Returns null when unparseable / out-of-range. */
function deriveAgeFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const dt = new Date(dob);
  if (Number.isNaN(dt.getTime())) return null;
  const now = new Date();
  let years = now.getUTCFullYear() - dt.getUTCFullYear();
  const m = now.getUTCMonth() - dt.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dt.getUTCDate())) {
    years -= 1;
  }
  if (years < 0 || years > 130) return null;
  return years;
}

/**
 * Queue rows for a session day (doctor TZ date string YYYY-MM-DD).
 *
 * Query budget per request (O(1) — no N+1 on row count):
 *   1. opd_queue_entries  (doctor + session_date scope)
 *   2. appointments       (single .in() over the entries' appointment_ids)
 *   3. patients           (single .in() over the appointments' patient_ids)
 *   4. doctor_settings    (one row, only fetched when at least one row carries
 *                          a `catalog_service_key` so label-less sessions stay
 *                          on the 3-query happy path)
 */
export async function listDoctorQueueSession(
  doctorId: string,
  sessionDateYmd: string,
  correlationId: string
): Promise<DoctorQueueSessionRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: entries, error } = await admin
    .from('opd_queue_entries')
    .select('id, appointment_id, token_number, position, status, session_date, created_at')
    .eq('doctor_id', doctorId)
    .eq('session_date', sessionDateYmd)
    .order('token_number', { ascending: true });

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  if (!entries?.length) {
    return [];
  }

  const aptIds = Array.from(new Set(entries.map((e) => e.appointment_id as string)));

  // Local row shape — supabase-js can't infer the column subset from this many
  // selected columns, so we narrow with an explicit cast right after the call.
  type AppointmentRow = {
    id: string;
    patient_id: string | null;
    patient_name: string | null;
    patient_phone: string | null;
    appointment_date: string | null;
    status: string | null;
    reason_for_visit: string | null;
    consultation_type: string | null;
    catalog_service_key: string | null;
    episode_id: string | null;
    opd_event_type: 'standard' | 'return_after_completed' | null;
    notes: string | null;
  };

  const { data: aptsRaw, error: aptErr } = await admin
    .from('appointments')
    .select(
      'id, patient_id, patient_name, patient_phone, appointment_date, status, ' +
        'reason_for_visit, consultation_type, catalog_service_key, ' +
        'episode_id, opd_event_type, notes'
    )
    .in('id', aptIds);

  if (aptErr) {
    handleSupabaseError(aptErr, correlationId);
  }

  const apts = (aptsRaw ?? []) as unknown as AppointmentRow[];
  const aptMap = new Map(apts.map((a) => [a.id, a]));

  // Batch-fetch patients for any appointments that reference one. We tolerate
  // patient_id = null (walk-ins booked without a patients row) by leaving
  // medicalRecordNumber / age / gender as null on those rows.
  const patientIds = Array.from(
    new Set(
      apts
        .map((a) => a.patient_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  type PatientRow = {
    id: string;
    medical_record_number: string | null;
    age: number | null;
    date_of_birth: string | null;
    gender: string | null;
  };
  const patientMap = new Map<string, PatientRow>();
  if (patientIds.length > 0) {
    const { data: patients, error: patientsErr } = await admin
      .from('patients')
      .select('id, medical_record_number, age, date_of_birth, gender')
      .in('id', patientIds);
    if (patientsErr) {
      handleSupabaseError(patientsErr, correlationId);
    }
    for (const p of (patients ?? []) as PatientRow[]) {
      patientMap.set(p.id, p);
    }
  }

  // Resolve human-readable service labels via the doctor's saved catalog.
  // We only pay the doctor_settings round-trip when at least one row actually
  // carries a catalog_service_key; sessions with no catalog use never trigger
  // the lookup and stay at 3 total queries.
  const needsCatalog = apts.some(
    (a) => typeof a.catalog_service_key === 'string' && a.catalog_service_key.length > 0
  );
  let labelByKey: Map<string, string> | null = null;
  if (needsCatalog) {
    const settings = await getDoctorSettings(doctorId);
    const catalog = getActiveServiceCatalog(settings);
    if (catalog) {
      labelByKey = new Map();
      for (const svc of catalog.services) {
        labelByKey.set(svc.service_key.trim().toLowerCase(), svc.label);
      }
    }
  }

  return entries.map<DoctorQueueSessionRow>((e) => {
    const apt = aptMap.get(e.appointment_id as string);
    const patient = apt?.patient_id ? patientMap.get(apt.patient_id) ?? null : null;

    const rawKey = apt?.catalog_service_key ?? null;
    const normalizedKey = rawKey ? rawKey.trim().toLowerCase() : null;
    const serviceLabel = normalizedKey
      ? labelByKey?.get(normalizedKey) ?? rawKey
      : null;

    const age =
      patient?.age != null ? patient.age : deriveAgeFromDob(patient?.date_of_birth ?? null);

    return {
      entryId: e.id as string,
      appointmentId: e.appointment_id as string,
      tokenNumber: e.token_number as number,
      position: e.position as number,
      queueStatus: e.status as OpdQueueEntryStatus,
      sessionDate: e.session_date as string,
      queueCreatedAt: e.created_at
        ? new Date(e.created_at as string).toISOString()
        : '',

      patientName: apt?.patient_name ?? '',
      medicalRecordNumber: patient?.medical_record_number ?? null,
      patientPhone: apt?.patient_phone ?? '',

      age,
      gender: patient?.gender ?? null,

      appointmentStatus: apt?.status ?? 'unknown',
      scheduledAt: apt?.appointment_date
        ? new Date(apt.appointment_date).toISOString()
        : '',
      reasonForVisit: apt?.reason_for_visit ?? null,
      serviceLabel,
      catalogServiceKey: rawKey,
      consultationType: apt?.consultation_type ?? null,

      episodeId: apt?.episode_id ?? null,
      opdEventType: apt?.opd_event_type ?? null,

      patientId: apt?.patient_id ?? null,
      patientNote: apt?.notes ?? null,
    };
  });
}

/**
 * Offer early join to a patient (slot mode): sets expiry and clears prior response.
 */
export async function doctorOfferEarlyJoin(
  appointmentId: string,
  doctorId: string,
  expiresInMinutes: number,
  correlationId: string
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: apt, error: fe } = await admin
    .from('appointments')
    .select('id, doctor_id, status')
    .eq('id', appointmentId)
    .maybeSingle();

  if (fe) {
    handleSupabaseError(fe, correlationId);
  }
  if (!apt) {
    throw new NotFoundError('Appointment not found');
  }
  validateOwnership(apt.doctor_id as string, doctorId);

  if (apt.status !== 'pending' && apt.status !== 'confirmed') {
    throw new ValidationError('Early join can only be offered for pending or confirmed visits');
  }

  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

  const { error } = await admin
    .from('appointments')
    .update({
      opd_early_invite_expires_at: expiresAt,
      opd_early_invite_response: null,
    })
    .eq('id', appointmentId);

  if (error) {
    handleSupabaseError(error, correlationId);
  }
}

/**
 * Set or clear doctor broadcast delay (minutes) for patient banners.
 */
export async function doctorSetSessionDelay(
  appointmentId: string,
  doctorId: string,
  delayMinutes: number | null,
  correlationId: string
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: apt, error: fe } = await admin
    .from('appointments')
    .select('id, doctor_id')
    .eq('id', appointmentId)
    .maybeSingle();

  if (fe) {
    handleSupabaseError(fe, correlationId);
  }
  if (!apt) {
    throw new NotFoundError('Appointment not found');
  }
  validateOwnership(apt.doctor_id as string, doctorId);

  const { error } = await admin
    .from('appointments')
    .update({ opd_session_delay_minutes: delayMinutes })
    .eq('id', appointmentId);

  if (error) {
    handleSupabaseError(error, correlationId);
  }
}

const QUEUE_ENTRY_DOCTOR_STATUSES: OpdQueueEntryStatus[] = ['called', 'skipped'];

/**
 * Update queue entry status (call next, skip).
 */
export async function doctorUpdateQueueEntryStatus(
  entryId: string,
  doctorId: string,
  status: OpdQueueEntryStatus,
  correlationId: string
): Promise<void> {
  if (!QUEUE_ENTRY_DOCTOR_STATUSES.includes(status)) {
    throw new ValidationError('Invalid queue action status');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: row, error: fe } = await admin
    .from('opd_queue_entries')
    .select('id, doctor_id, status')
    .eq('id', entryId)
    .maybeSingle();

  if (fe) {
    handleSupabaseError(fe, correlationId);
  }
  if (!row) {
    throw new NotFoundError('Queue entry not found');
  }
  validateOwnership(row.doctor_id as string, doctorId);

  const current = row.status as OpdQueueEntryStatus;
  if (current === 'completed' || current === 'cancelled') {
    throw new ValidationError('Queue entry is already finished');
  }

  const { error } = await admin.from('opd_queue_entries').update({ status }).eq('id', entryId);

  if (error) {
    handleSupabaseError(error, correlationId);
  }
}

/**
 * Mark appointment no-show / missed slot (slot policy); syncs queue row to missed when applicable.
 */
export async function doctorMarkAppointmentNoShow(
  appointmentId: string,
  doctorId: string,
  correlationId: string
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: apt, error: fe } = await admin
    .from('appointments')
    .select('id, doctor_id, status')
    .eq('id', appointmentId)
    .maybeSingle();

  if (fe) {
    handleSupabaseError(fe, correlationId);
  }
  if (!apt) {
    throw new NotFoundError('Appointment not found');
  }
  validateOwnership(apt.doctor_id as string, doctorId);

  if (apt.status !== 'pending' && apt.status !== 'confirmed') {
    throw new ValidationError('Only pending or confirmed visits can be marked no-show');
  }

  await updateAppointmentStatus(appointmentId, 'no_show', correlationId, doctorId);
}

/**
 * Requeue a patient after missed turn (OPD-08).
 */
export async function doctorRequeueQueueEntry(
  entryId: string,
  doctorId: string,
  strategy: 'end_of_queue' | 'after_current',
  correlationId: string
): Promise<void> {
  if (strategy === 'after_current') {
    await requeueEntryAfterCurrentPatient(entryId, doctorId, correlationId);
  } else {
    await requeueEntryToEndOfSession(entryId, doctorId, correlationId);
  }
}
