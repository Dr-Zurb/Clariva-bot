/**
 * Consultation Auto Audio-Only Fallback Service (Sub-batch E · task-video-E2)
 *
 * Owns the lifecycle banner emission for the auto audio-only fallback
 * feature. The actual fallback decision + on-screen banner live in the
 * frontend `<VideoRoom>` + `frontend/lib/video/adaptive-bitrate.ts`
 * (the controller hits the floor → engages fallback → posts here so
 * the chat companion has a transcript-grade record visible to BOTH
 * parties).
 *
 * Mirrors the C6 quick-actions service shape — same doctor-only auth
 * pattern, same `emitSystemMessage` dispatch, same fire-and-forget
 * ergonomics. Two action kinds:
 *
 *   - `engaged`   → emits `auto_audio_fallback` banner. Body:
 *                   "Switched to audio-only because of slow connection."
 *
 *   - `restored`  → emits `auto_audio_recovered` banner. Body:
 *                   "Video restored." Carries `durationSeconds` so the
 *                   post-call summary can render "Audio-only for 2m 14s"
 *                   without re-querying the timestamps.
 *
 * Why a backend-mediated route at all (instead of letting the frontend
 * write the system row directly):
 *   - System rows write through the service-role admin client; the
 *     frontend cannot have that credential. The HTTP indirection is
 *     the only way to mint a real system row. (Same rationale as C6.)
 *   - Doctor-only gate: a malicious patient JWT could otherwise spoof
 *     "Video restored." banners or fire spurious fallback rows that
 *     mislead the doctor. We keep this strictly doctor-authored —
 *     the doctor's `<VideoRoom>` is the only legitimate caller.
 *
 * **No PHI in logs.** Only sessionId, doctorId (already auth'd), the
 * action kind, and the attempt ordinal leak through.
 *
 * @see backend/src/services/consultation-message-service.ts (emit helpers)
 * @see frontend/components/consultation/VideoRoom.tsx (the caller)
 * @see frontend/components/consultation/AudioFallbackBanner.tsx (the on-screen banner)
 * @see frontend/lib/video/adaptive-bitrate.ts (the decision engine)
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
import {
  emitAutoAudioFallback,
  emitAutoAudioRecovered,
  type AutoAudioFallbackReason,
} from './consultation-message-service';

// ============================================================================
// Constants
// ============================================================================

/**
 * Whitelist of auto-fallback `kind` values the frontend may post.
 * Adding more kinds (e.g. `'failed_to_recover'` for a future Phase 2
 * where recovery itself fails) is a one-line addition here + a
 * matching emitter in `consultation-message-service.ts`.
 */
export const AUTO_FALLBACK_KINDS = ['engaged', 'restored'] as const;
export type AutoFallbackKind = (typeof AUTO_FALLBACK_KINDS)[number];

/**
 * Whitelist of `reason` values the frontend may attach to an `engaged`
 * payload. Mirrors `AutoAudioFallbackReason` in
 * `consultation-message-service.ts` (single source of truth for the
 * meta.reason discriminator).
 *
 *   - `low_bandwidth`    — adaptive controller (E.2 / E.3) tripped.
 *   - `battery_low`      — F.1: patient confirmed the 15% battery prompt.
 *   - `battery_critical` — F.1: patient battery <5% and not charging;
 *                          fallback was forced.
 *
 * Decision §34 reuses one `auto_audio_fallback` event with `meta.reason`
 * over enum-of-events so future triggers (CPU thermal, OS power-save,
 * etc.) are a meta-string addition rather than a chat-event addition.
 */
export const AUTO_FALLBACK_REASONS = [
  'low_bandwidth',
  'battery_low',
  'battery_critical',
] as const satisfies ReadonlyArray<AutoAudioFallbackReason>;

/**
 * Lifted from `consultation-quick-actions-service.ts` — same regex,
 * same intent. The two-copy precedent is documented there as
 * "promote-on-third"; this is the third copy site, but a shared util
 * extraction is its own follow-up PR (touches three services).
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sanity caps on the validated payload. The frontend should never
 * exceed these — if it does, it's a bug worth a 400, not a silent
 * truncation. Symmetric ceilings to the corresponding meta fields in
 * the emit helpers' typed shapes.
 */
const ATTEMPT_MIN = 1;
const ATTEMPT_MAX = 100; // ridiculous ceiling; one call should never reach 100 fallbacks
const THRESHOLD_LEVEL_MIN = 0;
const THRESHOLD_LEVEL_MAX = 5; // Twilio's networkQualityLevel domain is 0..5
const DURATION_SECONDS_MAX = 60 * 60 * 4; // 4h — caps a runaway clock from blowing up the meta JSON

// ============================================================================
// Input / output shapes
// ============================================================================

