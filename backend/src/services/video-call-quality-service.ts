/**
 * Video Call Quality Service (Sub-batch E · task-video-E6)
 *
 * Ingests batched per-call QoS samples from the frontend
 * `quality-reporter.ts` and writes them to `video_call_quality`
 * (Migration 086). The reporter runs on BOTH doctor and patient
 * sides; this service handles both auth shapes:
 *
 *   - Doctor caller: standard Supabase auth bearer JWT. We resolve to
 *     a real `auth.users.id` via `admin.auth.getUser(jwt)` (same
 *     pattern as `consultation-auto-fallback-service.ts`), then verify
 *     session ownership via `consultation_sessions.doctor_id`. user_id
 *     in the row = the resolved doctor UUID.
 *
 *   - Patient caller: scoped Supabase JWT minted by
 *     `supabase-jwt-mint.ts` (the text-token / video companion JWT).
 *     We verify the JWT signature locally with HS256 +
 *     `SUPABASE_JWT_SECRET`, then check `consult_role === 'patient'`
 *     and `session_id === <pathSessionId>`. user_id in the row =
 *     the sessionId (synthetic UUID surrogate; see Migration 086 header
 *     "USER_ID SEMANTICS" for rationale — patient JWT subs are
 *     synthetic non-UUID strings, so we cannot use them as the column
 *     value). The `role` column distinguishes the rows.
 *
 * The actual INSERT is done via the **admin client** (RLS bypass) for
 * two reasons:
 *
 *   1. Patient inserts can't satisfy the migration's
 *      `safe_uuid_sub() = ...` doctor branch (synthetic patient sub
 *      returns NULL from `safe_uuid_sub()`); the participant branch
 *      via `auth.jwt() ->> 'session_id'` works in principle, but
 *      requires a session-scoped client construction. Adding that
 *      helper is its own follow-up; for now we match the existing
 *      precedent (`consultation-extra-participant-service.ts` and
 *      `consultation-auto-fallback-service.ts` both insert via admin
 *      client + TypeScript-enforced auth).
 *   2. Bypassing RLS at the service layer keeps the auth check in one
 *      place (this file) instead of split between TypeScript + SQL.
 *      The migration's RLS policy is defense-in-depth for any future
 *      caller that hits the table via a session-scoped client (e.g.
 *      an ops dashboard reading own-clinic samples).
 *
 * **No PHI in samples.** Only acoustic + network + video metrics — no
 * transcript content, no message bodies, no patient identifiers
 * beyond what's already in `consultation_sessions`.
 *
 * @see backend/migrations/086_video_call_quality.sql
 * @see backend/src/services/supabase-jwt-mint.ts (the patient JWT minter)
 * @see frontend/lib/video/quality-reporter.ts (the caller — sample shape source)
 * @see backend/src/services/consultation-auto-fallback-service.ts (auth-pattern precedent)
 */

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

// ============================================================================
// Constants
// ============================================================================

/**
 * Sanity caps on the batch shape. The frontend reporter buffers at
 * 64 samples per side per 30-min call; 256 gives 4× headroom for a
 * delayed flush after a network blip without ever truncating, AND is
 * a low-enough ceiling that an abusive caller can't overwhelm the
 * insert path.
 */
const MAX_SAMPLES_PER_REQUEST = 256;

/** Mirrors `safe_uuid_sub()`'s expectation. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whitelist of role values the table accepts. Mirrors the migration's
 * CHECK constraint. Today the reporter only emits `'doctor'` and
 * `'patient'`; `'extra_participant'` is reserved for C8 forward-compat.
 *
 * Kept as a type-only union (the runtime check happens in
 * `resolveCallerForSession` via the `consult_role` JWT claim's allowed
 * values plus the doctor branch returning `'doctor'` literally — no
 * separate runtime validation array needed).
 */
type CallerRole = 'doctor' | 'patient' | 'extra_participant';

/**
 * Numeric range guards. The frontend parsers
 * (`twilio-stats-parse.ts`) already clamp to these ranges, so values
 * exceeding them indicate a buggy reporter (or a malicious caller).
 * 400 with a descriptive error is better than silently coercing.
 */
const NETWORK_QUALITY_LEVEL_MIN = 0;
const NETWORK_QUALITY_LEVEL_MAX = 5;
const RTT_MAX_MS = 60_000; // 60s — anything above this is broken state, not a real RTT
const JITTER_MAX_MS = 30_000;
const PACKET_LOSS_PCT_MIN = 0;
const PACKET_LOSS_PCT_MAX = 100;
const AUDIO_LEVEL_MIN = 0;
const AUDIO_LEVEL_MAX = 100;
const VIDEO_DIM_MAX = 8192; // 8K horizontal — generous future-proof ceiling
const VIDEO_FPS_MAX = 240;
const KBPS_MAX = 100_000; // 100 Mbps — covers any realistic upstream cap
const SAMPLE_SEQ_MAX = 10_000; // 30-min call at 10s cadence = ~180 samples; 10k = 50× headroom

