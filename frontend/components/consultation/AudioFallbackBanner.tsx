"use client";

/**
 * Sub-batch E · task-video-E2 — Auto audio-only fallback banner.
 *
 * Sticky banner that mounts at the top of the video canvas when the
 * adaptive controller (E.3 / E.1) has decided bandwidth can't
 * sustain even 480p video and has torn down the local video track.
 * The user sees a clear explanation + a "Try video again" CTA
 * that's disabled during the 60s post-restore cooldown
 * (Decision §25 — flapping prevention).
 *
 * Why a sticky banner and not a self-clearing pill (like the
 * `adaptiveNotice` from E.3):
 *   - The fallback persists until the user takes action. A
 *     self-clearing toast would vanish in 6s and the user would
 *     be left with a black tile + no explanation — exactly the
 *     "video froze and I don't know why" footgun this whole
 *     feature exists to prevent.
 *   - The "Try video again" CTA needs to live in the persistent
 *     surface so the user can act on it whenever they're ready
 *     (e.g. after they've moved closer to the router).
 *
 * Why no counterparty banner in v1:
 *   - The patient sees the camera-off avatar (A2's
 *     `remoteCameraOff` already shipped) AND the chat system row
 *     ("Switched to audio-only because of slow connection.") via
 *     their existing companion-chat surface. That's the v1
 *     transparency contract per Decision §28's no-blame copy
 *     guideline. A parallel on-screen banner can ship later
 *     (Phase 2) by reading the system row.
 *
 * Decision §24 — wait for user gesture (no auto-restore). The
 * caller does NOT auto-republish video when network recovers; the
 * user MUST click "Try video again". This is intentional — auto-
 * restoring would surprise users who turned video off because
 * they're in a sensitive setting (e.g. driving, restroom) and
 * happen to also be on bad bandwidth.
 *
 * Decision §25 — 60s cooldown after restore. The button is
 * disabled with a tooltip ("Wait for the connection to recover")
 * during the cooldown so the user doesn't immediately re-trigger
 * fallback if they hit "Try video again" too eagerly.
 */

import { useEffect, useState } from "react";

export interface AudioFallbackBannerProps {
  /**
   * Click handler — re-publishes the local video track and starts
   * the 60s cooldown anchor in the parent. The parent is responsible
   * for posting the `auto_audio_recovered` system row.
   */
  onTryVideoAgain: () => void;
  /**
   * `true` when the parent's 60s cooldown timer is still running
   * (set after the user previously clicked "Try video again" and
   * hasn't yet waited the full window). Disables the button +
   * shows the wait-for-recovery tooltip.
   */
  cooldownActive: boolean;
  /**
   * Epoch-ms when the cooldown ends. Used to render the live
   * countdown ("Try video again (in 42s)") so the user can see how
   * long until the button re-enables. `null` when no cooldown is
   * running.
   */
  cooldownEndsAt: number | null;
  /**
   * `true` when a republish is in flight (the parent's
   * `applyAdaptiveLevel('high')` is still racing through Twilio).
   * Disables the button to prevent double-clicks.
   */
  restoreInFlight: boolean;
  /**
   * Test-only override for `Date.now()` so unit tests don't need
   * fake timers to verify countdown rendering. Production callers
   * leave this undefined.
   */
  nowOverride?: number;
}

/**
 * Format a number of seconds as a short, human-friendly countdown
 * tail. We deliberately don't use mm:ss because the cooldown is
 * always under 60s in v1 — "(in 42s)" reads better than "(0:42)"
 * at this scale.
 */
function formatSecondsTail(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const rounded = Math.ceil(seconds);
  return `(in ${rounded}s)`;
}

export default function AudioFallbackBanner({
  onTryVideoAgain,
  cooldownActive,
  cooldownEndsAt,
  restoreInFlight,
  nowOverride,
}: AudioFallbackBannerProps) {
  // Local 1s ticker so the countdown updates without forcing the
  // parent to re-render every second. Only mounted while a
  // cooldown is active — idle when cooldownEndsAt is null to
  // keep render cost zero outside the active 60s window.
  const [now, setNow] = useState<number>(() =>
    typeof nowOverride === "number" ? nowOverride : Date.now(),
  );

  useEffect(() => {
    if (typeof nowOverride === "number") {
      // Test mode — fixed clock, no ticker.
      setNow(nowOverride);
      return;
    }
    if (cooldownEndsAt == null) return;
    const tick = () => setNow(Date.now());
    tick();
    const handle = window.setInterval(tick, 1000);
    return () => window.clearInterval(handle);
  }, [cooldownEndsAt, nowOverride]);

  const remainingSeconds =
    cooldownActive && cooldownEndsAt != null
      ? Math.max(0, (cooldownEndsAt - now) / 1000)
      : 0;

  const buttonDisabled = cooldownActive || restoreInFlight;
  const buttonLabel = restoreInFlight
    ? "Restoring video…"
    : cooldownActive
      ? `Try video again ${formatSecondsTail(remainingSeconds)}`.trim()
      : "Try video again";

  // Tooltip per Decision §25 — only shown while the cooldown is
  // active. The `title` attribute is the lowest-friction tooltip
  // surface (no extra deps); aria-disabled gates AT clients away
  // from a no-op click.
  const tooltip = cooldownActive
    ? "Wait for the connection to recover before re-enabling video."
    : restoreInFlight
      ? "Restoring your video — one moment…"
      : undefined;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-30 flex w-full items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-sm"
    >
      <div className="flex items-center gap-2">
        {/*
         * Inline SVG instead of pulling in an icon dep — Lucide isn't
         * in the frontend deps yet (see existing comments in
         * `<VideoRoom>`'s controls bar). Wifi-off glyph signals
         * "network constrained" without being alarmist.
         */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0"
        >
          <path d="M1 1l22 22" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
        <span className="font-medium">
          Audio-only — your connection is too slow for video.
        </span>
      </div>
      <button
        type="button"
        onClick={onTryVideoAgain}
        disabled={buttonDisabled}
        aria-disabled={buttonDisabled}
        title={tooltip}
        className="rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-amber-100/60 disabled:text-amber-900/60"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
