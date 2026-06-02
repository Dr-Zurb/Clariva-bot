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
  Sex,
} from '../types';
import { BookAppointmentInput, WrapUpBody } from '../utils/validation';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import { handleSupabaseError, validateOwnership } from '../utils/db-helpers';
import { logDataModification, logDataAccess, logAuditEvent } from '../utils/audit-logger';
import {
  createSession as createConsultationSession,
  endSession as endConsultationSession,
  findActiveSessionByAppointment,
  findLatestAppointmentSessionSummariesBulk,
  findLatestAppointmentSessionSummary,
  getJoinTokenForAppointment,
  isVideoModalityConfigured,
  updateSessionStatus,
} from './consultation-session-service';
import type { AppointmentConsultationSessionSummary } from './consultation-session-service';
import {
  generateConsultationToken,
  verifyConsultationToken,
} from '../utils/consultation-token';
import { sendConsultationLinkToPatient } from './notification-service';
import { logger } from '../config/logger';
import { getDoctorSettings } from './doctor-settings-service';
import {
  materializeSessionDayModeIfAbsent,
  resolveOpdModeFromSettings,
  resolveSessionDayMode,
} from './opd/opd-mode-service';
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
import { ensurePatientMrnIfEligible } from './patient-service';

const SLOT_INTERVAL_MS = env.SLOT_INTERVAL_MINUTES * 60 * 1000;

// ============================================================================
// Consultation-session enrichment (Task 35)
// ----------------------------------------------------------------------------
// Post-Task-35 the legacy `appointments.consultation_room_sid` /
// `consultation_started_at` / `consultation_ended_at` columns are gone. The
// frontend (and any API caller) reads the equivalent state off a nested
// `consultation_session` field populated here from `consultation_sessions`.
// ============================================================================

function attachConsultationSession(
  appointment: Appointment,
  summary: AppointmentConsultationSessionSummary | null
): Appointment {
  return { ...appointment, consultation_session: summary };
}

async function enrichAppointmentWithSession(appointment: Appointment): Promise<Appointment> {
  const summary = await findLatestAppointmentSessionSummary(appointment.id);
  return attachConsultationSession(appointment, summary);
}

async function enrichAppointmentsWithSessions(
  appointments: Appointment[]
): Promise<Appointment[]> {
  if (appointments.length === 0) return appointments;
  const ids = appointments.map((a) => a.id);
  const summaries = await findLatestAppointmentSessionSummariesBulk(ids);
  return appointments.map((a) => attachConsultationSession(a, summaries.get(a.id) ?? null));
}

// ============================================================================
// Patient-demographics enrichment (CP-D6 — cockpit appointment payload)
// ----------------------------------------------------------------------------
// Every read / post-mutation path in this service that returns an
// `Appointment` widens its supabase select with a PostgREST embed of
// `patient:patients(date_of_birth, gender)` (FK `appointments.patient_id`
// → `patients.id`, migration 010). The raw row therefore arrives with an
// extra `patient` field — either an object, an array (PostgREST returns
// arrays for some FK shapes), or `null` for legacy walk-in rows where
// `patient_id IS NULL`.
//
// `enrichRowWithDemographics` collapses all three shapes into the flat
// `patient_age` (server-computed years) + `patient_sex` (normalized union)
// fields the API contract promises, and STRIPS the embedded `patient`
// object so callers never see the join leak through.
//
// Server-side age computation is deliberate: doctor tablets in the field
// have wildly inconsistent system clocks (we've seen ±3h skew in production)
// and the cockpit cannot tolerate that for a clinical chart header.
// `now()` is the database server's view at fetch time — single source of
// truth. The pure-JS UTC math below mirrors the OPD precedent
// (`opd-doctor-service.ts § deriveAgeFromDob`); we don't pull in `date-fns`
// for one calculation since it isn't already a backend dependency
// (see backend/package.json — luxon ships, but date-fns does not).
// ============================================================================

/**
 * Compute integer years from a YYYY-MM-DD date-of-birth (UTC).
 * Returns `null` when the input is unparseable, missing, or out-of-range
 * (negative or > 130 — defensive guard against bad data).
 *
 * Mirrors `opd-doctor-service.ts § deriveAgeFromDob` so age renders
 * identically in the queue strip and the cockpit header.
 */
function computeAgeYears(dob: string | Date | null | undefined): number | null {
  if (!dob) return null;
  const dt = dob instanceof Date ? dob : new Date(dob);
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
 * Normalize the raw `patients.gender` value into the `Sex` union.
 * Accepts long-form (`'male'|'female'|'other'`, any case) and single-letter
 * shorthand (`'M'|'F'|'O'`); anything else returns `null`. See `Sex` JSDoc
 * in `backend/src/types/database.ts` for the rationale.
 */
function normalizePatientSex(raw: string | null | undefined): Sex | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v === 'male' || v === 'm') return 'male';
  if (v === 'female' || v === 'f') return 'female';
  if (v === 'other' || v === 'o') return 'other';
  return null;
}

/** Embedded `patient` shape returned by the PostgREST `patient:patients(...)` join. */
interface EmbeddedPatientJoin {
  date_of_birth?: string | Date | null;
  gender?: string | null;
}

/**
 * CS-03: Embedded `opd_queue_entries` shape returned by the PostgREST
 * `opd_queue_entry:opd_queue_entries(token_number)` join.
 * Null for non-queue appointments (LEFT JOIN returns no row).
 *
 * NOTE: an earlier revision of this embed also pulled `event_type`, but the
 * column does not exist on `opd_queue_entries` (migration 028 ships
 * `id, doctor_id, appointment_id, session_date, token_number, position,
 *  status, created_at, updated_at` only — there is no `event_type`).
 * Selecting it caused PostgREST to 4xx every appointment read, surfacing
 * as "Appointment not found" in the cockpit. We now project the API-level
 * `opd_queue_event_type` from row presence (see `enrichRowWithDemographics`).
 */
