/**
 * Supabase Access-Token Local Verifier (np-02)
 *
 * Verifies a Supabase **GoTrue access token** locally (signature + standard
 * claims) so the auth middleware no longer pays a per-request
 * `supabase.auth.getUser(token)` network round-trip on the hot path
 * (navigation-performance Phase 1, removes ~150–500ms/request).
 *
 * Signing scheme (detected — NP-Q2):
 *   This project's Supabase instance uses the **legacy HS256 shared-secret**
 *   scheme. The symmetric key is `SUPABASE_JWT_SECRET` (Supabase Dashboard →
 *   Project Settings → API → "JWT Secret"). Evidence: `services/
 *   supabase-jwt-mint.ts` signs HS256 JWTs with this same secret that the
 *   live Supabase project accepts at REST + Realtime (see
 *   `scripts/diagnose-text-consult-jwt.ts`), which is only possible under a
 *   shared-secret scheme.
 *
 * Revocation tradeoff (accepted — task 1.3):
 *   Local verification trusts the token until its `exp`. A user who is
 *   deleted/banned, or whose refresh token is revoked, keeps passing this
 *   middleware until their *access* token expires (Supabase default ≈ 1h).
 *   This is the standard JWT tradeoff and matches the task's intent. The
 *   blast radius is bounded by the short access-token lifetime; refresh is
 *   already blocked server-side at the Supabase layer.
 *
 * Security posture — **fail closed**:
 *   Any conclusive verification failure (bad signature, expired, wrong
 *   audience, malformed, unsigned/`alg:none`, missing subject) returns a
 *   `rejected` verdict — the caller MUST translate that to 401 and MUST NOT
 *   fall through to "authenticated". Only genuinely *inconclusive* cases
 *   (secret not configured, or an asymmetric `alg` we can't verify with the
 *   shared secret, or a validly-signed token whose issuer isn't this
 *   project's GoTrue) yield `inconclusive`, which the caller may resolve via
 *   the authoritative remote `getUser` check (never weaker than today).
 *
 * No PHI / no token contents are logged or returned — only opaque reason
 * codes (e.g. `'verification_failed'`).
 *
 * @see middleware/auth.ts (sole caller)
 * @see services/supabase-jwt-mint.ts (the symmetric-secret minting side)
 */

import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { User } from '@supabase/supabase-js';
import { env } from '../config/env';

/**
 * Outcome of a local verification attempt.
 *  - `verified`     → token is good; `user` mirrors the `req.user` shape the
 *                     middleware sets today (id from `sub`, plus standard claims).
 *  - `rejected`     → conclusive failure; caller MUST fail closed (401).
 *  - `inconclusive` → cannot decide locally; caller MAY fall back to the
 *                     remote `getUser` check (authoritative, fail-safe).
 */
export type VerifyAccessTokenResult =
  | { status: 'verified'; user: User }
  | { status: 'rejected'; reason: string }
  | { status: 'inconclusive'; reason: string };

/**
 * Asymmetric algorithms Supabase could use if a project migrates off the
 * legacy shared secret to JWT signing keys. We cannot verify these with
 * `SUPABASE_JWT_SECRET`, so they are routed to the remote fallback rather
 * than falsely rejected — this is the detect-first guard against a silent
 * scheme mismatch (task risk "Scheme mismatch").
 */
const ASYMMETRIC_ALGS = new Set([
  'RS256',
  'RS384',
  'RS512',
  'ES256',
  'ES384',
  'ES512',
  'PS256',
  'PS384',
  'PS512',
  'EdDSA',
]);

/** The `aud` every Supabase auth token carries. Mirrors `verifyScopedConsultationJwt`. */
const SUPABASE_AUDIENCE = 'authenticated';

/**
 * Expected `iss` of a GoTrue-issued access token for this project:
 * `${SUPABASE_URL}/auth/v1`. Used to distinguish real access tokens (hot
 * path, verified locally) from other validly-signed tokens — e.g. the
 * scoped consult JWTs minted by `supabase-jwt-mint.ts`, which carry no
 * `iss` — which are deferred to the remote check for parity with `getUser`.
 */
function expectedIssuer(): string {
  return `${env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1`;
}

