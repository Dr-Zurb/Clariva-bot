/**
 * Text Session — Supabase Realtime Adapter (Plan 04 · Task 18)
 *
 * Concrete `ConsultationSessionAdapter` for the text modality. Pairs with
 * Task 17's `consultation_messages` table + Task 18's RLS extension
 * (migration 052) and Task 21's DM copy text branch.
 *
 * Adapter responsibilities (per the modality-blind contract):
 *
 *   - `createSession`: provision the provider-side resource. For Supabase
 *     Realtime, channels are virtual — there's no remote room to create.
 *     We return a stable `providerSessionId = 'text:{appointmentId}'` so
 *     ops queries (`SELECT * FROM consultation_sessions WHERE provider =
 *     'supabase_realtime' AND provider_session_id = ...`) work and so the
 *     facade's existing `findSessionByProviderSessionId` lookup stays
 *     useful for future webhook-style flows.
 *
 *   - `endSession`: also a no-op on the provider side (no Twilio-style
 *     `room.complete()`). The facade flips the row's status to `'ended'`
 *     which is what triggers the live-only RLS lockout (Decision 5
 *     LOCKED) — at that point Realtime subscribers stay connected but
 *     INSERT attempts get rejected by `consultation_messages_insert_live_participants`.
 *
 *   - `getJoinToken`: mints a Supabase JWT scoped to the session via the
 *     custom claims `consult_role` + `session_id` (verified by the patient
 *     branch of the migration-052 RLS). Returns the full patient-facing
 *     URL because the route shape (`/c/text/{sessionId}?token=...`)
 *     embeds the session id in the path.
 *
 * Plus a `sendMessage` helper for backend-initiated inserts (system
 * messages in Plan 06, prescription delivery posts in Plan 04 chat-end
 * flow). Uses the service-role admin client which bypasses RLS — so this
 * is the ONLY path that can write to an `'ended'` session, and only when
 * the caller passes `allowEnded: true`.
 *
 * **No PHI in logs.** Body content stays on the wire to Supabase only.
 *
 * @see migrations/051_consultation_messages.sql
 * @see migrations/052_consultation_messages_patient_jwt_rls.sql
 * @see services/consultation-session-service.ts
 * @see services/supabase-jwt-mint.ts
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { InternalError, NotFoundError, ValidationError } from '../utils/errors';
import { generateConsultationToken } from '../utils/consultation-token';
import {
  buildPatientSub,
  mintScopedConsultationJwt,
} from './supabase-jwt-mint';
import { emitPartyJoined } from './consultation-message-service';
import type {
  AdapterCreateResult,
  AdapterGetJoinTokenInput,
  ConsultationSessionAdapter,
  CreateSessionInput,
  JoinToken,
  Modality,
  Provider,
} from '../types/consultation-session';

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Stable provider-session-id convention for text. Uses `appointmentId` so
 * the value is known at adapter `createSession` time (the row UUID isn't —
 * the facade hasn't inserted yet). One downside: a mid-consult modality
 * switch (Plan 09) that creates a fresh session for the same appointment
 * would collide on this value. The `consultation_sessions` table doesn't
 * have a uniqueness constraint on `(provider, provider_session_id)`, so
 * collisions are silent rows. Document for Plan 09.
 */
function buildTextProviderSessionId(appointmentId: string): string {
  return `text:${appointmentId}`;
}

/**
 * Patient-facing join URL. Returns `undefined` when `APP_BASE_URL` is
 * unset OR when the HMAC consultation-token can't be minted (missing
 * `CONSULTATION_TOKEN_SECRET`) — the fan-out helper logs and skips the
 * CTA gracefully rather than emitting a broken link.
 *
 * The URL carries an HMAC consultation-token (24h expiry, payload
 * `{ appointmentId, role: 'patient' }`) — NOT the Supabase JWT. Same
 * pattern the existing video flow uses (`generateConsultationToken`).
 * Rationale: JWTs in URLs leak via referrers / server logs / link
 * previews. The patient frontend exchanges the HMAC token for a
 * scoped Supabase JWT via `POST /api/v1/consultation/:sessionId/text-token`
 * on page load — JWT only ever lives in memory.
 */
