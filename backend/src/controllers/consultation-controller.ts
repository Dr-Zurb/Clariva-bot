/**
 * Consultation Controller (e-task-3)
 *
 * Handles HTTP requests for video consultation endpoints.
 * POST /api/v1/consultation/start - Start consultation (auth required)
 * GET /api/v1/consultation/token - Get Video access token (doctor: auth; patient: token param)
 *
 * No PHI in logs or response.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { successResponse, errorResponse } from '../utils/response';
import {
  startConsultation,
  startVoiceConsultation,
  getConsultationToken,
  getConsultationTokenForPatient,
} from '../services/appointment-service';
import {
  createSession as facadeCreateSession,
  getJoinToken as facadeGetJoinToken,
  findSessionById,
} from '../services/consultation-session-service';
import { getConsentForSession } from '../services/recording-consent-service';
import {
  pauseRecording,
  resumeRecording,
  getCurrentRecordingState,
  isSessionParticipant,
} from '../services/recording-pause-service';
import {
  requestVideoEscalation,
  patientResponseToEscalation,
  patientRevokeVideoMidCall,
  getVideoEscalationStateForSession,
  isSessionParticipantForRequest,
  AlreadyRecordingVideoError,
  CooldownInProgressError,
  MaxAttemptsReachedError,
  PendingRequestExistsError,
  SessionNotActiveError,
  type VideoEscalationPresetReason,
} from '../services/recording-escalation-service';
import {
  mintReplayUrl,
  getReplayAvailability,
  MintReplayError,
  VideoOtpRequiredError,
  type MintReplayErrorCode,
  type ReplayArtifactKind,
  type ReplayCallerRole,
} from '../services/recording-access-service';
import {
  isVideoOtpRequired,
  sendVideoReplayOtp,
  verifyVideoReplayOtp,
  VideoOtpRateLimitError,
  VideoOtpSmsUnavailableError,
} from '../services/video-replay-otp-service';
import {
  renderConsultTranscriptPdf,
  TranscriptExportError,
  type TranscriptExportErrorCode,
} from '../services/transcript-pdf-service';
import {
  mintScopedConsultationJwt,
  verifyScopedConsultationJwt,
  buildPatientSub,
} from '../services/supabase-jwt-mint';
import { supabase } from '../config/database';
import { sendConsultationReadyToPatient } from '../services/notification-service';
import { verifyConsultationToken } from '../utils/consultation-token';
import {
  validateStartConsultationBody,
  validateGetConsultationTokenQuery,
} from '../utils/validation';
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors';
import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Start consultation
 * POST /api/v1/consultation/start
 *
 * Body: { appointmentId }
 * Auth: Required (doctor).
 */
export const startConsultationHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  if (!userId) {
    throw new UnauthorizedError('Authentication required');
  }

  const { appointmentId } = validateStartConsultationBody(req.body);
  const result = await startConsultation(appointmentId, correlationId, userId);

  res.status(200).json(successResponse(result, req));
});

/**
 * Get consultation token
 * GET /api/v1/consultation/token?appointmentId=xxx&token=xxx (patient)
 * GET /api/v1/consultation/token?appointmentId=xxx (doctor, auth required)
 *
 * Doctor path: auth required, returns doctor Video token.
 * Patient path: token query param required, returns patient Video token.
 */
export const getConsultationTokenHandler = asyncHandler(async (req: Request, res: Response) => {
  const correlationId = req.correlationId || 'unknown';
  const userId = req.user?.id;

  const query = validateGetConsultationTokenQuery(
    req.query as Record<string, string | string[] | undefined>
  );

  let result: { token: string; roomName: string };
  if (userId && query.appointmentId) {
    result = await getConsultationToken(query.appointmentId, correlationId, { userId });
  } else if (query.token) {
    result = await getConsultationTokenForPatient(query.token, correlationId);
  } else {
    throw new UnauthorizedError('Authentication or consultation token required');
  }
  res.status(200).json(successResponse(result, req));
});

// ============================================================================
// Plan 04 · Task 18 — text-consult endpoints
// ============================================================================

/**
 * Start a text consultation (doctor-side entry point).
 * POST /api/v1/consultation/start-text
 *
 * Body: `{ appointmentId }`
 * Auth: doctor (Supabase auth).
 *
 * Creates a `consultation_sessions` row via the facade (idempotent on
 * `appointment_id`), fires the patient-side fan-out (DM + email + SMS),
 * and returns `{ sessionId }` so the doctor's `<TextConsultRoom>` can
 * subscribe to Realtime channel `consultation:{sessionId}`.
 *
 * Mirrors `startConsultationHandler` (video) but routes through the
 * modality-blind facade rather than `appointment-service.startConsultation`
 * (which is video-specific and out of scope for Task 18 to refactor —
 * see the task's "Out of scope" section).
 */
export const startTextConsultationHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { appointmentId } = validateStartConsultationBody(req.body);

    const admin = getSupabaseAdminClient();
    if (!admin) {
      throw new InternalError('Service role client not available');
    }

    const { data: appointment, error } = await admin
      .from('appointments')
      .select('id, doctor_id, patient_id, appointment_date')
      .eq('id', appointmentId)
      .maybeSingle();

    if (error || !appointment) {
      throw new NotFoundError('Appointment not found');
    }
    if (appointment.doctor_id !== userId) {
      throw new UnauthorizedError('You are not the doctor for this appointment');
    }

    const scheduledStartAt = new Date(appointment.appointment_date as string);
    const expectedEndAt = new Date(
      scheduledStartAt.getTime() + env.SLOT_INTERVAL_MINUTES * 60 * 1000,
    );

    const session = await facadeCreateSession(
      {
        appointmentId: appointment.id as string,
        doctorId:      appointment.doctor_id as string,
        patientId:     (appointment.patient_id as string | null) ?? null,
        modality:      'text',
        scheduledStartAt,
        expectedEndAt,
      },
      correlationId,
    );

    // Fire patient fan-out (best-effort — doctor still gets sessionId
    // even if fan-out fails).
    try {
      await sendConsultationReadyToPatient({
        sessionId:     session.id,
        correlationId,
      });
    } catch (err) {
      logger.warn(
        {
          correlationId,
          sessionId: session.id,
          error: err instanceof Error ? err.message : String(err),
        },
        'start-text: patient fan-out failed (doctor still receives sessionId)',
      );
    }

    res.status(200).json(
      successResponse(
        {
          sessionId: session.id,
          modality:  session.modality,
          status:    session.status,
        },
        req,
      ),
    );
  },
);

