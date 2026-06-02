/**
 * useCallRejoinCache — sessionStorage token cache for crash-recovery rejoin.
 *
 * Sub-batch E · task-video-E4 (`task-video-E4-crash-recovery-rejoin.md`).
 * Foundation hook ALSO ships the API that voice C5
 * (`task-voice-C5-crash-recovery-rejoin.md`) will reuse on pickup. Audit at
 * implementation time found voice C5 unshipped (`Drafted`); per video E.4
 * spec ("If rename can't happen yet, ship `useVideoRejoinCache` here as a
 * thin wrapper..."), Phase 1 lifts the foundation directly into the
 * modality-agnostic `useCallRejoinCache.ts` instead of a one-shot wrapper.
 * That way voice C5 + any future text rejoin only need to import + write
 * with their own modality data; no rename churn at PR time.
 *
 * Problem we're solving
 * ---------------------
 * Patient on a video call → tab crashes (low memory; backgrounded; OS kill).
 * Page reload today re-runs the entire join flow:
 *   1. URL must still carry `?token=` (HMAC) — but the page strips it after
 *      the first exchange to avoid leaking it on screenshots, so a reload
 *      from history shows "Invalid or missing link".
 *   2. HMAC → Twilio token exchange (1 backend round-trip).
 *   3. HMAC → Supabase JWT exchange for companion chat (2nd round-trip).
 *   4. Pre-call camera/mic check (manual user clicks).
 *   5. Camera/mic permission re-prompt (some browsers).
 * That's 30+ seconds of patient panic. T5.34 fixes it.
 *
 * Mechanism
 * ---------
 * On every successful token mint, write a snapshot to
 * `sessionStorage['call-rejoin-${sessionId}']`:
 *
 *   - `twilioAccessToken` — reused directly to reconnect to the same Twilio
 *      room (Twilio handles duplicate participants by `identity` so the
 *      old participant row is replaced — verified in backend audit).
 *   - `supabaseJwt`        — reused for the companion chat channel.
 *   - `hmacToken`          — kept as a fallback if the cached short-lived
 *      tokens have expired and we need a fresh exchange.
 *   - `cameraDeviceId` / `micDeviceId` — re-acquire camera/mic with same
 *      `deviceId` (Chrome/Safari skip the permission prompt if recently
 *      granted on the same device).
 *   - `expiresAt`          — `min(HMAC TTL, JWT TTL, Twilio TTL)` epoch ms.
 *
 * On reload, `<patient join page>` calls `tryAutoRejoin(sessionId)`:
 *   - Cache absent       → null (run the normal flow).
 *   - Cache stale        → null + clear (avoid trying again next reload).
 *   - Tab was kicked     → null + clear cache + clear kick flag (the kick
 *     is the source of truth; per E3 contract).
 *   - Cache fresh + sole → return the snapshot (caller skips lobby + mints,
 *     mounts `<VideoRoom>` with cached tokens + `rejoined` flag).
 *
 * Why sessionStorage (not localStorage)
 * -------------------------------------
 * Per spec out-of-scope §"Persistent cache across browser quit": "Out of
 * scope; sessionStorage is correct (clears on browser close)." sessionStorage
 * is per-tab and survives:
 *   - Tab crash + reload (the crash recovery target case).
 *   - In-tab navigation away + back.
 *   - Page refresh.
 * It does NOT survive:
 *   - Tab close.
 *   - Browser quit.
 *   - New tab opening the same URL (each new tab gets its own
 *     sessionStorage scope — exactly what we want, otherwise multi-tab
 *     would conflict with E3's kick semantics).
 *
 * PHI hygiene
 * -----------
 * Cache holds ONLY tokens + device IDs. No message content, no transcripts,
 * no audio frames. Tokens are short-lived (typically <1h). On clean call
 * end (`clear()` from the parent page), the cache is purged.
 *
 * Coordination with E3 (multi-tab kick)
 * -------------------------------------
 * E3 (`useTabPresenceClaim`) sets `sessionStorage('tab-was-kicked-${sid}', '1')`
 * on the kick edge. This hook reads that same flag in `tryAutoRejoin()` and
 * refuses to auto-rejoin if set. It also CLEARS the flag on the same call
 * — the kick was a transient signal; once acknowledged, future reloads
 * follow the normal cache-fresh-or-stale path. The kick semantics are
 * preserved on the surviving tab because takeOver() (in E3) re-broadcasts a
 * fresh claim, which any older tabs see as newer-than-self → they flip to
 * kicked, write the flag again on next reload.
 *
 * Backend idempotency assumption
 * ------------------------------
 * Per the spec ("verify, don't refactor"), backend was audited at
 * implementation time:
 *   - `getConsultationToken(appointmentId, ...)` calls
 *     `findActiveSessionByAppointment(appointmentId, 'video')` — read-only
 *     lookup; idempotent on same input.
 *   - `getJoinTokenForAppointment` mints a fresh Twilio JWT each call (local
 *     signing); duplicate participants handled by Twilio's `identity`
 *     replacement contract (re-publishing same identity replaces the
 *     previous session).
 *   - `verifyConsultationToken` is pure HMAC verification — no DB writes.
 * Reusing cached Twilio + Supabase tokens skips the backend entirely
 * (cached JWTs are valid until their embedded `exp` claim).
 */

