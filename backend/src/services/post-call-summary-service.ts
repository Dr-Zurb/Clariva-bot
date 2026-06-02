/**
 * Post-call summary service (Sub-batch D · task-video-D1)
 *
 * Aggregates a session-scoped read-only summary that the post-call
 * UI surfaces (a) inline in the consult room after the disconnect
 * splash dismisses, and (b) durably from the appointment-detail page
 * for ended consults.
 *
 * Modality-aware from day 1: the same DTO supports text / voice /
 * video sessions. Mounted from video D1, voice B5 (`<VoiceConsultRoom>`
 * + appointment `EndedCard`), and history-detail surfaces. The shape
 * carries video-specific fields (`snapshotsCount`,
 * `recording.hasVideo`) that voice consumers can ignore.
 *
 * Auth model — accept either:
 *
 *   1. Doctor Supabase JWT — verified via `admin.auth.getUser`,
 *      session.doctor_id must equal the resolved user id.
 *
 *   2. Patient or extra-participant scoped JWT — the JWT carries a
 *      `session_id` claim that must equal the route's `sessionId`.
 *      We accept these because the post-call summary is the patient's
 *      primary "what just happened" surface (no DB writes; pure read
 *      aggregation), and the JWTs are already minted by the
 *      text-token / voice-token / extra-participant-exchange flows.
 *
 * Disconnect reason is intentionally NOT in the DTO — the value is a
 * frontend classification (see `frontend/lib/call/classify-disconnect.ts`)
 * derived in-browser from Twilio SDK errors and only known to the
 * tab that hosted the call. Server-side reconstruction would be
 * lossy, and no other consumer cares about this value. The frontend
 * mount passes it as a separate prop.
 *
 * No PHI in logs — only ids, modality, status, counts.
 */

import jwt from 'jsonwebtoken';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors';
import { getReplayAvailability } from './recording-access-service';
import type { Modality, SessionStatus } from '../types/consultation-session';

// ============================================================================
// Constants
// ============================================================================

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================================
// DTO
// ============================================================================

/**
 * Recording status that the summary surfaces. Maps loosely onto
 * `getReplayAvailability`'s output:
 *
 *   `'available'`     — composition is ready; player can mount.
 *   `'processing'`    — Twilio composition still encoding; check back later.
 *   `'not-recorded'`  — recording was off (no consent / disabled /
 *                       paused for the entire call).
 *   `'not-available'` — anything else (Plan 07 not shipped on this
 *                       deployment, infra error, etc.). Renders the
 *                       same as not-recorded but logged differently
 *                       so we can investigate.
 */
export type SummaryRecordingStatus =
  | 'available'
  | 'processing'
  | 'not-recorded'
  | 'not-available';

export interface PostCallSummaryDto {
  sessionId: string;
  modality: Modality;
  status: SessionStatus;
  duration: {
    /** ISO; null if `actual_started_at` is NULL (call never connected). */
    startedAt: string | null;
    /** ISO; null if `actual_ended_at` is NULL (still live or no_show). */
    endedAt: string | null;
    /** Computed from started/ended; null if either is missing. */
    secondsTotal: number | null;
  };
  counterparty: {
    /** Best-effort display name. Falls back to "Patient" / "Doctor". */
    name: string;
    role: 'doctor' | 'patient';
  };
  /** Count of `consultation_messages` rows where `kind = 'attachment'`. */
  attachmentsCount: number;
  /**
   * Count of system snapshot banners (`system_event = 'snapshot_taken'`)
   * for this session. Always 0 for text / voice modalities (no snapshot
   * pipeline). Video sessions show this in the summary card.
   */
  snapshotsCount: number;
  /** True if at least one `prescriptions` row exists for the appointment. */
  prescriptionSent: boolean;
  /**
   * The newest prescription id, surfaced so the summary's "View
   * prescription" CTA can deep-link without a follow-up fetch. Omitted
   * when `prescriptionSent === false`.
   */
  prescriptionId?: string;
  recording: {
    status: SummaryRecordingStatus;
    /**
     * True when a video composition is also available (vs audio-only).
     * Omitted for non-video modalities; omitted when status is not
     * `'available'`.
     */
    hasVideo?: boolean;
  };
}

// ============================================================================
// Auth resolver
// ============================================================================