/**
 * Exchange the HMAC consultation-token (from the patient join URL) for a
 * scoped Supabase JWT plus the session metadata the frontend needs to
 * render the right state (holding screen vs live chat vs ended notice).
 * POST /api/v1/consultation/:sessionId/text-token
 *
 * Body: `{ token }` — the HMAC consultation-token minted by
 * `text-session-supabase.buildPatientJoinUrl`.
 * Auth: none (the consultation-token is itself the proof of authority).
 *
 * Response shape (Plan 04 · Task 19 extension):
 *   {
 *     token:            string|null,  // Supabase JWT scoped to this
 *                                     // session — null on ended/cancelled
 *     expiresAt:        ISO|null,     // when the JWT dies — null when
 *                                     // token is null
 *     currentUserId:    UUID,         // sender_id to use on inserts
 *                                     // (and for self-vs-counterparty
 *                                     // bubble alignment); see
 *                                     // derivation note below
 *     sessionStatus:    SessionStatus,
 *     scheduledStartAt: ISO,
 *     expectedEndAt:    ISO,
 *     practiceName?:    string,       // for the chat header — falls
 *                                     // back to "Your doctor" client-side
 *                                     // if absent
 *   }
 *
 * `currentUserId` derivation: bot patients (no `auth.users` row) cannot
 * present a real `auth.uid()` to RLS. The patient JWT's `sub` is
 * `patient:{appointmentId}` (synthetic, NOT a UUID). The migration-052
 * patient-branch INSERT policy doesn't constrain `sender_id` — but the
 * column is `UUID NOT NULL`, so we must hand the frontend *some* UUID to
 * use. We pick `consultation_sessions.patient_id` when present (mirrors
 * the existing `patients.id` UUID space), and fall back to
 * `consultation_sessions.appointment_id` (always non-null) when it isn't.
 * Doctor IDs and patient/appointment IDs come from independent UUID
 * generation, so collision risk between the two sides is statistically
 * zero — bubble alignment stays correct.
 *
 * Doctors do NOT use this endpoint — they use their existing Supabase
 * auth session for RLS (the doctor branch keys on `auth.uid() =
 * doctor_id`) and read session status from `consultation_sessions`
 * directly.
 */
export const exchangeTextConsultTokenHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }

    const body = req.body as { token?: unknown } | undefined;
    const consultationToken = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!consultationToken) {
      throw new ValidationError('Body { token } is required');
    }

    // Verify HMAC consultation-token. Throws UnauthorizedError on failure
    // (signature mismatch, expired, malformed) — propagates as 401 via
    // the central error handler.
    const verified = verifyConsultationToken(consultationToken);

    const session = await findSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Consultation session not found');
    }
    if (session.appointmentId !== verified.appointmentId) {
      // The token is valid for SOME session (its appointmentId), but the
      // URL is asking for a different session. Don't leak which exists —
      // just refuse.
      throw new UnauthorizedError('Token does not authorize this session');
    }
    if (session.modality !== 'text') {
      throw new ValidationError(
        `Cannot exchange text-token for ${session.modality} session`,
      );
    }

    // Mint the JWT only when the session is still joinable. For ended /
    // cancelled sessions we still return the response (so the frontend
    // can render its post-session state) but skip the mint — the patient
    // can't write anyway and reads of past messages are a Plan 07
    // concern.
    let token: string | null = null;
    let expiresAtIso: string | null = null;
    if (session.status !== 'ended' && session.status !== 'cancelled') {
      const joinToken = await facadeGetJoinToken(sessionId, 'patient', correlationId);
      token = joinToken.token;
      expiresAtIso = joinToken.expiresAt.toISOString();
    }

    // Best-effort look-up of practice name for the chat header. The
    // project doesn't ship a public-facing doctor `full_name` column —
    // patients see the practice (clinic) name via `doctor_settings`
    // (same convention as the existing IG / SMS / email fan-outs). On
    // lookup failure we fall back silently and the frontend renders a
    // generic "Your doctor" header. Service-role client used because the
    // patient JWT can't read this table under RLS.
    let practiceName: string | undefined;
    const admin = getSupabaseAdminClient();
    if (admin) {
      try {
        const { data: settings } = await admin
          .from('doctor_settings')
          .select('practice_name')
          .eq('doctor_id', session.doctorId)
          .maybeSingle();
        const pn = (settings as { practice_name?: string | null } | null)?.practice_name;
        if (pn && pn.trim().length > 0) {
          practiceName = pn.trim();
        }
      } catch (err) {
        logger.warn(
          { correlationId, sessionId, error: err instanceof Error ? err.message : String(err) },
          'exchange-text-token: practice name lookup failed (non-fatal)',
        );
      }
    }

    // sender_id derivation (see header doc above).
    const currentUserId = session.patientId ?? session.appointmentId;

    res.status(200).json(
      successResponse(
        {
          token,
          expiresAt:        expiresAtIso,
          currentUserId,
          sessionStatus:    session.status,
          scheduledStartAt: session.scheduledStartAt.toISOString(),
          expectedEndAt:    session.expectedEndAt.toISOString(),
          practiceName,
        },
        req,
      ),
    );
  },
);

// ============================================================================
// Plan 07 · Task 31 — post-consult chat-history token exchange
// ============================================================================

/**
 * 90 days, in seconds. Mirrors the patient-self-serve replay TTL from
 * Plan 07 · Task 29 — same mental model for both readonly artifacts.
 * Used both for the HMAC's `expiresInSeconds` upper-bound (so a stale
 * DM link can be re-tapped any time within 90 days to obtain a fresh
 * JWT without needing support to re-mint) and for the minted JWT
 * itself.
 *
 * The *access right* is indefinite per Decision 1 sub-decision LOCKED;
 * the *self-serve link* is bounded to 90 days. After 90 days the
 * patient contacts support, who re-mints a fresh HMAC link, which
 * exchanges to a fresh 90-day JWT.
 */
const POST_CONSULT_CHAT_HISTORY_JWT_TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * Exchange the HMAC consultation-token (from the post-consult chat
 * history DM link) for a patient-scoped Supabase JWT good for reading
 * the conversation thread.
 * POST /api/v1/consultation/:sessionId/chat-history-token
 *
 * Body: `{ hmacToken: string }` — the HMAC consultation-token minted
 * by `sendPostConsultChatHistoryDm` (90-day TTL upstream).
 * Auth: none (the HMAC is the proof of authority).
 *
 * Response:
 *   {
 *     accessToken: string,  // Supabase JWT scoped to (session_id,
 *                           //   consult_role: 'patient'); 90-day TTL
 *     expiresAt:   ISO,     // when the JWT dies
 *   }
 *
 * Mirrors `exchangeTextConsultTokenHandler` (live consults) and
 * `exchangeReplayTokenHandler` (Task 29 replay) but issues a long-TTL
 * JWT scoped to readonly chat-history reads. Plan 04 Migration 052's
 * patient-branch SELECT policy on `consultation_messages` keys on
 * (`consult_role`, `session_id`) — NOT on session status — so the
 * minted JWT can read messages even after the session is `ended`.
 *
 * Doctors do NOT use this endpoint — they navigate from the dashboard
 * and use their evergreen Supabase auth session (RLS doctor branch
 * keys on `auth.uid() = doctor_id`).
 *
 * @see backend/src/services/notification-service.ts#sendPostConsultChatHistoryDm
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-31-post-consult-chat-history-surface.md
 */
export const exchangeChatHistoryTokenHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }

    const body = req.body as { hmacToken?: unknown } | undefined;
    const hmacToken =
      typeof body?.hmacToken === 'string' ? body.hmacToken.trim() : '';
    if (!hmacToken) {
      throw new ValidationError('Body { hmacToken } is required');
    }

    // Verify the HMAC. Throws UnauthorizedError on signature mismatch /
    // expiry / malformed. Propagates as 401 via the global error handler.
    const verified = verifyConsultationToken(hmacToken);

    const session = await findSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Consultation session not found');
    }
    if (session.appointmentId !== verified.appointmentId) {
      // Token is valid for *some* session but not this one. Refuse without
      // leaking which session the token was minted for.
      throw new UnauthorizedError('Token does not authorize this session');
    }

    // Mint a 90-day patient-scoped JWT. The patient `sub` is synthetic
    // (`patient:{appointmentId}`) — bot patients have no `auth.users`
    // row; Migration 052's RLS branch for patients keys on the custom
    // claims, NOT on `auth.uid()`.
    const expiresAt = new Date(
      Date.now() + POST_CONSULT_CHAT_HISTORY_JWT_TTL_SECONDS * 1000,
    );
    const minted = mintScopedConsultationJwt({
      sub:       buildPatientSub(session.appointmentId),
      role:      'patient',
      sessionId: session.id,
      expiresAt,
    });

    // Best-effort enrichment: the patient page needs a few extra
    // fields to mount the readonly room without round-tripping a
    // second endpoint (`currentUserId` for self-vs-counterparty bubble
    // alignment, `actualEndedAt` for the "view of your consultation on
    // {date}" watermark, `practiceName` for the bot-side header).
    // Mirrors `exchangeTextConsultTokenHandler` (live consults), which
    // also returns these fields out of the same exchange call. None of
    // them are sensitive — sender_id IS public per consultation_messages
    // RLS, and practice_name is part of the public DM body anyway.
    let practiceName: string | undefined;
    let actualEndedAt: string | null = null;
    const admin = getSupabaseAdminClient();
    if (admin) {
      try {
        const { data: row } = await admin
          .from('consultation_sessions')
          .select('actual_ended_at')
          .eq('id', session.id)
          .maybeSingle();
        actualEndedAt =
          (row as { actual_ended_at?: string | null } | null)?.actual_ended_at ?? null;
      } catch (err) {
        logger.warn(
          {
            correlationId,
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          },
          'chat-history-token: actual_ended_at lookup failed (non-fatal)',
        );
      }
      try {
        const { data: settings } = await admin
          .from('doctor_settings')
          .select('practice_name')
          .eq('doctor_id', session.doctorId)
          .maybeSingle();
        const pn = (settings as { practice_name?: string | null } | null)?.practice_name;
        if (pn && pn.trim().length > 0) {
          practiceName = pn.trim();
        }
      } catch (err) {
        logger.warn(
          {
            correlationId,
            sessionId,
            error: err instanceof Error ? err.message : String(err),
          },
          'chat-history-token: practice name lookup failed (non-fatal)',
        );
      }
    }

    // sender_id derivation: same convention as the live text-token path.
    const currentUserId = session.patientId ?? session.appointmentId;

    logger.info(
      { correlationId, sessionId },
      'chat-history-token: minted patient-scoped 90-day JWT',
    );

    res.status(200).json(
      successResponse(
        {
          accessToken:    minted.token,
          expiresAt:      minted.expiresAt.toISOString(),
          currentUserId,
          sessionStatus:  session.status,
          consultEndedAt: actualEndedAt,
          practiceName,
        },
        req,
      ),
    );
  },
);

// ============================================================================
// Plan 05 · Task 24 — voice-consult endpoints
// ============================================================================

/**
 * Start a voice consultation (doctor-side entry point).
 * POST /api/v1/consultation/start-voice
 *
 * Body: `{ appointmentId }`
 * Auth: doctor (Supabase auth).
 *
 * Returns the same shape as `POST /start` (video) — the frontend voice
 * branch in `<ConsultationLauncher>` uses the same `VideoSession`-ish
 * local state, with the only difference being that the token connects to
 * an audio-only Twilio Video room (Recording Rules enforced by the
 * voice adapter; camera track never published by `<VoiceConsultRoom>`).
 */
export const startVoiceConsultationHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { appointmentId } = validateStartConsultationBody(req.body);
    const result = await startVoiceConsultation(appointmentId, correlationId, userId);

    res.status(200).json(successResponse(result, req));
  },
);

/**
 * Exchange the HMAC consultation-token (from the voice patient join URL)
 * for a Twilio Video access token plus session metadata.
 * POST /api/v1/consultation/:sessionId/voice-token
 *
 * Body: `{ token }` — HMAC consultation-token.
 * Auth: none (the HMAC is the proof of authority).
 *
 * Response:
 *   {
 *     token:            string|null,  // Twilio access token — null on ended
 *     roomName:         string,       // `appointment-voice-{appointmentId}`
 *     expiresAt:        ISO|null,     // Twilio token expiry
 *     sessionStatus:    SessionStatus,
 *     scheduledStartAt: ISO,
 *     expectedEndAt:    ISO,
 *     practiceName?:    string,
 *   }
 */
export const exchangeVoiceConsultTokenHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }

    const body = req.body as { token?: unknown } | undefined;
    const consultationToken = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!consultationToken) {
      throw new ValidationError('Body { token } is required');
    }

    const verified = verifyConsultationToken(consultationToken);

    const session = await findSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Consultation session not found');
    }
    if (session.appointmentId !== verified.appointmentId) {
      throw new UnauthorizedError('Token does not authorize this session');
    }
    if (session.modality !== 'voice') {
      throw new ValidationError(
        `Cannot exchange voice-token for ${session.modality} session`,
      );
    }

    const roomName = `appointment-voice-${session.appointmentId}`;

    let token: string | null = null;
    let expiresAtIso: string | null = null;
    if (session.status !== 'ended' && session.status !== 'cancelled') {
      const joinToken = await facadeGetJoinToken(sessionId, 'patient', correlationId);
      token = joinToken.token;
      expiresAtIso = joinToken.expiresAt.toISOString();
    }

    let practiceName: string | undefined;
    const admin = getSupabaseAdminClient();
    if (admin) {
      try {
        const { data: settings } = await admin
          .from('doctor_settings')
          .select('practice_name')
          .eq('doctor_id', session.doctorId)
          .maybeSingle();
        const pn = (settings as { practice_name?: string | null } | null)?.practice_name;
        if (pn && pn.trim().length > 0) {
          practiceName = pn.trim();
        }
      } catch (err) {
        logger.warn(
          { correlationId, sessionId, error: err instanceof Error ? err.message : String(err) },
          'exchange-voice-token: practice name lookup failed (non-fatal)',
        );
      }
    }

    res.status(200).json(
      successResponse(
        {
          token,
          roomName,
          expiresAt:        expiresAtIso,
          sessionStatus:    session.status,
          scheduledStartAt: session.scheduledStartAt.toISOString(),
          expectedEndAt:    session.expectedEndAt.toISOString(),
          practiceName,
        },
        req,
      ),
    );
  },
);

