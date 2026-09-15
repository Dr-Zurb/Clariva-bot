/**
 * Doctor OPD slot-mode session snapshot (sl-01 / osm-02).
 * Service role; rows scoped with `.eq('doctor_id', doctorId)` like `listDoctorQueueSession`.
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import type { AppointmentBookingOrigin } from '../types/database';
import type {
  SlotSessionCounts,
  SlotSessionPayload,
  SlotSessionRow,
  SlotTag,
  VisitLifecycle,
} from '../types/opd-slot-session';
import { handleSupabaseError } from '../utils/db-helpers';
import { InternalError } from '../utils/errors';
import {
  consultationSessionStarted,
  type IncompleteConsultSessionInput,
} from '../utils/incomplete-consult';
import { getActiveServiceCatalog } from '../utils/service-catalog-helpers';
import { getDoctorSettings } from './doctor-settings-service';
import { localDayUtcRange } from './opd/opd-queue-service';
import { getSlotJoinGraceMinutes } from './opd/opd-policy-service';
import { deriveSlotAxes, toLegacySlotStatus } from './opd/opd-slot-status';

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
    incomplete: 0,
    completed: 0,
    missed: 0,
    cancelled: 0,
    overflow: 0,
  };
}

function bumpCounts(
  counts: SlotSessionCounts,
  lifecycle: VisitLifecycle,
  timingBand: 'early' | 'due' | 'late' | null,
  tags: readonly SlotTag[]
): void {
  counts.all += 1;

  switch (lifecycle) {
    case 'in_consult':
      counts.in_consultation += 1;
      break;
    case 'incomplete':
      counts.incomplete += 1;
      // Legacy Incomplete filter still keys on in_consultation until osm-03.
      counts.in_consultation += 1;
      break;
    case 'completed':
      counts.completed += 1;
      break;
    case 'no_show':
      counts.missed += 1;
      break;
    case 'cancelled':
      counts.cancelled += 1;
      break;
    case 'scheduled':
      if (timingBand === 'late') counts.running_late += 1;
      else counts.upcoming += 1;
      break;
    default:
      break;
  }

  if (tags.includes('overflow')) {
    counts.overflow += 1;
  }
}

type SessionRow = IncompleteConsultSessionInput & {
  appointment_id: string;
};

/**
 * Prefer a live session; else any started session for incomplete detection.
 */
function pickSessionForAppointment(
  rows: SessionRow[]
): IncompleteConsultSessionInput | null {
  if (rows.length === 0) return null;
  const live = rows.find((r) => r.status === 'live');
  if (live) return live;
  const started = rows.find((r) => consultationSessionStarted(r));
  return started ?? rows[0] ?? null;
}

function resolveDurationMinutes(
  consultationType: string | null | undefined,
  slotIntervalMinutes: number
): number | null {
  if (consultationType == null || consultationType === '') return null;
  return slotIntervalMinutes;
}

function parseBookingOrigin(
  raw: string | null | undefined
): AppointmentBookingOrigin {
  switch (raw) {
    case 'walk_in':
    case 'overflow':
    case 'return_after_completed':
    case 'rebooked':
    case 'booked':
      return raw;
    default:
      return 'booked';
  }
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
 *   4. `consultation_sessions` — one `.in('appointment_id', …)` with start markers
 *      for incomplete / live derivation (osm-02).
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
    booking_origin: string | null;
    notes: string | null;
    opd_session_delay_minutes: number | null;
    opd_early_invite_expires_at: string | null;
    opd_early_invite_response: string | null;
    patient_checked_in_at: string | null;
    patient_lobby_last_seen_at: string | null;
    created_at: string;
  };

  const { data: aptsRaw, error: aptErr } = await admin
    .from('appointments')
    .select(
      'id, patient_id, patient_name, patient_phone, appointment_date, status, ' +
        'reason_for_visit, consultation_type, catalog_service_key, ' +
        'episode_id, opd_event_type, booking_origin, notes, ' +
        'opd_session_delay_minutes, opd_early_invite_expires_at, opd_early_invite_response, ' +
        'patient_checked_in_at, patient_lobby_last_seen_at, ' +
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

  const { data: sessionsRaw, error: sessErr } = await admin
    .from('consultation_sessions')
    .select(
      'appointment_id, status, actual_started_at, doctor_joined_at, patient_joined_at'
    )
    .in('appointment_id', aptIds);

  if (sessErr) {
    handleSupabaseError(sessErr, correlationId);
  }

  const sessionsByAppointmentId = new Map<string, SessionRow[]>();
  for (const row of (sessionsRaw ?? []) as SessionRow[]) {
    const list = sessionsByAppointmentId.get(row.appointment_id) ?? [];
    list.push(row);
    sessionsByAppointmentId.set(row.appointment_id, list);
  }

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
    const session = pickSessionForAppointment(
      sessionsByAppointmentId.get(apt.id) ?? []
    );

    const axes = deriveSlotAxes({
      appointmentStatus,
      scheduledAtMs: Number.isFinite(scheduledAtMs) ? scheduledAtMs : nowMs,
      nowMs,
      graceMinutes,
      session,
      opdEventType,
      bookingOrigin: parseBookingOrigin(apt.booking_origin),
      delayMinutes: apt.opd_session_delay_minutes ?? null,
      earlyInviteExpiresAt: apt.opd_early_invite_expires_at ?? null,
      earlyInviteResponse,
      patientCheckedInAt: apt.patient_checked_in_at ?? null,
      patientLobbyLastSeenAt: apt.patient_lobby_last_seen_at ?? null,
    });

    const slotStatus = toLegacySlotStatus(axes.lifecycle, axes.timing, axes.tags);
    bumpCounts(counts, axes.lifecycle, axes.timing?.band ?? null, axes.tags);

    const row: SlotSessionRow = {
      appointmentId: apt.id,
      position,
      slotStatus,
      lifecycle: axes.lifecycle,
      timing: axes.timing,
      tags: axes.tags,
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
      patientCheckedInAt: apt.patient_checked_in_at
        ? new Date(apt.patient_checked_in_at).toISOString()
        : null,
    };
    entries.push(row);
  }

  return { entries, counts, snapshotAt, date: sessionDateYmd };
}
