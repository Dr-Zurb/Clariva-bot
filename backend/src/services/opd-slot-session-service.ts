/**
 * Doctor OPD slot-mode session snapshot (sl-01).
 * Service role; rows scoped with `.eq('doctor_id', doctorId)` like `listDoctorQueueSession`.
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import type { SlotSessionCounts, SlotSessionPayload, SlotSessionRow, SlotStatus } from '../types/opd-slot-session';
import { handleSupabaseError } from '../utils/db-helpers';
import { InternalError } from '../utils/errors';
import { getActiveServiceCatalog } from '../utils/service-catalog-helpers';
import { getDoctorSettings } from './doctor-settings-service';
import { localDayUtcRange } from './opd/opd-queue-service';
import { getSlotJoinGraceMinutes } from './opd/opd-policy-service';
import { deriveSlotStatus } from './opd/opd-slot-status';

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

function emptyCounts(): SlotSessionCounts {
  return {
    all: 0,
    upcoming: 0,
    running_late: 0,
    in_consultation: 0,
    completed: 0,
    missed: 0,
    cancelled: 0,
    overflow: 0,
  };
}

function bumpCounts(counts: SlotSessionCounts, slotStatus: SlotStatus): void {
  counts.all += 1;
  if (slotStatus === 'upcoming' || slotStatus === 'grace') {
    counts.upcoming += 1;
  }
  switch (slotStatus) {
    case 'running_late':
      counts.running_late += 1;
      break;
    case 'in_consultation':
      counts.in_consultation += 1;
      break;
    case 'completed':
      counts.completed += 1;
      break;
    case 'missed':
      counts.missed += 1;
      break;
    case 'cancelled':
      counts.cancelled += 1;
      break;
    case 'overflow':
      counts.overflow += 1;
      break;
    default:
      break;
  }
}

/**
 * Per-appointment flag: booked after the latest scheduled instant among strictly
 * older bookings (sl-01 note 5).
 */
function computeAppendedAfterDayById(
  rows: { id: string; created_at: string; appointment_date: string }[]
): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const apt of rows) {
    const selfCreated = new Date(apt.created_at).getTime();
    let maxPeerDateMs = Number.NEGATIVE_INFINITY;
    for (const peer of rows) {
      if (peer.id === apt.id) continue;
      const peerCreated = new Date(peer.created_at).getTime();
      if (peerCreated < selfCreated) {
        maxPeerDateMs = Math.max(maxPeerDateMs, new Date(peer.appointment_date).getTime());
      }
    }
    const isAppended =
      Number.isFinite(maxPeerDateMs) && selfCreated > maxPeerDateMs;
    map.set(apt.id, isAppended);
  }
  return map;
}

function resolveDurationMinutes(
  consultationType: string | null | undefined,
  slotIntervalMinutes: number
): number | null {
  if (consultationType == null || consultationType === '') return null;
  return slotIntervalMinutes;
}

/**
 * Slot-mode rows for a session calendar day (doctor TZ `date` YYYY-MM-DD).
 *
 * **Privacy contract:** same as `DoctorQueueSessionRow` / `listDoctorQueueSession` —
 * returned ONLY to the authenticated doctor whose `doctor_id` matches; gated by
 * `authenticateToken` + `.eq('doctor_id', doctorId)` on `appointments`.
 *
 * **Query budget (O(1) in N):**
 *   1. `doctor_settings` — session-day TZ (`localDayUtcRange`), grace minutes,
 *      slot interval, and optional service catalog (single fetch; reused).
 *   2. `appointments` — doctor + local-day UTC range, ordered by `appointment_date`.
 *   3. `patients` — skipped when no `patient_id` on any row; else one `.in('id', …)`.
 *   4. `consultation_sessions` — one `.in('appointment_id', …).eq('status','live')`.
 *
 * Catalog label resolution reuses the settings object from step 1 — no extra round-trip.
 */
