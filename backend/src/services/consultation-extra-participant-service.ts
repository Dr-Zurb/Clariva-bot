/**
 * Consultation Extra Participant Service (Sub-batch C · task-video-C8)
 *
 * Owns the lifecycle of "third party in the call" — interpreters,
 * family members, specialists pulled in mid-call. Backed by the
 * `consultation_extra_participants` table from Migration 085.
 *
 * Public API:
 *   1. `createInvite`               — doctor-only; mints an opaque
 *                                     token, INSERTs the row, returns
 *                                     `{ participantId, inviteToken,
 *                                       inviteUrl }` for the doctor's
 *                                     panel to copy / SMS.
 *
 *   2. `exchangeInviteToken`        — public (no JWT); the third
 *                                     party hits this from the invite
 *                                     URL. Looks up the row by
 *                                     `invite_token`, gates on
 *                                     revocation + single-shot, stamps
 *                                     `joined_at`, mints a Supabase
 *                                     JWT (`consult_role:
 *                                     'extra_participant'`) + a
 *                                     Twilio access token tied to the
 *                                     same room SID, and emits the
 *                                     `participant_joined` banner.
 *
 *   3. `revokeInvite`               — doctor-only; sets `revoked_at`
 *                                     (and `left_at` if the third
 *                                     party had joined). Emits
 *                                     `participant_left` if a join
 *                                     happened.
 *
 *   4. `listInvitesForSession`      — doctor-only; returns the panel's
 *                                     "who's in the room" list.
 *
 *   5. `recordParticipantLeft`      — extra-participant-frontend hook
 *                                     (Phase 2 will wire this from
 *                                     `<VideoRoom>`'s leave path).
 *                                     Idempotent — first call wins.
 *
 * Gate-ordering doctrine (locked by snapshot-storage-service / C6):
 *   1. Validate path-params + body BEFORE any DB / auth round-trip.
 *   2. Doctor JWT verification BEFORE any side-effect.
 *   3. Side-effect (INSERT / UPDATE) → emit banner LAST.
 *
 * **No PHI in logs.** Display name / role label NEVER leak; only
 * ids and `kind` flow through.
 *
 * @see backend/migrations/085_consultation_extra_participants.sql
 * @see backend/src/services/supabase-jwt-mint.ts (mintScopedConsultationJwt + buildExtraParticipantSub)
 * @see backend/src/services/video-session-twilio.ts (generateVideoAccessToken)
 * @see backend/src/services/consultation-message-service.ts (emitParticipantJoined / emitParticipantLeft)
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors';
import {
  emitParticipantJoined,
  emitParticipantLeft,
} from './consultation-message-service';
import {
  buildExtraParticipantSub,
  mintScopedConsultationJwt,
} from './supabase-jwt-mint';
import { generateVideoAccessToken } from './video-session-twilio';

// ============================================================================
// Constants
// ============================================================================

/** Same UUID regex used by snapshot-storage-service / C6 quick-actions. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Hard caps mirror the CHECK constraints in Migration 085 §1. */
const MAX_DISPLAY_NAME_LEN = 80;
const MAX_ROLE_LABEL_LEN = 64;

/**
 * Extra-participant JWT TTL after `joined_at`. Long enough that
 * legitimate reconnects (page refresh, transient WebRTC drop) just
 * work; short enough that a leaked invite-page tab can't be used
 * indefinitely.
 *
 * Decision §16 (per-call invite link): the link itself is single-shot
 * (we reject re-exchange after `joined_at` is set), but the JWT
 * issued by that exchange survives short outages. Doctor must
 * re-invite if the third party clears cookies or takes longer than
 * this TTL.
 */
const EXTRA_PARTICIPANT_JWT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/** Token entropy: 192 bits → 32-char base64url string. */
const INVITE_TOKEN_BYTES = 24;

// ============================================================================
// Public input / output shapes
// ============================================================================

export interface CreateInviteOptions {
  /** Path-param `consultation_sessions.id`. */
  sessionId: string;
  /** Doctor JWT from the `Authorization` header. */
  bearerJwt: string;
  /** Display name as shown to all parties (e.g. "Maria"). Trimmed; required. */
  displayName: string;
  /** Optional role label ("interpreter", "family member"). Trimmed; max 64 chars. */
  roleLabel?: string | null;
  /** Required correlation id for log fan-out. */
  correlationId: string;
}

