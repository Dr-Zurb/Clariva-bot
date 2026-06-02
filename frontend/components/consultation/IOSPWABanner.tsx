"use client";

/**
 * Sub-batch F · task-video-F3 — iOS PWA degradation banner.
 *
 * On Android Chrome (PWA install + fullscreen) the SW persistent
 * notification path keeps a backgrounded call alive for 5+ min
 * (see `useCallMediaSession`). On iOS standalone / PWA, Apple
 * gates this — the SW notification doesn't pin the same way and
 * background WebRTC is throttled aggressively, so calls may drop
 * within ~30s of backgrounding.
 *
 * Per F3 acceptance criteria: "If iOS PWA: skip notification path
 * entirely; show in-app banner 'Audio call may pause when app
 * backgrounded — keep in foreground for best experience.'"
 *
 * The banner is sticky-amber (matches the reconnect / battery /
 * privacy banner family) and renders ONLY when the host hook
 * detects iOS standalone via `useCallMediaSession.isIOSPWA`. Non-
 * PWA iOS Safari (regular tab) gets nothing — that's a different
 * UX path (the user can just keep the tab open) and shouldn't be
 * scolded with a permanent banner.
 *
 * The host also passes the optional `hidden` flag so the banner
 * can be suppressed during hold (matches the rest of the
 * controls-bar visibility discipline; while held the call isn't
 * ACTUALLY at risk from backgrounding).
 */

import type React from "react";

interface IOSPWABannerProps {
  /** From `useCallMediaSession.isIOSPWA`. Banner null-renders
   *  when false. */
  isIOSPWA: boolean;
  /** Suppress banner (e.g. during hold). Defaults to false. */
  hidden?: boolean;
}

export function IOSPWABanner({
  isIOSPWA,
  hidden = false,
}: IOSPWABannerProps): React.JSX.Element | null {
  if (!isIOSPWA) return null;
  if (hidden) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 self-stretch rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
      data-testid="ios-pwa-banner"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="flex-shrink-0"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
      <span className="flex-1 font-medium">
        Call may pause if you switch apps — keep this tab in the
        foreground for the best experience.
      </span>
    </div>
  );
}