/**
 * Re-send the patient join link for a voice/video consultation.
 * POST /api/v1/consultation/:sessionId/resend-link
 *
 * Body: `{ channel?: 'sms' | 'ig_dm' | 'email' }` (currently advisory —
 * v1 fans out to all configured channels; the `channel` hint is logged
 * for audit and will narrow the dispatch in a later refinement).
 * Auth: doctor (Supabase auth). Must own the session.
 *
 * The `force: true` option on `sendConsultationReadyToPatient` bypasses
 * the 60s dedup window so the doctor's explicit resend always fires.
 * Return shape: `{ sent: boolean, reason?: string }`.
 */
export const resendConsultationLinkHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }

    const body = req.body as { channel?: unknown } | undefined;
    const channelRaw = typeof body?.channel === 'string' ? body.channel.trim() : '';
    const channel =
      channelRaw === 'sms' || channelRaw === 'ig_dm' || channelRaw === 'email'
        ? channelRaw
        : undefined;

    const session = await findSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Consultation session not found');
    }
    if (session.doctorId !== userId) {
      throw new UnauthorizedError('Not authorized to resend for this session');
    }

    logger.info(
      { correlationId, sessionId, channelHint: channel ?? 'all' },
      'resend-link: doctor triggered patient join-link resend',
    );

    const result = await sendConsultationReadyToPatient({
      sessionId,
      correlationId,
      force: true,
    });

    res.status(200).json(
      successResponse(
        {
          sent: result.anySent,
          reason: result.reason,
        },
        req,
      ),
    );
  },
);

/**
 * Get recording-consent decision for a session (Plan 02 · Task 27).
 * GET /api/v1/consultation/:sessionId/recording-consent
 *
 * Auth: Requires authenticated doctor. The doctor must own the session
 * (verified indirectly by the RLS-enforced service layer — service-role
 * read here is safe because we check `session.doctorId === req.user.id`
 * before returning).
 *
 * Response: { decision: boolean | null, capturedAt: string | null, version: string | null }
 */
export const getRecordingConsentForSessionHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }

    const session = await findSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Consultation session not found');
    }
    if (session.doctorId !== userId) {
      throw new UnauthorizedError('Not authorized to read this session');
    }

    const consent = await getConsentForSession({ sessionId });

    res.status(200).json(
      successResponse(
        {
          decision: consent.decision,
          capturedAt: consent.capturedAt ? consent.capturedAt.toISOString() : null,
          version: consent.version,
        },
        req,
      ),
    );
  },
);

// ============================================================================
// Plan 07 · Task 28 — recording pause / resume / inspect (Decision 4 LOCKED)
// ============================================================================

/**
 * POST /api/v1/consultation/:sessionId/recording/pause
 *
 * Body: { reason: string }  (5..200 chars after trim)
 * Auth: Required; caller MUST be the session's doctor (enforced inside
 *       `pauseRecording` via the `doctorId === session.doctorId` check).
 * Returns 204 on success. Maps `ValidationError` / `ForbiddenError` /
 * `ConflictError` to the standard 400 / 403 / 409 envelopes via the
 * global error middleware.
 */
export const pauseRecordingHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }

    const body = req.body as { reason?: unknown } | undefined;
    const reason = typeof body?.reason === 'string' ? body.reason : '';

    await pauseRecording({
      sessionId,
      doctorId:      userId,
      reason,
      correlationId,
    });

    res.status(204).send();
  },
);

/**
 * POST /api/v1/consultation/:sessionId/recording/resume
 *
 * No body. Same authz model as pause. 204 on success.
 */
export const resumeRecordingHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }

    await resumeRecording({
      sessionId,
      doctorId:      userId,
      correlationId,
    });

    res.status(204).send();
  },
);

/**
 * GET /api/v1/consultation/:sessionId/recording/state
 *
 * Read-only state inspector. Either participant (doctor or patient)
 * can call it — the RecordingPausedIndicator on both sides needs the
 * initial state on mount. RBAC here only rejects non-participants;
 * session-scoped Supabase RLS on the patient side would normally do
 * this, but since we're reading via service-role admin we enforce it
 * directly.
 *
 * Response:
 *   {
 *     sessionId:   string,
 *     paused:      boolean,
 *     pausedAt?:   string (ISO),
 *     pausedBy?:   string,
 *     pauseReason?: string,
 *     resumedAt?:  string (ISO)
 *   }
 */
export const getRecordingStateHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }

    const { isParticipant } = await isSessionParticipant(sessionId, userId);
    if (!isParticipant) {
      throw new ForbiddenError('Not authorized to read this session');
    }

    const state = await getCurrentRecordingState(sessionId);

    res.status(200).json(
      successResponse(
        {
          sessionId:    state.sessionId,
          paused:       state.paused,
          pausedAt:     state.pausedAt ? state.pausedAt.toISOString() : undefined,
          pausedBy:     state.pausedBy,
          pauseReason:  state.pauseReason,
          resumedAt:    state.resumedAt ? state.resumedAt.toISOString() : undefined,
        },
        req,
      ),
    );
  },
);

// ============================================================================
// Plan 07 · Task 29 — recording replay (patient self-serve + doctor review)
// Decision 4 + Decision 10 LOCKED.
// ============================================================================

/**
 * Map a MintReplayError code → HTTP status. Pinned by the route unit
 * test so any future code addition is forced to declare its mapping.
 */
function replayErrorStatus(code: MintReplayErrorCode): number {
  switch (code) {
    case 'not_a_participant':
      return 403;
    case 'artifact_not_found':
    case 'no_video_artifact':
      return 404;
    case 'artifact_not_ready':
    case 'beyond_self_serve_window':
      return 409;
    case 'revoked':
      return 410;
    default:
      return 500;
  }
}

interface ReplayCaller {
  role:             ReplayCallerRole;
  /** Effective user id passed to the access service. */
  userId:           string;
  /** Set when the caller is a patient — the JWT's sessionId claim, used to bind. */
  jwtSessionId?:    string;
}