interface EmbeddedOpdQueueJoin {
  token_number?: number | null;
}

/**
 * Strip the embedded `patient` join from a raw appointment row and project
 * it onto the flat `patient_age` / `patient_sex` fields the API contract
 * exposes. Also strips the `opd_queue_entry` embed and projects onto the
 * flat `opd_queue_event_type` / `opd_token_number` fields (CS-03).
 *
 * Mutates a clone, never the input. Defensive about PostgREST returning
 * either an object or a single-element array for the embeds (the
 * supabase-js typing varies by FK direction). For `opd_queue_entries`,
 * which has a one-to-many relationship with `appointments`, PostgREST
 * returns an array; we take the last element (latest by insertion order)
 * to match the "accept latest row" guidance from the CS-03 task spec.
 */
function enrichRowWithDemographics(row: Record<string, unknown>): Appointment {
  const rawPatient = row.patient as EmbeddedPatientJoin | EmbeddedPatientJoin[] | null | undefined;
  const patientRow: EmbeddedPatientJoin | null = Array.isArray(rawPatient)
    ? rawPatient[0] ?? null
    : rawPatient ?? null;

  // CS-03: opd_queue_entries is one-to-many with appointments at the
  // PostgREST schema level (the FK lives on the child), so the embed comes
  // back as an array. The DB itself enforces `UNIQUE (appointment_id)` (see
  // migration 028 § opd_queue_entries_one_per_appointment) so the array is
  // always 0- or 1-length in practice; we still defensively take the last
  // element to match the CS-03 spec's "accept latest row" guidance.
  // For non-queue appointments the LEFT JOIN returns null / an empty array
  // — both collapse to null here.
  const rawOpdEntry = row.opd_queue_entry as
    | EmbeddedOpdQueueJoin
    | EmbeddedOpdQueueJoin[]
    | null
    | undefined;
  const opdEntry: EmbeddedOpdQueueJoin | null = Array.isArray(rawOpdEntry)
    ? rawOpdEntry[rawOpdEntry.length - 1] ?? null
    : rawOpdEntry ?? null;

  // CS-03 (post-fix): `opd_queue_event_type` is projected from the *presence*
  // of an `opd_queue_entries` row, not from a real column (the column does
  // not exist — see `EmbeddedOpdQueueJoin` JSDoc). Today the schema only
  // supports token-style queue entries; if "group" semantics are ever
  // introduced, add a real column / migration and read from it here.
  const enriched: Record<string, unknown> = {
    ...row,
    patient_age: computeAgeYears(patientRow?.date_of_birth ?? null),
    patient_sex: normalizePatientSex(patientRow?.gender ?? null),
    opd_queue_event_type: opdEntry ? 'token' : null,
    opd_token_number: opdEntry?.token_number ?? null,
  };
  delete enriched.patient;
  delete enriched.opd_queue_entry;
  return enriched as unknown as Appointment;
}

/** Bulk variant used by list endpoints; preserves order. */
function enrichRowsWithDemographics(rows: Record<string, unknown>[]): Appointment[] {
  return rows.map(enrichRowWithDemographics);
}

/**
 * The PostgREST select fragment used by every doctor-scoped appointment
 * read / post-mutation. Centralised so the privacy widening + the
 * `getDoctorAppointments` consistency widening + every `bookAppointment`
 * style post-insert select stay in lock-step.
 *
 * Don't reuse this on narrow projections (`getAppointmentByIdForWorker`,
 * audit-log helpers) — those intentionally select fewer columns and have
 * no need for patient demographics.
 */
