/**
 * Prescription share-link token service (EHR Sub-batch B2 / T3.16).
 *
 * Mints + verifies HMAC-signed tokens used by the patient-facing
 * `/r/[id]?t=<token>` route. Pattern mirrors
 * `backend/src/utils/consultation-token.ts` (Plan 03 / e-task-3) so
 * the wire format and crypto choices are intentionally identical:
 *
 *   token  = base64url(payload) + '.' + base64url(hmac256(payload))
 *   payload = JSON.stringify({ rxId, exp, kind: 'rx-share' })
 *
 * Why HMAC, not Supabase patient JWT (Decision T3-D3 LOCKED):
 *   - Patients have no Supabase identity in this product. Adding one
 *     just for the share page would be a major scope creep.
 *   - HMAC tokens are stateless — no table writes on mint/verify, no
 *     RLS policy plumbing, no revocation surface (the 24h TTL caps
 *     exposure on its own).
 *   - The token IS bound to `rxId` so a leaked token can't be
 *     redirected at someone else's prescription (the verify step
 *     checks the URL `:id` against the payload `rxId`).
 *
 * The HMAC SECRET (`RX_SHARE_TOKEN_SECRET`) is required in non-test
 * envs. We do NOT throw on import — env loading is centralised in
 * `config/env.ts` — but `mintRxToken` and `verifyRxToken` throw if
 * the secret is missing/short. This matches the existing
 * `generateConsultationToken` ergonomics.
 */

import crypto from 'crypto';
import { env } from '../config/env';

const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24h
const TOKEN_KIND = 'rx-share';

interface RxTokenPayload {
  /** Prescription ID this token is bound to. */
  rxId: string;
  /** Unix timestamp (seconds) at which the token expires. */
  exp: number;
  /** Discriminator so an HMAC collision with another token kind can't be reused here. */
  kind: typeof TOKEN_KIND;
}

export type VerifyRxTokenReason =
  | 'missing_token'
  | 'missing_secret'
  | 'malformed'
  | 'invalid_signature'
  | 'wrong_kind'
  | 'wrong_rx_id'
  | 'expired';

export interface VerifyRxTokenResult {
  ok: boolean;
  reason?: VerifyRxTokenReason;
  /** Echoed back when ok=true; useful for audit logs. */
  rxId?: string;
  /** Token expiry (seconds since epoch). Useful for cache headers / debugging. */
  exp?: number;
}

function getSecret(): string {
  const secret = env.RX_SHARE_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    // 32 chars = the `openssl rand -hex 32` output (hex 32 → 64 chars).
    // We're permissive here (>=32) so an `openssl rand -base64 24` (~32
    // chars) also passes. The pre-batch checklist tells ops to use the
    // hex variant — this floor catches accidentally-short secrets.
    throw new Error(
      'RX_SHARE_TOKEN_SECRET must be set and at least 32 characters. ' +
        'Generate with: openssl rand -hex 32',
    );
  }
  return secret;
}

/**
 * Mint a fresh HMAC token bound to `prescriptionId`. Default TTL is
 * 24h; callers may override (e.g. for testing).
 */
export function mintRxToken(
  prescriptionId: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  if (!prescriptionId || typeof prescriptionId !== 'string') {
    throw new Error('mintRxToken: prescriptionId is required');
  }
  if (ttlSeconds <= 0) {
    throw new Error('mintRxToken: ttlSeconds must be > 0');
  }
  const secret = getSecret();

  const payload: RxTokenPayload = {
    rxId: prescriptionId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    kind: TOKEN_KIND,
  };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr, 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

/**
 * Verify a token AND confirm it was minted for the supplied
 * prescription ID. Never throws — returns a discriminated result so
 * the controller can choose between 401/410 styling without try/catch
 * acrobatics.
 *
 * Time-constant signature comparison via `crypto.timingSafeEqual`.
 */
export function verifyRxToken(
  token: string | undefined | null,
  prescriptionId: string,
): VerifyRxTokenResult {
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'missing_token' };
  }
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return { ok: false, reason: 'missing_secret' };
  }

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'malformed' };
  }
  const [payloadB64, sigB64] = parts;

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');
  let sigBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    sigBuf = Buffer.from(sigB64, 'base64url');
    expectedBuf = Buffer.from(expectedSig, 'base64url');
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return { ok: false, reason: 'invalid_signature' };
  }

  let payload: RxTokenPayload;
  try {
    const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
    payload = JSON.parse(payloadStr) as RxTokenPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (
    !payload ||
    typeof payload.rxId !== 'string' ||
    typeof payload.exp !== 'number' ||
    payload.kind !== TOKEN_KIND
  ) {
    return { ok: false, reason: 'wrong_kind' };
  }

  if (payload.rxId !== prescriptionId) {
    // Prevents the "swap the URL :id while keeping the token" attack.
    return { ok: false, reason: 'wrong_rx_id' };
  }

  if (Math.floor(Date.now() / 1000) >= payload.exp) {
    return { ok: false, reason: 'expired', rxId: payload.rxId, exp: payload.exp };
  }

  return { ok: true, rxId: payload.rxId, exp: payload.exp };
}

/**
 * Ergonomic helper for Decision T3-D3: build the share URL given a
 * prescription id + a freshly-minted token + the public app base URL
 * (passed in by the caller — keeps env.ts as the only thing that
 * reads `APP_BASE_URL`).
 */
export function buildShareUrl(
  appBaseUrl: string,
  prescriptionId: string,
  token: string,
): string {
  const trimmed = appBaseUrl.replace(/\/$/, '');
  return `${trimmed}/r/${encodeURIComponent(prescriptionId)}?t=${encodeURIComponent(token)}`;
}