function buildPatientJoinUrl(
  sessionId: string,
  appointmentId: string,
  correlationId: string,
): string | undefined {
  const base = env.APP_BASE_URL?.trim();
  if (!base) return undefined;
  let consultationToken: string;
  try {
    consultationToken = generateConsultationToken(appointmentId);
  } catch (err) {
    logger.warn(
      {
        correlationId,
        sessionId,
        appointmentId,
        error: err instanceof Error ? err.message : String(err),
      },
      'text-session-supabase: HMAC consultation-token mint failed (CONSULTATION_TOKEN_SECRET missing?)',
    );
    return undefined;
  }
  return `${base.replace(/\/$/, '')}/c/text/${sessionId}?t=${consultationToken}`;
}

/**
 * Compute the JWT expiry — `expected_end_at` + the env-configurable
 * post-end buffer. The buffer covers slot overrun + a brief read-only
 * window for the patient to glance at the final transcript before the
 * token dies. Capped to 240 min in env.ts so misconfig can't issue
 * multi-hour bearer tokens.
 */
function computeJwtExpiresAt(expectedEndAt: Date): Date {
  const bufferMs = env.TEXT_CONSULT_JWT_TTL_MINUTES_AFTER_END * 60 * 1000;
  return new Date(expectedEndAt.getTime() + bufferMs);
}

/**
 * Look up the session row for the JWT mint. Returns the bits we need
 * (id, doctor, expected end, status). The adapter doesn't need a full
 * `SessionRecord` here — that's facade-layer concern.
 */
async function loadSessionRowForJoinToken(sessionId: string): Promise<{
  id: string;
  doctor_id: string;
  appointment_id: string;
  patient_id: string | null;
  expected_end_at: string;
  status: string;
} | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from('consultation_sessions')
    .select('id, doctor_id, appointment_id, patient_id, expected_end_at, status')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) {
    logger.warn(
      { sessionId, error: error.message },
      'text-session-supabase: session lookup failed',
    );
    return null;
  }
  return data ?? null;
}

// ============================================================================
// Adapter implementation
// ============================================================================

async function createTextSession(
  input: CreateSessionInput,
  correlationId: string,
): Promise<AdapterCreateResult> {
  // Supabase Realtime channels are virtual — nothing to provision on the
  // provider side. We just return a stable provider session id so the
  // facade's `findSessionByProviderSessionId` lookup works and ops queries
  // can pivot on `(provider, provider_session_id)`.
  logger.info(
    {
      correlationId,
      appointmentId: input.appointmentId,
      doctorId: input.doctorId,
      modality: input.modality,
    },
    'text-session-supabase: createSession (no provider-side work)',
  );
  return { providerSessionId: buildTextProviderSessionId(input.appointmentId) };
}

async function endTextSession(
  providerSessionId: string,
  correlationId: string,
): Promise<void> {
  // No remote room to tear down. The facade's status flip to `'ended'` is
  // what triggers RLS lockout on `consultation_messages` writes (Decision
  // 5 live-only). Realtime subscribers stay connected (so they can read
  // any final messages the doctor posts in flight) until they disconnect
  // naturally; no proactive disconnect.
  logger.info(
    { correlationId, providerSessionId },
    'text-session-supabase: endSession (no provider-side work)',
  );
}