/**
 * Resolve the caller for a replay route. Tries (in order):
 *   1. Scoped consultation JWT (patient): verifies via the project's
 *      JWT secret with `verifyScopedConsultationJwt`. The patient's
 *      synthetic `sub` is mapped to the session's real `patient_id`
 *      after a session lookup so the access service's authZ check
 *      (which compares against `consultation_sessions.patient_id`)
 *      sees a real UUID.
 *   2. Standard Supabase Auth (doctor): same `authenticateToken` path
 *      as the rest of the doctor surface; `req.user.id` is the
 *      doctor's UUID.
 *
 * Returns the resolved caller or throws `UnauthorizedError`. Never
 * promotes a doctor to a patient (or vice versa) — the caller's
 * declared role is bound to which auth path matched.
 */
async function resolveReplayCaller(
  req: Request,
  urlSessionId: string,
): Promise<ReplayCaller> {
  const authHeader = typeof req.headers.authorization === 'string'
    ? req.headers.authorization
    : '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }
  const token = authHeader.substring(7).trim();
  if (!token) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  // Path 1: scoped consultation JWT (patient).
  try {
    const claims = verifyScopedConsultationJwt(token);
    if (claims.consult_role === 'patient') {
      if (claims.session_id !== urlSessionId) {
        throw new UnauthorizedError('Token is not scoped to this session');
      }
      const session = await findSessionById(urlSessionId);
      if (!session) {
        throw new NotFoundError('Consultation session not found');
      }
      if (!session.patientId) {
        throw new ForbiddenError('Patient replay not available for guest sessions');
      }
      return {
        role:          'patient',
        userId:        session.patientId,
        jwtSessionId:  claims.session_id,
      };
    }
    // Doctor scoped JWT — fall through to Path 2 to canonicalise via Supabase.
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof NotFoundError || err instanceof ForbiddenError) {
      throw err;
    }
    // Not a scoped consultation JWT (signature/shape mismatch). Fall
    // through and let Supabase try.
  }

  // Path 2: standard Supabase JWT (doctor).
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    throw new UnauthorizedError('Invalid or expired token');
  }
  return { role: 'doctor', userId: user.id };
}

/**
 * POST /api/v1/consultation/:sessionId/replay-token
 *
 * Patient HMAC-exchange. Body: `{ token }` (the HMAC consultation-token
 * from the patient join URL). Verifies the HMAC, asserts the session's
 * `appointmentId` matches the token's, and mints a 15-min Supabase JWT
 * scoped to this session (`consult_role: patient`, `session_id`).
 *
 * **15-min TTL is intentional** (vs Task 31's 90-day chat-history
 * JWT). Replay is a single-click event; chat-history is a multi-visit
 * read surface. Shorter TTL = smaller blast radius if the JWT leaks.
 *
 * Auth: HMAC token in the body (no Authorization header needed). Same
 * pattern as the text/voice token-exchange routes.
 */
export const exchangeReplayTokenHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }
    const body = req.body as { token?: unknown } | undefined;
    const consultationToken = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!consultationToken) {
      throw new ValidationError('Body { token } is required');
    }

    const verified = verifyConsultationToken(consultationToken);

    const session = await findSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Consultation session not found');
    }
    if (session.appointmentId !== verified.appointmentId) {
      throw new UnauthorizedError('Token does not authorize this session');
    }

    // 15 min TTL per task-29 acceptance criteria + Note #7.
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const minted = mintScopedConsultationJwt({
      sub:       buildPatientSub(session.appointmentId),
      role:      'patient',
      sessionId: session.id,
      expiresAt,
    });

    logger.info(
      { correlationId, sessionId },
      'replay-token: minted patient-scoped 15-min JWT',
    );

    res.status(200).json(
      successResponse(
        {
          token:     minted.token,
          expiresAt: minted.expiresAt.toISOString(),
        },
        req,
      ),
    );
  },
);

/**
 * POST /api/v1/consultation/:sessionId/replay/audio/mint
 *
 * Body: `{}` (no body needed; session from URL, role from auth).
 * Auth: doctor (Supabase Auth) OR patient (scoped JWT from
 * `replay-token` exchange).
 *
 * Returns `{ signedUrl, expiresAt, artifactRef }` on 200. Maps
 * `MintReplayError` codes to 403 / 404 / 409 / 410 per
 * `replayErrorStatus`. `ValidationError` (e.g. support-staff missing
 * reason) maps to 400 via the global error handler.
 *
 * Rate limiting is applied at the route layer (10 req/hr per IP — see
 * `replayMintLimiter` in `routes/api/v1/consultation.ts`).
 */
export const mintReplayUrlHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }

    // Plan 08 · Task 44 · Decision 10 LOCKED.
    //
    // `artifactKind` comes in as an optional query param. Default
    // `'audio'` preserves the Task 29 baseline (the player calls this
    // route with no query param for the audio-only default state).
    // When the patient toggles "Show video", the frontend re-calls
    // the same route with `?artifactKind=video`. Accepting it as a
    // query (vs body) keeps the route idempotent-at-URL for debug
    // replay + curl sanity checks.
    const rawKind = (req.query as { artifactKind?: unknown })?.artifactKind;
    const kindStr = typeof rawKind === 'string' ? rawKind.trim().toLowerCase() : '';
    let artifactKind: ReplayArtifactKind;
    if (!kindStr || kindStr === 'audio') {
      artifactKind = 'audio';
    } else if (kindStr === 'video') {
      artifactKind = 'video';
    } else {
      throw new ValidationError(
        `artifactKind must be 'audio' or 'video' (got '${kindStr}')`,
      );
    }

    const caller = await resolveReplayCaller(req, sessionId);

    try {
      const result = await mintReplayUrl({
        sessionId,
        artifactKind,
        requestingUserId: caller.userId,
        requestingRole:   caller.role,
        correlationId,
      });
      res.status(200).json(
        successResponse(
          {
            signedUrl:    result.signedUrl,
            expiresAt:    result.expiresAt.toISOString(),
            artifactRef:  result.artifactRef,
            artifactKind,
          },
          req,
        ),
      );
    } catch (err) {
      if (err instanceof MintReplayError) {
        const status = replayErrorStatus(err.code);
        res.status(status).json(
          errorResponse(
            { code: err.code, message: err.message, statusCode: status },
            req,
          ),
        );
        return;
      }
      if (err instanceof VideoOtpRequiredError) {
        // Decision 10 friction gate: the client renders the OTP modal
        // on this response shape. 403 is semantically "forbidden until
        // you prove presence". `lastVerifiedAt` is an ISO timestamp or
        // null (never verified) so the UI can render "last verified
        // N days ago" copy.
        const statusCode = 403;
        res.status(statusCode).json(
          errorResponse(
            {
              code:       'video_otp_required',
              message:    err.message,
              statusCode,
              details:    {
                lastVerifiedAt: err.lastVerifiedAt ? err.lastVerifiedAt.toISOString() : null,
              },
            },
            req,
          ),
        );
        return;
      }
      throw err;
    }
  },
);

