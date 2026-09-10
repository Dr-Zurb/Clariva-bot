"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getVideoEscalationState,
  type VideoEscalationStateData,
} from "@/lib/api/recording-escalation";

/**
 * Doctor-side state machine for the Plan 08 · Task 40 video escalation
 * button + reason modal.
 *
 * Owns three concerns that would otherwise leak into the component:
 *
 *   1. **Initial fetch** — `GET /video-escalation-state` on mount so the
 *      button lands in the right variant on page refresh (e.g. the doctor
 *      refreshed during a 5-min cooldown or while video was already being
 *      recorded). Network / 404 failures degrade silently to `idle` — see
 *      `getVideoEscalationState` fallback.
 *
 *   2. **Cooldown countdown** — decrements a 1-Hz ticker while `kind ===
 *      'cooldown'`, auto-transitioning to `idle` when the ISO `availableAt`
 *      elapses. Uses wall-clock time (`Date.now()`) comparisons, not an
 *      accumulator, so the transition survives tab-inactivity (browser
 *      throttles `setInterval` to 1Hz+ on hidden tabs but doesn't pause
 *      `Date.now()`).
 *
 *   3. **Realtime updates** — Supabase Postgres-changes subscription on
 *      `video_escalation_audit` filtered by `session_id = ?`. Fires:
 *        - INSERT → new row with `patient_response = null` → transition to
 *          `requesting` (if we weren't already there from the optimistic
 *          POST path).
 *        - UPDATE → existing row flipped to
 *          `allow | decline | timeout` (or `revoked_at` set) → local
 *          `kind` from the head row, then `refresh()` so the server
 *          owns `attemptsUsed` (rec-23). A stop must never bump the
 *          local count or show `max_attempts`.
 *
 * ## Optimistic transitions
 *
 * When the button triggers `markRequesting()` (wrapped around the POST
 * response), the hook immediately flips to `requesting` without waiting for
 * the INSERT Realtime event. This avoids a "Waiting for server…" flicker
 * between the POST returning 200 and Supabase emitting the INSERT payload.
 * If the Realtime event arrives later, it's deduped by `requestId`.
 *
 * Similarly `markCooldown()` / `markLocked()` let the button stamp the
 * local state after a 429 so we don't have to re-round-trip to the state
 * endpoint.
 *
 * ## Why no `currentRecordingRule` prop / subscription
 *
 * Task 40's original spec floated plumbing a `currentRecordingRule:
 * 'audio_only' | 'audio_and_video'` prop through `<ConsultationLauncher>`
 * → `<LiveConsultPanel>` → `<VideoRoom>`. In practice that value is
 * already encoded in the escalation state: `kind === 'locked' && reason
 * === 'already_recording_video'` means video is rolling, everything else
 * means audio-only. We derive `isVideoRecording` internally so the prop
 * surface stays small.
 *
 * @see docs/Work/Daily-plans/April 2026/19-04-2026/Tasks/task-40-doctor-video-escalation-button-and-reason-modal.md
 * @see backend/migrations/070_video_escalation_audit_and_otp_window.sql
 */

export type VideoEscalationState = VideoEscalationStateData;

export interface UseVideoEscalationStateArgs {
  /** `consultation_sessions.id`. Hook is a no-op when null / empty. */
  sessionId: string | null | undefined;
  /**
   * Doctor's Supabase dashboard JWT (authenticated browser session). Used
   * for the initial GET + the Realtime channel. When null the hook skips
   * both — parents should mount the button in a disabled state until the
   * token is ready.
   */
  token: string | null | undefined;
  /** Flip to `false` to disable all activity (post-session-end cleanup). */
  enabled?: boolean;
}

