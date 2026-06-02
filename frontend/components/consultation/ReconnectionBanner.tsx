"use client";

import type { ReconnectStatus } from "@/hooks/useTwilioReconnectState";

/**
 * Sub-batch B · task-video-B4 / task-voice-B1 — reconnect-state
 * banner. Pure presentation; mounting decisions live with the
 * caller.
 *
 * Authored ahead of voice B1 (which owns the canonical contract);
 * voice B1 will import this component verbatim once it lands. Same
 * doctrine as `<HoldCallBanner>` (B3) and `branding.ts` (B1).
 *
 * Two mount surfaces (caller decides):
 *   - `<VideoRoom>` mounts as an absolute-positioned overlay over
 *     the video canvas (so the last-good frame stays visible
 *     underneath; the user knows the call hasn't gone dark, just
 *     the signaling).
 *   - `<VoiceConsultRoom>` (when voice B1 lands) will mount
 *     immediately below `<CallerCardHeader>` as a top bar (no
 *     video tile to overlay; the caller card is the canvas).
 *
 * Two variants based on `status`:
 *   - `reconnecting` — amber, "Reconnecting… (28s)" with a
 *     `[Try now]` button (slim secondary). Subtle pulse so the
 *     user knows it's a transient state, not a final error.
 *   - `failed` — red, "Couldn't reconnect" with a `[Rejoin call]`
 *     button (primary). No pulse — this IS the final state until
 *     the user takes action (or Twilio's `'disconnected'` fires
 *     and the splash takes over).
 *   - `live` — returns null. Caller can also gate at the mount
 *     site; returning null here means callers can mount this
 *     unconditionally without an extra wrapper.
 *
 * Accessibility:
 *   - `role="status"` so screen readers announce the state change
 *     when the banner appears (without stealing focus).
 *   - `aria-live="polite"` on the message text so countdown
 *     ticks don't barrage the user with announcements (only the
 *     headline change is announced).
 *   - The action button is keyboard-focusable; failed state's
 *     primary button could optionally auto-focus (caller decides
 *     via the `autoFocusAction` prop) so a user navigating by
 *     keyboard isn't stranded.
 */

export interface ReconnectionBannerProps {
  status: ReconnectStatus;
  /**
   * Seconds remaining in the reconnecting-window countdown (from
   * `useTwilioReconnectState`). Renders as "(28s)" suffix on the
   * reconnecting variant. Ignored on the failed variant.
   *
   * `null` is rendered as no-suffix (e.g. countdown hasn't started
   * yet, or just transitioned to failed).
   */
  countdownSeconds?: number | null;
  /** "Try now" button click. Reconnecting variant only. */
  onTryNow?: () => void;
  /** "Rejoin call" button click. Failed variant only. */
  onRejoin?: () => void;
  /**
   * If true, the primary action button gets `autoFocus` on mount
   * so keyboard users aren't stranded. Defaults to false (the
   * banner appears mid-call; stealing focus mid-conversation is
   * intrusive; the user can tab to it). Failed-state callers may
   * want to flip this on.
   */
  autoFocusAction?: boolean;
}

export default function ReconnectionBanner({
  status,
  countdownSeconds,
  onTryNow,
  onRejoin,
  autoFocusAction = false,
}: ReconnectionBannerProps) {
  if (status === "live") {
    return null;
  }

  if (status === "reconnecting") {
    const suffix =
      typeof countdownSeconds === "number" && countdownSeconds >= 0
        ? ` (${countdownSeconds}s)`
        : "";
    return (
      <div
        role="status"
        aria-live="polite"
        className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 bg-amber-100/95 px-4 py-2 text-sm text-amber-900 shadow-sm backdrop-blur-sm"
        data-testid="reconnection-banner"
        data-variant="reconnecting"
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-600"
            aria-hidden
          />
          <span className="font-medium">
            Reconnecting…
            <span className="ml-1 font-normal tabular-nums">{suffix}</span>
          </span>
        </div>
        {onTryNow ? (
          <button
            type="button"
            onClick={onTryNow}
            autoFocus={autoFocusAction}
            className="rounded-md border border-amber-700/30 bg-white/70 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-1 focus:ring-offset-amber-100"
          >
            Try now
          </button>
        ) : null}
      </div>
    );
  }

  // status === "failed"
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 bg-red-100/95 px-4 py-2 text-sm text-red-900 shadow-sm backdrop-blur-sm"
      data-testid="reconnection-banner"
      data-variant="failed"
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full bg-red-600"
          aria-hidden
        />
        <span className="font-medium">Couldn&apos;t reconnect.</span>
      </div>
      {onRejoin ? (
        <button
          type="button"
          onClick={onRejoin}
          autoFocus={autoFocusAction}
          className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-1 focus:ring-offset-red-100"
        >
          Rejoin call
        </button>
      ) : null}
    </div>
  );
}