// CS-03: widened to embed opd_queue_entries so the cockpit can paint the
// OPD token number on first render without waiting for the OPD snapshot.
// `opd_queue_entry` is an alias so the enrichment helper (`enrichRowWithDemographics`)
// can strip it cleanly after projecting onto the flat `opd_queue_event_type`
// and `opd_token_number` fields.
//
// NOTE: `opd_event_type` on the `appointments` row itself (migration 031)
// carries a different semantic ('standard' | 'return_after_completed') and
// is preserved as-is via the `...row` spread. The queue-derived event type
// uses the distinct key `opd_queue_event_type` to avoid shadowing it; that
// API field is projected from the *presence* of the joined row, not from a
// real column (see `EmbeddedOpdQueueJoin` JSDoc and `enrichRowWithDemographics`
// for the full rationale — the column does not exist in migration 028).
const APPOINTMENT_SELECT_WITH_DEMOGRAPHICS = `*, patient:patients(date_of_birth, gender), opd_queue_entry:opd_queue_entries(token_number)` as const;

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

  // Create appointment (user role - respects RLS). Post-insert select
  // widens to the demographics-enriched shape (CP-D6) so the returned
  // `Appointment` matches the cockpit / dashboard contract.
  const { data: appointment, error } = await supabase
    .from('appointments')
    .insert(data)
    .select(APPOINTMENT_SELECT_WITH_DEMOGRAPHICS)
    .single();

  if (error || !appointment) {
    handleSupabaseError(error, correlationId);
  }

  const row = appointment as unknown as Record<string, unknown>;

  // Audit log
  await logDataModification(
    correlationId,
    userId,
    'create',
    'appointment',
    row.id as string
  );

  return enrichRowWithDemographics(row);
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
    ...(data.opdEventType && { opd_event_type: data.opdEventType }),
    ...(data.relatedAppointmentId && {
      related_appointment_id: data.relatedAppointmentId,
    }),
  };

  if (appointmentDate < new Date()) {
    throw new ValidationError('Cannot book appointments in the past');
  }

  if (userId) {
    validateOwnership(data.doctorId, userId);
  }

  const settings = await getDoctorSettings(data.doctorId);
  const timezone = settings?.timezone ?? 'Asia/Kolkata';
  const sessionDateYmd = sessionDateFromAppointmentDate(appointmentDate, timezone);

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for booking');
  }

  const sessionDayMode = await resolveSessionDayMode(admin, data.doctorId, sessionDateYmd);
  const opdMode = sessionDayMode.mode;

  logger.info(
    {
      correlationId,
      doctorId: data.doctorId,
      opd_mode: opdMode,
      opd_mode_source: sessionDayMode.source,
      context: 'opd_queue',
    },
    'booking_opd_mode'
  );

  if (opdMode === 'queue') {
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

  // Post-insert select widens to demographics (CP-D6) so the returned
  // `Appointment` matches the contract every other read path now exposes.
  const { data: appointment, error } = await admin
    .from('appointments')
    .insert(insertData)
    .select(APPOINTMENT_SELECT_WITH_DEMOGRAPHICS)
    .single();

  if (error || !appointment) {
    handleSupabaseError(error, correlationId);
  }

  const row = appointment as unknown as Record<string, unknown>;
  const appointmentId = row.id as string;

  try {
    await materializeSessionDayModeIfAbsent(admin, data.doctorId, sessionDateYmd, correlationId);
  } catch (materializeErr) {
    logger.warn(
      {
        correlationId,
        doctorId: data.doctorId,
        sessionDate: sessionDateYmd,
        error: materializeErr instanceof Error ? materializeErr.message : String(materializeErr),
      },
      'opd_session_mode_materialize_failed'
    );
  }

  if (data.freeOfCost && data.patientId) {
    await ensurePatientMrnIfEligible(data.patientId, correlationId);
  }

  if (opdMode === 'queue') {
    try {
      await createQueueEntryAfterBooking(
        appointmentId,
        data.doctorId,
        appointmentDate,
        timezone,
        correlationId
      );
    } catch (queueErr) {
      await admin.from('appointments').delete().eq('id', appointmentId);
      throw queueErr;
    }
  }

  if (userId) {
    await logDataModification(
      correlationId,
      userId,
      'create',
      'appointment',
      appointmentId
    );
  } else {
    await logAuditEvent({
      correlationId,
      action: 'create_appointment',
      resourceType: 'appointment',
      resourceId: appointmentId,
      status: 'success',
    });
  }

  recordOpdBookingTotal(opdMode, correlationId);

  return enrichRowWithDemographics(row);
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
/**
 * CP-D6: Doctor-scoped PHI surface — `patient_age` + `patient_sex` are
 * exposed here because they are already visible to this doctor on every
 * adjacent surface (patient list, patient detail, prescription PDF, OPD
 * queue session row). The appointment row carries `patient_name` +
 * `patient_phone` for the same reason, and this widening preserves the
 * same privacy boundary — no expansion of the audience, only of the
 * fields surfaced to the audience that already has full access.
 *
 * Privacy invariants enforced by this endpoint:
 *   - Caller must hold a doctor JWT (verified upstream by the route's
 *     `authMiddleware`; this function refuses to run without `userId`).
 *   - `appointment.doctor_id` must equal `userId` — mismatch raises
 *     `NotFoundError`, NOT `ForbiddenError`, so the existence of the
 *     row is never leaked across doctor accounts.
 *   - `logDataAccess()` audits every successful read.
 *
 * Future endpoints — receptionist queue, kiosk display, patient-facing
 * waiting-room TV — must NOT reuse this query or this row shape. Each
 * gets its own endpoint with its own privacy rules and its own
 * (typically narrower) projection. Pattern matches OQ-D7 from the OPD
 * queue redesign batch (08-05-2026 § task-oq-01).
 *
 * Normalization caveats (read the `Sex` JSDoc in `types/database.ts`
 * before changing): `patient_sex` is the long-form union, normalized
 * from the raw TEXT column. `patient_age` is server-computed against
 * `now()` (UTC) at fetch time, NOT cached on the row — doctor tablet
 * clocks are unreliable enough that client-side computation is unsafe
 * for a clinical chart header.
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
    .select(APPOINTMENT_SELECT_WITH_DEMOGRAPHICS)
    .eq('id', id)
    .single();

  if (error || !appointment) {
    throw new NotFoundError('Appointment not found');
  }

  // Cast through `unknown` because the embedded join widens the row shape
  // beyond the supabase-js generated typings; `enrichRowWithDemographics`
  // strips the join and projects onto the flat `Appointment` contract.
  const row = appointment as unknown as Record<string, unknown>;

  if (row.doctor_id !== userId) {
    throw new NotFoundError('Appointment not found');
  }

  await logDataAccess(correlationId, userId, 'appointment', id);

  return enrichAppointmentWithSession(enrichRowWithDemographics(row));
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

  // CP-D6: same demographics widening as `getAppointmentById`. Doctor JWT
  // gates the read; ownership is validated above. The dashboard `OpdQueueStrip`
  // and `useTodaysAppointments` consume this list and may chip the demographics
  // — having the data here avoids a follow-up backend round-trip per row.
  let query = supabase
    .from('appointments')
    .select(APPOINTMENT_SELECT_WITH_DEMOGRAPHICS)
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

  const enriched = enrichRowsWithDemographics(
    (appointments || []) as unknown as Record<string, unknown>[]
  );
  return enrichAppointmentsWithSessions(enriched);
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
    .select(APPOINTMENT_SELECT_WITH_DEMOGRAPHICS)
    .eq('patient_id', patientId)
    .eq('doctor_id', doctorId)
    .order('appointment_date', { ascending: true });

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  const enriched = enrichRowsWithDemographics(
    (appointments || []) as unknown as Record<string, unknown>[]
  );
  return enrichAppointmentsWithSessions(enriched);
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
  correlationId: string,
  patientId?: string
): Promise<Appointment[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for list');
  }

  let query = admin
    .from('appointments')
    .select(APPOINTMENT_SELECT_WITH_DEMOGRAPHICS)
    .eq('doctor_id', userId);

  if (patientId) {
    query = query.eq('patient_id', patientId);
  }

  const { data: appointments, error } = await query.order('appointment_date', {
    ascending: true,
  });

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  await logDataAccess(correlationId, userId, 'appointment', undefined);

  const enriched = enrichRowsWithDemographics(
    (appointments || []) as unknown as Record<string, unknown>[]
  );
  return enrichAppointmentsWithSessions(enriched);
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
    .select(APPOINTMENT_SELECT_WITH_DEMOGRAPHICS)
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  // Audit log
  await logDataModification(correlationId, userId, 'update', 'appointment', id, ['status']);

  await syncOpdQueueEntryOnAppointmentStatus(id, status, correlationId);

  const updatedAppt = enrichRowWithDemographics(updated as unknown as Record<string, unknown>);
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
    .select(APPOINTMENT_SELECT_WITH_DEMOGRAPHICS)
    .single();

  if (error || !updated) {
    handleSupabaseError(error, correlationId);
  }

  await logDataModification(correlationId, userId, 'update', 'appointment', id, Object.keys(dbUpdates) as string[]);

  if (updates.status !== undefined) {
    await syncOpdQueueEntryOnAppointmentStatus(id, updates.status, correlationId);
  }

  const updatedAppt = enrichRowWithDemographics(updated as unknown as Record<string, unknown>);
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
    .select(APPOINTMENT_SELECT_WITH_DEMOGRAPHICS)
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

  return enrichRowWithDemographics(updated as unknown as Record<string, unknown>);
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
    .select(APPOINTMENT_SELECT_WITH_DEMOGRAPHICS)
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

  return enrichRowWithDemographics(updated as unknown as Record<string, unknown>);
}

// ============================================================================
// Wrap-up (pf-02 — Patient seeing flow)
// ----------------------------------------------------------------------------
// `POST /v1/appointments/:id/wrap-up` is the single entry point that owns
// appointment completion: it persists the doctor-side wrap-up fields
// (diagnosis + follow-up), flips `appointments.status` to `completed`, and
// best-effort ends any still-live consultation session.
//
// Three failure-mode considerations baked into this design:
//
// 1. **`endSession` outside the row UPDATE.** The facade in
//    `consultation-session-service.ts:endSession` does its own writes (and
//    fires fire-and-forget DM dispatches). Wrapping it inside the same logical
//    "transaction" risks deadlock and complicates rollback. We flip the
//    appointment first, then dispatch `endSession` after — if it fails, the
//    appointment is still completed and we log a warning. The facade is
//    itself idempotent (no-op on `ended` / `cancelled`), so a retry path is
//    safe.
//
// 2. **Idempotent on `status='completed'`.** A second wrap-up call must NOT
//    re-fire `endSession` (the session is already ended) and must NOT
//    overwrite the previously-saved diagnosis. We short-circuit at the
//    top, returning the existing row untouched.
//
// 3. **Race-safe against double-click.** Two concurrent wrap-ups → the
//    second's UPDATE matches zero rows because of the `status<>'completed'`
//    guard in the WHERE; we detect that and fall through to the idempotent
//    "already completed" path (re-fetch + return).
//
// Side-effect parity: `updateAppointment` (PATCH path) fires
// `syncOpdQueueEntryOnAppointmentStatus` + `syncCareEpisodeLifecycleOnAppointmentCompleted`
// on every transition into `completed`. We mirror both here so wrap-up and
// PATCH-to-completed stay behaviourally identical.
// ============================================================================

/**
 * Tag aggregate returned by `getRecentDiagnosisTags`. `tag` is the unique
 * tag string (already trimmed); `uses` is the count over completed
 * appointments in the rolling 90-day window.
 */
export interface RecentDiagnosisTag {
  tag: string;
  uses: number;
}

const WRAP_UP_DIAGNOSIS_RECENT_WINDOW_DAYS = 90;

/**
 * Finalise an appointment (pf-02): persist diagnosis + follow-up, flip
 * `status='completed'`, and best-effort end any live consultation session.
 *
 * Idempotent — a second call on an already-completed appointment is a 200
 * no-op (returns the existing row, no audit log, no `endSession`).
 *
 * @param appointmentId - Appointment UUID
 * @param input         - Validated wrap-up body (diagnosis + follow-up fields)
 * @param correlationId - Request correlation ID
 * @param userId        - Authenticated doctor's UUID (must own the appointment)
 * @returns the updated, session-enriched `Appointment` row
 *
 * @throws NotFoundError if the appointment does not exist
 * @throws ForbiddenError if `userId !== appointment.doctor_id` (403)
 * @throws ValidationError if the appointment is `cancelled` / `no_show`
 * @throws InternalError on service-role / DB failures
 */
export async function wrapUpAppointment(
  appointmentId: string,
  input: WrapUpBody,
  correlationId: string,
  userId: string
): Promise<Appointment> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for wrap-up');
  }

  const { data: existing, error: fetchError } = await admin
    .from('appointments')
    .select(APPOINTMENT_SELECT_WITH_DEMOGRAPHICS)
    .eq('id', appointmentId)
    .maybeSingle();

  if (fetchError) {
    handleSupabaseError(fetchError, correlationId);
  }
  if (!existing) {
    throw new NotFoundError('Appointment not found');
  }

  const existingRow = existing as unknown as Record<string, unknown>;

  if (existingRow.doctor_id !== userId) {
    throw new ForbiddenError('Not authorized to wrap up this appointment');
  }

  const previousStatus = existingRow.status as AppointmentStatus;

  if (previousStatus === 'cancelled') {
    throw new ValidationError('Cannot wrap up a cancelled appointment');
  }
  if (previousStatus === 'no_show') {
    throw new ValidationError('Cannot wrap up a no-show appointment');
  }

  if (previousStatus === 'completed') {
    logger.info(
      { correlationId, appointmentId, userId },
      'wrapUpAppointment: appointment already completed - returning idempotent no-op'
    );
    return enrichAppointmentWithSession(enrichRowWithDemographics(existingRow));
  }

  const latestSession = await findLatestAppointmentSessionSummary(appointmentId);

  const updatePayload = {
    diagnosis_text: input.diagnosis_text ?? null,
    diagnosis_tags: input.diagnosis_tags ?? [],
    followup_date: input.followup_date ?? null,
    followup_kind: input.followup_kind ?? null,
    status: 'completed' as const,
    updated_at: new Date().toISOString(),
  };

  // Race-safety guard: `status<>'completed'` in the WHERE means a second
  // concurrent wrap-up returns 0 rows. We detect that below and treat it
  // exactly like the idempotent `previousStatus === 'completed'` branch.
  const { data: updated, error: updateError } = await admin
    .from('appointments')
    .update(updatePayload)
    .eq('id', appointmentId)
    .eq('doctor_id', userId)
    .neq('status', 'completed')
    .select(APPOINTMENT_SELECT_WITH_DEMOGRAPHICS)
    .maybeSingle();

  if (updateError) {
    handleSupabaseError(updateError, correlationId);
  }

  if (!updated) {
    logger.info(
      { correlationId, appointmentId, userId },
      'wrapUpAppointment: race-loss on concurrent completion - returning idempotent no-op'
    );
    const { data: refetched, error: refetchError } = await admin
      .from('appointments')
      .select(APPOINTMENT_SELECT_WITH_DEMOGRAPHICS)
      .eq('id', appointmentId)
      .single();
    if (refetchError || !refetched) {
      handleSupabaseError(refetchError, correlationId);
    }
    return enrichAppointmentWithSession(
      enrichRowWithDemographics(refetched as unknown as Record<string, unknown>)
    );
  }

  const updatedAppt = enrichRowWithDemographics(updated as unknown as Record<string, unknown>);

  // Mirror `updateAppointment`'s status-transition side-effects so wrap-up
  // and PATCH-to-completed stay behaviourally identical (OPD queue
  // bookkeeping + care-episode lifecycle). `previousStatus` is narrowed to
  // 'pending' | 'confirmed' here — the 'completed' / 'cancelled' / 'no_show'
  // branches all early-returned above.
  await syncOpdQueueEntryOnAppointmentStatus(appointmentId, 'completed', correlationId);
  await syncCareEpisodeLifecycleOnAppointmentCompleted(
    admin,
    updatedAppt,
    previousStatus,
    correlationId
  );

  // After-commit `endSession` dispatch. Gated on `status === 'live'` per
  // pf-02 spec — `'scheduled'` sessions never started, `'no_show'` and
  // `'ended'` / `'cancelled'` are terminal. The facade is itself idempotent
  // so this is belt-and-suspenders. Wrapped in try/catch — a failure here
  // MUST NOT roll back the appointment flip; we log and continue.
  if (latestSession && latestSession.status === 'live') {
    try {
      await endConsultationSession(latestSession.id, correlationId);
    } catch (err) {
      logger.warn(
        {
          correlationId,
          appointmentId,
          sessionId: latestSession.id,
          error: err instanceof Error ? err.message : String(err),
        },
        'wrapUpAppointment: endSession failed (non-fatal; appointment is still completed)'
      );
    }
  }

  await logAuditEvent({
    correlationId,
    userId,
    action: 'wrap_up_appointment',
    resourceType: 'appointment',
    resourceId: appointmentId,
    status: 'success',
    metadata: {
      changedFields: ['diagnosis_text', 'diagnosis_tags', 'followup_date', 'followup_kind', 'status'],
      tagCount: updatePayload.diagnosis_tags.length,
      hasFollowup: updatePayload.followup_kind !== null && updatePayload.followup_kind !== 'none',
      sessionEnded: latestSession?.status === 'live',
    },
  });

  return enrichAppointmentWithSession(updatedAppt);
}