export interface CreateInviteResult {
  participantId: string;
  inviteToken: string;
  /** Fully-qualified invite URL (or token-only when `APP_BASE_URL` isn't configured). */
  inviteUrl: string | null;
  invitedAt: string;
}

export interface ExchangeInviteOptions {
  inviteToken: string;
  correlationId: string;
}

export interface ExchangeInviteResult {
  participantId: string;
  sessionId: string;
  displayName: string;
  roleLabel: string | null;
  joinedAt: string;
  /** Supabase JWT for chat / RLS (consult_role='extra_participant'). */
  jwt: string;
  jwtExpiresAt: string;
  /** Twilio Video access token tied to the same room as doctor + patient. May be null when Twilio isn't configured (dev). */
  twilioToken: string | null;
  /** The Twilio room name / SID the extra participant should `connect()` to. */
  roomName: string | null;
}

export interface RevokeInviteOptions {
  sessionId: string;
  bearerJwt: string;
  participantId: string;
  correlationId: string;
}

export interface RevokeInviteResult {
  participantId: string;
  revokedAt: string;
  /** True when this revoke also stamped `left_at` (because the third party had joined). */
  leftStamped: boolean;
}

export interface ListInvitesOptions {
  sessionId: string;
  bearerJwt: string;
  correlationId: string;
}

export interface InviteRow {
  id: string;
  displayName: string;
  roleLabel: string | null;
  invitedAt: string;
  joinedAt: string | null;
  leftAt: string | null;
  revokedAt: string | null;
  /**
   * Convenience boolean computed server-side so the doctor's panel
   * doesn't have to re-derive it: true when `joined_at IS NOT NULL
   * AND left_at IS NULL AND revoked_at IS NULL`.
   */
  active: boolean;
}

export interface RecordLeftOptions {
  /** Extra-participant JWT from the leaver's session. */
  bearerJwt: string;
  correlationId: string;
}

export interface RecordLeftResult {
  participantId: string;
  leftAt: string;
  /** True if THIS call performed the stamp (false on idempotent re-call). */
  newlyStamped: boolean;
}

// ============================================================================
// Pure validation helpers (exported for unit-test reuse).
// ============================================================================

/**
 * Trim + sanity-check the create-invite payload. Throws
 * `ValidationError` on any malformed input. Mirrors the CHECK
 * constraints in Migration 085 §1 so the DB never sees a value the
 * service would have rejected anyway.
 */
