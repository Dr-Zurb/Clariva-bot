"use client";

/**
 * Sub-batch F · task-video-F4 — Battery-saver auto-downgrade banner.
 *
 * Three render modes, driven by the consumer's state machine:
 *
 *   - `'prompt'`   → battery <15%, not charging. Modal-shaped row with
 *                     [Switch to audio-only] + [Keep video]. The user
 *                     decision latches in the parent so we don't re-nag.
 *   - `'forced'`   → battery <5%, not charging, audio-only engaged via
 *                     the E.2 fallback path. Sticky amber banner.
 *                     No primary CTA (the only escape is plugging in;
 *                     "Try video again" is gated to that recovery).
 *   - `'charging'` → AC was plugged in OR battery climbed back above 20%
 *                     while a previous prompt/forced state was active.
 *                     Green sticky banner with [Re-enable video] when
 *                     a forced fallback was active, OR a simple
 *                     dismiss-able recovery pill when only the prompt
 *                     was open. Mode resolution happens in the parent.
 *
 * Color palette mirrors A8/E.2 conventions:
 *   - amber (`amber-50/300/900`)  — warning / non-blocking, e.g. the
 *                                   bandwidth audio-fallback banner.
 *   - red   (`red-50/300/900`)    — critical / forced; reserved for the
 *                                   `'forced'` mode so the user
 *                                   immediately distinguishes "I should
 *                                   plug in" from "my connection is
 *                                   slow".
 *   - emerald (`emerald-50/300/900`) — recovery; reused from the
 *                                       reconnect-success pill.
 *
 * No new icon library — inline SVG, same shape as `<AudioFallbackBanner>`
 * (Lucide isn't a dep yet; existing comments in `<VideoRoom>` track
 * this).
 *
 * Accessibility: `role="status"` + `aria-live="polite"` so AT users hear
 * the level transition without it stealing focus mid-sentence. Action
 * buttons are real `<button>`s; Escape on the prompt does not dismiss
 * (consumer owns the "Keep video" semantics — Escape would map to
 * "decline" which we want to be an explicit click, not an accidental
 * keyboard tap).
 */

export type BatteryBannerMode = "prompt" | "forced" | "charging";

export interface BatteryWarningBannerProps {
  /** Render mode. The consumer drives this from the battery state machine. */
  mode: BatteryBannerMode;
  /**
   * `'prompt'` mode — user clicked "Switch to audio-only". Consumer
   * engages the E.2 fallback path with `reason: 'battery_low'`.
   * Required for `'prompt'`; ignored otherwise.
   */
  onSwitchToAudio?: () => void;
  /**
   * `'prompt'` mode — user clicked "Keep video". Consumer latches
   * the decline so we don't re-nag this call. Required for
   * `'prompt'`; ignored otherwise.
   */
  onKeepVideo?: () => void;
  /**
   * `'charging'` mode — user clicked "Re-enable video". Consumer
   * routes to `handleTryVideoAgain` (the existing E.2 restore
   * primitive). Required when `mode === 'charging'` AND there was a
   * prior forced fallback (the consumer decides which charging
   * sub-mode to render via this prop's presence). When omitted, the
   * `'charging'` banner renders a simple dismiss-only message.
   */
  onReEnableVideo?: () => void;
  /**
   * `'charging'` mode — user clicked dismiss / X. Consumer hides
   * the banner. Required for `'charging'`; ignored otherwise.
   */
  onDismiss?: () => void;
  /**
   * Disable the action buttons (e.g. while a republish is in flight
   * after the user already clicked Re-enable). Visually greys out
   * + ignores clicks; layout slot preserved.
   */
  busy?: boolean;
}

// ----------------------------------------------------------------------------
// Inline SVG glyphs — kept local so we don't pull in an icon dep.
// ----------------------------------------------------------------------------

function BatteryLowGlyph() {
  return (
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
      <rect x="2" y="7" width="16" height="10" rx="2" ry="2" />
      <line x1="22" y1="11" x2="22" y2="13" />
      {/* Single segment fill on the left to communicate "low". */}
      <rect x="4" y="9" width="3" height="6" fill="currentColor" />
    </svg>
  );
}

function BoltGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4 shrink-0"
    >
      <path d="M13 2 L4 14 L11 14 L10 22 L20 10 L13 10 Z" />
    </svg>
  );
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export default function BatteryWarningBanner({
  mode,
  onSwitchToAudio,
  onKeepVideo,
  onReEnableVideo,
  onDismiss,
  busy = false,
}: BatteryWarningBannerProps) {
  if (mode === "prompt") {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="battery-warning-banner"
        data-mode="prompt"
        className="sticky top-0 z-30 flex w-full flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <span className="text-amber-700">
            <BatteryLowGlyph />
          </span>
          <span className="font-medium">
            Battery is low. Switch to audio-only to save power?
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSwitchToAudio}
            disabled={busy}
            aria-disabled={busy}
            className="rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-amber-100/60 disabled:text-amber-900/60"
          >
            Switch to audio-only
          </button>
          <button
            type="button"
            onClick={onKeepVideo}
            disabled={busy}
            aria-disabled={busy}
            className="rounded-md border border-transparent px-3 py-1 text-xs font-medium text-amber-900/80 hover:bg-amber-100 hover:text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:text-amber-900/40"
          >
            Keep video
          </button>
        </div>
      </div>
    );
  }

  if (mode === "forced") {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="battery-warning-banner"
        data-mode="forced"
        className="sticky top-0 z-30 flex w-full items-center justify-between gap-3 border-b border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <span className="text-red-700">
            <BatteryLowGlyph />
          </span>
          <span className="font-medium">
            Battery critical — switched to audio-only.
          </span>
        </div>
        <span className="text-xs text-red-800/80">
          Plug in to re-enable video
        </span>
      </div>
    );
  }

  // mode === 'charging' — recovery branch. If the consumer passes
  // `onReEnableVideo`, we render the "Re-enable video" CTA (forced
  // fallback was active; user can resume video now that they're
  // charging). Otherwise it's a simple recovery acknowledgement
  // (the prompt was open but never accepted; just let the user know
  // they're back to safe).
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="battery-warning-banner"
      data-mode="charging"
      className="sticky top-0 z-30 flex w-full flex-wrap items-center justify-between gap-3 border-b border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <span className="text-emerald-700">
          <BoltGlyph />
        </span>
        <span className="font-medium">
          {onReEnableVideo
            ? "Charging detected — try video again?"
            : "Charging detected — battery recovering."}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {onReEnableVideo ? (
          <button
            type="button"
            onClick={onReEnableVideo}
            disabled={busy}
            aria-disabled={busy}
            className="rounded-md border border-emerald-400 bg-white px-3 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-emerald-100/60 disabled:text-emerald-900/60"
          >
            {busy ? "Restoring video…" : "Re-enable video"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss battery recovery banner"
          className="rounded-md border border-transparent px-2 py-1 text-xs font-medium text-emerald-900/80 hover:bg-emerald-100 hover:text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
