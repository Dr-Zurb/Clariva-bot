/**
 * Supabase JWT Mint (Plan 04 · Task 18)
 *
 * Signs scoped Supabase JWTs (HS256 with the project's `SUPABASE_JWT_SECRET`)
 * for the text-consult Realtime channel. Two callers exist:
 *
 *   1. **Doctor** — JWT `sub` = the doctor's `auth.users.id` (real Supabase
 *      auth user). The RLS doctor branch keys on `auth.uid() = doctor_id`,
 *      so the JWT goes through the standard path.
 *
 *   2. **Patient** — JWT `sub` = `'patient:{appointmentId}'` (synthetic;
 *      bot patients have no `auth.users` row). The RLS patient branch
 *      (added by migration 052) keys on the custom claims
 *      `consult_role = 'patient'` and `session_id = <sid>`, NOT on
 *      `auth.uid()`. So the synthetic `sub` is fine — it just needs to
 *      be unique per patient so Supabase Realtime presence works.
 *
 * No PHI in the JWT body. The custom claims are opaque IDs only.
 *
 * @see migrations/052_consultation_messages_patient_jwt_rls.sql
 * @see services/text-session-supabase.ts (the only caller)
 */

import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { InternalError } from '../utils/errors';

// ============================================================================
// Types
// ============================================================================

export type ConsultRole = 'doctor' | 'patient';

export interface MintScopedJwtInput {
  /**
   * Subject (`sub`) claim.
   *  - Doctor: the doctor's `auth.users.id` UUID.
   *  - Patient: a synthetic string `'patient:{appointmentId}'` so each
   *    patient maps to a stable unique Realtime presence id.
   */
  sub: string;

  /** Whether this JWT is for a doctor or patient. Drives the custom claim. */
  role: ConsultRole;

  /** `consultation_sessions.id` UUID. Pinned via the `session_id` claim. */
  sessionId: string;

  /**
   * Token expiry as a JavaScript `Date`. Caller (text adapter) computes
   * this from the session's `expected_end_at` + the env-configurable
   * post-end buffer (`TEXT_CONSULT_JWT_TTL_MINUTES_AFTER_END`).
   */
  expiresAt: Date;
}

export interface MintScopedJwtResult {
  token: string;
  expiresAt: Date;
}

/**
 * Decoded payload shape — exported for the controller's token-exchange
 * handler (which inspects claims to authorize before re-issuing). Aligned
 * with the standard Supabase JWT shape (`aud`, `role`, `sub`, `exp`) plus
 * our two custom claims (`session_id`, `consult_role`).
 */
export interface ScopedJwtPayload {
  aud: 'authenticated';
  role: 'authenticated';
  sub: string;
  exp: number;
  iat: number;
  session_id: string;
  consult_role: ConsultRole;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Mint a scoped consultation JWT.
 *
 * @throws InternalError if `SUPABASE_JWT_SECRET` is unset (caller bug —
 *   text-consult code-paths should validate config at startup or fail-fast
 *   on first call).
 * @throws InternalError on `expiresAt` in the past (caller bug).
 */
export function mintScopedConsultationJwt(
  input: MintScopedJwtInput,
): MintScopedJwtResult {
  const secret = env.SUPABASE_JWT_SECRET?.trim();
  if (!secret) {
    throw new InternalError(
      'mintScopedConsultationJwt: SUPABASE_JWT_SECRET is not configured. ' +
        'Set it from Supabase Project Settings → API → JWT Secret to enable text-consult.',
    );
  }

  const sub = input.sub?.trim();
  if (!sub) {
    throw new InternalError('mintScopedConsultationJwt: sub is required');
  }

  const sessionId = input.sessionId?.trim();
  if (!sessionId) {
    throw new InternalError('mintScopedConsultationJwt: sessionId is required');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = Math.floor(input.expiresAt.getTime() / 1000);
  if (expSec <= nowSec) {
    throw new InternalError(
      'mintScopedConsultationJwt: expiresAt must be in the future',
    );
  }

  const payload: Omit<ScopedJwtPayload, 'iat'> = {
    aud: 'authenticated',
    role: 'authenticated',
    sub,
    exp: expSec,
    session_id: sessionId,
    consult_role: input.role,
  };

  const token = jwt.sign(payload, secret, {
    algorithm: 'HS256',
    // `iat` is set automatically by jsonwebtoken; `exp` is honored from
    // the payload above (do NOT pass `expiresIn` here — it would conflict
    // with the explicit `exp` and throw).
  });

  return {
    token,
    expiresAt: new Date(expSec * 1000),
  };
}

/**
 * Verify a token signed by `mintScopedConsultationJwt`. Returns the decoded
 * payload on success; throws on signature mismatch / expiry / shape errors.
 *
 * Used by the patient-facing token-exchange controller (`POST
 * /api/v1/consultation/:sessionId/text-token`) to validate the
 * one-time bearer minted at booking before re-issuing a fresh consult JWT.
 */
export function verifyScopedConsultationJwt(token: string): ScopedJwtPayload {
  const secret = env.SUPABASE_JWT_SECRET?.trim();
  if (!secret) {
    throw new InternalError(
      'verifyScopedConsultationJwt: SUPABASE_JWT_SECRET is not configured.',
    );
  }
  const trimmed = token?.trim();
  if (!trimmed) {
    throw new InternalError('verifyScopedConsultationJwt: token is required');
  }

  const decoded = jwt.verify(trimmed, secret, {
    algorithms: ['HS256'],
    audience: 'authenticated',
  });

  if (typeof decoded === 'string') {
    throw new InternalError('verifyScopedConsultationJwt: unexpected token shape');
  }
  const p = decoded as Partial<ScopedJwtPayload>;
  if (
    p.aud !== 'authenticated' ||
    p.role !== 'authenticated' ||
    typeof p.sub !== 'string' ||
    typeof p.exp !== 'number' ||
    typeof p.session_id !== 'string' ||
    (p.consult_role !== 'doctor' && p.consult_role !== 'patient')
  ) {
    throw new InternalError(
      'verifyScopedConsultationJwt: token payload missing required claims',
    );
  }
  return p as ScopedJwtPayload;
}

/**
 * Build the synthetic patient `sub` from the appointment id. Centralized
 * so the text adapter and any future caller (Plan 06 attachments,
 * Plan 09 mid-consult switch) use the same shape.
 */
export function buildPatientSub(appointmentId: string): string {
  const trimmed = appointmentId?.trim();
  if (!trimmed) {
    throw new InternalError('buildPatientSub: appointmentId is required');
  }
  return `patient:${trimmed}`;
}