/**
 * Recent diagnosis-tag autocomplete (pf-02): returns the doctor's top-N
 * tags by usage across `completed` appointments in the rolling
 * `WRAP_UP_DIAGNOSIS_RECENT_WINDOW_DAYS` window.
 *
 * Implementation note: PostgREST doesn't expose `LATERAL UNNEST`, so we
 * pull `diagnosis_tags` arrays for the in-window slice (gated by the
 * partial index `idx_appointments_doctor_completed_recent` from migration
 * 097) and aggregate in JS. The slice is small — even a busy doctor at
 * 30 completed appointments/day caps at ~2700 rows × ≤20 tags each.
 *
 * @param doctorId      - Doctor UUID (must equal authenticated `userId`)
 * @param limit         - Max number of tags to return (1..50)
 * @param correlationId - Request correlation ID
 */
export async function getRecentDiagnosisTags(
  doctorId: string,
  limit: number,
  correlationId: string
): Promise<RecentDiagnosisTag[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available for diagnosis lookup');
  }

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - WRAP_UP_DIAGNOSIS_RECENT_WINDOW_DAYS);

  const { data: rows, error } = await admin
    .from('appointments')
    .select('diagnosis_tags')
    .eq('doctor_id', doctorId)
    .eq('status', 'completed')
    .gt('updated_at', since.toISOString());

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  const counts = new Map<string, number>();
  for (const row of (rows ?? []) as { diagnosis_tags: unknown }[]) {
    const tags = Array.isArray(row.diagnosis_tags) ? (row.diagnosis_tags as string[]) : [];
    for (const raw of tags) {
      if (typeof raw !== 'string') continue;
      const tag = raw.trim();
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([tag, uses]) => ({ tag, uses }))
    .sort((a, b) => (b.uses - a.uses) || a.tag.localeCompare(b.tag))
    .slice(0, limit);
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
  /**
   * Plan 06 · Task 36 · Decision 9 LOCKED — companion text channel
   * surface for the video/voice session.
   *
   * Populated on BOTH the fresh-create branch (full payload — sessionId
   * + patientJoinUrl + freshly-minted patientToken + token expiry) AND
   * the idempotent rejoin branch (sessionId only; patientJoinUrl /
   * patientToken stay null because they are patient-side join creds
   * the doctor doesn't consume — the doctor reuses the dashboard
   * Supabase session for chat auth, and the patient mints fresh
   * patient-side creds via their own join page exchange on every
   * page load). `expiresAt` falls back to the session's expected end
   * on the rejoin branch so the field is always present (the doctor
   * read path does not actually consume it).
   *
   * Pre-fix the rejoin branch left this entirely undefined, so doctor
   * page-refreshes / rehydrates fell back to the legacy single-pane
   * video layout (no Video/Chat tabs). The chat channel itself is
   * the same live `consultation_messages` rows the patient has been
   * writing to all along; surfacing the sessionId is enough for the
   * doctor's `<VideoRoom>` to subscribe.
   *
   * Only `undefined` when no active session exists at all (i.e. a
   * fresh-create that failed mid-facade — defensive guard).
   *
   * Frontend code (Tasks 38 + 24c) reads this to mount `<TextConsultRoom>`
   * inside the `<VideoRoom>` side panel.
   */
  companion?: {
    /**
     * Task 38: `consultation_sessions.id` surfaced alongside the URL +
     * token so the doctor-side `<VideoRoom>` companion panel (which uses
     * dashboard auth, not the HMAC URL) knows which session row to chat
     * against. Mirrors `SessionRecord.companion.sessionId`.
     */
    sessionId: string;
    patientJoinUrl: string | null;
    patientToken: string | null;
    expiresAt: string;
  };
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

  if (!isVideoModalityConfigured()) {
    throw new ValidationError('Video consultation is not configured');
  }

  const roomName = `appointment-${appointmentId}`;

  // Idempotency source-of-truth: an existing live `consultation_sessions`
  // row for this appointment. Task 35 dropped the legacy
  // `appointments.consultation_room_sid` column that previously served
  // this role, so the session lookup is now the only path.
  const existingSession = await findActiveSessionByAppointment(appointmentId, 'video');
  let roomSid = existingSession?.providerSessionId ?? null;
  // Plan 06 · Task 36: companion is populated on the fresh-create
  // branch via the facade's lifecycle hook (mints a patient HMAC +
  // join URL alongside the session row). The rejoin branch below
  // synthesises a minimal companion from the existing session's id
  // so the doctor's `<VideoRoom>` can mount the chat side-panel
  // after a page refresh / rehydrate (the chat channel itself is
  // the same live `consultation_messages` rows; we just need to
  // thread the sessionId through to the frontend).
  let companion: StartConsultationResult['companion'];
  // sessionId for the post-branch defensive `status='live'` promotion.
  // Captured on both branches (fresh-create + rejoin) so the post-branch
  // RLS-unblock step has a single source of truth. See the long comment
  // on `updateSessionStatus(... 'live' ...)` below for why we promote
  // here proactively instead of leaning on Twilio's webhook.
  let activeSessionIdForPromotion: string | null = null;

  if (!roomSid) {
    const scheduledStartAt =
      appointment.appointment_date instanceof Date
        ? appointment.appointment_date
        : new Date(appointment.appointment_date as unknown as string);
    // No `duration_minutes` column on `appointments` today; derive from
    // env-configured slot interval (defaults to 30 min). When Plan 02 adds
    // an explicit per-appointment duration, swap this default out.
    const expectedEndAt = new Date(
      scheduledStartAt.getTime() + env.SLOT_INTERVAL_MINUTES * 60 * 1000
    );

    const session = await createConsultationSession(
      {
        appointmentId,
        doctorId: appointment.doctor_id,
        patientId: appointment.patient_id ?? null,
        modality: 'video',
        scheduledStartAt,
        expectedEndAt,
      },
      correlationId
    );
    if (!session.providerSessionId) {
      throw new InternalError('Failed to create video room');
    }
    roomSid = session.providerSessionId;
    companion = session.companion;
    activeSessionIdForPromotion = session.id;

    await logDataModification(
      correlationId,
      userId,
      'create',
      'consultation_session',
      session.id,
      ['provider_session_id']
    );
  } else if (existingSession) {
    // Idempotent rejoin: surface a minimal companion handle so the
    // doctor's `<VideoRoom>` can mount the chat side-panel after a
    // page refresh / rehydrate. `patientJoinUrl` and `patientToken`
    // stay null — the doctor doesn't read them (chat auth flows via
    // the dashboard Supabase session); the patient mints fresh
    // patient-side creds via their own join page exchange. See the
    // long comment on `StartConsultationResult.companion` for the
    // full contract.
    companion = {
      sessionId:      existingSession.id,
      patientJoinUrl: null,
      patientToken:   null,
      expiresAt:      existingSession.expectedEndAt.toISOString(),
    };
    activeSessionIdForPromotion = existingSession.id;
  }

  // Defensive `status='live'` promotion — RLS unblock for chat sends.
  // ----------------------------------------------------------------------
  // The `consultation_messages_insert_live_participants` RLS policy
  // (migration 078) requires `consultation_sessions.status = 'live'` for
  // BOTH the doctor and patient INSERT branches. Without that, every
  // user-side chat send 4xxs out and the bubble shows a "Retry" pill;
  // system messages still appear (those are admin-client / RLS-bypass
  // writes from the backend).
  //
  // The canonical promotion path is Twilio's `participant-connected`
  // webhook → `handleParticipantConnected` → `mirrorJoinEventToSession`
  // (see `consultation-verification-service.ts`). That works in prod where
  // Twilio can reach our public URL, but in dev (local Tailscale Funnel
  // origin) and on transient webhook delivery failures the promotion can
  // be late, missing, or out-of-order with the doctor's first chat send.
  //
  // Stamping `status='live'` here — synchronously, BEFORE we return the
  // join token to the doctor — guarantees the chat works the instant the
  // doctor opens the consult, regardless of webhook delivery. Twilio's
  // `room-ended` webhook (which fires on the room idle-timeout, ~5min, or
  // when `endRoom` is called explicitly) flips the row back to `'ended'`
  // via `updateSessionStatus`, so this doesn't strand sessions.
  //
  // `updateSessionStatus` is idempotent (a flat `UPDATE ... SET status=$1`)
  // so re-promoting an already-live session is a no-op DB-side.
  if (activeSessionIdForPromotion) {
    await updateSessionStatus(activeSessionIdForPromotion, 'live', {
      actualStartedAt: new Date(),
    });
  }

  const doctorJoinToken = await getJoinTokenForAppointment(
    {
      appointmentId,
      doctorId: appointment.doctor_id,
      modality: 'video',
      role: 'doctor',
    },
    correlationId
  );

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

  return {
    roomSid,
    roomName,
    doctorToken: doctorJoinToken.token,
    patientJoinUrl,
    patientJoinToken,
    expiresAt: doctorJoinToken.expiresAt.toISOString(),
    ...(companion ? { companion } : {}),
  };
}

