/**
 * Local Supabase access-token verifier — token battery (np-02, task 4.1).
 *
 * Pins the fail-closed contract of `verifySupabaseAccessToken`:
 *   - valid          → `verified` + reconstructed `req.user` shape (id = sub)
 *   - expired        → `rejected`  (never accepted)
 *   - wrong signature→ `rejected`
 *   - wrong audience → `rejected`
 *   - malformed      → `rejected`
 *   - alg:none       → `rejected`  (unsigned tokens never accepted)
 *   - missing subject→ `rejected`
 *   - empty          → `rejected`
 *   - secret unset   → `inconclusive` (rollout fallback)
 *   - asymmetric alg → `inconclusive` (scheme-migration fallback)
 *   - wrong issuer / our own scoped consult JWT → `inconclusive`
 *     (deferred to the authoritative remote check — parity with getUser,
 *     which rejects these)
 *
 * The signing scheme under test is the project's legacy HS256 shared secret
 * (`SUPABASE_JWT_SECRET`). See `utils/supabase-token-verifier.ts` header.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import jwt from 'jsonwebtoken';

const SECRET = 'unit-test-supabase-jwt-secret-at-least-16';
const SUPABASE_URL = 'https://test.supabase.co';
const EXPECTED_ISS = `${SUPABASE_URL}/auth/v1`;
const USER_ID = '00000000-0000-0000-0000-0000000000aa';

// The factory is hoisted above imports, so it cannot close over the consts
// above — the literals are mirrored here and asserted-by-construction via the
// `SECRET` / `SUPABASE_URL` consts used in the token builders below. We import
// the created `env` object and mutate it per-test (see beforeEach).
jest.mock('../../../src/config/env', () => ({
  env: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_JWT_SECRET: 'unit-test-supabase-jwt-secret-at-least-16',
  },
}));

import { env as mockEnv } from '../../../src/config/env';
import { verifySupabaseAccessToken } from '../../../src/utils/supabase-token-verifier';

// ---------------------------------------------------------------------------
// Token builders
// ---------------------------------------------------------------------------

function signToken(
  payloadOverrides: Record<string, unknown> = {},
  opts: { secret?: string; alg?: jwt.Algorithm } = {},
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    sub: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    iss: EXPECTED_ISS,
    email: 'doctor@example.test',
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: 'Test Doctor' },
    iat: nowSec,
    exp: nowSec + 3600,
    ...payloadOverrides,
  };
  return jwt.sign(payload, opts.secret ?? SECRET, { algorithm: opts.alg ?? 'HS256' });
}

/** Craft a structurally-valid JWT with an arbitrary header alg (no real signature). */
function craftTokenWithAlg(alg: string): string {
  const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ alg, typ: 'JWT' });
  const body = b64({ sub: USER_ID, aud: 'authenticated', iss: EXPECTED_ISS });
  const sig = Buffer.from('not-a-real-signature').toString('base64url');
  return `${header}.${body}.${sig}`;
}

beforeEach(() => {
  mockEnv.SUPABASE_URL = SUPABASE_URL;
  mockEnv.SUPABASE_JWT_SECRET = SECRET;
});

// ---------------------------------------------------------------------------
// Verified (accepted) — the hot path
// ---------------------------------------------------------------------------

describe('verifySupabaseAccessToken — verified', () => {
  it('accepts a valid HS256 access token and reconstructs the req.user shape', () => {
    const result = verifySupabaseAccessToken(signToken());

    expect(result.status).toBe('verified');
    if (result.status !== 'verified') return; // type narrow
    expect(result.user.id).toBe(USER_ID);
    expect(result.user.aud).toBe('authenticated');
    expect(result.user.role).toBe('authenticated');
    expect(result.user.email).toBe('doctor@example.test');
    expect(result.user.app_metadata).toEqual({ provider: 'email', providers: ['email'] });
    expect(result.user.user_metadata).toEqual({ full_name: 'Test Doctor' });
    // created_at is not a JWT claim; left empty (no consumer reads it).
    expect(result.user.created_at).toBe('');
  });

  it('accepts an aud array that includes "authenticated"', () => {
    const result = verifySupabaseAccessToken(signToken({ aud: ['authenticated', 'other'] }));
    expect(result.status).toBe('verified');
  });

  it('tolerates a trailing slash on SUPABASE_URL when computing the issuer', () => {
    mockEnv.SUPABASE_URL = `${SUPABASE_URL}/`;
    const result = verifySupabaseAccessToken(signToken());
    expect(result.status).toBe('verified');
  });
});