export interface PostAutoFallbackEngagedInput {
  kind: 'engaged';
  /**
   * Per-session ordinal of this fallback engagement. The frontend
   * tracks it in a ref and bumps after each successful restore +
   * cooldown expiry. Used as the dedup key suffix so a buggy
   * double-emit within one engagement collapses; legitimate
   * subsequent fallbacks (after a restore) get a fresh row.
   */
  attempt: number;
  /**
   * The Twilio `networkQualityLevel` threshold that tripped the
   * fallback. Required when `reason === 'low_bandwidth'` (typically
   * `1`). Optional / null for battery-triggered fallbacks (F.1) where
   * there's no Twilio threshold — the trigger is the OS Battery API
   * `level` crossing the configured floor.
   */
  thresholdLevel: number | null;
  /**
   * Why we dropped to audio-only. Defaults to `'low_bandwidth'` for
   * backwards compat with the E.2 frontend that doesn't send it.
   * Future battery-triggered engagement payloads (F.1 /
   * task-video-F4) send `'battery_low'` (user-confirmed 15% prompt)
   * or `'battery_critical'` (5% forced). Decision §34.
   */
  reason?: AutoAudioFallbackReason;
}

export interface PostAutoFallbackRestoredInput {
  kind: 'restored';
  /** Pairs with the engaged-attempt ordinal. */
  attempt: number;
  /**
   * How long the fallback was active before the user clicked
   * "Try video again". Best-effort; the frontend computes from
   * the engagement timestamp. The post-call summary reads it
   * straight out of `meta.duration_seconds`.
   */
  durationSeconds: number;
}

export type AutoFallbackBannerInput =
  | PostAutoFallbackEngagedInput
  | PostAutoFallbackRestoredInput;

export interface PostAutoFallbackBannerOptions {
  /** Path-param `consultation_sessions.id` from the URL. */
  sessionId: string;
  /** Bearer JWT from the `Authorization` header (must be doctor). */
  bearerJwt: string;
  /**
   * The raw action payload (typed `unknown` — the service-layer
   * validator narrows it). Mirrors the C6 quick-actions shape so
   * the route handler can pass `req.body` straight through.
   */
  action: unknown;
  /** Required — same correlation id flowed through the request. */
  correlationId: string;
}

export interface PostAutoFallbackBannerResult {
  kind: AutoFallbackKind;
  /** UTC ISO timestamp of when the service finished emitting. */
  emittedAt: string;
}

// ============================================================================
// Pure validation helpers (exported for unit-test reuse).
// ============================================================================

/**
 * Narrow the request body into an `AutoFallbackBannerInput`. Throws
 * `ValidationError` on any malformed input. Strict on the required
 * fields per `kind`; extra fields tolerated (forwards-compat). All
 * numeric fields are bounded — the frontend should never exceed the
 * sanity caps; if it does, that's a bug worth a 400.
 */