async function getTextJoinToken(
  input: AdapterGetJoinTokenInput,
  correlationId: string,
): Promise<JoinToken> {
  if (!input.sessionId) {
    throw new InternalError(
      'text-session-supabase: getJoinToken requires sessionId. ' +
        'The facade populates this from the consultation_sessions row; ' +
        'getJoinTokenForAppointment cannot be used for text without a ' +
        'persisted session (text has no legacy single-room appointment path).',
    );
  }

  const session = await loadSessionRowForJoinToken(input.sessionId);
  if (!session) {
    throw new NotFoundError('Consultation session not found');
  }

  // Defense-in-depth: the facade already filters terminal statuses via
  // `findActiveSessionByAppointment`, but the lazy-write bridge could
  // surface an ended row here.
  if (session.status === 'ended' || session.status === 'cancelled') {
    throw new ValidationError(
      'Cannot mint join token for ended/cancelled session',
    );
  }

  // Verify the caller's role matches the session row. For doctor, we
  // check `auth.users.id == doctor_id`. For patient, the facade caller
  // (controller / fan-out) has already authenticated the patient via the
  // booking-token exchange — we just trust the role here.
  if (input.role === 'doctor' && session.doctor_id !== input.doctorId) {
    throw new ValidationError(
      'Doctor identity mismatch — refusing to mint cross-doctor token',
    );
  }

  const sub =
    input.role === 'doctor'
      ? input.doctorId
      : buildPatientSub(session.appointment_id);

  const expiresAt = computeJwtExpiresAt(new Date(session.expected_end_at));

  const minted = mintScopedConsultationJwt({
    sub,
    role: input.role,
    sessionId: session.id,
    expiresAt,
  });

  // Only patients get a join URL — doctors are already authenticated on
  // the dashboard and use their existing Supabase auth session for RLS;
  // they get the sessionId from the `start-text` endpoint and mount
  // `<TextConsultRoom>` in-place.
  const url =
    input.role === 'patient'
      ? buildPatientJoinUrl(session.id, session.appointment_id, correlationId)
      : undefined;

  logger.info(
    {
      correlationId,
      sessionId: session.id,
      role: input.role,
      expiresAt: minted.expiresAt.toISOString(),
      hasUrl: !!url,
    },
    'text-session-supabase: getJoinToken minted',
  );

  // Plan 06 · Task 37: fire a companion-chat "party joined" banner.
  // Token-mint is the canonical join signal for text (no Twilio-style
  // `participantConnected` webhook exists here). Fire-and-forget — the
  // helper swallows all errors, and the 60 s in-process dedup collapses
  // rapid retries / page refreshes into one banner per role.
  void emitPartyJoined(session.id, input.role);

  return {
    token: minted.token,
    expiresAt: minted.expiresAt,
    url,
  };
}

export const textSessionSupabaseAdapter: ConsultationSessionAdapter = {
  modality: 'text' satisfies Modality,
  provider: 'supabase_realtime' satisfies Provider,
  createSession: createTextSession,
  endSession: endTextSession,
  getJoinToken: getTextJoinToken,
};

// ============================================================================
// Companion channel provisioning (Plan 06 · Task 36 · Decision 9 LOCKED)
// ============================================================================

/**
 * Input shape for `provisionCompanionChannel`.
 *
 * Mirrors the subset of `CreateSessionInput` the helper actually needs +
 * the persisted `sessionId` from the facade. Kept as a dedicated interface
 * (rather than reusing `CreateSessionInput`) so a future caller that wants
 * to provision a companion channel WITHOUT the full create-session
 * scaffolding (e.g. a one-shot backfill job from Notes #2) has a minimal
 * contract to satisfy.
 */
export interface ProvisionCompanionChannelInput {
  /** `consultation_sessions.id` — already persisted by the facade. */
  sessionId: string;
  doctorId: string;
  /**
   * Nullable. When null the helper still runs (and returns a non-null
   * `expiresAt` so callers can prove the code-path ran), but
   * `patientJoinUrl` + `patientToken` collapse to null — there's no
   * patient to route a link to. Mirrors the `CreateSessionInput.patientId`
   * contract for guest bookings that don't have a `patients` row.
   */
  patientId: string | null;
  appointmentId: string;
  correlationId: string;
}

/**
 * Return shape for `provisionCompanionChannel`.
 *
 * Surfaces as `SessionRecord.companion` on the facade's `createSession`
 * return and as the new `companion` field on the `POST /start` / `POST
 * /start-voice` HTTP response shape (Task 36).
 */
