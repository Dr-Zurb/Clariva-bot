/**
 * Unit tests for `services/supabase-jwt-mint.ts` (Plan 04 · Task 18).
 *
 * Covers:
 *   - HS256 signing with `SUPABASE_JWT_SECRET`
 *   - Standard Supabase claim shape (`aud`, `role`, `sub`, `exp`)
 *   - Custom claims (`session_id`, `consult_role`)
 *   - Expiry honoring + roundtrip (verifyScopedConsultationJwt)
 *   - Doctor vs patient sub conventions
 *   - Error surfaces: missing secret, missing fields, past expiry, signature mismatch
 *
 * Uses the real `jsonwebtoken` library (no mock) — the whole point of
 * these tests is to confirm the bytes go in/out of the canonical Supabase
 * JWT format. The env layer is mocked at module scope so we can flip
 * `SUPABASE_JWT_SECRET` without touching real env vars.
 */

import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'test-secret-thirty-two-bytes-long-please';

jest.mock('../../../src/config/env', () => ({
  env: {
    SUPABASE_JWT_SECRET: TEST_SECRET,
  },
}));

import {
  buildPatientSub,
  mintScopedConsultationJwt,
  verifyScopedConsultationJwt,
} from '../../../src/services/supabase-jwt-mint';
import { env } from '../../../src/config/env';
import { InternalError } from '../../../src/utils/errors';

const mutableEnv = env as { SUPABASE_JWT_SECRET: string | undefined };

