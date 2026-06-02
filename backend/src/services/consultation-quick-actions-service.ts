/**
 * Consultation Quick Actions Service (Sub-batch C · task-video-C6)
 *
 * Owns the in-call quick-action lifecycle on the backend side:
 *
 *   - `postQuickActionBanner` — emits a `'rx_sent'` or
 *     `'follow_up_scheduled'` system banner row to the consultation
 *     chat after the doctor uses the in-call action panel.
 *
 * Why a backend-mediated route at all (instead of letting the frontend
 * write the system row directly):
 *
 *   - System rows (`sender_role = 'system'`, `sender_id =
 *     SYSTEM_SENDER_ID`) write through the service-role admin client.
 *     The frontend cannot — and SHOULD NOT — have access to that
 *     credential. Going through this service is the only way to mint
 *     a real system row.
 *
 *   - Doctor-only auth gate. Only the doctor authenticated for the
 *     specific consultation session can post these banners. A patient
 *     JWT (or any other doctor's JWT) is rejected — otherwise the
 *     patient could spoof a "Doctor sent you a prescription" message
 *     to themselves, or another doctor could pollute the wrong session.
 *
 *   - The existing Rx send flow (`sendPrescriptionToPatient`) and
 *     appointment-create flow (`createAppointment`) are SHARED with
 *     dashboard surfaces (the appointment-detail page's Rx writer,
 *     the standalone "Add appointment" modal). Co-locating the banner
 *     emit into those flows would create orphan banner rows whenever
 *     they're called outside a live consult — a leaky abstraction.
 *     This service stays pure: it only fires the in-channel banner,
 *     it does NOT create the Rx or the appointment.
 *
 * **No PHI in logs.** Only ids and the action `kind` leak through.
 *
 * @see backend/src/services/consultation-message-service.ts (emitRxSent / emitFollowUpScheduled)
 * @see frontend/components/consultation/InCallQuickActions.tsx (the FAB)
 * @see frontend/components/consultation/InCallActionPanel.tsx (the panel shell)
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
  emitFollowUpScheduled,
  emitRxSent,
} from './consultation-message-service';

// ============================================================================
// Constants
// ============================================================================

/**
 * Whitelist of in-call quick-action `kind` values the frontend may
 * post. Lab + consent panels are out-of-scope for v1 (decision §15);
 * adding them later is a one-line addition here + a matching new
 * emitter in `consultation-message-service.ts`.
 */
export const QUICK_ACTION_KINDS = ['rx_sent', 'follow_up_scheduled'] as const;
export type QuickActionKind = (typeof QUICK_ACTION_KINDS)[number];

/**
 * Lifted from `snapshot-storage-service.ts` — same regex, same
 * intent. Could be promoted to a shared util in a future refactor;
 * three local copies is the threshold I'll act on (currently two).
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================================
// Input / output shapes
// ============================================================================

export interface PostRxBannerInput {
  kind: 'rx_sent';
  prescriptionId: string;
}

export interface PostFollowUpBannerInput {
  kind: 'follow_up_scheduled';
  appointmentId: string;
  /** ISO timestamp from the freshly created appointment row's `appointment_date`. */
  scheduledAt: string;
}

export type QuickActionBannerInput =
  | PostRxBannerInput
  | PostFollowUpBannerInput;

export interface PostQuickActionBannerOptions {
  /** Path-param `consultation_sessions.id` from the URL. */
  sessionId: string;
  /** Bearer JWT from the `Authorization` header (must be doctor). */
  bearerJwt: string;
  /**
   * The raw action payload (typed `unknown` — the service-layer
   * validator narrows it to `QuickActionBannerInput`). Same shape
   * `submitSnapshot.annotations` uses so route handlers can pass the
   * request body straight through without an unsafe cast.
   */
  action: unknown;
  /** Required — same correlation id flowed through the request. */
  correlationId: string;
}

export interface PostQuickActionBannerResult {
  /** The action `kind` the banner was emitted for. */
  kind: QuickActionKind;
  /** UTC ISO timestamp of when the service finished emitting. */
  emittedAt: string;
}

// ============================================================================
// Pure validation helpers (exported for unit-test reuse).
// ============================================================================

/**
 * Narrow the request body into a `QuickActionBannerInput`. Throws
 * `ValidationError` on any malformed input. Strict — extra fields are
 * tolerated (forwards-compat) but the required fields per `kind` MUST
 * be present and well-formed. Per-`kind` UUIDs are checked here so the
 * consent / session-lookup gate doesn't run on bad input.
 */