export interface ProvisionCompanionChannelResult {
  /**
   * Echoes `input.sessionId` — surfaced so the facade can attach it to
   * `SessionRecord.companion` without re-threading its own row id. Task 38's
   * `<VideoRoom>` companion panel uses this to key its chat Realtime
   * subscription (doctor-side dashboard auth → no HMAC URL to parse).
   */
  sessionId: string;
  patientJoinUrl: string | null;
  patientToken: string | null;
  expiresAt: string;
}

/**
 * Provision a companion text channel for a voice or video session.
 *
 * The channel itself is virtual — Supabase Realtime channels are
 * topic-based subscriptions, not persisted resources. This helper's job
 * is purely to mint the patient-facing HMAC consultation-token + assemble
 * the patient join URL so `<ConsultationLauncher>` (doctor side) and the
 * consult-ready fan-out (patient side) can hand off to `<TextConsultRoom>`
 * later when Tasks 38 + 24c mount it inside the room.
 *
 * Idempotent — multiple calls for the same session return functionally-
 * equivalent shapes (URL path stable; the embedded HMAC token rotates
 * each second because the HMAC's payload carries an `exp` — both tokens
 * verify cleanly via `verifyConsultationToken`).
 *
 * Decision 9 LOCKED: chat is a free affordance, billed only as the booked
 * modality — this helper does NOT touch payments / Razorpay /
 * `appointment.amount`. Pure provisioning.
 *
 * **Trade-off / note:** the JWT TTL surfaced on `expiresAt` is the text
 * adapter's Supabase-JWT TTL (`expected_end_at + TEXT_CONSULT_JWT_TTL_MINUTES_AFTER_END`).
 * The HMAC consultation-token embedded in the URL carries its OWN 24h
 * expiry (see `generateConsultationToken`) — they are two separate
 * tokens with two separate TTLs. Callers that need the HMAC expiry
 * specifically should re-mint or parse the URL's `?t=` payload.
 *
 * **Security note — doctor-side vs patient-side:** this helper only
 * mints a *patient-scoped* URL + HMAC. The doctor does not need a
 * companion-channel JWT — they re-use their existing dashboard auth
 * session which already passes the `consultation_messages` doctor-branch
 * RLS (migration 051's `auth.uid() = doctor_id` predicate). So a
 * doctor-side call still goes through `provisionCompanionChannel` at
 * create-time; the output is what the doctor shares with the patient,
 * not what the doctor themselves uses.
 *
 * **Non-persistence:** this helper writes NOTHING. The existence of the
 * `consultation_sessions` row (already persisted by the facade before
 * this helper runs) + its modality are sufficient for the frontend to
 * know whether to mount `<TextConsultRoom>` (Tasks 38 + 24c read
 * `session.modality !== 'text'` to decide).
 *
 * @returns
 *   - `{ patientJoinUrl, patientToken, expiresAt }` on success (URL + token
 *     may be null when `APP_BASE_URL` is unset or when the HMAC helper
 *     can't mint).
 *   - `null` on defensive short-circuit (session not found, modality-
 *     unknown guard). The facade's caller treats both `null` and a thrown
 *     error identically: log + omit the `companion` field from the
 *     returned `SessionRecord`.
 */