export async function listDoctorSlotSession(
  doctorId: string,
  sessionDateYmd: string,
  correlationId: string
): Promise<SlotSessionPayload> {
  const snapshotAt = new Date().toISOString();
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const settings = await getDoctorSettings(doctorId);
  const timezone = settings?.timezone ?? 'Asia/Kolkata';
  const { start, end } = localDayUtcRange(sessionDateYmd, timezone);
  const graceMinutes = getSlotJoinGraceMinutes(settings);
  const slotIntervalMinutes = settings?.slot_interval_minutes ?? env.SLOT_INTERVAL_MINUTES;
  const nowMs = Date.now();

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
    opd_session_delay_minutes: number | null;
    opd_early_invite_expires_at: string | null;
    opd_early_invite_response: string | null;
    created_at: string;
  };

  const { data: aptsRaw, error: aptErr } = await admin
    .from('appointments')
    .select(
      'id, patient_id, patient_name, patient_phone, appointment_date, status, ' +
        'reason_for_visit, consultation_type, catalog_service_key, ' +
        'episode_id, opd_event_type, notes, ' +
        'opd_session_delay_minutes, opd_early_invite_expires_at, opd_early_invite_response, ' +
        'created_at'
    )
    .eq('doctor_id', doctorId)
    .gte('appointment_date', start)
    .lt('appointment_date', end)
    .order('appointment_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (aptErr) {
    handleSupabaseError(aptErr, correlationId);
  }

  const apts = (aptsRaw ?? []) as unknown as AppointmentRow[];
  if (apts.length === 0) {
    return {
      entries: [],
      counts: emptyCounts(),
      snapshotAt,
      date: sessionDateYmd,
    };
  }

  const appendedMap = computeAppendedAfterDayById(
    apts.map((a) => ({
      id: a.id,
      created_at: a.created_at,
      appointment_date: a.appointment_date ?? '',
    }))
  );

  const aptIds = apts.map((a) => a.id);

  const patientIds = Array.from(
    new Set(
      apts.map((a) => a.patient_id).filter((id): id is string => Boolean(id))
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

  const { data: liveSessions, error: sessErr } = await admin
    .from('consultation_sessions')
    .select('appointment_id')
    .in('appointment_id', aptIds)
    .eq('status', 'live');

  if (sessErr) {
    handleSupabaseError(sessErr, correlationId);
  }

  const liveByAppointmentId = new Set(
    (liveSessions ?? []).map((r) => r.appointment_id as string)
  );

  const needsCatalog = apts.some(
    (a) => typeof a.catalog_service_key === 'string' && a.catalog_service_key.length > 0
  );
  let labelByKey: Map<string, string> | null = null;
  if (needsCatalog) {
    const catalog = getActiveServiceCatalog(settings);
    if (catalog) {
      labelByKey = new Map();
      for (const svc of catalog.services) {
        labelByKey.set(svc.service_key.trim().toLowerCase(), svc.label);
      }
    }
  }

  const counts = emptyCounts();
  const entries: SlotSessionRow[] = [];

  let position = 0;
  for (const apt of apts) {
    position += 1;
    const patient = apt.patient_id ? patientMap.get(apt.patient_id) ?? null : null;
    const age =
      patient?.age != null ? patient.age : deriveAgeFromDob(patient?.date_of_birth ?? null);

    const rawKey = apt.catalog_service_key ?? null;
    const normalizedKey = rawKey ? rawKey.trim().toLowerCase() : null;
    const serviceLabel = normalizedKey
      ? labelByKey?.get(normalizedKey) ?? rawKey
      : null;

    const scheduledAtMs = apt.appointment_date
      ? new Date(apt.appointment_date).getTime()
      : NaN;
    const appointmentStatus = apt.status ?? 'unknown';

    let earlyInviteResponse: 'accepted' | 'declined' | null = null;
    const rawResp = apt.opd_early_invite_response;
    if (rawResp === 'accepted' || rawResp === 'declined') {
      earlyInviteResponse = rawResp;
    }

    const opdEventType = apt.opd_event_type ?? null;

    const slotStatus = deriveSlotStatus({
      appointmentStatus,
      scheduledAtMs: Number.isFinite(scheduledAtMs) ? scheduledAtMs : nowMs,
      nowMs,
      graceMinutes,
      consultationLive: liveByAppointmentId.has(apt.id),
      opdEventType,
      isAppendedAfterDay: appendedMap.get(apt.id) ?? false,
    });

    bumpCounts(counts, slotStatus);

    const row: SlotSessionRow = {
      appointmentId: apt.id,
      position,
      slotStatus,
      appointmentStatus,
      scheduledAt: apt.appointment_date
        ? new Date(apt.appointment_date).toISOString()
        : '',
      durationMinutes: resolveDurationMinutes(apt.consultation_type, slotIntervalMinutes),

      patientName: apt.patient_name ?? '',
      medicalRecordNumber: patient?.medical_record_number ?? null,
      patientPhone: apt.patient_phone ?? '',

      age,
      gender: patient?.gender ?? null,

      reasonForVisit: apt.reason_for_visit ?? null,
      serviceLabel,
      catalogServiceKey: rawKey,
      consultationType: apt.consultation_type ?? null,

      delayMinutes: apt.opd_session_delay_minutes ?? null,
      earlyInviteExpiresAt: apt.opd_early_invite_expires_at
        ? new Date(apt.opd_early_invite_expires_at).toISOString()
        : null,
      earlyInviteResponse,

      episodeId: apt.episode_id ?? null,
      opdEventType,

      patientId: apt.patient_id ?? null,
      patientNote: apt.notes ?? null,
    };
    entries.push(row);
  }

  return { entries, counts, snapshotAt, date: sessionDateYmd };
}