// ---------------------------------------------------------------------------
// Rejected (fail closed) — must never become "authenticated"
// ---------------------------------------------------------------------------

describe('verifySupabaseAccessToken — rejected (fail closed)', () => {
  it('rejects an expired token', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const result = verifySupabaseAccessToken(signToken({ iat: nowSec - 7200, exp: nowSec - 60 }));
    expect(result).toEqual({ status: 'rejected', reason: 'verification_failed' });
  });

  it('rejects a token signed with the wrong secret', () => {
    const result = verifySupabaseAccessToken(
      signToken({}, { secret: 'a-totally-different-secret-value-1234' }),
    );
    expect(result).toEqual({ status: 'rejected', reason: 'verification_failed' });
  });

  it('rejects a token with the wrong audience', () => {
    const result = verifySupabaseAccessToken(signToken({ aud: 'anon' }));
    expect(result).toEqual({ status: 'rejected', reason: 'verification_failed' });
  });

  it('rejects a malformed token', () => {
    expect(verifySupabaseAccessToken('not-a-jwt')).toEqual({
      status: 'rejected',
      reason: 'malformed_token',
    });
    expect(verifySupabaseAccessToken('aaa.bbb.ccc')).toEqual({
      status: 'rejected',
      reason: 'malformed_token',
    });
  });

  it('rejects an unsigned (alg:none) token', () => {
    const result = verifySupabaseAccessToken(craftTokenWithAlg('none'));
    expect(result).toEqual({ status: 'rejected', reason: 'unsupported_alg' });
  });

  it('rejects a token missing the subject claim', () => {
    const result = verifySupabaseAccessToken(signToken({ sub: undefined }));
    expect(result).toEqual({ status: 'rejected', reason: 'missing_subject' });
  });

  it('rejects an empty token', () => {
    expect(verifySupabaseAccessToken('')).toEqual({ status: 'rejected', reason: 'empty_token' });
    expect(verifySupabaseAccessToken('   ')).toEqual({ status: 'rejected', reason: 'empty_token' });
  });
});

// ---------------------------------------------------------------------------
// Inconclusive — defer to the authoritative remote getUser check
// ---------------------------------------------------------------------------

describe('verifySupabaseAccessToken — inconclusive (remote fallback)', () => {
  it('is inconclusive when the JWT secret is not configured', () => {
    mockEnv.SUPABASE_JWT_SECRET = undefined;
    const result = verifySupabaseAccessToken(signToken());
    expect(result).toEqual({ status: 'inconclusive', reason: 'jwt_secret_not_configured' });
  });

  it('is inconclusive for an asymmetric-alg token (possible scheme migration)', () => {
    const result = verifySupabaseAccessToken(craftTokenWithAlg('RS256'));
    expect(result).toEqual({ status: 'inconclusive', reason: 'asymmetric_alg' });
  });

  it('is inconclusive for a validly-signed token with an unexpected issuer', () => {
    const result = verifySupabaseAccessToken(signToken({ iss: 'https://evil.example/auth/v1' }));
    expect(result).toEqual({ status: 'inconclusive', reason: 'unexpected_issuer' });
  });

  it('is inconclusive for our own scoped consult JWT (no iss) — parity with getUser', () => {
    // Mirrors `mintScopedConsultationJwt`: same secret, aud=authenticated,
    // synthetic patient sub, NO iss claim. getUser rejects these (synthetic
    // sub is not a real user); we must not accept them on the fast path.
    const consultToken = signToken({
      sub: 'patient:appt-1',
      consult_role: 'patient',
      session_id: '11111111-1111-1111-1111-111111111111',
      iss: undefined,
      role: undefined,
      email: undefined,
    });
    const result = verifySupabaseAccessToken(consultToken);
    expect(result).toEqual({ status: 'inconclusive', reason: 'unexpected_issuer' });
  });
});