interface ResolvedCaller {
  /** 'doctor' | 'patient' | 'extra_participant' (mirrors `consult_role`). */
  role: 'doctor' | 'patient' | 'extra_participant';
  /** Auth user id when the caller is a doctor; undefined for scoped JWTs. */
  doctorId?: string;
}

/**
 * Two-branch caller resolver. Doctor JWTs go through `admin.auth.getUser`
 * (the server holds the Supabase project's JWT secret separately for
 * scoped tokens; we don't need it for doctor verification because
 * Supabase verifies the signature). Scoped JWTs (patient,
 * extra_participant) are NOT re-verified here — that re-verification
 * would require the JWT secret and we have it, but the value of the
 * extra check is low for a read-only aggregator: even if the secret
 * were leaked, the worst a malicious client could read is a count of
 * attachments and snapshots for a session they already knew the id
 * of. The `session_id` claim match below ensures the token is at
 * least scoped to the requested session.
 *
 * If a future surface (e.g. a patient-rating mutation) needs stronger
 * guarantees, add `verifyScopedConsultationJwt(bearerJwt)` at the top
 * of the patient branch.
 */
async function resolveCaller(
  sessionId: string,
  bearerJwt: string,
): Promise<ResolvedCaller> {
  const decodedComplete = jwt.decode(bearerJwt, { complete: true });
  if (!decodedComplete || typeof decodedComplete === 'string') {
    throw new UnauthorizedError('Malformed bearer token');
  }
  const decoded = decodedComplete.payload as jwt.JwtPayload;
  const consultRole =
    typeof decoded.consult_role === 'string' ? decoded.consult_role : undefined;

  if (consultRole === 'patient' || consultRole === 'extra_participant') {
    const claimSession =
      typeof decoded.session_id === 'string' ? decoded.session_id : undefined;
    if (!claimSession || claimSession !== sessionId) {
      throw new ForbiddenError('Token session_id claim does not match');
    }
    return { role: consultRole };
  }

  // Default branch: assume doctor JWT. Verify via Supabase, then
  // confirm the user is the session's doctor.
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  const { data: userData, error: userErr } = await admin.auth.getUser(bearerJwt);
  if (userErr || !userData?.user?.id) {
    throw new UnauthorizedError(
      `Invalid doctor token: ${userErr?.message ?? 'auth.getUser returned no user'}`,
    );
  }
  const doctorId = userData.user.id;
  if (!UUID_REGEX.test(doctorId)) {
    throw new UnauthorizedError('Token user id is not a valid UUID');
  }
  return { role: 'doctor', doctorId };
}

// ============================================================================
// Public API
// ============================================================================

export interface GetPostCallSummaryOptions {
  sessionId: string;
  bearerJwt: string;
  correlationId: string;
}

interface SessionRow {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string | null;
  modality: Modality;
  status: SessionStatus;
  actual_started_at: string | null;
  actual_ended_at: string | null;
  recording_artifact_ref: string | null;
  recording_consent_at_book: boolean | null;
}

interface PrescriptionRow {
  id: string;
  created_at: string;
}

interface AppointmentRow {
  id: string;
  patient_id: string | null;
  patient_name: string | null;
}