// ============================================================================
// Plan 08 · Task 44 — video-replay OTP handlers (Decision 10 LOCKED)
// ============================================================================

/**
 * Shared helper: resolve the caller's patient-scoped identity for the
 * video-OTP routes. Patients call these three endpoints via their
 * Task-29 scoped JWT (same one the replay/mint route accepts).
 * Doctors do not call these routes — the friction gate exists to
 * protect patient self-serve replay. Passing a doctor JWT returns
 * 403 with `forbidden_role`.
 */
async function resolvePatientReplayCaller(
  req: Request,
  urlSessionId: string,
): Promise<{ patientId: string; sessionId: string }> {
  const caller = await resolveReplayCaller(req, urlSessionId);
  if (caller.role !== 'patient') {
    throw new ForbiddenError(
      'Video replay OTP endpoints are patient-only (doctor JWTs are not accepted)',
    );
  }
  return { patientId: caller.userId, sessionId: urlSessionId };
}

/**
 * GET /api/v1/consultation/:sessionId/video-replay-otp/state
 *
 * Returns `{ required: boolean, lastVerifiedAt: ISO | null }`. Read-
 * only preflight the UI hits before showing the warning modal, so the
 * client can skip the OTP step entirely when the patient is inside
 * their 30-day window.
 */
export const getVideoReplayOtpStateHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }
    const caller = await resolvePatientReplayCaller(req, sessionId);
    const state = await isVideoOtpRequired({ patientId: caller.patientId });
    res.status(200).json(
      successResponse(
        {
          required:        state.required,
          lastVerifiedAt:  state.lastVerifiedAt ? state.lastVerifiedAt.toISOString() : null,
        },
        req,
      ),
    );
  },
);

/**
 * POST /api/v1/consultation/:sessionId/video-replay-otp/send
 *
 * Body: `{}` — the server derives the patient phone from the on-file
 * `patients.phone` (never trust a client-supplied recipient for an
 * OTP; a compromised session must not be able to redirect the code).
 *
 * Returns `{ otpId, expiresAt, sent: true }` on 201.
 *
 * Error cases:
 *   - 403 `no_patient_phone_on_file`    — patient row has no phone.
 *   - 409 `already_verified`            — the patient is inside their
 *                                         30-day skip window; the UI
 *                                         should proceed directly
 *                                         without prompting for OTP.
 *   - 429 `rate_limited`                — >= 3 sends in the last hour;
 *                                         `retry_after_seconds` included.
 *   - 502 `sms_unavailable`             — Twilio rejected or SMS isn't
 *                                         configured (the DB row is
 *                                         rolled back via consumed_at).
 */
export const sendVideoReplayOtpHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }
    const caller = await resolvePatientReplayCaller(req, sessionId);

    // Fast path — if the patient is already inside the window, short
    // circuit: no point sending an OTP for a check that would have
    // passed. Saves an SMS spend + a rate-limit slot.
    const state = await isVideoOtpRequired({ patientId: caller.patientId });
    if (!state.required) {
      res.status(409).json(
        errorResponse(
          {
            code:       'already_verified',
            message:    'Patient is inside the 30-day OTP skip window; no SMS needed',
            statusCode: 409,
            details: {
              lastVerifiedAt: state.lastVerifiedAt ? state.lastVerifiedAt.toISOString() : null,
            },
          },
          req,
        ),
      );
      return;
    }

    // Resolve the authoritative phone. Never trust a client-supplied
    // number — this is the "OTP redirection via compromised session"
    // prevention.
    const admin = getSupabaseAdminClient();
    if (!admin) {
      throw new InternalError('Supabase admin client unavailable');
    }
    const { data: patientRow, error: patientErr } = await admin
      .from('patients')
      .select('phone')
      .eq('id', caller.patientId)
      .maybeSingle();
    if (patientErr) {
      throw new InternalError(`Patient lookup failed: ${patientErr.message}`);
    }
    const phone = (patientRow as { phone: string | null } | null)?.phone?.trim();
    if (!phone) {
      res.status(403).json(
        errorResponse(
          {
            code:       'no_patient_phone_on_file',
            message:    'Patient has no phone number on file for SMS OTP',
            statusCode: 403,
          },
          req,
        ),
      );
      return;
    }

    try {
      const result = await sendVideoReplayOtp({
        patientId:      caller.patientId,
        phone,
        correlationId,
      });
      res.status(201).json(
        successResponse(
          {
            otpId:      result.otpId,
            expiresAt:  result.expiresAt.toISOString(),
            sent:       true,
          },
          req,
        ),
      );
    } catch (err) {
      if (err instanceof VideoOtpRateLimitError) {
        res.status(429).json(
          errorResponse(
            {
              code:       'rate_limited',
              message:    err.message,
              statusCode: 429,
              details:    { retry_after_seconds: err.retryAfterSeconds },
            },
            req,
          ),
        );
        return;
      }
      if (err instanceof VideoOtpSmsUnavailableError) {
        res.status(502).json(
          errorResponse(
            {
              code:       'sms_unavailable',
              message:    err.message,
              statusCode: 502,
            },
            req,
          ),
        );
        return;
      }
      throw err;
    }
  },
);

/**
 * POST /api/v1/consultation/:sessionId/video-replay-otp/verify
 *
 * Body: `{ otpId: string, code: string }`.
 *
 * Returns `{ verified: true }` (200) on success. On failure returns
 * 200 with `{ verified: false, reason }` where reason is one of
 * `'expired' | 'too_many_attempts' | 'wrong_code'` — the client maps
 * the reason to per-field error copy in the modal. Intentionally NOT
 * using HTTP 4xx here: a wrong OTP isn't a client contract violation,
 * it's expected user state. Rate-limit / malformed-input denials
 * still surface through the normal 4xx path.
 */
export const verifyVideoReplayOtpHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }
    const caller = await resolvePatientReplayCaller(req, sessionId);

    const body = req.body as { otpId?: unknown; code?: unknown } | undefined;
    const otpId = typeof body?.otpId === 'string' ? body.otpId.trim() : '';
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!otpId) {
      throw new ValidationError('Body { otpId } is required');
    }
    if (!code) {
      throw new ValidationError('Body { code } is required');
    }

    const result = await verifyVideoReplayOtp({
      otpId,
      code,
      patientId:     caller.patientId,
      correlationId,
    });

    if (result.verified) {
      res.status(200).json(
        successResponse({ verified: true }, req),
      );
      return;
    }
    res.status(200).json(
      successResponse(
        {
          verified: false,
          reason:   result.reason ?? 'wrong_code',
        },
        req,
      ),
    );
  },
);