interface AuditRow {
  id:                  string;
  session_id:          string;
  requested_at:        string;
  patient_response:    "allow" | "decline" | "timeout" | null;
  responded_at:        string | null;
  /** Plan 08 · Task 42. Non-NULL when an accepted (`allow`) row has been
   *  rolled back mid-call. rec-23: a consensual stop is a 30s debounce,
   *  not a decline. */
  revoked_at:          string | null;
  revoke_reason:       "patient_revoked" | "doctor_revert" | "system_error_fallback" | "grant_expired" | null;
  /** rec-21 / rec-23. Missing on older Realtime payloads → treat as doctor. */
  initiated_by?:       "doctor" | "patient";
  grant_expires_at?:   string | null;
  grant_extended_at?:  string | null;
  video_paused_at?:    string | null;
}

export interface UseVideoEscalationStateResult {
  state:          VideoEscalationState;
  loading:        boolean;
  /** Seconds remaining until cooldown expires. `null` outside cooldown. */
  cooldownSecondsRemaining: number | null;
  /** Seconds remaining on the patient's 60s consent window. `null` outside
   *  requesting. Ticks at 1Hz; reaches `0` when `expiresAt` is in the past. */
  waitingSecondsRemaining:  number | null;
  /** Manual refresh (used after explicit actions that aren't covered by
   *  Realtime, e.g. a 500 on the POST that we want to rescue). */
  refresh:                   () => Promise<void>;
  /**
   * Called by the button right after a successful POST. Optimistically
   * transitions to `requesting` without waiting for Supabase Realtime.
   */
  markRequesting: (args: { requestId: string; expiresAt: string; attemptsUsed: 0 | 1 | 2 }) => void;
  /** Called after a 429. Prefer `refresh()` so counts stay server-owned. */
  markCooldown:   (args: { availableAt: string; attemptsUsed: 0 | 1 | 2; lastOutcome: "decline" | "timeout" | "stopped" }) => void;
  /** Called after a terminal server response that should permanently disable
   *  the button (max_attempts). */
  markLocked:     (reason: "max_attempts" | "already_recording_video") => void;
  /** Seconds remaining on the active grant. `null` when not recording video. */
  grantSecondsRemaining: number | null;
  /** Countdown hit 0 before the worker stamped the row — show "stopping…". */
  grantIsSettling:       boolean;
}

const IDLE: VideoEscalationState = { kind: "idle", attemptsUsed: 0 };

const COOLDOWN_MS = 5 * 60 * 1000;
/** rec-23 / REC-D9. Named beside the 5-min decline/timeout window. */
const STOP_DEBOUNCE_MS = 30_000;
const MAX_ATTEMPTS = 2;
const EXPIRY_MS = 60_000;

export interface EscalationDeriveRow {
  id:               string;
  requested_at:     string;
  patient_response: "allow" | "decline" | "timeout" | null;
  revoked_at:       string | null;
  revoke_reason:    AuditRow["revoke_reason"];
  initiated_by?:    "doctor" | "patient";
  grant_expires_at?:  string | null;
  grant_extended_at?: string | null;
  video_paused_at?:   string | null;
}

function isChargeableRow(row: EscalationDeriveRow): boolean {
  if ((row.initiated_by ?? "doctor") === "patient") return false;
  if (row.patient_response === null) return true;
  if (row.patient_response === "decline" || row.patient_response === "timeout") {
    return true;
  }
  if (row.patient_response === "allow" && row.revoked_at === null) return true;
  if (row.patient_response === "allow" && row.revoked_at !== null) {
    return (
      row.revoke_reason === "doctor_revert" ||
      row.revoke_reason === "system_error_fallback"
    );
  }
  return false;
}

function isStopClassRow(row: EscalationDeriveRow): boolean {
  return (
    row.patient_response === "allow" &&
    row.revoked_at !== null &&
    row.revoke_reason !== "doctor_revert" &&
    row.revoke_reason !== "system_error_fallback"
  );
}

function clampAttemptsUsed(n: number): 0 | 1 | 2 {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  return 2;
}

function clampIdleAttempts(n: number): 0 | 1 {
  return n <= 0 ? 0 : 1;
}

