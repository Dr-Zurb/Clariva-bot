"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Room } from "twilio-video";

/**
 * Sub-batch B · task-video-B4 / task-voice-B1 — pure reconnect-state
 * machine for Twilio Video / Voice rooms.
 *
 * Authored ahead of voice B1 (which owns the canonical contract);
 * voice B1 will import this hook verbatim once it lands. Same
 * doctrine as `useHoldState` (B3) and `branding.ts` (B1).
 *
 * Why a hook (not in-component state):
 *   - The same machine is consumed by `<VideoRoom>` (overlay mount)
 *     AND `<VoiceConsultRoom>` (top-bar mount). Two mount surfaces,
 *     one source of truth.
 *   - Twilio's `'reconnecting'` / `'reconnected'` events fire on the
 *     `Room` instance; the hook owns subscribe + unsubscribe so
 *     callers never have to remember teardown.
 *   - The countdown timer is a UX hint (NOT an authoritative timeout
 *     — Twilio's SDK has its own retry loop). Centralizing the
 *     interval here keeps both modalities visually consistent.
 *
 * State machine (Twilio events drive transitions):
 *
 *   live ── reconnecting event ──▶ reconnecting (countdown starts)
 *     ▲                                │
 *     │                                ├── reconnected event ──▶ live
 *     │                                ├── countdown reaches 0 ──▶ failed
 *     │                                └── room disconnect ──▶ live (hook unmounts)
 *     │
 *     └── room becomes null (final disconnect) ──▶ live (reset)
 *
 * On `'failed'`, Twilio's `'disconnected'` event will (almost
 * certainly) fire shortly after — the existing `<VideoRoom>` /
 * `<VoiceConsultRoom>` disconnect listener then unmounts the room
 * and the disconnect splash (B5 / voice A9) takes over with its
 * own Rejoin CTA. The `'failed'` state on this hook exists as a
 * BRIDGE so the user sees a "Couldn't reconnect — Rejoin call"
 * affordance immediately (countdown reaches 0) rather than waiting
 * for Twilio's signaling-disconnect grace period.
 *
 * IMPORTANT — `tryNow` and `rejoinNow` are intentionally identical
 * in v1: both invoke the parent-supplied `onRejoinRequested`
 * callback (which typically calls `window.location.reload()` so the
 * patient join page can re-mint tokens via its existing mount-time
 * exchange). Twilio's SDK does not expose a manual-retry surface;
 * the SDK's auto-retry is the only mechanism. So `[Try now]` is a
 * deterministic "force a fresh attempt RIGHT NOW" — slightly more
 * disruptive than waiting for the SDK's next attempt, but the user
 * asked for it.
 *
 * Recording continuity (per task file): Twilio Programmable Video
 * composes a single recording across SDK-internal reconnects (no
 * gap). Once the user clicks Rejoin (which we treat as a fresh
 * room join), recording starts a NEW composition — there WILL be
 * a gap on the recording playback surface. Document this in the
 * Plan 07 follow-up if it becomes a clinical concern.
 */

export type ReconnectStatus = "live" | "reconnecting" | "failed";

export interface UseTwilioReconnectStateOptions {
  /**
   * The active Twilio Room. Null until `connectRoom()` resolves;
   * null again after `'disconnected'` fires. Hook handles both
   * transitions via the effect's cleanup path.
   */
  room: Room | null;
  /**
   * How long to count down before flipping `status` from
   * `'reconnecting'` → `'failed'`. Default 30s — matches Twilio's
   * default auto-retry window (per voice B1 § note 1). Surface as
   * a prop so we can tune if Twilio adjusts the default.
   */
  autoRetryWindowSeconds?: number;
  /**
   * Parent's rejoin handler. Called when the user clicks
   * `[Try now]` OR `[Rejoin call]`. Today's caller passes
   * `() => window.location.reload()`; smarter handlers (in-place
   * re-mount with cached HMAC) can wire later.
   *
   * Optional — when omitted, the buttons are still rendered by
   * `<ReconnectionBanner>` but clicks are no-ops (the banner can
   * surface a console.warn for dev visibility).
   */
  onRejoinRequested?: () => void;
}

export interface UseTwilioReconnectStateApi {
  /** Current state — drives the banner variant (or hides it). */
  status: ReconnectStatus;
  /**
   * Seconds remaining in the reconnecting-window countdown.
   *   `null` when status === 'live' (no countdown).
   *   `null` when status === 'failed' (countdown is over).
   *   Number 0..autoRetryWindowSeconds when status === 'reconnecting'.
   */
  countdownSeconds: number | null;
  /**
   * "Try now" button handler. Forces a full rejoin (see hook
   * doc above for why try-now ≡ rejoin in v1).
   */
  tryNow: () => void;
  /**
   * "Rejoin call" button handler. Identical to `tryNow` in v1.
   */
  rejoinNow: () => void;
}

const DEFAULT_AUTO_RETRY_WINDOW_SECONDS = 30;

