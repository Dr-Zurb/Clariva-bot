"use client";

import { useEffect, useState } from "react";

/**
 * Sub-batch A · task-video-A3 (pull-forward of voice T1.1 / A1).
 *
 * Live call-duration timer that ticks once per second from the moment
 * `connectedAt` is set. Re-derived purely from `connectedAt + Date.now()`
 * so a doctor-side and patient-side render of the same call drift
 * by at most ~2s (acceptable per task-A3 Notes #3 — no Realtime sync).
 *
 * Behavior contract (matches voice A1 task draft so the hook is a true
 * shared dependency once voice batch picks up):
 *   - `connectedAt === null` → returns `{ formatted: '', seconds: 0 }`.
 *     Callers should treat empty string as "do not render the chip".
 *   - `connectedAt` set → starts ticking; first emit fires within ~1s.
 *   - Format threshold: under 60 minutes → `mm:ss` (zero-padded);
 *     ≥ 60 minutes → `h:mm:ss` (hours unpadded; minutes + seconds
 *     zero-padded).
 *   - Reconnect / hold doctrine: callers KEEP `connectedAt` unchanged
 *     across reconnects + holds — the timer naturally keeps counting.
 *     Only set `connectedAt` once per session (on the first
 *     `room.connected` / `participantConnected` Twilio event).
 *   - `setInterval` is registered + cleaned up on `connectedAt`
 *     transitions and on unmount, so there's no leaked timer.
 *
 * Future consumers planned per the batch plan:
 *   - <VideoRoom> header chip (this PR — A3).
 *   - <VoiceConsultRoom> header chip (voice A1 — when it ships).
 *   - <CallerCardOverlay> (video B2 — uses the same `formatted` value).
 *   - Plan 07 history viewer renders a STATIC duration from session
 *     start/end and does NOT mount this hook (live ticking has no
 *     semantic in a recorded session).
 */
export interface UseCallDurationResult {
  /** Empty string when `connectedAt === null`; otherwise `mm:ss` / `h:mm:ss`. */
  formatted: string;
  /** Whole seconds since `connectedAt`. `0` when `connectedAt === null`. */
  seconds: number;
}

/** Shared formatter for live + readonly (Plan 07) duration labels. */
export function formatCallDurationSeconds(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function useCallDuration(connectedAt: Date | null): UseCallDurationResult {
  const [seconds, setSeconds] = useState<number>(() => {
    if (!connectedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - connectedAt.getTime()) / 1000));
  });

  useEffect(() => {
    if (!connectedAt) {
      setSeconds(0);
      return;
    }
    // Seed immediately so the first paint after `connectedAt` becomes
    // non-null doesn't show 00:00 for a tick.
    setSeconds(Math.max(0, Math.floor((Date.now() - connectedAt.getTime()) / 1000)));
    const id = window.setInterval(() => {
      setSeconds(Math.max(0, Math.floor((Date.now() - connectedAt.getTime()) / 1000)));
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [connectedAt]);

  return {
    formatted: connectedAt ? formatCallDurationSeconds(seconds) : "",
    seconds: connectedAt ? seconds : 0,
  };
}

export default useCallDuration;