/**
 * Client mirror of `deriveVideoEscalationState` (rec-23 matrix).
 * Realtime only sees the head row; `refresh()` then replaces counts
 * from the server. A stop row can never raise `attemptsUsed` or
 * produce `max_attempts` on its own.
 */
export function deriveStateFromRows(
  rows: EscalationDeriveRow[],
  nowMs: number = Date.now(),
): VideoEscalationState {
  if (rows.length === 0) {
    return { kind: "idle", attemptsUsed: 0 };
  }

  const head = rows[0]!;
  const headMs = Date.parse(head.requested_at);
  const attemptsUsed = rows.filter(isChargeableRow).length;

  if (head.patient_response === "allow" && head.revoked_at === null) {
    return {
      kind:            "locked",
      reason:          "already_recording_video",
      requestId:       head.id,
      grantExpiresAt:  head.grant_expires_at ?? null,
      extensionSpent:  Boolean(head.grant_extended_at),
      videoPaused:     Boolean(head.video_paused_at),
    };
  }

  if (head.patient_response === null) {
    const expiresAtMs = Number.isFinite(headMs) ? headMs + EXPIRY_MS : nowMs;
    return {
      kind:         "requesting",
      requestId:    head.id,
      expiresAt:    new Date(expiresAtMs).toISOString(),
      attemptsUsed: clampAttemptsUsed(attemptsUsed),
    };
  }

  if (attemptsUsed >= MAX_ATTEMPTS) {
    return { kind: "locked", reason: "max_attempts", requestId: null };
  }

  if (isStopClassRow(head)) {
    const revokedMs = Date.parse(head.revoked_at ?? "");
    const debounceEndMs = Number.isFinite(revokedMs)
      ? revokedMs + STOP_DEBOUNCE_MS
      : nowMs;
    if (nowMs < debounceEndMs) {
      return {
        kind:         "cooldown",
        availableAt:  new Date(debounceEndMs).toISOString(),
        attemptsUsed: clampIdleAttempts(attemptsUsed),
        lastOutcome:  "stopped",
        lastReason:   null,
      };
    }
    return { kind: "idle", attemptsUsed: clampIdleAttempts(attemptsUsed) };
  }

  if (!Number.isFinite(headMs)) {
    return { kind: "idle", attemptsUsed: clampIdleAttempts(attemptsUsed) };
  }
  const cooldownEndMs = headMs + COOLDOWN_MS;
  const lastOutcome: "decline" | "timeout" =
    head.patient_response === "timeout" ? "timeout" : "decline";
  if (nowMs < cooldownEndMs) {
    return {
      kind:         "cooldown",
      availableAt:  new Date(cooldownEndMs).toISOString(),
      attemptsUsed: clampIdleAttempts(attemptsUsed),
      lastOutcome,
      lastReason:   null,
    };
  }
  return { kind: "idle", attemptsUsed: clampIdleAttempts(attemptsUsed) };
}

function deriveStateFromRow(row: AuditRow, nowMs: number = Date.now()): VideoEscalationState {
  return deriveStateFromRows([row], nowMs);
}

function computeCooldownRemaining(availableAt: string): number {
  const iso = Date.parse(availableAt);
  if (Number.isNaN(iso)) return 0;
  const delta = iso - Date.now();
  return Math.max(0, Math.ceil(delta / 1000));
}

function computeWaitingRemaining(expiresAt: string): number {
  const iso = Date.parse(expiresAt);
  if (Number.isNaN(iso)) return 0;
  const delta = iso - Date.now();
  return Math.max(0, Math.ceil(delta / 1000));
}