/**
 * GET /api/v1/consultation/:sessionId/replay/status
 *
 * Returns `ReplayAvailability` shape:
 *   { available: boolean, reason?: string, selfServeExpiresAt?: ISO }
 *
 * Same auth model as the mint route. Read-only; does NOT write an
 * audit row (preflight for the player UI).
 */
export const getReplayStatusHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }

    const caller = await resolveReplayCaller(req, sessionId);

    const result = await getReplayAvailability({
      sessionId,
      requestingUserId: caller.userId,
      requestingRole:   caller.role,
    });

    res.status(200).json(
      successResponse(
        {
          available:           result.available,
          reason:              result.reason,
          selfServeExpiresAt:  result.selfServeExpiresAt
            ? result.selfServeExpiresAt.toISOString()
            : undefined,
          hasVideo:            result.hasVideo ?? false,
        },
        req,
      ),
    );
  },
);

// ============================================================================
// Plan 07 · Task 32 — transcript PDF export
// ============================================================================

/**
 * Map `TranscriptExportErrorCode` to an HTTP status for the 
 * GET /transcript.pdf denial path.
 *
 *   - `not_a_participant`          → 403 (same as audio replay)
 *   - `session_not_ended`          → 409 (the resource is pre-terminal;
 *                                   retry when the consult ends)
 *   - `beyond_self_serve_window`   → 409 (temporally unavailable —
 *                                   contact support)
 *   - `revoked`                    → 410 Gone (regulatory tombstone;
 *                                   will not return)
 */
function transcriptErrorStatus(code: TranscriptExportErrorCode): number {
  switch (code) {
    case 'not_a_participant':
      return 403;
    case 'session_not_ended':
    case 'beyond_self_serve_window':
      return 409;
    case 'revoked':
      return 410;
    default:
      return 500;
  }
}

/**
 * POST /api/v1/consultation/:sessionId/transcript-token
 *
 * Body: `{ hmacToken }` (the HMAC consultation-token from the patient
 *                        join URL or the post-consult chat-history URL).
 * Auth: HMAC-only (no Authorization header needed); the HMAC IS the
 *       proof of authority. Same pattern as `replay-token` + 
 *       `chat-history-token` — verifies the HMAC, asserts the session's
 *       `appointmentId` matches, and mints a short-TTL (15 min)
 *       patient-scoped Supabase JWT that can access the transcript
 *       download route.
 *
 * **15-min TTL** (not 90-day like chat-history): transcript download is
 * a one-shot click event — not a readonly-browse surface. A short TTL
 * shrinks the blast radius if the JWT is captured by a share-link leak
 * (patient pastes the PDF URL into a group chat, etc.). Patients who
 * want to re-download after 15 min re-exchange from the original HMAC.
 *
 * Returns: `{ accessToken, expiresAt }`.
 *
 * @see `exchangeChatHistoryTokenHandler` — parallel design.
 */
export const exchangeTranscriptTokenHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }

    const body = req.body as { hmacToken?: unknown; token?: unknown } | undefined;
    // Accept either `hmacToken` (Task 31 convention) or `token` (Task 29
    // convention) — the patient clients that already exist were built
    // against the Task 29 name. Taking both keeps the API palatable
    // without forcing a frontend bump.
    const rawToken = typeof body?.hmacToken === 'string'
      ? body.hmacToken
      : typeof body?.token === 'string'
        ? body.token
        : '';
    const hmacToken = rawToken.trim();
    if (!hmacToken) {
      throw new ValidationError('Body { hmacToken | token } is required');
    }

    const verified = verifyConsultationToken(hmacToken);

    const session = await findSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Consultation session not found');
    }
    if (session.appointmentId !== verified.appointmentId) {
      throw new UnauthorizedError('Token does not authorize this session');
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const minted = mintScopedConsultationJwt({
      sub:       buildPatientSub(session.appointmentId),
      role:      'patient',
      sessionId: session.id,
      expiresAt,
    });

    logger.info(
      { correlationId, sessionId },
      'transcript-token: minted patient-scoped 15-min JWT',
    );

    res.status(200).json(
      successResponse(
        {
          accessToken: minted.token,
          expiresAt:   minted.expiresAt.toISOString(),
        },
        req,
      ),
    );
  },
);

/**
 * GET /api/v1/consultation/:sessionId/transcript.pdf
 *
 * Auth: doctor (Supabase Auth) OR patient (scoped JWT from
 *       `transcript-token` exchange). `resolveReplayCaller` handles
 *       both paths — Task 32 reuses Task 29's resolver verbatim because
 *       the auth surface is identical.
 *
 * Behaviour: calls `renderConsultTranscriptPdf` which runs the policy
 * pipeline → cache check → compose-if-miss → upload → mint signed URL
 * → write audit → fire notification. On success, returns JSON
 * `{ signedUrl, expiresAt, cacheHit, filename }`. The frontend does
 * `window.location.assign(signedUrl)` to trigger the download.
 *
 * Why JSON instead of a 302 redirect: this route is Bearer-authed. A
 * browser-initiated navigation (which is how downloads trigger save-
 * to-disk) does NOT replay the `Authorization` header, so sending the
 * user through this endpoint via `location.assign(thisUrl)` would fail
 * 401. Returning the signed URL as JSON lets the frontend navigate
 * directly to Supabase Storage, which doesn't need the Bearer header
 * (the signed URL carries its own token).
 *
 * On denial, returns a JSON error body — the frontend renders a toast
 * / empty state from the machine-readable code.
 *
 * Rate limiting: intentionally not added in v1. The service itself
 * cache-fronts heavy renders, and the abuse surface is limited (only
 * session participants can reach the service). A follow-up can add a
 * per-IP limiter if we see cost pressure.
 */
export const downloadTranscriptPdfHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }

    const caller = await resolveReplayCaller(req, sessionId);

    try {
      const result = await renderConsultTranscriptPdf({
        sessionId,
        requestingUserId: caller.userId,
        requestingRole:   caller.role,
        correlationId,
      });
      res.status(200).json(
        successResponse(
          {
            signedUrl: result.signedUrl,
            expiresAt: result.expiresAt.toISOString(),
            cacheHit:  result.cacheHit,
            filename:  result.filename,
          },
          req,
        ),
      );
    } catch (err) {
      if (err instanceof TranscriptExportError) {
        const status = transcriptErrorStatus(err.code);
        res.status(status).json(
          errorResponse(
            { code: err.code, message: err.message, statusCode: status },
            req,
          ),
        );
        return;
      }
      throw err;
    }
  },
);

// ============================================================================
// Plan 08 · Task 41 — video-escalation HTTP surface
// ============================================================================