import { useCallback, useMemo } from "react";

// ============================================================================
// Public types
// ============================================================================

export type CallRejoinRole = "doctor" | "patient";
export type CallRejoinModality = "voice" | "video" | "text";

/** Per-modality extras that voice / video / text can each persist + restore. */
export interface CallRejoinModalityExtras {
  /** NEW for video — re-acquire same camera deviceId silently (Chrome/Safari
   *  skip the prompt if permission was recently granted on this origin). */
  cameraDeviceId?: string;
  /** Voice + video — same trick for the mic. */
  micDeviceId?: string;
  /** Last mute state at cache-write time (epoch ms when muted; null/absent
   *  if unmuted). The room restores it on rejoin so the mic is correctly
   *  silent if the user had toggled mute before the crash. */
  micMutedAt?: number | null;
  /** NEW for video — last camera-off state. */
  cameraOffAt?: number | null;
  /** Voice + video — last hold state. */
  onHoldAt?: number | null;
  /** NEW for video — B6 layout preference (`gallery` / `speaker` / `sidebar`). */
  layoutPreference?: "gallery" | "speaker" | "sidebar";
  /** Voice/video — last known session status at cache-write (holding vs live). */
  sessionStatus?: "scheduled" | "live" | "ended" | "cancelled" | "no_show";
}

/** What we store in sessionStorage on each token-mint success. */
export interface CallRejoinSnapshot extends CallRejoinModalityExtras {
  /** `consultation_sessions.id`. Required — keys the cache. */
  sessionId: string;
  /** Modality identifier so a future text rejoin doesn't accidentally
   *  use a voice/video snapshot (sessionId collisions are unlikely but
   *  defense-in-depth costs nothing). */
  modality: CallRejoinModality;
  role: CallRejoinRole;
  /** Patient-side: HMAC consultation token. Doctor-side: undefined (doctor
   *  uses Supabase session, no HMAC). */
  hmacToken?: string;
  /** Twilio access token for the room (voice + video). Undefined for text
   *  rejoin (no Twilio room). */
  twilioAccessToken?: string;
  /** Supabase JWT for the companion chat / text channel. Undefined if the
   *  companion exchange failed at mint time (we still cache the rest). */
  supabaseJwt?: string;
  /** Twilio room name for the rejoin (`appointment-${appointmentId}`). */
  roomName?: string;
  /** Companion patient sub (synthetic `patient:${appointmentId}` or real
   *  `patients.id`). The room needs this alongside the JWT. */
  companionCurrentUserId?: string;
  /** Wall-clock at write time. Useful for diagnostics / "rejoined N min ago"
   *  copy in the future. */
  cachedAt: number;
  /** `min(HMAC TTL, JWT TTL, Twilio TTL)` epoch ms. Cache is stale once
   *  `Date.now() >= expiresAt`. */
  expiresAt: number;
}

/** Returned by `tryAutoRejoin()`. Discriminated for clarity at the call site. */
export type AutoRejoinResult =
  | { kind: "ok"; snapshot: CallRejoinSnapshot }
  | { kind: "absent" }
  | { kind: "stale" }
  | { kind: "kicked" };

export interface UseCallRejoinCacheResult {
  tryAutoRejoin: () => AutoRejoinResult;
  write: (snapshot: CallRejoinSnapshot) => void;
  clear: () => void;
}

// ============================================================================
// Pure exported helpers (testable; voice C5 will wire its own jest tests)
// ============================================================================

const STORAGE_KEY_PREFIX = "call-rejoin";
/** Mirrors E3's flag (set by `useTabPresenceClaim` on kick). MUST stay in
 *  sync with `KICKED_FLAG_KEY_PREFIX` in `useTabPresenceClaim.ts`. */
const KICKED_FLAG_KEY_PREFIX = "tab-was-kicked";
/** Defensive lower bound — refuse to write a cache that's already expired
 *  or that has a TTL window of < 5 seconds (probably a clock skew or
 *  computation bug — we'd rather miss the rejoin than serve a snapshot
 *  the room will reject anyway). */
const MIN_TTL_WINDOW_MS = 5_000;