// ============================================================================
// Voice consultation (Plan 05 · Task 24)
// ============================================================================

/**
 * Start a voice consultation for an appointment.
 *
 * Mirrors `startConsultation` (video) but with two differences:
 *   1. The facade routes through `voiceSessionTwilioAdapter` (audio-only
 *      Recording Rules applied at room-create time; Task 23 + Decision 2).
 *   2. Patient join URL targets `/c/voice/{sessionId}?t={hmac}` — Principle
 *      8 LOCKED ("audio-only web call, not a phone call"; see Task 26 and
 *      `buildConsultationReadyDm` voice branch).
 *
 * Idempotent on `(appointmentId, modality='voice')`. Re-calls return the
 * existing room/session without re-provisioning; the rejoin branch
 * synthesises a minimal `companion` ({ sessionId, expiresAt } —
 * patientJoinUrl/patientToken stay null) so the doctor's
 * `<VoiceConsultRoom>` mounts the chat side-panel after a page
 * refresh / rehydrate. See `StartConsultationResult.companion` for
 * the full contract.
 */
export async function startVoiceConsultation(
  appointmentId: string,
  correlationId: string,
  userId: string
): Promise<StartConsultationResult> {
  const appointment = await getAppointmentById(appointmentId, correlationId, userId);

  if (appointment.status !== 'pending' && appointment.status !== 'confirmed') {
    throw new ValidationError('Only pending or confirmed appointments can start a consultation');
  }

  // Voice rides the same Twilio Video stack as video, so the same
  // configuration gate applies.
  if (!isVideoModalityConfigured()) {
    throw new ValidationError('Voice consultation is not configured (Twilio Video required)');
  }

  const roomName = `appointment-voice-${appointmentId}`;
  const existingSession = await findActiveSessionByAppointment(appointmentId, 'voice');
  let roomSid = existingSession?.providerSessionId ?? null;
  let sessionId = existingSession?.id ?? null;
  let companion: StartConsultationResult['companion'];
  // Captured for the post-branch defensive `status='live'` promotion. See
  // the matching comment in `startConsultation` for why we do this.
  let activeSessionIdForPromotion: string | null = null;

  if (!roomSid || !sessionId) {
    const scheduledStartAt =
      appointment.appointment_date instanceof Date
        ? appointment.appointment_date
        : new Date(appointment.appointment_date as unknown as string);
    const expectedEndAt = new Date(
      scheduledStartAt.getTime() + env.SLOT_INTERVAL_MINUTES * 60 * 1000
    );

    const session = await createConsultationSession(
      {
        appointmentId,
        doctorId: appointment.doctor_id,
        patientId: appointment.patient_id ?? null,
        modality: 'voice',
        scheduledStartAt,
        expectedEndAt,
      },
      correlationId
    );
    if (!session.providerSessionId) {
      throw new InternalError('Failed to create voice room');
    }
    roomSid = session.providerSessionId;
    sessionId = session.id;
    companion = session.companion;
    activeSessionIdForPromotion = session.id;

    await logDataModification(
      correlationId,
      userId,
      'create',
      'consultation_session',
      session.id,
      ['provider_session_id']
    );
  } else if (existingSession) {
    // Idempotent rejoin: surface a minimal companion handle so the
    // doctor's `<VoiceConsultRoom>` can mount the chat side-panel
    // after a page refresh / rehydrate. Mirrors the video path
    // above — see `StartConsultationResult.companion` for the full
    // rationale on why patientJoinUrl/patientToken stay null.
    companion = {
      sessionId:      existingSession.id,
      patientJoinUrl: null,
      patientToken:   null,
      expiresAt:      existingSession.expectedEndAt.toISOString(),
    };
    activeSessionIdForPromotion = existingSession.id;
  }

  // Defensive `status='live'` promotion — RLS unblock for chat sends.
  // See the long comment in `startConsultation` for the full rationale.
  // TL;DR: the chat-row INSERT RLS policy requires `status='live'`; the
  // canonical promotion happens via Twilio's participant-connected
  // webhook, but we promote here synchronously as a defense against
  // delayed/missing webhooks (especially on local dev origins).
  if (activeSessionIdForPromotion) {
    await updateSessionStatus(activeSessionIdForPromotion, 'live', {
      actualStartedAt: new Date(),
    });
  }

  const doctorJoinToken = await getJoinTokenForAppointment(
    {
      appointmentId,
      doctorId: appointment.doctor_id,
      modality: 'voice',
      role: 'doctor',
    },
    correlationId
  );

  const patientJoinToken = generateConsultationToken(appointmentId);
  // Patient join URL targets the voice-specific patient route. Uses
  // `APP_BASE_URL` (same base as `/c/text/*`) rather than the legacy
  // video-only `CONSULTATION_JOIN_BASE_URL`, since the `/c/voice/*` path
  // is served by the Next.js app, not a standalone consult URL.
  const appBase = (env.APP_BASE_URL ?? env.CONSULTATION_JOIN_BASE_URL)?.trim();
  const patientJoinUrl = appBase
    ? `${appBase.replace(/\/$/, '')}/c/voice/${sessionId}?t=${patientJoinToken}`
    : '';

  if (patientJoinUrl) {
    try {
      await sendConsultationLinkToPatient(appointmentId, patientJoinUrl, correlationId);
    } catch (err) {
      logger.warn(
        { correlationId, appointmentId, error: err instanceof Error ? err.message : String(err) },
        'Voice consultation link send failed (doctor can copy link)'
      );
    }
  }

  return {
    roomSid,
    roomName,
    doctorToken: doctorJoinToken.token,
    patientJoinUrl,
    patientJoinToken,
    expiresAt: doctorJoinToken.expiresAt.toISOString(),
    ...(companion ? { companion } : {}),
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
): Promise<{ token: string; roomName: string; sessionId: string }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: appointment, error } = await admin
    .from('appointments')
    .select('id, doctor_id')
    .eq('id', appointmentId)
    .single();

  if (error || !appointment) {
    throw new NotFoundError('Appointment not found');
  }

  // Gate: consultation must have been started. Post-Task-35 the single
  // source of truth is the presence of a live `consultation_sessions`
  // row for this appointment (legacy `consultation_room_sid` column was
  // dropped).
  const startedSession = await findActiveSessionByAppointment(appointmentId, 'video');
  if (!startedSession?.providerSessionId) {
    throw new ValidationError('Consultation has not been started yet');
  }

  const roomName = `appointment-${appointmentId}`;
  // Plan 06 Decision 9 / voice-0B: surface the `consultation_sessions.id`
  // alongside the Twilio token so the patient join page can call
  // `POST /api/v1/consultation/:sessionId/text-token` for the companion
  // chat. The doctor side already has the sessionId via the dashboard
  // `consultation-launcher` flow; this addition is purely so the legacy
  // `/consult/join?token=...` patient path can mount the companion chat
  // without a second round-trip.
  const sessionId = startedSession.id;

  if ('userId' in options) {
    if (appointment.doctor_id !== options.userId) {
      throw new NotFoundError('Appointment not found');
    }
    const joinToken = await getJoinTokenForAppointment(
      {
        appointmentId,
        doctorId: appointment.doctor_id,
        modality: 'video',
        role: 'doctor',
      },
      correlationId
    );
    return { token: joinToken.token, roomName, sessionId };
  }

  const verified = verifyConsultationToken(options.patientToken);
  if (verified.appointmentId !== appointmentId) {
    throw new NotFoundError('Appointment not found');
  }

  await assertSlotJoinAllowedForPatient(appointmentId, correlationId);

  const joinToken = await getJoinTokenForAppointment(
    {
      appointmentId,
      doctorId: appointment.doctor_id,
      modality: 'video',
      role: 'patient',
    },
    correlationId
  );
  return { token: joinToken.token, roomName, sessionId };
}

/**
 * Get consultation token for patient using only the signed join token.
 * Verifies token to extract appointmentId, then returns Video access token.
 * Used by /consult/join page when patient has ?token=xxx in URL.
 */
export async function getConsultationTokenForPatient(
  patientToken: string,
  correlationId: string
): Promise<{ token: string; roomName: string; sessionId: string }> {
  const verified = verifyConsultationToken(patientToken);
  return getConsultationToken(verified.appointmentId, correlationId, {
    patientToken,
  });
}