export function useTwilioReconnectState(
  options: UseTwilioReconnectStateOptions,
): UseTwilioReconnectStateApi {
  const {
    room,
    autoRetryWindowSeconds = DEFAULT_AUTO_RETRY_WINDOW_SECONDS,
    onRejoinRequested,
  } = options;

  const [status, setStatus] = useState<ReconnectStatus>("live");
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

  // Stable ref for the rejoin callback so the listener-effect
  // doesn't re-subscribe whenever the parent re-renders with a new
  // closure identity. Same pattern as `onDisconnectRef` in
  // `<VideoRoom>`.
  const onRejoinRequestedRef = useRef(onRejoinRequested);
  useEffect(() => {
    onRejoinRequestedRef.current = onRejoinRequested;
  }, [onRejoinRequested]);

  // Countdown interval handle — torn down on `'reconnected'`,
  // `'failed'`, room change, OR unmount.
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  const clearCountdown = useCallback(() => {
    if (countdownIntervalRef.current !== null) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  // Subscribe to room reconnect events. Re-runs only when the
  // `Room` identity changes (mount → connect → disconnect → null).
  useEffect(() => {
    if (!room) {
      // Pre-connect / post-disconnect — reset to a clean state so
      // a stale `'reconnecting'` doesn't survive across rooms (e.g.
      // user clicks Rejoin and a fresh room mounts).
      clearCountdown();
      setStatus("live");
      setCountdownSeconds(null);
      return;
    }

    const handleReconnecting = () => {
      setStatus("reconnecting");
      setCountdownSeconds(autoRetryWindowSeconds);
      clearCountdown();
      countdownIntervalRef.current = setInterval(() => {
        // Functional setState so the interval callback sees the
        // latest value (no closure-staleness bug).
        setCountdownSeconds((prev) => {
          if (prev === null) {
            // Race: status flipped to live/failed before this tick
            // fired. Stop the interval; don't transition.
            clearCountdown();
            return null;
          }
          if (prev <= 1) {
            // Countdown exhausted. Flip to `'failed'` and stop the
            // interval. Twilio's `'disconnected'` event will fire
            // shortly after (almost always); the room's parent
            // disconnect listener picks it up and the splash takes
            // over. The `'failed'` overlay is the bridge.
            clearCountdown();
            setStatus("failed");
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    };

    const handleReconnected = () => {
      clearCountdown();
      setStatus("live");
      setCountdownSeconds(null);
    };

    const handleDisconnected = () => {
      // Hard disconnect — Twilio gave up (or the user chose to
      // leave). The parent's `'disconnected'` listener handles
      // teardown + splash; we just clean our local state so the
      // banner unmounts cleanly. Do NOT flip to `'failed'` here —
      // the splash supersedes our banner, and a stale `'failed'`
      // state would race with the next room's `'live'` reset.
      clearCountdown();
      setStatus("live");
      setCountdownSeconds(null);
    };

    // Twilio's `Room` extends EventEmitter — `.on()` returns the
    // room itself for chaining. We typecast minimally because the
    // SDK types are present (twilio-video is already a dep) but
    // we still want defensive `typeof` checks for the tests path.
    if (typeof (room as { on?: unknown }).on === "function") {
      (room as { on: (event: string, handler: (...args: unknown[]) => void) => void }).on(
        "reconnecting",
        handleReconnecting,
      );
      (room as { on: (event: string, handler: (...args: unknown[]) => void) => void }).on(
        "reconnected",
        handleReconnected,
      );
      (room as { on: (event: string, handler: (...args: unknown[]) => void) => void }).on(
        "disconnected",
        handleDisconnected,
      );
    }

    return () => {
      clearCountdown();
      if (typeof (room as { off?: unknown }).off === "function") {
        (room as { off: (event: string, handler: (...args: unknown[]) => void) => void }).off(
          "reconnecting",
          handleReconnecting,
        );
        (room as { off: (event: string, handler: (...args: unknown[]) => void) => void }).off(
          "reconnected",
          handleReconnected,
        );
        (room as { off: (event: string, handler: (...args: unknown[]) => void) => void }).off(
          "disconnected",
          handleDisconnected,
        );
      }
    };
  }, [room, autoRetryWindowSeconds, clearCountdown]);

  // Final unmount guard — the per-room effect cleanup also clears
  // the interval, but a parent unmount during a rapid mount/unmount
  // race could leave the interval orphaned. Belt + braces.
  useEffect(() => {
    return () => {
      clearCountdown();
    };
  }, [clearCountdown]);

  const triggerRejoin = useCallback(() => {
    const handler = onRejoinRequestedRef.current;
    if (handler) {
      handler();
      return;
    }
    // No handler wired — surface for dev visibility but don't
    // throw. Production builds will silently no-op.
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[useTwilioReconnectState] tryNow/rejoinNow invoked but no `onRejoinRequested` handler was provided. The button is a no-op.",
      );
    }
  }, []);

  return {
    status,
    countdownSeconds,
    tryNow: triggerRejoin,
    rejoinNow: triggerRejoin,
  };
}