/**
 * POST /api/v1/consultation/:sessionId/video-escalation/request
 *
 * Doctor-only. Body: `{ presetReasonCode, reason }` (optional informational
 * `doctorId` — must match the bearer JWT if present). Returns
 * `{ requestId, expiresAt, correlationId, attemptsUsed }` on 200.
 *
 * Error mapping (driven by the AppError subclass thrown by the service;
 * the global error handler already maps `statusCode` for anything not
 * caught here):
 *   · `AlreadyRecordingVideoError` / `SessionNotActiveError` → 409
 *   · `MaxAttemptsReachedError` / `CooldownInProgressError` /
 *     `PendingRequestExistsError`                            → 429
 *
 * The 429 for `CooldownInProgressError` includes `availableAt` so the
 * doctor UI can skip the round-trip to GET /video-escalation-state
 * right after the error.
 */
export const requestVideoEscalationHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }

    const body = req.body as
      | {
          doctorId?:         unknown;
          presetReasonCode?: unknown;
          reason?:           unknown;
        }
      | undefined;
    const bodyDoctorId = typeof body?.doctorId === 'string' ? body.doctorId.trim() : '';
    if (bodyDoctorId && bodyDoctorId !== userId) {
      throw new ForbiddenError('doctorId in body does not match authenticated user');
    }
    const presetReasonCode = typeof body?.presetReasonCode === 'string'
      ? body.presetReasonCode.trim()
      : '';
    const reason = typeof body?.reason === 'string' ? body.reason : '';

    try {
      const result = await requestVideoEscalation({
        sessionId,
        doctorId:         userId,
        presetReasonCode: presetReasonCode as VideoEscalationPresetReason,
        reason,
        correlationId,
      });
      res.status(200).json(
        successResponse(
          {
            requestId:     result.requestId,
            expiresAt:     result.expiresAt,
            correlationId: result.correlationId,
            attemptsUsed:  result.attemptsUsed,
          },
          req,
        ),
      );
    } catch (err) {
      if (err instanceof CooldownInProgressError) {
        res.status(429).json(
          errorResponse(
            {
              code:       'CooldownInProgressError',
              message:    err.message,
              statusCode: 429,
            },
            req,
            { availableAt: err.availableAt },
          ),
        );
        return;
      }
      if (err instanceof MaxAttemptsReachedError) {
        res.status(429).json(
          errorResponse(
            { code: 'MaxAttemptsReachedError', message: err.message, statusCode: 429 },
            req,
          ),
        );
        return;
      }
      if (err instanceof PendingRequestExistsError) {
        res.status(429).json(
          errorResponse(
            { code: 'PendingRequestExistsError', message: err.message, statusCode: 429 },
            req,
          ),
        );
        return;
      }
      if (err instanceof AlreadyRecordingVideoError) {
        res.status(409).json(
          errorResponse(
            { code: 'AlreadyRecordingVideoError', message: err.message, statusCode: 409 },
            req,
          ),
        );
        return;
      }
      if (err instanceof SessionNotActiveError) {
        res.status(409).json(
          errorResponse(
            { code: 'SessionNotActiveError', message: err.message, statusCode: 409 },
            req,
          ),
        );
        return;
      }
      throw err;
    }
  },
);

/**
 * POST /api/v1/consultation/video-escalation-requests/:requestId/respond
 *
 * Patient-only. Body: `{ decision: 'allow' | 'decline' }`. Returns
 * `{ accepted, reason? }`. Uses the bearer JWT's `sub` as the patient
 * id; the service cross-checks against `session.patient_id` and
 * returns `{ accepted: false, reason: 'not_a_participant' }` on
 * mismatch.
 *
 * Always 200 — the response body's `accepted` field is the success
 * discriminator. The frontend uses this endpoint to collapse its own
 * modal state, not to make a product decision, so 200 with
 * `{ accepted: false, reason: 'already_timed_out' }` is more useful
 * than a 409 for error-surface simplicity.
 */
export const respondVideoEscalationHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const requestId = (req.params as { requestId?: string }).requestId?.trim();
    if (!requestId) {
      throw new ValidationError('requestId path param is required');
    }

    const body = req.body as { decision?: unknown } | undefined;
    const decisionRaw = typeof body?.decision === 'string' ? body.decision.trim() : '';
    if (decisionRaw !== 'allow' && decisionRaw !== 'decline') {
      throw new ValidationError('decision must be "allow" or "decline"');
    }

    const result = await patientResponseToEscalation({
      requestId,
      patientId: userId,
      decision:  decisionRaw,
      correlationId,
    });

    res.status(200).json(successResponse(result, req));
  },
);

/**
 * GET /api/v1/consultation/:sessionId/video-escalation-state
 *
 * Doctor OR patient participant. Returns derived state
 * `{ state, recent }`. Read-only — no audit side effects.
 */
export const getVideoEscalationStateHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }

    const { isParticipant } = await isSessionParticipant(sessionId, userId);
    if (!isParticipant) {
      throw new ForbiddenError('Not authorized to read this session');
    }

    const { state, recent } = await getVideoEscalationStateForSession({ sessionId });
    res.status(200).json(successResponse({ state, recent }, req));
  },
);

// Keep the request-level RBAC helper addressable for a future tightening
// pass (e.g. deriving sessionId from requestId without a second lookup).
// v1's respond-handler uses the service's internal `patientId` check.
void isSessionParticipantForRequest;

/**
 * POST /api/v1/consultation/:sessionId/video-escalation/revoke
 *
 * Plan 08 · Task 42 · Decision 10 LOCKED — patient-initiated revoke of
 * an in-flight video recording. Patient-only — the service re-checks
 * `session.patient_id` against the bearer JWT.sub even though the
 * standard `authenticateToken` middleware already validated the token.
 *
 * Body: empty (no input required — the session + bearer JWT are
 * enough to locate the active allow row). Returns:
 *   `{ correlationId, status: 'revoked' | 'already_audio_only' }`.
 *
 * Error shapes:
 *   · 401 — bearer token missing / invalid (handled by middleware).
 *   · 403 — caller is not the session patient (`ForbiddenError` from
 *     the service).
 *   · 404 — session id doesn't resolve.
 *   · 5xx — Twilio rule-flip failed (per task-42 Option A: the audit
 *     row is NOT stamped; UI shows "Couldn't stop recording. Try
 *     again.").
 *
 * Why always 200 on both `revoked` and `already_audio_only`: the patient
 * tapping revoke when the recording is already audio-only is a UI
 * correctness concern, not an error. The idempotent shape lets the
 * modal close cleanly on either branch without a second round-trip.
 */
export const patientRevokeVideoHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const correlationId = req.correlationId || 'unknown';
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
    if (!sessionId) {
      throw new ValidationError('sessionId path param is required');
    }

    const result = await patientRevokeVideoMidCall({
      sessionId,
      patientId: userId,
      correlationId,
    });

    res.status(200).json(
      successResponse(
        {
          correlationId: result.correlationId,
          status:        result.status,
        },
        req,
      ),
    );
  },
);