export function validateAutoFallbackAction(
  raw: unknown,
): AutoFallbackBannerInput {
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError('Request body must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const kind = obj.kind;
  if (typeof kind !== 'string') {
    throw new ValidationError('Field `kind` is required and must be a string');
  }
  if (!AUTO_FALLBACK_KINDS.includes(kind as AutoFallbackKind)) {
    throw new ValidationError(
      `Field \`kind\` must be one of: ${AUTO_FALLBACK_KINDS.join(', ')}`,
    );
  }

  const attemptRaw = obj.attempt;
  if (typeof attemptRaw !== 'number' || !Number.isFinite(attemptRaw)) {
    throw new ValidationError(
      'Field `attempt` is required and must be a finite number',
    );
  }
  const attempt = Math.trunc(attemptRaw);
  if (attempt < ATTEMPT_MIN || attempt > ATTEMPT_MAX) {
    throw new ValidationError(
      `Field \`attempt\` must be in [${ATTEMPT_MIN}, ${ATTEMPT_MAX}]`,
    );
  }

  if (kind === 'engaged') {
    // Reason defaults to 'low_bandwidth' so the legacy E.2 frontend
    // (which doesn't send the field) keeps working unchanged. F.1
    // battery callers send 'battery_low' or 'battery_critical'.
    const reasonRaw = obj.reason;
    let reason: AutoAudioFallbackReason = 'low_bandwidth';
    if (reasonRaw !== undefined) {
      if (typeof reasonRaw !== 'string') {
        throw new ValidationError('Field `reason` must be a string when provided');
      }
      if (
        !AUTO_FALLBACK_REASONS.includes(reasonRaw as AutoAudioFallbackReason)
      ) {
        throw new ValidationError(
          `Field \`reason\` must be one of: ${AUTO_FALLBACK_REASONS.join(', ')}`,
        );
      }
      reason = reasonRaw as AutoAudioFallbackReason;
    }

    // thresholdLevel is REQUIRED for low_bandwidth (Twilio's network
    // quality reading is the trigger evidence) and OPTIONAL for
    // battery_* (no Twilio threshold — the trigger is the OS Battery
    // API level crossing). Sending a thresholdLevel for a battery
    // engagement is tolerated (forwards-compat); we just normalise it
    // through the same range check so a buggy frontend can't poison
    // the `meta` blob.
    let thresholdLevel: number | null = null;
    const thresholdRaw = obj.thresholdLevel;
    const thresholdProvided =
      thresholdRaw !== undefined && thresholdRaw !== null;
    if (reason === 'low_bandwidth' && !thresholdProvided) {
      throw new ValidationError(
        'Field `thresholdLevel` is required for `reason: low_bandwidth`',
      );
    }
    if (thresholdProvided) {
      if (typeof thresholdRaw !== 'number' || !Number.isFinite(thresholdRaw)) {
        throw new ValidationError(
          'Field `thresholdLevel` must be a finite number when provided',
        );
      }
      thresholdLevel = Math.trunc(thresholdRaw);
      if (
        thresholdLevel < THRESHOLD_LEVEL_MIN ||
        thresholdLevel > THRESHOLD_LEVEL_MAX
      ) {
        throw new ValidationError(
          `Field \`thresholdLevel\` must be in [${THRESHOLD_LEVEL_MIN}, ${THRESHOLD_LEVEL_MAX}]`,
        );
      }
    }
    return { kind: 'engaged', attempt, thresholdLevel, reason };
  }

  // kind === 'restored'
  const durationRaw = obj.durationSeconds;
  if (typeof durationRaw !== 'number' || !Number.isFinite(durationRaw)) {
    throw new ValidationError(
      'Field `durationSeconds` is required and must be a finite number',
    );
  }
  // Round-up + clamp negatives to 0; clamp absurd values to the
  // ceiling. The emit helper does the same coercion defensively, but
  // catching it here gives a clearer 400 message than a silent
  // floor-to-zero downstream.
  const durationSeconds = Math.max(
    0,
    Math.min(DURATION_SECONDS_MAX, Math.round(durationRaw)),
  );
  return { kind: 'restored', attempt, durationSeconds };
}

// ============================================================================
// Doctor-only auth gate.
//
// Lifted from `consultation-quick-actions-service.ts#resolveDoctorCallerForSession`
// — same JWT decode + supabase-auth-getUser + session-row ownership
// check. Patient JWTs are 403'd identically (the on-screen fallback
// banner is the patient's surface; the chat row is the doctor's
// transcript-grade authoring channel).
// ============================================================================

interface ResolvedDoctorCaller {
  doctorId: string;
}

async function resolveDoctorCallerForSession(
  sessionId: string,
  bearerJwt: string,
): Promise<ResolvedDoctorCaller> {
  const secret = env.SUPABASE_JWT_SECRET?.trim();
  if (!secret) {
    throw new InternalError('SUPABASE_JWT_SECRET is not configured');
  }

  const decodedComplete = jwt.decode(bearerJwt, { complete: true });
  if (!decodedComplete || typeof decodedComplete === 'string') {
    throw new UnauthorizedError('Malformed bearer token');
  }
  const decoded = decodedComplete.payload as jwt.JwtPayload;
  const consultRole =
    typeof decoded.consult_role === 'string' ? decoded.consult_role : undefined;

  if (consultRole === 'patient') {
    throw new ForbiddenError(
      'Patients cannot post auto-fallback lifecycle banners',
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
// Public API
// ============================================================================

/**
 * Validate + auth-gate + dispatch the auto-fallback lifecycle banner.
 * Errors propagate to the route handler as our standard `*Error`
 * types so the controller's central error mapper turns them into
 * the right HTTP status codes.
 *
 * Validation runs FIRST (gate-ordering doctrine), so a bad payload
 * doesn't trigger an upstream auth call.
 */
export async function postAutoFallbackBanner(
  options: PostAutoFallbackBannerOptions,
): Promise<PostAutoFallbackBannerResult> {
  const { sessionId, bearerJwt, action: rawAction, correlationId } = options;

  if (!UUID_REGEX.test(sessionId)) {
    throw new ValidationError('sessionId must be a UUID');
  }
  if (!correlationId || typeof correlationId !== 'string') {
    throw new ValidationError('correlationId is required');
  }

  const action = validateAutoFallbackAction(rawAction);
  const caller = await resolveDoctorCallerForSession(sessionId, bearerJwt);

  const emittedAt = new Date();
  if (action.kind === 'engaged') {
    await emitAutoAudioFallback(
      sessionId,
      action.attempt,
      action.thresholdLevel,
      correlationId,
      action.reason,
    );
  } else {
    await emitAutoAudioRecovered(
      sessionId,
      action.attempt,
      action.durationSeconds,
      correlationId,
    );
  }

  logger.info(
    {
      sessionId,
      doctorId: caller.doctorId,
      kind: action.kind,
      attempt: action.attempt,
      correlationId,
    },
    'Auto-fallback lifecycle banner emitted',
  );

  return {
    kind: action.kind,
    emittedAt: emittedAt.toISOString(),
  };
}