export const storageKey = (sessionId: string): string =>
  `${STORAGE_KEY_PREFIX}-${sessionId}`;
export const kickedFlagKey = (sessionId: string): string =>
  `${KICKED_FLAG_KEY_PREFIX}-${sessionId}`;

/**
 * Compute the strictest TTL across HMAC + JWT + Twilio access token. All
 * three are JWTs (or HMACs) with embedded epoch-seconds `exp` claims.
 * Returns `null` if no inputs were supplied (e.g. doctor side with no
 * HMAC) — caller should fall back to the latest known JWT exp or the
 * default cache window. A `null` from a CALLER that DID supply at least
 * one input is a malformed-token sentinel; don't write the cache.
 */
export function computeMinExpiryEpochMs(input: {
  /** epoch SECONDS (JWT-style `exp`). */
  hmacExp?: number;
  /** epoch SECONDS. */
  twilioExp?: number;
  /** epoch SECONDS. */
  supabaseExp?: number;
}): number | null {
  const exps: number[] = [];
  if (typeof input.hmacExp === "number" && Number.isFinite(input.hmacExp)) {
    exps.push(input.hmacExp);
  }
  if (typeof input.twilioExp === "number" && Number.isFinite(input.twilioExp)) {
    exps.push(input.twilioExp);
  }
  if (
    typeof input.supabaseExp === "number" &&
    Number.isFinite(input.supabaseExp)
  ) {
    exps.push(input.supabaseExp);
  }
  if (exps.length === 0) return null;
  return Math.min(...exps) * 1000;
}

/**
 * Decode the `exp` claim from a JWT WITHOUT verifying the signature. We
 * don't need verification here — we trust that the backend issued the JWT
 * and the worst-case (a tampered local cache) is that the rejoin fails
 * server-side and falls through to the normal exchange path.
 *
 * Returns the `exp` field in epoch SECONDS (the JWT spec's native unit), or
 * `undefined` if the JWT is malformed / lacks `exp`.
 */
export function decodeJwtExp(jwt: string | undefined): number | undefined {
  if (!jwt || typeof jwt !== "string") return undefined;
  const parts = jwt.split(".");
  if (parts.length !== 3) return undefined;
  try {
    // Base64URL decode the payload. atob() needs +/= padding.
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded =
      payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf-8");
    const payload = JSON.parse(json) as { exp?: unknown };
    if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
      return payload.exp;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** True if the snapshot is still within its TTL window. */
export function isSnapshotFresh(
  snapshot: CallRejoinSnapshot,
  now: number = Date.now(),
): boolean {
  return (
    typeof snapshot.expiresAt === "number" &&
    Number.isFinite(snapshot.expiresAt) &&
    now < snapshot.expiresAt
  );
}

/**
 * Best-effort sessionStorage read. Returns `null` on any failure (privacy
 * mode, JSON parse, schema mismatch). Defensive against tampered caches —
 * we validate the minimum required shape but don't run a full schema check
 * because the worst-case "use it" path will still fail the
 * `isSnapshotFresh` gate or the room mount itself.
 */
export function readSnapshot(sessionId: string): CallRejoinSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CallRejoinSnapshot>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.sessionId !== sessionId ||
      typeof parsed.cachedAt !== "number" ||
      typeof parsed.expiresAt !== "number" ||
      (parsed.role !== "doctor" && parsed.role !== "patient") ||
      (parsed.modality !== "voice" &&
        parsed.modality !== "video" &&
        parsed.modality !== "text")
    ) {
      return null;
    }
    return parsed as CallRejoinSnapshot;
  } catch {
    return null;
  }
}

/** Best-effort sessionStorage write. Swallows quota / privacy-mode errors. */
export function writeSnapshot(snapshot: CallRejoinSnapshot): void {
  if (typeof window === "undefined") return;
  // Refuse to write a snapshot that's effectively already-expired — caller
  // probably miscomputed the TTL and we don't want to poison subsequent
  // reads with a guaranteed-stale entry.
  if (snapshot.expiresAt - snapshot.cachedAt < MIN_TTL_WINDOW_MS) return;
  try {
    window.sessionStorage.setItem(
      storageKey(snapshot.sessionId),
      JSON.stringify(snapshot),
    );
  } catch {
    // Best-effort.
  }
}

/** Best-effort clear. */
export function clearSnapshot(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(sessionId));
  } catch {
    // Best-effort.
  }
}