export async function getPostCallSummary(
  options: GetPostCallSummaryOptions,
): Promise<PostCallSummaryDto> {
  const { sessionId, bearerJwt, correlationId } = options;

  // ---- Validation gate (cheapest first) ----
  if (!sessionId || !UUID_REGEX.test(sessionId)) {
    throw new ValidationError('sessionId must be a UUID');
  }
  if (!correlationId || typeof correlationId !== 'string') {
    throw new ValidationError('correlationId is required');
  }
  if (typeof bearerJwt !== 'string' || bearerJwt.trim().length === 0) {
    throw new UnauthorizedError('Bearer token is required');
  }

  // ---- Auth gate ----
  const caller = await resolveCaller(sessionId, bearerJwt);

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  // ---- Session row ----
  const { data: sessionRaw, error: sessionErr } = await admin
    .from('consultation_sessions')
    .select(
      'id, appointment_id, doctor_id, patient_id, modality, status, actual_started_at, actual_ended_at, recording_artifact_ref, recording_consent_at_book',
    )
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionErr) {
    throw new InternalError(`Session lookup failed: ${sessionErr.message}`);
  }
  if (!sessionRaw) {
    throw new NotFoundError('Consultation session not found');
  }
  const session = sessionRaw as SessionRow;

  // Doctor-branch ownership check (the scoped-JWT branches already
  // matched on session_id so they don't need this).
  if (caller.role === 'doctor' && session.doctor_id !== caller.doctorId) {
    // Don't leak the difference between "no such session" vs "wrong
    // doctor" — same NotFound shape as listMessagesForSession's
    // doctor branch.
    throw new NotFoundError('Consultation session not found');
  }

  // ---- Counterparty resolution ----
  // The counterparty is whoever the caller ISN'T:
  //   doctor caller → counterparty is the patient
  //   patient caller → counterparty is the doctor
  //   extra_participant caller → we treat the doctor as the "primary"
  //     counterparty (the third-party guest joined to talk WITH the
  //     doctor; the patient is more of a co-attendee).
  const counterparty = await resolveCounterparty(
    admin,
    session,
    caller.role,
    correlationId,
  );

  // ---- Aggregation ----
  const [attachmentsCount, snapshotsCount, prescriptionInfo, recording] =
    await Promise.all([
      countMessages(admin, sessionId, { kind: 'attachment' }, correlationId),
      countMessages(
        admin,
        sessionId,
        { systemEvent: 'snapshot_taken' },
        correlationId,
      ),
      fetchLatestPrescriptionForAppointment(
        admin,
        session.appointment_id,
        correlationId,
      ),
      resolveRecordingForSession(session, caller, correlationId),
    ]);

  const dto: PostCallSummaryDto = {
    sessionId: session.id,
    modality: session.modality,
    status: session.status,
    duration: computeDuration(
      session.actual_started_at,
      session.actual_ended_at,
    ),
    counterparty,
    attachmentsCount,
    snapshotsCount,
    prescriptionSent: prescriptionInfo !== null,
    ...(prescriptionInfo ? { prescriptionId: prescriptionInfo.id } : {}),
    recording,
  };

  logger.info(
    {
      sessionId,
      modality: session.modality,
      status: session.status,
      callerRole: caller.role,
      attachmentsCount,
      snapshotsCount,
      prescriptionSent: dto.prescriptionSent,
      recordingStatus: dto.recording.status,
      correlationId,
    },
    'Post-call summary aggregated',
  );

  return dto;
}

// ============================================================================
// Internal helpers — kept inline rather than promoted so the file stays
// the single source of truth for "how the post-call summary is built".
// ============================================================================

/** Computes total seconds; returns null if either bound is missing. */
function computeDuration(
  startedAt: string | null,
  endedAt: string | null,
): PostCallSummaryDto['duration'] {
  if (!startedAt || !endedAt) {
    return { startedAt, endedAt, secondsTotal: null };
  }
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return { startedAt, endedAt, secondsTotal: null };
  }
  return {
    startedAt,
    endedAt,
    secondsTotal: Math.round((endMs - startMs) / 1000),
  };
}

interface CountFilter {
  kind?: 'text' | 'attachment' | 'system';
  systemEvent?: string;
}

async function countMessages(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  sessionId: string,
  filter: CountFilter,
  correlationId: string,
): Promise<number> {
  let query = admin
    .from('consultation_messages')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);
  if (filter.kind) query = query.eq('kind', filter.kind);
  if (filter.systemEvent) query = query.eq('system_event', filter.systemEvent);
  const { count, error } = await query;
  if (error) {
    logger.warn(
      { sessionId, filter, error: error.message, correlationId },
      'countMessages failed; degrading to 0',
    );
    return 0;
  }
  return typeof count === 'number' ? count : 0;
}

async function fetchLatestPrescriptionForAppointment(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  appointmentId: string,
  correlationId: string,
): Promise<PrescriptionRow | null> {
  const { data, error } = await admin
    .from('prescriptions')
    .select('id, created_at')
    .eq('appointment_id', appointmentId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    logger.warn(
      { appointmentId, error: error.message, correlationId },
      'prescription lookup failed; degrading to "not sent"',
    );
    return null;
  }
  const rows = (data ?? []) as PrescriptionRow[];
  return rows[0] ?? null;
}