export function validateCreateInviteInput(raw: unknown): {
  displayName: string;
  roleLabel: string | null;
} {
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError('Request body must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const displayNameRaw = obj.displayName;
  if (typeof displayNameRaw !== 'string') {
    throw new ValidationError(
      'Field `displayName` is required and must be a string',
    );
  }
  const displayName = displayNameRaw.trim();
  if (displayName.length === 0) {
    throw new ValidationError('Field `displayName` must not be empty');
  }
  if (displayName.length > MAX_DISPLAY_NAME_LEN) {
    throw new ValidationError(
      `Field \`displayName\` must be at most ${MAX_DISPLAY_NAME_LEN} chars`,
    );
  }

  let roleLabel: string | null = null;
  if (obj.roleLabel !== undefined && obj.roleLabel !== null) {
    if (typeof obj.roleLabel !== 'string') {
      throw new ValidationError('Field `roleLabel` must be a string when present');
    }
    const trimmed = obj.roleLabel.trim();
    if (trimmed.length > 0) {
      if (trimmed.length > MAX_ROLE_LABEL_LEN) {
        throw new ValidationError(
          `Field \`roleLabel\` must be at most ${MAX_ROLE_LABEL_LEN} chars`,
        );
      }
      roleLabel = trimmed;
    }
  }

  return { displayName, roleLabel };
}

// ============================================================================
// Doctor-only auth gate (factored for test reuse).
//
// Mirrors `consultation-quick-actions-service.ts#resolveDoctorCallerForSession`
// — patient JWTs are hard-rejected; the caller's user id from
// supabase admin.auth.getUser MUST equal the session's doctor_id.
// ============================================================================

interface ResolvedDoctorCaller {
  doctorId: string;
}

async function resolveDoctorCallerForSession(
  sessionId: string,
  bearerJwt: string,
): Promise<ResolvedDoctorCaller> {
  const decodedComplete = jwt.decode(bearerJwt, { complete: true });
  if (!decodedComplete || typeof decodedComplete === 'string') {
    throw new UnauthorizedError('Malformed bearer token');
  }
  const decoded = decodedComplete.payload as jwt.JwtPayload;
  const consultRole =
    typeof decoded.consult_role === 'string' ? decoded.consult_role : undefined;

  if (consultRole === 'patient' || consultRole === 'extra_participant') {
    throw new ForbiddenError(
      'Only the consult doctor can manage extra-participant invites',
    );
  }

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

  const { data: sessionRow, error: sessionErr } = await admin
    .from('consultation_sessions')
    .select('id, doctor_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionErr) {
    throw new InternalError(`Session lookup failed: ${sessionErr.message}`);
  }
  if (!sessionRow) {
    throw new NotFoundError('Consultation session not found');
  }
  if ((sessionRow as { doctor_id?: string }).doctor_id !== doctorId) {
    throw new UnauthorizedError('Doctor identity mismatch for this session');
  }

  return { doctorId };
}

// ============================================================================
// Internal helpers
// ============================================================================

interface ExtraParticipantRow {
  id: string;
  session_id: string;
  invite_token: string;
  display_name: string;
  role_label: string | null;
  invited_by: string;
  invited_at: string;
  joined_at: string | null;
  left_at: string | null;
  revoked_at: string | null;
}

/** Map a DB row to the public `InviteRow` shape. */
function toInviteRow(row: ExtraParticipantRow): InviteRow {
  return {
    id: row.id,
    displayName: row.display_name,
    roleLabel: row.role_label,
    invitedAt: row.invited_at,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    revokedAt: row.revoked_at,
    active:
      row.joined_at !== null && row.left_at === null && row.revoked_at === null,
  };
}

/** Build the `/c/video-invite/{token}` URL, or null when `APP_BASE_URL` isn't configured. */
function buildInviteUrl(inviteToken: string): string | null {
  const base = env.APP_BASE_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/c/video-invite/${inviteToken}`;
}

/** Decode an extra-participant JWT to its `extra_participant_id` claim, validating shape. */
function decodeExtraParticipantClaims(bearerJwt: string): {
  participantId: string;
  sessionId: string;
} {
  const decodedComplete = jwt.decode(bearerJwt, { complete: true });
  if (!decodedComplete || typeof decodedComplete === 'string') {
    throw new UnauthorizedError('Malformed extra-participant token');
  }
  const decoded = decodedComplete.payload as jwt.JwtPayload;
  if (decoded.consult_role !== 'extra_participant') {
    throw new ForbiddenError('Token is not an extra-participant token');
  }
  const participantId =
    typeof decoded.extra_participant_id === 'string'
      ? decoded.extra_participant_id
      : undefined;
  const sessionId =
    typeof decoded.session_id === 'string' ? decoded.session_id : undefined;
  if (!participantId || !UUID_REGEX.test(participantId)) {
    throw new UnauthorizedError(
      'Extra-participant token missing valid extra_participant_id',
    );
  }
  if (!sessionId || !UUID_REGEX.test(sessionId)) {
    throw new UnauthorizedError(
      'Extra-participant token missing valid session_id',
    );
  }
  return { participantId, sessionId };
}

// ============================================================================
// Public API — createInvite
// ============================================================================

export async function createInvite(
  options: CreateInviteOptions,
): Promise<CreateInviteResult> {
  const { sessionId, bearerJwt, correlationId } = options;

  // Path-param sanity (gate 1).
  if (!UUID_REGEX.test(sessionId)) {
    throw new ValidationError('sessionId must be a UUID');
  }
  if (!correlationId || typeof correlationId !== 'string') {
    throw new ValidationError('correlationId is required');
  }

  // Body validation (gate 2 — runs BEFORE the auth round-trip).
  const { displayName, roleLabel } = validateCreateInviteInput({
    displayName: options.displayName,
    roleLabel: options.roleLabel,
  });

  // Doctor-only auth (gate 3).
  const caller = await resolveDoctorCallerForSession(sessionId, bearerJwt);

  // Side-effect: mint token + INSERT.
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  const inviteToken = crypto
    .randomBytes(INVITE_TOKEN_BYTES)
    .toString('base64url');

  const { data: insertedRaw, error: insertErr } = await admin
    .from('consultation_extra_participants')
    .insert({
      session_id: sessionId,
      invite_token: inviteToken,
      role_label: roleLabel,
      display_name: displayName,
      invited_by: caller.doctorId,
    })
    .select('id, invited_at')
    .single();
  if (insertErr) {
    // Token collisions are astronomically unlikely with 192 bits of
    // entropy, but treat the unique-violation case explicitly so the
    // controller can map it to a retryable 503 rather than 500.
    if (insertErr.code === '23505') {
      throw new InternalError(
        'Invite token collision (retry should be safe)',
      );
    }
    throw new InternalError(
      `Failed to insert extra-participant row: ${insertErr.message}`,
    );
  }
  const inserted = insertedRaw as { id: string; invited_at: string };

  logger.info(
    {
      sessionId,
      participantId: inserted.id,
      doctorId: caller.doctorId,
      hasRoleLabel: roleLabel !== null,
      correlationId,
    },
    'Extra participant invite created',
  );

  return {
    participantId: inserted.id,
    inviteToken,
    inviteUrl: buildInviteUrl(inviteToken),
    invitedAt: inserted.invited_at,
  };
}

// ============================================================================
// Public API — exchangeInviteToken
// ============================================================================

export async function exchangeInviteToken(
  options: ExchangeInviteOptions,
): Promise<ExchangeInviteResult> {
  const { inviteToken, correlationId } = options;

  // Validation gate.
  if (typeof inviteToken !== 'string' || inviteToken.trim().length === 0) {
    throw new ValidationError('inviteToken is required');
  }
  if (!correlationId || typeof correlationId !== 'string') {
    throw new ValidationError('correlationId is required');
  }
  // Format guard: invite tokens are base64url, so reject anything
  // containing characters outside [A-Za-z0-9_-]. Defense-in-depth
  // against SQL-injection-flavoured token shapes.
  if (!/^[A-Za-z0-9_-]+$/.test(inviteToken)) {
    throw new ValidationError('inviteToken contains invalid characters');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  // Lookup the row by invite_token.
  const { data: rowRaw, error: lookupErr } = await admin
    .from('consultation_extra_participants')
    .select(
      'id, session_id, invite_token, display_name, role_label, invited_by, invited_at, joined_at, left_at, revoked_at',
    )
    .eq('invite_token', inviteToken)
    .maybeSingle();
  if (lookupErr) {
    throw new InternalError(
      `Invite lookup failed: ${lookupErr.message}`,
    );
  }
  if (!rowRaw) {
    throw new NotFoundError('Invite not found or already revoked');
  }
  const row = rowRaw as ExtraParticipantRow;

  // Lifecycle gates.
  if (row.revoked_at !== null) {
    throw new ForbiddenError('This invite has been revoked');
  }
  if (row.joined_at !== null) {
    // Single-shot policy — if you cleared cookies, the doctor must re-invite.
    throw new ForbiddenError('This invite has already been used');
  }

  // Look up the parent session for the Twilio room SID + status guard.
  const { data: sessionRaw, error: sessionErr } = await admin
    .from('consultation_sessions')
    .select('id, status, provider, provider_session_id')
    .eq('id', row.session_id)
    .maybeSingle();
  if (sessionErr) {
    throw new InternalError(
      `Session lookup failed: ${sessionErr.message}`,
    );
  }
  if (!sessionRaw) {
    throw new NotFoundError('Consultation session not found');
  }
  const session = sessionRaw as {
    id: string;
    status: string;
    provider: string | null;
    provider_session_id: string | null;
  };
  if (session.status !== 'live' && session.status !== 'scheduled') {
    throw new ForbiddenError(
      `Cannot join a session in status '${session.status}'`,
    );
  }

  // Stamp `joined_at` BEFORE minting tokens so a crash mid-flight
  // can't issue a JWT for a row that still looks "pending" (which
  // would let the link be re-used).
  const joinedAt = new Date();
  const { data: updatedRaw, error: updateErr } = await admin
    .from('consultation_extra_participants')
    .update({ joined_at: joinedAt.toISOString() })
    .eq('id', row.id)
    .is('joined_at', null) // optimistic lock
    .is('revoked_at', null)
    .select('id, joined_at')
    .maybeSingle();
  if (updateErr) {
    throw new InternalError(
      `Failed to stamp joined_at: ${updateErr.message}`,
    );
  }
  if (!updatedRaw) {
    // Optimistic-lock loss — someone else exchanged the same token
    // concurrently. Rare but possible; treat the same as "already used".
    throw new ForbiddenError('This invite has already been used');
  }

  // Mint Supabase JWT.
  const sub = buildExtraParticipantSub(row.id);
  const expiresAt = new Date(joinedAt.getTime() + EXTRA_PARTICIPANT_JWT_TTL_MS);
  const minted = mintScopedConsultationJwt({
    sub,
    role: 'extra_participant',
    sessionId: row.session_id,
    extraParticipantId: row.id,
    expiresAt,
  });

  // Mint Twilio access token tied to the same room.
  let twilioToken: string | null = null;
  if (session.provider_session_id) {
    try {
      twilioToken = generateVideoAccessToken(
        // Identity must be unique per participant; prefix avoids
        // collision with `doctor-{...}` / `patient-{...}` shapes.
        `extra-${row.id}`,
        session.provider_session_id,
        correlationId,
      );
    } catch (err) {
      // Twilio token mint failures are not fatal — the chat surface
      // still works. Log + continue.
      logger.warn(
        {
          participantId: row.id,
          sessionId: row.session_id,
          correlationId,
          error: err instanceof Error ? err.message : String(err),
        },
        'Twilio access-token mint failed for extra participant; chat-only fallback',
      );
    }
  } else {
    logger.warn(
      {
        participantId: row.id,
        sessionId: row.session_id,
        correlationId,
      },
      'Session has no provider_session_id; extra participant joins chat-only',
    );
  }

  // Emit `participant_joined` banner LAST (after all DB writes succeed).
  // emitter swallows its own errors so a banner failure can't block
  // the exchange path.
  await emitParticipantJoined(
    row.session_id,
    row.id,
    row.display_name,
    row.role_label,
    correlationId,
  );

  logger.info(
    {
      participantId: row.id,
      sessionId: row.session_id,
      hasTwilioToken: twilioToken !== null,
      correlationId,
    },
    'Extra participant exchanged invite token',
  );

  return {
    participantId: row.id,
    sessionId: row.session_id,
    displayName: row.display_name,
    roleLabel: row.role_label,
    joinedAt: joinedAt.toISOString(),
    jwt: minted.token,
    jwtExpiresAt: minted.expiresAt.toISOString(),
    twilioToken,
    roomName: session.provider_session_id,
  };
}

// ============================================================================
// Public API — revokeInvite
// ============================================================================

export async function revokeInvite(
  options: RevokeInviteOptions,
): Promise<RevokeInviteResult> {
  const { sessionId, bearerJwt, participantId, correlationId } = options;

  // Gate 1: path-params.
  if (!UUID_REGEX.test(sessionId)) {
    throw new ValidationError('sessionId must be a UUID');
  }
  if (!UUID_REGEX.test(participantId)) {
    throw new ValidationError('participantId must be a UUID');
  }
  if (!correlationId || typeof correlationId !== 'string') {
    throw new ValidationError('correlationId is required');
  }

  // Gate 2: doctor auth.
  await resolveDoctorCallerForSession(sessionId, bearerJwt);

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  // Fetch existing row to know whether to also stamp `left_at` +
  // emit `participant_left`. NOT-FOUND is a 404, not silent success.
  const { data: existingRaw, error: lookupErr } = await admin
    .from('consultation_extra_participants')
    .select('id, session_id, display_name, joined_at, left_at, revoked_at')
    .eq('id', participantId)
    .eq('session_id', sessionId)
    .maybeSingle();
  if (lookupErr) {
    throw new InternalError(`Lookup failed: ${lookupErr.message}`);
  }
  if (!existingRaw) {
    throw new NotFoundError('Extra-participant invite not found');
  }
  const existing = existingRaw as {
    id: string;
    session_id: string;
    display_name: string;
    joined_at: string | null;
    left_at: string | null;
    revoked_at: string | null;
  };

  if (existing.revoked_at !== null) {
    // Idempotent — return the existing revocation timestamp.
    return {
      participantId,
      revokedAt: existing.revoked_at,
      leftStamped: existing.left_at !== null,
    };
  }

  const revokedAt = new Date();
  const willStampLeft =
    existing.joined_at !== null && existing.left_at === null;
  const updatePayload: Record<string, string> = {
    revoked_at: revokedAt.toISOString(),
  };
  if (willStampLeft) {
    updatePayload.left_at = revokedAt.toISOString();
  }
  const { error: updateErr } = await admin
    .from('consultation_extra_participants')
    .update(updatePayload)
    .eq('id', participantId);
  if (updateErr) {
    throw new InternalError(
      `Failed to revoke invite: ${updateErr.message}`,
    );
  }

  // Emit participant_left banner ONLY if the third party had actually joined.
  if (willStampLeft) {
    await emitParticipantLeft(
      existing.session_id,
      existing.id,
      existing.display_name,
      correlationId,
    );
  }

  logger.info(
    {
      participantId,
      sessionId,
      hadJoined: existing.joined_at !== null,
      correlationId,
    },
    'Extra participant invite revoked',
  );

  return {
    participantId,
    revokedAt: revokedAt.toISOString(),
    leftStamped: willStampLeft,
  };
}

// ============================================================================
// Public API — listInvitesForSession
// ============================================================================

export async function listInvitesForSession(
  options: ListInvitesOptions,
): Promise<InviteRow[]> {
  const { sessionId, bearerJwt, correlationId } = options;

  if (!UUID_REGEX.test(sessionId)) {
    throw new ValidationError('sessionId must be a UUID');
  }
  if (!correlationId || typeof correlationId !== 'string') {
    throw new ValidationError('correlationId is required');
  }

  await resolveDoctorCallerForSession(sessionId, bearerJwt);

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  const { data, error } = await admin
    .from('consultation_extra_participants')
    .select(
      'id, session_id, invite_token, display_name, role_label, invited_by, invited_at, joined_at, left_at, revoked_at',
    )
    .eq('session_id', sessionId)
    .order('invited_at', { ascending: false });
  if (error) {
    throw new InternalError(`List failed: ${error.message}`);
  }
  const rows = (data ?? []) as ExtraParticipantRow[];
  return rows.map(toInviteRow);
}

// ============================================================================
// Public API — recordParticipantLeft
// ============================================================================

export async function recordParticipantLeft(
  options: RecordLeftOptions,
): Promise<RecordLeftResult> {
  const { bearerJwt, correlationId } = options;

  if (!correlationId || typeof correlationId !== 'string') {
    throw new ValidationError('correlationId is required');
  }
  if (typeof bearerJwt !== 'string' || bearerJwt.trim().length === 0) {
    throw new UnauthorizedError('Bearer token is required');
  }

  const { participantId, sessionId } = decodeExtraParticipantClaims(bearerJwt);

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  // Optimistic-lock UPDATE — only stamp if NOT already stamped.
  const leftAt = new Date();
  const { data: updatedRaw, error: updateErr } = await admin
    .from('consultation_extra_participants')
    .update({ left_at: leftAt.toISOString() })
    .eq('id', participantId)
    .eq('session_id', sessionId)
    .is('left_at', null)
    .select('id, left_at, display_name')
    .maybeSingle();
  if (updateErr) {
    throw new InternalError(
      `Failed to stamp left_at: ${updateErr.message}`,
    );
  }

  if (!updatedRaw) {
    // Either already left, or the row is gone. Idempotent — re-read
    // for the response.
    const { data: existingRaw, error: lookupErr } = await admin
      .from('consultation_extra_participants')
      .select('id, left_at')
      .eq('id', participantId)
      .maybeSingle();
    if (lookupErr) {
      throw new InternalError(`Re-read failed: ${lookupErr.message}`);
    }
    if (!existingRaw) {
      throw new NotFoundError('Extra-participant row not found');
    }
    const existing = existingRaw as { id: string; left_at: string | null };
    return {
      participantId,
      leftAt: existing.left_at ?? leftAt.toISOString(),
      newlyStamped: false,
    };
  }
  const updated = updatedRaw as {
    id: string;
    left_at: string;
    display_name: string;
  };

  await emitParticipantLeft(
    sessionId,
    participantId,
    updated.display_name,
    correlationId,
  );

  logger.info(
    { participantId, sessionId, correlationId },
    'Extra participant recorded left',
  );

  return {
    participantId,
    leftAt: updated.left_at,
    newlyStamped: true,
  };
}