export function useVideoEscalationState({
  sessionId,
  token,
  enabled = true,
}: UseVideoEscalationStateArgs): UseVideoEscalationStateResult {
  const [state,   setState]   = useState<VideoEscalationState>(IDLE);
  const [loading, setLoading] = useState(true);
  const [nowMs,   setNowMs]   = useState(() => Date.now());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled || !sessionId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await getVideoEscalationState(token, sessionId);
      if (!mountedRef.current) return;
      setState(next);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled, sessionId, token]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  // --- 1Hz wall-clock tick — drives the cooldown + waiting countdowns ---
  useEffect(() => {
    if (!enabled) return;
    const grantTicking =
      state.kind === "locked" &&
      state.reason === "already_recording_video" &&
      Boolean(state.grantExpiresAt);
    if (state.kind !== "cooldown" && state.kind !== "requesting" && !grantTicking) {
      return;
    }
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [enabled, state]);

  // --- Auto-transition cooldown → idle when availableAt elapses ---
  useEffect(() => {
    if (state.kind !== "cooldown") return;
    const availableAtMs = Date.parse(state.availableAt);
    if (!Number.isFinite(availableAtMs)) return;
    if (availableAtMs <= nowMs) {
      // `cooldown(2)` shouldn't arise in practice — after 2 declines the
      // server issues `locked/max_attempts` — but if it does we transition
      // to locked rather than a non-representable idle(2). Preserve
      // `attemptsUsed: 0` so a stop debounce does not invent a spent slot.
      if (state.attemptsUsed >= 2) {
        setState({ kind: "locked", reason: "max_attempts", requestId: null });
      } else {
        setState({
          kind:         "idle",
          attemptsUsed: state.attemptsUsed === 0 ? 0 : 1,
        });
      }
    }
  }, [state, nowMs]);

  // --- Auto-transition requesting → (cooldown|idle) on expiresAt elapse ---
  // Defensive: normally the server fires a `timeout` UPDATE via Realtime
  // before expiresAt, but if Realtime hiccups we don't want the button
  // stuck in "Waiting" forever. Treats local expiry as a timeout with a
  // server-clock cooldown starting at `expiresAt - 60000` (the original
  // `requested_at`).
  useEffect(() => {
    if (state.kind !== "requesting") return;
    const expiresAtMs = Date.parse(state.expiresAt);
    if (!Number.isFinite(expiresAtMs)) return;
    if (expiresAtMs > nowMs) return;
    const requestedAtMs = expiresAtMs - 60_000;
    const availableAtMs = requestedAtMs + COOLDOWN_MS;
    if (availableAtMs > nowMs) {
      setState({
        kind:         "cooldown",
        availableAt:  new Date(availableAtMs).toISOString(),
        attemptsUsed: state.attemptsUsed,
        lastOutcome:  "timeout",
        lastReason:   null,
      });
    } else {
      // Unlikely: cooldown already expired too (tab was backgrounded).
      // Slide straight to idle OR lock if this was the second attempt.
      if (state.attemptsUsed >= 2) {
        setState({ kind: "locked", reason: "max_attempts", requestId: null });
      } else {
        setState({
          kind:         "idle",
          attemptsUsed: state.attemptsUsed === 0 ? 0 : 1,
        });
      }
    }
  }, [state, nowMs]);

  // --- Realtime: subscribe to video_escalation_audit changes ---
  useEffect(() => {
    if (!enabled || !sessionId) return;
    // Uses the doctor's browser-authenticated Supabase client — RLS
    // allows them to SELECT rows where they're the session doctor.
    //
    // Per-mount nonce in the topic (`…:${nonce}`) prevents the
    // React-Strict-Mode "cannot add callbacks after subscribe()" error.
    // `@supabase/ssr`'s `createBrowserClient` is singleton-cached per
    // browser, so `client.channels` survives across mount → cleanup →
    // re-mount. The cleanup's `removeChannel` is async and returns
    // before the channel is actually evicted — so the re-mounted effect
    // would otherwise find the same topic still in the cache and re-use
    // an already-subscribed channel object, which throws on `.on()`.
    // The Postgres CDC `filter` below is what scopes rows to this
    // session; the topic name is just a client-side multiplexing key,
    // so the nonce is safe.
    const client = createClient();
    const nonce =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = client
      .channel(`video-escalation:${sessionId}:${nonce}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "video_escalation_audit",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as AuditRow | undefined;
          if (!row) return;
          // If we already optimistically marked ourselves as `requesting`
          // from the POST response, respect the stamped `requestId` — the
          // INSERT event might reach us after the server handler already
          // returned. If the requestIds match, do nothing; otherwise let
          // the derived state take over.
          setState((prev) => {
            if (prev.kind === "requesting" && prev.requestId === row.id) {
              return prev;
            }
            return deriveStateFromRow(row);
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "video_escalation_audit",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as AuditRow | undefined;
          if (!row) return;
          setState((prev) => {
            // Only react if this UPDATE targets the request we're waiting
            // on, or if we're in a terminal state and the row flipped
            // (edge case — patient allowed after local timeout).
            if (prev.kind === "requesting" && prev.requestId !== row.id) {
              return prev;
            }
            return deriveStateFromRow(row);
          });
          // Server owns multi-row counts (rec-23). Local derive covers
          // `kind` only; a single-row stop must not invent a spent slot.
          if (row.patient_response !== null) {
            void refresh();
          }
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [enabled, sessionId, refresh]);

  const markRequesting = useCallback(
    (args: { requestId: string; expiresAt: string; attemptsUsed: 0 | 1 | 2 }): void => {
      setState({
        kind:         "requesting",
        requestId:    args.requestId,
        expiresAt:    args.expiresAt,
        attemptsUsed: args.attemptsUsed,
      });
    },
    [],
  );

  const markCooldown = useCallback(
    (args: { availableAt: string; attemptsUsed: 0 | 1 | 2; lastOutcome: "decline" | "timeout" | "stopped" }): void => {
      setState({
        kind:         "cooldown",
        availableAt:  args.availableAt,
        attemptsUsed: args.attemptsUsed,
        lastOutcome:  args.lastOutcome,
        lastReason:   null,
      });
    },
    [],
  );

  const markLocked = useCallback(
    (reason: "max_attempts" | "already_recording_video"): void => {
      setState({ kind: "locked", reason, requestId: null });
    },
    [],
  );

  const cooldownSecondsRemaining =
    state.kind === "cooldown"
      ? computeCooldownRemaining(state.availableAt)
      : null;

  const waitingSecondsRemaining =
    state.kind === "requesting"
      ? computeWaitingRemaining(state.expiresAt)
      : null;

  const grantSecondsRemaining =
    state.kind === "locked" &&
    state.reason === "already_recording_video" &&
    state.grantExpiresAt
      ? computeWaitingRemaining(state.grantExpiresAt)
      : null;
  const grantIsSettling =
    grantSecondsRemaining !== null && grantSecondsRemaining <= 0;

  // Touch `nowMs` so the linter + future readers understand that the
  // ticker state drives the seconds-remaining derivation. React's
  // re-render cycle already includes this — the explicit reference is a
  // no-op guard against accidental removal.
  void nowMs;

  return {
    state,
    loading,
    cooldownSecondsRemaining,
    waitingSecondsRemaining,
    grantSecondsRemaining,
    grantIsSettling,
    refresh,
    markRequesting,
    markCooldown,
    markLocked,
  };
}

// ---------------------------------------------------------------------------
// Small helpers for the button component
// ---------------------------------------------------------------------------

/**
 * Formats a cooldown countdown as `"M:SS"` (e.g. `"4:32"`). Used in button
 * labels and the decline-banner copy. Caps at 59:59 defensively.
 */
export function videoEscalationRequestsLeftCopy(attemptsUsed: number): string {
  if (attemptsUsed <= 0) return "2 requests left this consult.";
  if (attemptsUsed === 1) return "1 request left this consult.";
  return "No requests left this consult.";
}

export function formatMinuteSecond(totalSeconds: number): string {
  const clamped = Math.max(0, Math.min(59 * 60 + 59, Math.floor(totalSeconds)));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