/**
 * Scans sessionStorage for ALL `call-rejoin-*` keys and returns the
 * freshest valid snapshot. Returns `null` if no candidate exists or all
 * candidates are stale.
 *
 * Why we need discovery: the patient join page strips `?token=` from the
 * URL after the first successful exchange (security hygiene — don't leak
 * the HMAC on screenshots). After a crash + reopen, the URL has no
 * sessionId and no token. The page can't ask the hook "give me the
 * snapshot for sessionId X" because it doesn't know X yet. This helper
 * lets the page discover the sessionId from the cache itself.
 *
 * sessionStorage is per-tab, so the only `call-rejoin-*` keys present are
 * ones THIS tab wrote during a previous live consult — there's no
 * cross-tenant leakage risk. Stale entries are cleared as a side-effect
 * (we don't want to leave them around to influence future scans).
 */
export function findLatestRejoinCandidate(): CallRejoinSnapshot | null {
  if (typeof window === "undefined") return null;
  let bestSnapshot: CallRejoinSnapshot | null = null;
  let bestCachedAt = 0;
  const staleKeys: string[] = [];
  try {
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (!key || !key.startsWith(`${STORAGE_KEY_PREFIX}-`)) continue;
      const raw = window.sessionStorage.getItem(key);
      if (!raw) continue;
      let parsed: CallRejoinSnapshot | null = null;
      try {
        parsed = JSON.parse(raw) as CallRejoinSnapshot;
      } catch {
        // Malformed entry — flag for cleanup but don't throw.
        staleKeys.push(key);
        continue;
      }
      if (
        !parsed ||
        typeof parsed.sessionId !== "string" ||
        typeof parsed.cachedAt !== "number" ||
        typeof parsed.expiresAt !== "number"
      ) {
        staleKeys.push(key);
        continue;
      }
      if (!isSnapshotFresh(parsed)) {
        staleKeys.push(key);
        continue;
      }
      if (parsed.cachedAt > bestCachedAt) {
        bestCachedAt = parsed.cachedAt;
        bestSnapshot = parsed;
      }
    }
    // Best-effort cleanup of stale / malformed entries.
    for (const key of staleKeys) {
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        // Best-effort.
      }
    }
  } catch {
    return null;
  }
  return bestSnapshot;
}

/**
 * Reads and CONSUMES the E3 kick flag in one call. Intended only for the
 * rejoin path — once the kick has been acknowledged (we refuse the
 * rejoin), the flag's job is done. Subsequent reloads follow the normal
 * cache-fresh-or-stale path.
 */
export function consumeKickedFlag(sessionId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const flag = window.sessionStorage.getItem(kickedFlagKey(sessionId));
    if (flag !== "1") return false;
    window.sessionStorage.removeItem(kickedFlagKey(sessionId));
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook entry point. Returns a memoised `{ tryAutoRejoin, write, clear }`
 * triple bound to a specific `sessionId`.
 *
 * Pass `null` / `undefined` for `sessionId` to no-op (returns inert
 * functions). That's the right shape for the patient join page on first
 * load when we don't know the sessionId yet — we call the hook
 * unconditionally so hook order stays stable.
 *
 * @param sessionId  `consultation_sessions.id` for the live consult.
 */
export function useCallRejoinCache(
  sessionId: string | null | undefined,
): UseCallRejoinCacheResult {
  const tryAutoRejoin = useCallback((): AutoRejoinResult => {
    if (!sessionId) return { kind: "absent" };

    // Kick takes precedence over the cache (E3 contract). Consume the flag
    // so subsequent reloads can follow the normal path; if a fresh kick
    // happens, E3 sets the flag again.
    if (consumeKickedFlag(sessionId)) {
      // Also clear the cache — the user explicitly handed off to another
      // tab; serving them stale rejoin data on a future reload would be
      // wrong (the surviving tab owns the call now).
      clearSnapshot(sessionId);
      return { kind: "kicked" };
    }

    const snapshot = readSnapshot(sessionId);
    if (!snapshot) return { kind: "absent" };

    if (!isSnapshotFresh(snapshot)) {
      // Don't try again with a stale entry — clear so the user falls back
      // to the normal mint flow this reload AND every subsequent reload
      // until a fresh mint writes a new snapshot.
      clearSnapshot(sessionId);
      return { kind: "stale" };
    }

    return { kind: "ok", snapshot };
  }, [sessionId]);

  const write = useCallback(
    (snapshot: CallRejoinSnapshot) => {
      // Defensive: the caller might have a stale `sessionId` binding (race
      // between two consults in the same tab — unusual, but cheap to
      // guard). Refuse the write if the snapshot's sessionId doesn't
      // match the hook's bound sessionId.
      if (!sessionId || snapshot.sessionId !== sessionId) return;
      writeSnapshot(snapshot);
    },
    [sessionId],
  );

  const clear = useCallback(() => {
    if (!sessionId) return;
    clearSnapshot(sessionId);
  }, [sessionId]);

  return useMemo(
    () => ({ tryAutoRejoin, write, clear }),
    [tryAutoRejoin, write, clear],
  );
}
