/**
 * useVoiceRejoinCache — voice-specific crash-recovery rejoin.
 *
 * task-voice-C5 (`task-voice-C5-crash-recovery-rejoin.md`).
 *
 * Thin voice wrapper around the modality-agnostic foundation in
 * `useCallRejoinCache.ts` (shipped by task-video-E4). Voice C5 reuses
 * the shared `call-rejoin-${sessionId}` sessionStorage key with
 * `modality: "voice"` rather than introducing a parallel
 * `voice-rejoin-*` namespace — one cache per session per tab, keyed by
 * sessionId, with modality as a defense-in-depth gate at read time.
 *
 * @see useCallRejoinCache.ts — storage helpers, kick-flag contract (C4).
 */

import { useCallback, useMemo } from "react";
import type { TextConsultSessionStatus } from "@/lib/api";
import {
  computeMinExpiryEpochMs,
  decodeJwtExp,
  useCallRejoinCache,
  readSnapshot,
  isSnapshotFresh,
  clearSnapshot,
  consumeKickedFlag,
  type CallRejoinRole,
  type CallRejoinSnapshot,
} from "@/hooks/useCallRejoinCache";

/** sessionStorage payload shape for voice crash-recovery (task C5). */
export interface VoiceRejoinCache {
  hmacToken?: string;
  supabaseJwt?: string;
  twilioAccessToken?: string;
  cachedAt: number;
  expiresAt: number;
  sessionId: string;
  role: CallRejoinRole;
  roomName?: string;
  companionCurrentUserId?: string;
  sessionStatus?: TextConsultSessionStatus;
  micDeviceId?: string;
}

export interface UseVoiceRejoinCacheResult {
  tryAutoRejoin: () => VoiceRejoinCache | null;
  write: (cache: VoiceRejoinCache) => void;
  clear: () => void;
}

function snapshotToVoiceCache(snapshot: CallRejoinSnapshot): VoiceRejoinCache {
  return {
    hmacToken: snapshot.hmacToken,
    supabaseJwt: snapshot.supabaseJwt,
    twilioAccessToken: snapshot.twilioAccessToken,
    cachedAt: snapshot.cachedAt,
    expiresAt: snapshot.expiresAt,
    sessionId: snapshot.sessionId,
    role: snapshot.role,
    roomName: snapshot.roomName,
    companionCurrentUserId: snapshot.companionCurrentUserId,
    sessionStatus: snapshot.sessionStatus,
    micDeviceId: snapshot.micDeviceId,
  };
}

function voiceCacheToSnapshot(cache: VoiceRejoinCache): CallRejoinSnapshot {
  return {
    sessionId: cache.sessionId,
    modality: "voice",
    role: cache.role,
    hmacToken: cache.hmacToken,
    twilioAccessToken: cache.twilioAccessToken,
    supabaseJwt: cache.supabaseJwt,
    roomName: cache.roomName,
    companionCurrentUserId: cache.companionCurrentUserId,
    micDeviceId: cache.micDeviceId,
    sessionStatus: cache.sessionStatus,
    cachedAt: cache.cachedAt,
    expiresAt: cache.expiresAt,
  };
}

/**
 * Build a voice rejoin snapshot after a successful token mint.
 * TTL = min(HMAC fallback, Twilio JWT exp, Supabase JWT exp).
 */
export function buildVoiceRejoinCache(input: {
  sessionId: string;
  role: CallRejoinRole;
  twilioAccessToken: string;
  roomName: string;
  hmacToken?: string;
  supabaseJwt?: string;
  companionCurrentUserId?: string;
  sessionStatus?: TextConsultSessionStatus;
  micDeviceId?: string;
  /** epoch seconds — when the opaque HMAC expiry is known. */
  hmacExpSeconds?: number;
}): VoiceRejoinCache | null {
  const twilioExp = decodeJwtExp(input.twilioAccessToken);
  const supabaseExp = decodeJwtExp(input.supabaseJwt);
  const hmacExp =
    typeof input.hmacExpSeconds === "number"
      ? input.hmacExpSeconds
      : input.hmacToken
        ? Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000)
        : undefined;

  const expiresAt = computeMinExpiryEpochMs({
    hmacExp,
    twilioExp,
    supabaseExp,
  });
  if (!expiresAt || expiresAt <= Date.now()) return null;

  const cachedAt = Date.now();
  return {
    sessionId: input.sessionId,
    role: input.role,
    twilioAccessToken: input.twilioAccessToken,
    roomName: input.roomName,
    hmacToken: input.hmacToken,
    supabaseJwt: input.supabaseJwt,
    companionCurrentUserId: input.companionCurrentUserId,
    sessionStatus: input.sessionStatus,
    micDeviceId: input.micDeviceId,
    cachedAt,
    expiresAt,
  };
}

/**
 * Pure helper for tests and early mount paths (before hook binding).
 * Returns null when absent, stale, kicked, or wrong modality/role.
 */
export function tryVoiceAutoRejoin(
  sessionId: string,
  expectedRole?: CallRejoinRole,
): VoiceRejoinCache | null {
  if (typeof window === "undefined" || !sessionId) return null;

  if (consumeKickedFlag(sessionId)) {
    clearSnapshot(sessionId);
    return null;
  }

  const snapshot = readSnapshot(sessionId);
  if (!snapshot || snapshot.modality !== "voice") return null;
  if (expectedRole && snapshot.role !== expectedRole) return null;
  if (!isSnapshotFresh(snapshot)) {
    clearSnapshot(sessionId);
    return null;
  }
  if (!snapshot.twilioAccessToken || !snapshot.roomName) {
    clearSnapshot(sessionId);
    return null;
  }
  return snapshotToVoiceCache(snapshot);
}

export function useVoiceRejoinCache(
  sessionId: string | null | undefined,
): UseVoiceRejoinCacheResult {
  const base = useCallRejoinCache(sessionId);

  const tryAutoRejoin = useCallback((): VoiceRejoinCache | null => {
    const result = base.tryAutoRejoin();
    if (result.kind !== "ok") return null;
    if (result.snapshot.modality !== "voice") {
      base.clear();
      return null;
    }
    if (!result.snapshot.twilioAccessToken || !result.snapshot.roomName) {
      base.clear();
      return null;
    }
    return snapshotToVoiceCache(result.snapshot);
  }, [base]);

  const write = useCallback(
    (cache: VoiceRejoinCache) => {
      base.write(voiceCacheToSnapshot(cache));
    },
    [base],
  );

  return useMemo(
    () => ({ tryAutoRejoin, write, clear: base.clear }),
    [tryAutoRejoin, write, base.clear],
  );
}
