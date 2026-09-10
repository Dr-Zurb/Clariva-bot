/**
 * crc-14 — purpose-minted lobby presence JWT.
 */

import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'test-secret-thirty-two-bytes-long-please';
const HMAC_SECRET = 'consultation-token-secret-16';

jest.mock('../../../src/config/env', () => ({
  env: {
    SUPABASE_JWT_SECRET: TEST_SECRET,
    CONSULTATION_TOKEN_SECRET: HMAC_SECRET,
  },
}));

import {
  LOBBY_PRESENCE_PURPOSE,
  buildLobbyPresenceSub,
  issueLobbyPresenceJwt,
  mintLobbyPresenceJwt,
  verifyLobbyPresenceJwt,
} from '../../../src/services/lobby-presence-jwt';
import { mintScopedConsultationJwt } from '../../../src/services/supabase-jwt-mint';
import { generateConsultationToken } from '../../../src/utils/consultation-token';
import { env } from '../../../src/config/env';
import { InternalError } from '../../../src/utils/errors';

const mutableEnv = env as {
  SUPABASE_JWT_SECRET: string | undefined;
  CONSULTATION_TOKEN_SECRET: string | undefined;
};

describe('lobby-presence-jwt (crc-14)', () => {
  beforeEach(() => {
    mutableEnv.SUPABASE_JWT_SECRET = TEST_SECRET;
    mutableEnv.CONSULTATION_TOKEN_SECRET = HMAC_SECRET;
  });
  afterEach(() => {
    mutableEnv.SUPABASE_JWT_SECRET = TEST_SECRET;
    mutableEnv.CONSULTATION_TOKEN_SECRET = HMAC_SECRET;
  });

  describe('mint / verify', () => {
    it('stamps purpose + appointment_id and omits session-scoped claims', () => {
      const exp = new Date(Date.now() + 60 * 60 * 1000);
      const minted = mintLobbyPresenceJwt({
        appointmentId: 'appt-uuid-1',
        expiresAt: exp,
      });
      const decoded = jwt.verify(minted.token, TEST_SECRET, {
        algorithms: ['HS256'],
        audience: 'authenticated',
      }) as Record<string, unknown>;

      expect(decoded.purpose).toBe(LOBBY_PRESENCE_PURPOSE);
      expect(decoded.appointment_id).toBe('appt-uuid-1');
      expect(decoded.sub).toBe('lobby:appt-uuid-1');
      expect(decoded.aud).toBe('authenticated');
      expect(decoded.role).toBe('authenticated');
      expect(decoded.session_id).toBeUndefined();
      expect(decoded.consult_role).toBeUndefined();
    });

    it('roundtrips through verifyLobbyPresenceJwt', () => {
      const minted = mintLobbyPresenceJwt({
        appointmentId: 'appt-9',
        expiresAt: new Date(Date.now() + 60_000),
      });
      const payload = verifyLobbyPresenceJwt(minted.token);
      expect(payload.appointment_id).toBe('appt-9');
      expect(payload.purpose).toBe('lobby_presence');
    });

    it('rejects an expired token', () => {
      const token = jwt.sign(
        {
          aud: 'authenticated',
          role: 'authenticated',
          sub: 'lobby:appt',
          exp: Math.floor(Date.now() / 1000) - 60,
          purpose: LOBBY_PRESENCE_PURPOSE,
          appointment_id: 'appt',
        },
        TEST_SECRET
      );
      expect(() => verifyLobbyPresenceJwt(token)).toThrow();
    });

    it('rejects a session-scoped consult JWT (scope violation)', () => {
      const consult = mintScopedConsultationJwt({
        sub: 'patient:appt-1',
        role: 'patient',
        sessionId: 'sess-1',
        expiresAt: new Date(Date.now() + 60_000),
      });
      expect(() => verifyLobbyPresenceJwt(consult.token)).toThrow(/missing required claims/);
    });

    it('rejects a lobby-shaped token that also carries session_id', () => {
      const token = jwt.sign(
        {
          aud: 'authenticated',
          role: 'authenticated',
          sub: 'lobby:appt',
          exp: Math.floor(Date.now() / 1000) + 60,
          purpose: LOBBY_PRESENCE_PURPOSE,
          appointment_id: 'appt',
          session_id: 'sess-sneak',
        },
        TEST_SECRET
      );
      expect(() => verifyLobbyPresenceJwt(token)).toThrow(/must not carry session-scoped claims/);
    });

    it('throws when expiresAt is in the past', () => {
      expect(() =>
        mintLobbyPresenceJwt({
          appointmentId: 'appt',
          expiresAt: new Date(Date.now() - 1000),
        })
      ).toThrow(InternalError);
    });
  });

  describe('issueLobbyPresenceJwt (HMAC exchange)', () => {
    it('mints from a valid consultation token', () => {
      const hmac = generateConsultationToken('appt-from-hmac');
      const issued = issueLobbyPresenceJwt(hmac);
      expect(issued.appointmentId).toBe('appt-from-hmac');
      const payload = verifyLobbyPresenceJwt(issued.token);
      expect(payload.appointment_id).toBe('appt-from-hmac');
    });

    it('rejects a garbage HMAC', () => {
      expect(() => issueLobbyPresenceJwt('not-a-token')).toThrow();
    });
  });

  describe('buildLobbyPresenceSub', () => {
    it('returns lobby:{appointmentId}', () => {
      expect(buildLobbyPresenceSub('appt-7')).toBe('lobby:appt-7');
    });
  });

  describe('publication ban (CRC4-D1)', () => {
    it('no migration adds appointments to supabase_realtime', () => {
      const dir = resolve(__dirname, '../../../migrations');
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.sql')) continue;
        const sql = readFileSync(join(dir, name), 'utf8');
        expect(sql).not.toMatch(
          /ALTER PUBLICATION\s+supabase_realtime\s+ADD TABLE\s+appointments\b/i
        );
      }
    });
  });
});