// ============================================================================
// Public types — the frontend reporter mirrors these field names verbatim
// ============================================================================

/**
 * One QoS sample from one side (doctor or patient). Field names
 * mirror the column names in `video_call_quality` for transparency.
 * All metrics are nullable (Twilio doesn't always populate every
 * field on every sample, especially the first few before the SDK
 * has enough data).
 */
export interface VideoQualitySample {
  /** Per-(session, role) monotonic counter. 0-indexed. */
  sampleSeq: number;
  networkQualityLevel?: number | null;
  rttMs?: number | null;
  jitterMs?: number | null;
  packetLossPct?: number | null;
  audioInputLevel?: number | null;
  audioOutputLevel?: number | null;
  videoResolutionW?: number | null;
  videoResolutionH?: number | null;
  videoFps?: number | null;
  kbpsSend?: number | null;
  kbpsReceive?: number | null;
  twilioRoomSid?: string | null;
}

export interface IngestVideoQualityOptions {
  /** Path-param `consultation_sessions.id` from the URL. */
  sessionId: string;
  /** Bearer JWT from the `Authorization` header. Doctor OR patient. */
  bearerJwt: string;
  /** The raw request body — service layer narrows. */
  body: unknown;
  /** Standard correlation id flowed through the request. */
  correlationId: string;
}

export interface IngestVideoQualityResult {
  /** How many rows the admin INSERT actually wrote. */
  inserted: number;
  /** Echo'd for the response payload. */
  sessionId: string;
  /** Resolved caller role — useful for the response so the frontend can
   *  log "we successfully posted as <role>" for debugging. */
  role: CallerRole;
}

// ============================================================================
// Pure validation helpers (exported for unit-test reuse).
// ============================================================================

/**
 * Defensive numeric range check. Returns the cleaned integer value (or
 * null if input is null/undefined). Throws ValidationError on
 * out-of-range or non-finite values.
 */
function validateNumericInRange(
  raw: unknown,
  fieldName: string,
  min: number,
  max: number,
  options: { allowNull?: boolean; isInteger?: boolean } = {},
): number | null {
  const { allowNull = true, isInteger = true } = options;
  if (raw == null) {
    if (!allowNull) {
      throw new ValidationError(`Field \`${fieldName}\` is required`);
    }
    return null;
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new ValidationError(
      `Field \`${fieldName}\` must be a finite number when present`,
    );
  }
  if (raw < min || raw > max) {
    throw new ValidationError(
      `Field \`${fieldName}\` must be in [${min}, ${max}]`,
    );
  }
  return isInteger ? Math.trunc(raw) : raw;
}

/**
 * Narrow one raw sample object into a `VideoQualitySample`. Throws
 * `ValidationError` on any malformed input. Strict on `sampleSeq`
 * (required, non-negative integer); permissive on the metric fields
 * (all nullable). Extra fields tolerated (forwards-compat).
 *
 * Exported so unit tests + the controller-level batch validator can
 * reuse it.
 */