/**
 * Build the `User` object the middleware attaches to `req.user`.
 *
 * Downstream consumers read only `req.user.id` (verified across all
 * controllers), but we reconstruct the standard claims faithfully so the
 * shape stays a valid `@supabase/supabase-js` `User` and nothing downstream
 * regresses. `created_at` is not present in an access token (it's account
 * metadata, not a JWT claim) and no consumer reads it, so it is left empty.
 */
function buildUserFromClaims(payload: JwtPayload, sub: string): User {
  const appMetadata =
    payload.app_metadata && typeof payload.app_metadata === 'object'
      ? (payload.app_metadata as Record<string, unknown>)
      : {};
  const userMetadata =
    payload.user_metadata && typeof payload.user_metadata === 'object'
      ? (payload.user_metadata as Record<string, unknown>)
      : {};

  const user: User = {
    id: sub,
    aud: typeof payload.aud === 'string' ? payload.aud : SUPABASE_AUDIENCE,
    role: typeof payload.role === 'string' ? payload.role : undefined,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    phone: typeof payload.phone === 'string' ? payload.phone : undefined,
    app_metadata: appMetadata as User['app_metadata'],
    user_metadata: userMetadata as User['user_metadata'],
    created_at: '',
  };

  if (typeof payload.is_anonymous === 'boolean') {
    user.is_anonymous = payload.is_anonymous;
  }

  return user;
}

/**
 * Verify a Supabase access token locally.
 *
 * @param token - the raw bearer token (already stripped of the `Bearer ` prefix).
 * @returns a {@link VerifyAccessTokenResult}. Never throws.
 */
export function verifySupabaseAccessToken(token: string): VerifyAccessTokenResult {
  const secret = env.SUPABASE_JWT_SECRET?.trim();
  if (!secret) {
    // No secret provisioned yet → we cannot verify locally. Defer to the
    // remote check so deployments mid-rollout keep working (fail-safe, not
    // fail-open: the remote path still validates).
    return { status: 'inconclusive', reason: 'jwt_secret_not_configured' };
  }

  const trimmed = token?.trim();
  if (!trimmed) {
    return { status: 'rejected', reason: 'empty_token' };
  }

  // Inspect the header WITHOUT trusting the (unverified) payload, so we can
  // detect the signing scheme before choosing how to verify.
  let decoded: ReturnType<typeof jwt.decode>;
  try {
    decoded = jwt.decode(trimmed, { complete: true });
  } catch {
    decoded = null;
  }
  if (!decoded || typeof decoded === 'string' || !decoded.header) {
    return { status: 'rejected', reason: 'malformed_token' };
  }

  const alg = decoded.header.alg;
  if (alg && ASYMMETRIC_ALGS.has(alg)) {
    // Project may have rotated to asymmetric JWT signing keys; the shared
    // secret can't verify those. Defer to remote rather than break auth.
    return { status: 'inconclusive', reason: 'asymmetric_alg' };
  }
  if (alg !== 'HS256') {
    // `none` / unknown alg is never acceptable for a signed token → fail closed.
    return { status: 'rejected', reason: 'unsupported_alg' };
  }

  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(trimmed, secret, {
      algorithms: ['HS256'],
      audience: SUPABASE_AUDIENCE,
    });
  } catch {
    // Bad signature, expired (`exp`), wrong audience, `nbf` in the future,
    // or otherwise invalid → conclusive rejection, fail closed.
    return { status: 'rejected', reason: 'verification_failed' };
  }

  if (typeof payload === 'string') {
    return { status: 'rejected', reason: 'unexpected_payload' };
  }

  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!sub) {
    // A token with no subject cannot identify a user; `getUser` would never
    // return one either.
    return { status: 'rejected', reason: 'missing_subject' };
  }

  // The token is validly signed and unexpired. Only treat it as a verified
  // GoTrue *access* token when its issuer matches this project's GoTrue.
  // Anything else validly-signed (e.g. our own scoped consult JWTs, which
  // carry no `iss`) is deferred to the authoritative remote check so we
  // reject exactly the set `getUser` rejects — and so an unexpected issuer
  // never silently grants access on the fast path.
  if (payload.iss !== expectedIssuer()) {
    return { status: 'inconclusive', reason: 'unexpected_issuer' };
  }

  return { status: 'verified', user: buildUserFromClaims(payload, sub) };
}