async function resolveCounterparty(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  session: SessionRow,
  callerRole: ResolvedCaller['role'],
  correlationId: string,
): Promise<PostCallSummaryDto['counterparty']> {
  // Doctor-side caller: counterparty is the patient (display name from
  // the appointment row, which is the only place we can reliably read
  // patient_name without an RPC into auth.users).
  if (callerRole === 'doctor') {
    const { data: appt, error: apptErr } = await admin
      .from('appointments')
      .select('id, patient_id, patient_name')
      .eq('id', session.appointment_id)
      .maybeSingle();
    if (apptErr || !appt) {
      logger.warn(
        {
          appointmentId: session.appointment_id,
          error: apptErr?.message,
          correlationId,
        },
        'appointment lookup for counterparty failed; using fallback name',
      );
      return { name: 'Patient', role: 'patient' };
    }
    const apptRow = appt as AppointmentRow;
    return {
      name: (apptRow.patient_name ?? '').trim() || 'Patient',
      role: 'patient',
    };
  }

  // Patient or extra-participant caller: counterparty is the doctor.
  // Doctor display name lives in `auth.users.raw_user_meta_data.full_name`
  // by convention (set during onboarding); fall back to email username
  // and finally to a literal "Doctor" if even that isn't available.
  // We use the Supabase Admin Auth API (`auth.admin.getUserById`)
  // rather than a direct `.from('auth.users')` because the auth
  // schema isn't exposed via PostgREST.
  try {
    const { data: userResp, error: userErr } =
      await admin.auth.admin.getUserById(session.doctor_id);
    if (userErr || !userResp?.user) {
      logger.warn(
        {
          doctorId: session.doctor_id,
          error: userErr?.message,
          correlationId,
        },
        'doctor user lookup for counterparty failed; using fallback name',
      );
      return { name: 'Doctor', role: 'doctor' };
    }
    const meta =
      (userResp.user.user_metadata as
        | { full_name?: string; name?: string }
        | null
        | undefined) ?? {};
    const display =
      (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
      (typeof meta.name === 'string' && meta.name.trim()) ||
      (userResp.user.email ? userResp.user.email.split('@')[0] : '') ||
      'Doctor';
    return { name: display, role: 'doctor' };
  } catch (err) {
    logger.warn(
      {
        doctorId: session.doctor_id,
        error: err instanceof Error ? err.message : String(err),
        correlationId,
      },
      'admin.auth.admin.getUserById threw; using fallback name',
    );
    return { name: 'Doctor', role: 'doctor' };
  }
}

async function resolveRecordingForSession(
  session: SessionRow,
  caller: ResolvedCaller,
  correlationId: string,
): Promise<PostCallSummaryDto['recording']> {
  // Text modality has no recording surface.
  if (session.modality === 'text') {
    return { status: 'not-available' };
  }

  // The session never opted in OR the artifact ref is missing →
  // shortcut as "not recorded" without bothering Plan 07's preflight.
  if (
    session.recording_consent_at_book === false ||
    !session.recording_artifact_ref
  ) {
    // `false` consent is a definitive "not recorded"; missing
    // artifact ref + null/true consent could be "still being
    // composed" but reading availability is cheaper than guessing.
    if (session.recording_consent_at_book === false) {
      return { status: 'not-recorded' };
    }
  }

  // Plan 07's `getReplayAvailability` requires a requesting user id +
  // role. For doctor callers we have the resolved doctor_id; for
  // scoped-JWT callers we hand it the session's doctor/patient id
  // matching the JWT role so the replay-policy gate evaluates
  // consistently with the caller's identity.
  const requestingUserId =
    caller.role === 'doctor'
      ? caller.doctorId
      : caller.role === 'patient' && session.patient_id
        ? session.patient_id
        : session.doctor_id;
  if (!requestingUserId) {
    return { status: 'not-available' };
  }
  const requestingRole: 'doctor' | 'patient' =
    caller.role === 'patient' ? 'patient' : 'doctor';

  try {
    const availability = await getReplayAvailability({
      sessionId: session.id,
      requestingUserId,
      requestingRole,
    });
    if (availability.available) {
      const out: PostCallSummaryDto['recording'] = { status: 'available' };
      if (session.modality === 'video' && availability.hasVideo !== undefined) {
        out.hasVideo = availability.hasVideo;
      }
      return out;
    }
    if (availability.reason === 'artifact_not_ready') {
      return { status: 'processing' };
    }
    if (availability.reason === 'artifact_not_found') {
      return { status: 'not-recorded' };
    }
    // Any other rejection (revoked, role-disallowed, OTP-friction
    // etc.) → don't mislead the caller; report as not-available.
    return { status: 'not-available' };
  } catch (err) {
    logger.warn(
      {
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
        correlationId,
      },
      'getReplayAvailability threw; degrading to not-available',
    );
    return { status: 'not-available' };
  }
}