export function validateQuickAction(raw: unknown): QuickActionBannerInput {
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError('Request body must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const kind = obj.kind;
  if (typeof kind !== 'string') {
    throw new ValidationError('Field `kind` is required and must be a string');
  }
  if (!QUICK_ACTION_KINDS.includes(kind as QuickActionKind)) {
    throw new ValidationError(
      `Field \`kind\` must be one of: ${QUICK_ACTION_KINDS.join(', ')}`,
    );
  }

  if (kind === 'rx_sent') {
    const prescriptionId = obj.prescriptionId;
    if (typeof prescriptionId !== 'string' || !UUID_REGEX.test(prescriptionId)) {
      throw new ValidationError(
        'Field `prescriptionId` is required and must be a UUID',
      );
    }
    return { kind: 'rx_sent', prescriptionId };
  }

  // kind === 'follow_up_scheduled'
  const appointmentId = obj.appointmentId;
  if (typeof appointmentId !== 'string' || !UUID_REGEX.test(appointmentId)) {
    throw new ValidationError(
      'Field `appointmentId` is required and must be a UUID',
    );
  }
  const scheduledAt = obj.scheduledAt;
  if (typeof scheduledAt !== 'string' || scheduledAt.length === 0) {
    throw new ValidationError(
      'Field `scheduledAt` is required and must be an ISO timestamp string',
    );
  }
  // Reject NaN dates — `new Date('garbage').getTime()` is NaN.
  const parsed = new Date(scheduledAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(
      'Field `scheduledAt` is not a parseable ISO timestamp',
    );
  }
  return { kind: 'follow_up_scheduled', appointmentId, scheduledAt };
}

// ============================================================================
// Doctor-only auth gate.
//
// Mirrors `snapshot-storage-service.ts#resolveCallerForSession` for the
// doctor branch — same JWT-decode + supabase-auth-getUser + session-row
// ownership check. Crucially, this service REJECTS patient JWTs entirely
// (the snapshot service accepted both because patients can capture their
// OWN tile; for quick actions only the doctor has these affordances per
// task-video-C6 §FAB visibility / §`mode='readonly'`).
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
    // Hard reject — patient JWTs may not post these banners.
    throw new ForbiddenError(
      'Patients cannot post in-call quick-action banners',
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
 * Validate + auth-gate + emit the in-call quick-action banner. Errors
 * propagate to the route handler as our standard `*Error` types so the
 * controller's central error mapper turns them into the right HTTP
 * status codes.
 *
 * Validation runs FIRST (gate-ordering doctrine), so a bad payload
 * doesn't trigger an upstream auth call.
 */
export async function postQuickActionBanner(
  options: PostQuickActionBannerOptions,
): Promise<PostQuickActionBannerResult> {
  const { sessionId, bearerJwt, action: rawAction, correlationId } = options;

  // Path-param sanity (matches snapshot service shape).
  if (!UUID_REGEX.test(sessionId)) {
    throw new ValidationError('sessionId must be a UUID');
  }
  if (!correlationId || typeof correlationId !== 'string') {
    throw new ValidationError('correlationId is required');
  }

  // Validation gate — ordering matters; bad payloads must not trigger
  // the supabase-auth round-trip or the session-row lookup.
  const action = validateQuickAction(rawAction);

  // Doctor-only auth gate.
  const caller = await resolveDoctorCallerForSession(sessionId, bearerJwt);

  // Fire the right emitter. Both are fire-and-forget at the
  // banner-write layer (errors are swallowed by the emitter) — but if
  // the emitter itself never gets called we'd silently lose the banner,
  // so we only get here after auth + validation succeeds.
  const emittedAt = new Date();
  if (action.kind === 'rx_sent') {
    await emitRxSent(sessionId, action.prescriptionId, correlationId);
  } else {
    await emitFollowUpScheduled(
      sessionId,
      action.appointmentId,
      new Date(action.scheduledAt),
      correlationId,
    );
  }

  logger.info(
    {
      sessionId,
      doctorId: caller.doctorId,
      kind: action.kind,
      correlationId,
    },
    'Quick-action banner emitted',
  );

  return {
    kind: action.kind,
    emittedAt: emittedAt.toISOString(),
  };
}
