/**
 * crc-14 — purpose-minted JWT for lobby Realtime presence.
 *
 * Separate from `mintScopedConsultationJwt`. That minter stamps
 * `consult_role` + `session_id` for consultation_messages RLS (mig 052).
 * The lobby exists before any consultation_sessions row (CRC-D3), so
 * this token must not carry those claims.
 *
 * Grants Realtime identity only. No table access. No PHI in the body.
 *
 * @see docs/Work/Daily-plans/August 2026/12-08-2026/consult-room-checkin/p4-realtime-and-channel-gaps/Tasks/task-crc-14-realtime-presence-channel.md
 */

import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { InternalError } from '../utils/errors';
import { verifyConsultationToken } from '../utils/consultation-token';

export const LOBBY_PRESENCE_PURPOSE = 'lobby_presence' as const;

/**
 * 2h — T−30 check-in (CRC-D4) + consult + delay, without matching the
 * 24h HMAC lifetime. Heartbeat is independent of this TTL.
 */
export const LOBBY_PRESENCE_JWT_TTL_MS = 2 * 60 * 60 * 1000;

export interface LobbyPresenceJwtPayload {
  aud: 'authenticated';
  role: 'authenticated';
  sub: string;
  exp: number;
  iat: number;
  purpose: typeof LOBBY_PRESENCE_PURPOSE;
  appointment_id: string;
}

export function buildLobbyPresenceSub(appointmentId: string): string {
  const trimmed = appointmentId?.trim();
  if (!trimmed) {
    throw new InternalError('buildLobbyPresenceSub: appointmentId is required');
  }
  return `lobby:${trimmed}`;
}

export function mintLobbyPresenceJwt(input: { appointmentId: string; expiresAt: Date }): {
  token: string;
  expiresAt: Date;
} {
  const secret = env.SUPABASE_JWT_SECRET?.trim();
  if (!secret) {
    throw new InternalError('mintLobbyPresenceJwt: SUPABASE_JWT_SECRET is not configured.');
  }
  const appointmentId = input.appointmentId?.trim();
  if (!appointmentId) {
    throw new InternalError('mintLobbyPresenceJwt: appointmentId is required');
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = Math.floor(input.expiresAt.getTime() / 1000);
  if (expSec <= nowSec) {
    throw new InternalError('mintLobbyPresenceJwt: expiresAt must be in the future');
  }

  const payload: Omit<LobbyPresenceJwtPayload, 'iat'> = {
    aud: 'authenticated',
    role: 'authenticated',
    sub: buildLobbyPresenceSub(appointmentId),
    exp: expSec,
    purpose: LOBBY_PRESENCE_PURPOSE,
    appointment_id: appointmentId,
  };

  const token = jwt.sign(payload, secret, { algorithm: 'HS256' });
  return { token, expiresAt: new Date(expSec * 1000) };
}

export function verifyLobbyPresenceJwt(token: string): LobbyPresenceJwtPayload {
  const secret = env.SUPABASE_JWT_SECRET?.trim();
  if (!secret) {
    throw new InternalError('verifyLobbyPresenceJwt: SUPABASE_JWT_SECRET is not configured.');
  }
  const trimmed = token?.trim();
  if (!trimmed) {
    throw new InternalError('verifyLobbyPresenceJwt: token is required');
  }

  const decoded = jwt.verify(trimmed, secret, {
    algorithms: ['HS256'],
    audience: 'authenticated',
  });
  if (typeof decoded === 'string') {
    throw new InternalError('verifyLobbyPresenceJwt: unexpected token shape');
  }
  const p = decoded as Partial<LobbyPresenceJwtPayload> & {
    session_id?: unknown;
    consult_role?: unknown;
  };
  if (
    p.aud !== 'authenticated' ||
    p.role !== 'authenticated' ||
    typeof p.sub !== 'string' ||
    typeof p.exp !== 'number' ||
    p.purpose !== LOBBY_PRESENCE_PURPOSE ||
    typeof p.appointment_id !== 'string' ||
    !p.appointment_id.trim()
  ) {
    throw new InternalError('verifyLobbyPresenceJwt: token payload missing required claims');
  }
  if (p.session_id != null || p.consult_role != null) {
    throw new InternalError(
      'verifyLobbyPresenceJwt: lobby token must not carry session-scoped claims'
    );
  }
  return p as LobbyPresenceJwtPayload;
}

export interface LobbyPresenceTokenResult {
  token: string;
  expiresAt: string;
  appointmentId: string;
}

/** HMAC consultation token → purpose-minted lobby Realtime JWT. */
export function issueLobbyPresenceJwt(consultationToken: string): LobbyPresenceTokenResult {
  const { appointmentId } = verifyConsultationToken(consultationToken);
  const minted = mintLobbyPresenceJwt({
    appointmentId,
    expiresAt: new Date(Date.now() + LOBBY_PRESENCE_JWT_TTL_MS),
  });
  return {
    token: minted.token,
    expiresAt: minted.expiresAt.toISOString(),
    appointmentId,
  };
}