describe('supabase-jwt-mint', () => {
  beforeEach(() => {
    mutableEnv.SUPABASE_JWT_SECRET = TEST_SECRET;
  });
  afterEach(() => {
    mutableEnv.SUPABASE_JWT_SECRET = TEST_SECRET;
  });

  describe('mintScopedConsultationJwt', () => {
    it('signs HS256 and the resulting token decodes to the canonical Supabase shape', () => {
      const exp = new Date(Date.now() + 60 * 60 * 1000);
      const result = mintScopedConsultationJwt({
        sub:       'doctor-uuid-1',
        role:      'doctor',
        sessionId: 'sess-uuid-1',
        expiresAt: exp,
      });

      const decoded = jwt.verify(result.token, TEST_SECRET, {
        algorithms: ['HS256'],
        audience:   'authenticated',
      }) as Record<string, unknown>;

      expect(decoded.aud).toBe('authenticated');
      expect(decoded.role).toBe('authenticated');
      expect(decoded.sub).toBe('doctor-uuid-1');
      expect(decoded.consult_role).toBe('doctor');
      expect(decoded.session_id).toBe('sess-uuid-1');
      expect(typeof decoded.exp).toBe('number');
      expect(typeof decoded.iat).toBe('number');
      expect(decoded.exp).toBe(Math.floor(exp.getTime() / 1000));
    });

    it('mints a patient JWT with a synthetic sub via buildPatientSub', () => {
      const sub = buildPatientSub('appt-1');
      expect(sub).toBe('patient:appt-1');

      const result = mintScopedConsultationJwt({
        sub,
        role:      'patient',
        sessionId: 'sess-9',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });
      const decoded = jwt.decode(result.token) as Record<string, unknown>;
      expect(decoded.sub).toBe('patient:appt-1');
      expect(decoded.consult_role).toBe('patient');
      expect(decoded.session_id).toBe('sess-9');
    });

    it('throws when SUPABASE_JWT_SECRET is missing', () => {
      mutableEnv.SUPABASE_JWT_SECRET = undefined;
      expect(() =>
        mintScopedConsultationJwt({
          sub:       'd',
          role:      'doctor',
          sessionId: 's',
          expiresAt: new Date(Date.now() + 1000),
        }),
      ).toThrow(InternalError);
    });

    it('throws on missing sub', () => {
      expect(() =>
        mintScopedConsultationJwt({
          sub:       '   ',
          role:      'doctor',
          sessionId: 'sess',
          expiresAt: new Date(Date.now() + 1000),
        }),
      ).toThrow(/sub is required/);
    });

    it('throws on missing sessionId', () => {
      expect(() =>
        mintScopedConsultationJwt({
          sub:       'd',
          role:      'doctor',
          sessionId: '',
          expiresAt: new Date(Date.now() + 1000),
        }),
      ).toThrow(/sessionId is required/);
    });

    it('throws when expiresAt is not in the future', () => {
      expect(() =>
        mintScopedConsultationJwt({
          sub:       'd',
          role:      'doctor',
          sessionId: 's',
          expiresAt: new Date(Date.now() - 1000),
        }),
      ).toThrow(/expiresAt must be in the future/);
    });

    it('returned expiresAt rounds to second precision matching the JWT exp claim', () => {
      const exp = new Date(Date.now() + 5_500); // 5.5s from now
      const result = mintScopedConsultationJwt({
        sub:       'd',
        role:      'doctor',
        sessionId: 's',
        expiresAt: exp,
      });
      // JWT `exp` is unix seconds; the returned Date should match
      // floor(exp / 1000) * 1000 (so milliseconds are zeroed).
      expect(result.expiresAt.getTime() % 1000).toBe(0);
      expect(result.expiresAt.getTime()).toBe(Math.floor(exp.getTime() / 1000) * 1000);
    });
  });

  describe('verifyScopedConsultationJwt', () => {
    it('roundtrips a freshly minted token', () => {
      const minted = mintScopedConsultationJwt({
        sub:       'patient:a-1',
        role:      'patient',
        sessionId: 'sess-x',
        expiresAt: new Date(Date.now() + 60_000),
      });
      const payload = verifyScopedConsultationJwt(minted.token);
      expect(payload.sub).toBe('patient:a-1');
      expect(payload.session_id).toBe('sess-x');
      expect(payload.consult_role).toBe('patient');
    });

    it('rejects a token signed with a different secret', () => {
      const token = jwt.sign(
        {
          aud:          'authenticated',
          role:         'authenticated',
          sub:          'imposter',
          exp:          Math.floor(Date.now() / 1000) + 60,
          session_id:   'sess-x',
          consult_role: 'patient',
        },
        'wrong-secret-thirty-two-bytes-long-please',
      );
      expect(() => verifyScopedConsultationJwt(token)).toThrow();
    });

    it('rejects an expired token', () => {
      const token = jwt.sign(
        {
          aud:          'authenticated',
          role:         'authenticated',
          sub:          'd',
          exp:          Math.floor(Date.now() / 1000) - 60, // already expired
          session_id:   'sess-x',
          consult_role: 'doctor',
        },
        TEST_SECRET,
      );
      expect(() => verifyScopedConsultationJwt(token)).toThrow();
    });

    it('rejects a token missing required claims', () => {
      const token = jwt.sign(
        {
          aud:  'authenticated',
          role: 'authenticated',
          sub:  'd',
          exp:  Math.floor(Date.now() / 1000) + 60,
          // session_id + consult_role missing
        },
        TEST_SECRET,
      );
      expect(() => verifyScopedConsultationJwt(token)).toThrow(/missing required claims/);
    });

    it('throws when secret is missing', () => {
      mutableEnv.SUPABASE_JWT_SECRET = undefined;
      expect(() => verifyScopedConsultationJwt('any.token.here')).toThrow(
        /SUPABASE_JWT_SECRET is not configured/,
      );
    });

    it('throws on empty token', () => {
      expect(() => verifyScopedConsultationJwt('')).toThrow(/token is required/);
    });
  });

  describe('buildPatientSub', () => {
    it('returns patient:{appointmentId}', () => {
      expect(buildPatientSub('appt-7')).toBe('patient:appt-7');
    });
    it('throws on empty appointmentId', () => {
      expect(() => buildPatientSub('')).toThrow(/appointmentId is required/);
      expect(() => buildPatientSub('   ')).toThrow(/appointmentId is required/);
    });
  });
});
