"use client";

import { useEffect, useRef } from "react";
import {
  type DisconnectReason,
  disconnectReasonCopy,
} from "@/lib/call/classify-disconnect";

/**
 * Sub-batch B · task-video-B5 — disconnect-reason splash.
 *
 * Modality-agnostic — `<VideoRoom>` mounts this in place of the old
 * static "Call ended" placeholder; voice A9 will mount the same
 * component when it lands. Pure presentation: takes the classified
 * `reason` and the local user's `role`, renders the appropriate copy
 * + CTAs, and forwards Rejoin / Restart / Dismiss intents back to
 * the parent.
 *
 * CTA matrix:
 *   reason            | Rejoin | Restart | Dismiss
 *   ------------------|--------|---------|--------
 *   local             | —      | —       | yes
 *   remote            | —      | —       | yes
 *   connection_lost   | yes    | —       | yes
 *   timeout           | yes    | —       | yes
 *   token_expired     | —      | yes     | yes
 *   unknown           | yes    | —       | yes
 *
 * Auto-dismiss: deliberately OFF for video. The voice spec calls for
 * a 5s auto-dismiss because voice has a post-call summary screen
 * underneath; for video, this splash IS the post-call surface until
 * D1 (post-call summary) ships, so auto-dismiss would leave a blank
 * page. When D1 ships, lift `autoDismissMs` to a prop and let the
 * page wire it.
 */

export interface CallDisconnectSplashProps {
  reason: DisconnectReason;
  /** Local user's role — drives copy direction (we vs they). */
  role: "doctor" | "patient";
  /**
   * Counterparty's display name (e.g. "Dr. Sharma" / "Patient").
   * When omitted, `disconnectReasonCopy` falls back to a generic
   * label ("the doctor" / "the patient").
   */
  actorLabel?: string;
  /**
   * User clicked Dismiss — hide the splash. Parent decides what to
   * render in its place (today: a minimal "Call ended." placeholder
   * matching the legacy behavior).
   */
  onDismiss: () => void;
  /**
   * User clicked Rejoin — only shown for `connection_lost` /
   * `timeout` / `unknown`. Parent re-mounts the call (today:
   * `window.location.reload()` is the easiest implementation
   * because all the state lives in the URL + localStorage; the
   * page can opt into a smarter rejoin later).
   *
   * If omitted but the reason expects a Rejoin button, the button
   * is hidden (graceful degrade). Same applies to `onRestart`.
   */
  onRejoin?: () => void;
  /**
   * User clicked Restart — only shown for `token_expired`.
   * Parent should redirect to the original consult URL (which
   * triggers a fresh HMAC → Supabase JWT exchange).
   */
  onRestart?: () => void;
  /**
   * voice-A9 — when `'voice'`, uses the T2 §T2.16 copy table instead of
   * the default video-oriented strings.
   */
  modality?: "default" | "voice";
}

const REASON_VARIANT: Record<
  DisconnectReason,
  {
    icon: string;
    iconBg: string;
    iconFg: string;
    showRejoin: boolean;
    showRestart: boolean;
  }
> = {
  local: {
    icon: "✓",
    iconBg: "bg-gray-100",
    iconFg: "text-gray-600",
    showRejoin: false,
    showRestart: false,
  },
  remote: {
    icon: "✓",
    iconBg: "bg-gray-100",
    iconFg: "text-gray-600",
    showRejoin: false,
    showRestart: false,
  },
  connection_lost: {
    icon: "!",
    iconBg: "bg-amber-100",
    iconFg: "text-amber-700",
    showRejoin: true,
    showRestart: false,
  },
  timeout: {
    icon: "i",
    iconBg: "bg-blue-100",
    iconFg: "text-blue-700",
    showRejoin: true,
    showRestart: false,
  },
  token_expired: {
    icon: "!",
    iconBg: "bg-red-100",
    iconFg: "text-red-700",
    showRejoin: false,
    showRestart: true,
  },
  unknown: {
    icon: "?",
    iconBg: "bg-gray-100",
    iconFg: "text-gray-600",
    showRejoin: true,
    showRestart: false,
  },
};

export default function CallDisconnectSplash({
  reason,
  role,
  actorLabel,
  onDismiss,
  onRejoin,
  onRestart,
  modality = "default",
}: CallDisconnectSplashProps) {
  const variant = REASON_VARIANT[reason];
  const copy = disconnectReasonCopy(reason, { role, actorLabel, modality });

  // Focus the primary CTA on mount so keyboard users can dismiss /
  // rejoin without first tabbing through the splash. The "primary"
  // is Rejoin > Restart > Dismiss, picked in that priority order
  // because Rejoin is the most useful action when offered.
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    primaryButtonRef.current?.focus();
  }, []);

  const showRejoin = variant.showRejoin && Boolean(onRejoin);
  const showRestart = variant.showRestart && Boolean(onRestart);

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="call-disconnect-headline"
      className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm"
      data-testid="call-disconnect-splash"
      data-reason={reason}
    >
      <div
        className={
          "mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full text-lg font-semibold " +
          variant.iconBg +
          " " +
          variant.iconFg
        }
        aria-hidden
      >
        {variant.icon}
      </div>
      <p
        id="call-disconnect-headline"
        className="text-base font-semibold text-gray-900"
      >
        {copy.headline}
      </p>
      {copy.body ? (
        <p className="mt-1 text-sm text-gray-600">{copy.body}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {showRejoin ? (
          <button
            type="button"
            ref={primaryButtonRef}
            onClick={onRejoin}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Rejoin
          </button>
        ) : null}
        {showRestart ? (
          <button
            type="button"
            ref={showRejoin ? undefined : primaryButtonRef}
            onClick={onRestart}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Restart
          </button>
        ) : null}
        <button
          type="button"
          ref={!showRejoin && !showRestart ? primaryButtonRef : undefined}
          onClick={onDismiss}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