export function validateSample(raw: unknown): VideoQualitySample {
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError('Each sample must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;

  const sampleSeq = validateNumericInRange(
    obj.sampleSeq,
    'sampleSeq',
    0,
    SAMPLE_SEQ_MAX,
    { allowNull: false },
  );
  if (sampleSeq == null) {
    // Belt-and-suspenders — `allowNull: false` already throws above.
    throw new ValidationError('Field `sampleSeq` is required');
  }

  const sample: VideoQualitySample = { sampleSeq };

  sample.networkQualityLevel = validateNumericInRange(
    obj.networkQualityLevel,
    'networkQualityLevel',
    NETWORK_QUALITY_LEVEL_MIN,
    NETWORK_QUALITY_LEVEL_MAX,
  );
  sample.rttMs = validateNumericInRange(obj.rttMs, 'rttMs', 0, RTT_MAX_MS);
  sample.jitterMs = validateNumericInRange(
    obj.jitterMs,
    'jitterMs',
    0,
    JITTER_MAX_MS,
  );
  sample.packetLossPct = validateNumericInRange(
    obj.packetLossPct,
    'packetLossPct',
    PACKET_LOSS_PCT_MIN,
    PACKET_LOSS_PCT_MAX,
    { isInteger: false },
  );
  sample.audioInputLevel = validateNumericInRange(
    obj.audioInputLevel,
    'audioInputLevel',
    AUDIO_LEVEL_MIN,
    AUDIO_LEVEL_MAX,
    { isInteger: false },
  );
  sample.audioOutputLevel = validateNumericInRange(
    obj.audioOutputLevel,
    'audioOutputLevel',
    AUDIO_LEVEL_MIN,
    AUDIO_LEVEL_MAX,
    { isInteger: false },
  );
  sample.videoResolutionW = validateNumericInRange(
    obj.videoResolutionW,
    'videoResolutionW',
    1,
    VIDEO_DIM_MAX,
  );
  sample.videoResolutionH = validateNumericInRange(
    obj.videoResolutionH,
    'videoResolutionH',
    1,
    VIDEO_DIM_MAX,
  );
  sample.videoFps = validateNumericInRange(
    obj.videoFps,
    'videoFps',
    0,
    VIDEO_FPS_MAX,
  );
  sample.kbpsSend = validateNumericInRange(
    obj.kbpsSend,
    'kbpsSend',
    0,
    KBPS_MAX,
  );
  sample.kbpsReceive = validateNumericInRange(
    obj.kbpsReceive,
    'kbpsReceive',
    0,
    KBPS_MAX,
  );

  if (obj.twilioRoomSid != null) {
    if (typeof obj.twilioRoomSid !== 'string') {
      throw new ValidationError('Field `twilioRoomSid` must be a string when present');
    }
    // Twilio room SIDs are 34 chars; cap at 64 as defensive ceiling.
    if (obj.twilioRoomSid.length > 64) {
      throw new ValidationError('Field `twilioRoomSid` must be ≤ 64 characters');
    }
    sample.twilioRoomSid = obj.twilioRoomSid;
  }

  return sample;
}

/**
 * Narrow the request body into a sample array. Throws on any
 * malformed input. Caps at `MAX_SAMPLES_PER_REQUEST` — over-batched
 * requests are 400'd, not silently truncated (so the reporter can
 * react by flushing a smaller batch next time).
 */
export function validateBody(raw: unknown): VideoQualitySample[] {
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError('Request body must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const samples = obj.samples;
  if (!Array.isArray(samples)) {
    throw new ValidationError('Field `samples` is required and must be an array');
  }
  if (samples.length === 0) {
    throw new ValidationError('Field `samples` must contain at least one sample');
  }
  if (samples.length > MAX_SAMPLES_PER_REQUEST) {
    throw new ValidationError(
      `Batch too large: ${samples.length} samples (max ${MAX_SAMPLES_PER_REQUEST}). ` +
        'Reduce the reporter flush interval or batch size.',
    );
  }
  return samples.map((s, idx) => {
    try {
      return validateSample(s);
    } catch (err) {
      if (err instanceof ValidationError) {
        throw new ValidationError(`samples[${idx}]: ${err.message}`);
      }
      throw err;
    }
  });
}

// ============================================================================
// Auth resolution — doctor OR patient.
// ============================================================================

interface ResolvedCaller {
  role: CallerRole;
  /** UUID written into `video_call_quality.user_id`. */
  userIdForRow: string;
}

/**
 * Resolve the bearer JWT into a `(role, userIdForRow)` pair. Two
 * branches, distinguished by the JWT payload shape:
 *
 *   1. **Patient** (or extra_participant) — the JWT has a
 *      `consult_role: 'patient' | 'extra_participant'` claim AND a
 *      `session_id` claim that matches the path. We verify the JWT
 *      signature locally with HS256 + `SUPABASE_JWT_SECRET`. user_id
 *      in the row = the sessionId (synthetic surrogate per migration
 *      semantics). Patient sub is `patient:{appointmentId}` (synthetic
 *      non-UUID); we don't use it as the column value.
 *
 *   2. **Doctor** — no `consult_role: 'patient'` claim. We resolve to
 *      a real `auth.users.id` via `admin.auth.getUser(jwt)` (matches
 *      `consultation-auto-fallback-service.ts` precedent). Then we
 *      verify session ownership via `consultation_sessions.doctor_id
 *      === resolvedUserId`. user_id in the row = the resolved doctor
 *      UUID.
 *
 * Mismatched session ownership → 401/403. Malformed JWT → 401.
 */
async function resolveCallerForSession(
  sessionId: string,
  bearerJwt: string,
): Promise<ResolvedCaller> {
  const secret = env.SUPABASE_JWT_SECRET?.trim();
  if (!secret) {
    throw new InternalError('SUPABASE_JWT_SECRET is not configured');
  }

  // Decode without verification first so we can inspect the
  // `consult_role` claim and route to the right branch. Verification
  // happens on each branch (full HS256 verify for patient; auth.getUser
  // for doctor — which itself verifies the signature).
  const decodedComplete = jwt.decode(bearerJwt, { complete: true });
  if (!decodedComplete || typeof decodedComplete === 'string') {
    throw new UnauthorizedError('Malformed bearer token');
  }
  const payload = decodedComplete.payload as jwt.JwtPayload & {
    consult_role?: string;
    session_id?: string;
    sub?: string;
  };
  const consultRole = typeof payload.consult_role === 'string' ? payload.consult_role : undefined;

  // -------- Patient / extra_participant branch --------
  if (consultRole === 'patient' || consultRole === 'extra_participant') {
    // Full HS256 verify so a tampered patient JWT can't slip through.
    let verified: jwt.JwtPayload;
    try {
      verified = jwt.verify(bearerJwt, secret, {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload;
    } catch (err) {
      throw new UnauthorizedError(
        `Invalid patient token: ${err instanceof Error ? err.message : 'verify failed'}`,
      );
    }
    const claimedSessionId = (verified as { session_id?: unknown }).session_id;
    if (typeof claimedSessionId !== 'string' || claimedSessionId !== sessionId) {
      throw new ForbiddenError('Patient token session mismatch');
    }
    const claimedRole = (verified as { consult_role?: unknown }).consult_role;
    if (claimedRole !== consultRole) {
      // Defensive — the unverified decode said one thing, the verified
      // decode said another. Refuse.
      throw new UnauthorizedError('Patient token consult_role mismatch');
    }
    // user_id surrogate per Migration 086 semantics: use the sessionId
    // UUID. Stable, deterministic, satisfies the NOT NULL UUID column.
    return {
      role: consultRole === 'extra_participant' ? 'extra_participant' : 'patient',
      userIdForRow: sessionId,
    };
  }

  // -------- Doctor branch --------
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
    throw new ForbiddenError('Doctor identity mismatch for this session');
  }

  return { role: 'doctor', userIdForRow: doctorId };
}

// ============================================================================
// Insert
// ============================================================================

/**
 * Top-level handler-facing entry point. Orchestrates auth → validation
 * → admin INSERT → result. Throws standard error classes on auth /
 * validation failures (caught by `asyncHandler`).
 *
 * Uses admin client (RLS bypass); the migration's RLS policies are
 * defense-in-depth for any future caller that hits the table via a
 * session-scoped client (e.g. an ops dashboard reading own-clinic
 * samples).
 */
export async function ingestVideoQualitySamples(
  options: IngestVideoQualityOptions,
): Promise<IngestVideoQualityResult> {
  const { sessionId, bearerJwt, body, correlationId } = options;

  if (!UUID_REGEX.test(sessionId)) {
    throw new ValidationError('sessionId path param must be a UUID');
  }

  const samples = validateBody(body);
  const caller = await resolveCallerForSession(sessionId, bearerJwt);

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  // Pre-shape rows for the bulk INSERT. Field names mirror the column
  // names in the migration verbatim (snake_case) so a future schema
  // change shows up at compile time on this object literal.
  const rows = samples.map((s) => ({
    session_id: sessionId,
    user_id: caller.userIdForRow,
    role: caller.role,
    network_quality_level: s.networkQualityLevel ?? null,
    rtt_ms: s.rttMs ?? null,
    jitter_ms: s.jitterMs ?? null,
    packet_loss_pct: s.packetLossPct ?? null,
    audio_input_level: s.audioInputLevel ?? null,
    audio_output_level: s.audioOutputLevel ?? null,
    video_resolution_w: s.videoResolutionW ?? null,
    video_resolution_h: s.videoResolutionH ?? null,
    video_fps: s.videoFps ?? null,
    kbps_send: s.kbpsSend ?? null,
    kbps_receive: s.kbpsReceive ?? null,
    twilio_room_sid: s.twilioRoomSid ?? null,
    sample_seq: s.sampleSeq,
    // sampled_at deliberately omitted — DB DEFAULT now() is the
    // authoritative wall-clock per migration design (avoids
    // client-clock-skew noise in percentile queries).
  }));

  const { error: insertErr, count } = await admin
    .from('video_call_quality')
    .insert(rows, { count: 'exact' });

  if (insertErr) {
    // Don't crash the call over a metrics POST failure — the frontend
    // reporter is fire-and-forget. Log with correlation id so ops can
    // correlate. Returning a 500 lets the reporter retry on next flush.
    logger.warn(
      {
        correlationId,
        sessionId,
        role: caller.role,
        sampleCount: rows.length,
        errCode: insertErr.code,
        errMessage: insertErr.message,
      },
      'video_call_quality insert failed',
    );
    throw new InternalError(`video_call_quality insert failed: ${insertErr.message}`);
  }

  return {
    inserted: count ?? rows.length,
    sessionId,
    role: caller.role,
  };
}