export async function provisionCompanionChannel(
  input: ProvisionCompanionChannelInput,
): Promise<ProvisionCompanionChannelResult | null> {
  const sessionId = input.sessionId?.trim();
  if (!sessionId) {
    logger.warn(
      { correlationId: input.correlationId },
      'text-session-supabase.provisionCompanionChannel: sessionId missing — short-circuiting',
    );
    return null;
  }

  // Reuse the existing loader — shares the single-query surface with
  // `getJoinToken` so any future schema widening (e.g. a
  // `companion_enabled` column) only has to touch one function.
  const session = await loadSessionRowForJoinToken(sessionId);
  if (!session) {
    logger.warn(
      { correlationId: input.correlationId, sessionId },
      'text-session-supabase.provisionCompanionChannel: session row not found',
    );
    return null;
  }

  const expiresAt = computeJwtExpiresAt(new Date(session.expected_end_at));

  // No patient row → no patient-facing URL to compose. Return the partial
  // shape so callers can still prove the helper ran (the `expiresAt`
  // field is non-null). This matches guest-booking appointments that
  // don't have a linked `patients` row.
  if (!input.patientId) {
    logger.info(
      {
        correlationId: input.correlationId,
        sessionId,
        modality: '(provisioned-from-companion-hook)',
        patientId: null,
      },
      'text-session-supabase.provisionCompanionChannel: patientId=null — returning URL-less shape',
    );
    return {
      sessionId,
      patientJoinUrl: null,
      patientToken: null,
      expiresAt: expiresAt.toISOString(),
    };
  }

  // Mint the HMAC consultation-token (what goes into the URL as `?t=`).
  // We explicitly do NOT use `buildPatientJoinUrl` here because it
  // swallows the mint failure and returns `undefined` without surfacing
  // the token — we need the token as a separate return field.
  let patientToken: string | null = null;
  try {
    patientToken = generateConsultationToken(input.appointmentId);
  } catch (err) {
    logger.warn(
      {
        correlationId: input.correlationId,
        sessionId,
        appointmentId: input.appointmentId,
        error: err instanceof Error ? err.message : String(err),
      },
      'text-session-supabase.provisionCompanionChannel: HMAC consultation-token mint failed (CONSULTATION_TOKEN_SECRET missing?) — returning URL-less shape',
    );
    return {
      sessionId,
      patientJoinUrl: null,
      patientToken: null,
      expiresAt: expiresAt.toISOString(),
    };
  }

  const base = env.APP_BASE_URL?.trim();
  const patientJoinUrl = base
    ? `${base.replace(/\/$/, '')}/c/text/${session.id}?t=${patientToken}`
    : null;

  logger.info(
    {
      correlationId: input.correlationId,
      sessionId,
      modality: '(provisioned-from-companion-hook)',
      patientId: input.patientId,
      hasUrl: !!patientJoinUrl,
      expiresAt: expiresAt.toISOString(),
    },
    'text-session-supabase.provisionCompanionChannel: minted HMAC consultation-token',
  );

  return {
    sessionId,
    patientJoinUrl,
    patientToken,
    expiresAt: expiresAt.toISOString(),
  };
}

// ============================================================================
// sendMessage — backend-initiated inserts (Plan 04 chat-end + Plan 06)
// ============================================================================

export interface SendMessageInput {
  sessionId: string;
  /**
   * Sender UUID — for doctor: their `auth.users.id`. For patient: the
   * appointment's `patient_id` (or a synthetic UUID; backend-initiated
   * sends in v1 are always doctor / system).
   *
   * For `senderRole === 'system'`, callers MUST use the shared
   * `SYSTEM_SENDER_ID` constant exported below (Task 39 Notes #5) so
   * filtering "what did Dr. Sharma send?" can safely exclude system rows
   * via `sender_role != 'system'` without string-matching on `sender_id`.
   */
  senderId: string;
  senderRole: 'doctor' | 'patient' | 'system';
  body: string;
  correlationId: string;
  /**
   * When `true`, the helper accepts an `'ended'` session — used by Plan
   * 04's chat-end flow to post the prescription message *just before* the
   * session flips to ended (race-safe). Default `false` for safety.
   */
  allowEnded?: boolean;
  /**
   * System-event tag — REQUIRED when `senderRole === 'system'`, REJECTED
   * otherwise. Typed as plain `string` in Task 39; Task 37 will narrow
   * this to the canonical `SystemEvent` union (e.g. `'consult_started'`,
   * `'party_joined'`, `'recording_paused'`, `'modality_switched'`). The
   * DB-side `system_event` column is TEXT by design — see Migration 062
   * head comment and Task 39 Notes #4 for the rationale (Plans 07/08/09
   * want to add tags without coordinating `ALTER TYPE` ordering).
   *
   * The application-layer guard below mirrors Migration 062's row-shape
   * CHECK so callers get a readable ValidationError before the insert
   * hits the DB.
   */
  systemEvent?: string;
}

export interface SendMessageResult {
  id: string;
  createdAt: string;
}

/**
 * Synthetic sender id for system rows. Canonical home is
 * `consultation-message-service.ts` (Task 37 / Plan 06); re-exported
 * here for backward compatibility with pre-Task-37 callers (the Task
 * 39 test suite imports from this module).
 */
export { SYSTEM_SENDER_ID } from './consultation-message-service';

/**
 * Insert a message into `consultation_messages` using the service-role
 * client (bypasses RLS). Validates that the session exists and is in a
 * permitted status, and that the per-kind required-fields contract
 * holds (mirrors Migration 062's row-shape CHECK with a friendlier
 * error message).
 *
 * Kind-inference:
 *   - `senderRole === 'system'` → `kind = 'system'`, `system_event` must
 *     be set (ValidationError if missing).
 *   - All other roles → `kind = 'text'`, `system_event` MUST NOT be set.
 *
 * Attachment rows (`kind = 'attachment'`) are NOT writable via this
 * helper — they go through a dedicated `sendAttachment` path that owns
 * the Storage upload + metadata insert. Task 37 / a follow-up owns that
 * helper; shipping it alongside the schema would overload Task 39.
 */
export async function sendMessage(
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const sessionId = input.sessionId?.trim();
  const senderId = input.senderId?.trim();
  const body = input.body?.trim();
  if (!sessionId) throw new ValidationError('sendMessage: sessionId is required');
  if (!senderId) throw new ValidationError('sendMessage: senderId is required');
  if (!body) throw new ValidationError('sendMessage: body is required');

  const systemEvent = input.systemEvent?.trim();
  const isSystem = input.senderRole === 'system';

  // Mirror Migration 062's row-shape CHECK at the application layer —
  // produce a clear error before the DB sees the row. The DB-layer CHECK
  // remains defense-in-depth for any future caller that routes around
  // this helper.
  if (isSystem && !systemEvent) {
    throw new ValidationError(
      "sendMessage: systemEvent is required when senderRole='system' " +
        "(row-shape CHECK in migration 062 enforces the same invariant). " +
        "Pass a canonical tag like 'consult_started' or 'modality_switched'.",
    );
  }
  if (!isSystem && systemEvent) {
    throw new ValidationError(
      "sendMessage: systemEvent may only be set when senderRole='system' " +
        "(non-system rows render as text bubbles and the DB row-shape " +
        "CHECK rejects system_event on kind='text').",
    );
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('sendMessage: Supabase admin client unavailable');
  }

  // Verify the session exists and is in an allowed status. The DB-layer
  // RLS would reject (for non-admin clients), but we use service-role here
  // so we have to enforce in code.
  const { data: session, error: sessionError } = await admin
    .from('consultation_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    throw new NotFoundError('Consultation session not found');
  }
  if (session.status === 'ended' || session.status === 'cancelled') {
    if (!input.allowEnded) {
      throw new ValidationError(
        `sendMessage: session status='${session.status}' rejects writes ` +
          `(pass allowEnded=true to bypass — only for Plan 04 chat-end flow)`,
      );
    }
  }

  const insertRow: Record<string, unknown> = {
    session_id: sessionId,
    sender_id: senderId,
    sender_role: input.senderRole,
    kind: isSystem ? 'system' : 'text',
    body,
  };
  if (isSystem) {
    insertRow.system_event = systemEvent;
  }

  const { data, error } = await admin
    .from('consultation_messages')
    .insert(insertRow)
    .select('id, created_at')
    .single();

  if (error || !data) {
    logger.warn(
      {
        correlationId: input.correlationId,
        sessionId,
        senderRole: input.senderRole,
        systemEvent: isSystem ? systemEvent : undefined,
        error: error?.message,
      },
      'sendMessage: consultation_messages insert failed',
    );
    throw new InternalError(
      `sendMessage: insert failed: ${error?.message ?? 'no row returned'}`,
    );
  }

  logger.info(
    {
      correlationId: input.correlationId,
      sessionId,
      senderRole: input.senderRole,
      systemEvent: isSystem ? systemEvent : undefined,
      messageId: data.id,
    },
    'sendMessage: consultation_messages row inserted',
  );

  return {
    id: data.id as string,
    createdAt: data.created_at as string,
  };
}
