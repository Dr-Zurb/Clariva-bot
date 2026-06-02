"use client";

/**
 * Sub-batch B · task-voice-B3 / task-video-B3 — hold-call banner overlay.
 *
 * Shown to both parties while the call is on hold. Only the initiator
 * (`hold-by-self`) sees a Resume button (decision §4).
 */

import { useCallback } from "react";

export type CallHoldState = "live" | "hold-by-self" | "hold-by-other";

/** @deprecated Prefer `holdState` — kept for video B3 local-only hold. */
export type HoldCallBannerVariant = "self" | "counterparty";

export interface HoldCallBannerProps {
  /**
   * Bilateral hold state (voice B3). When set, drives copy + Resume visibility.
   * Omit when using legacy `variant` (video local hold until Realtime wire).
   */
  holdState?: CallHoldState;
  /** @deprecated Use `holdState` — maps `self` → hold-by-self, `counterparty` → hold-by-other */
  variant?: HoldCallBannerVariant;
  /** Remote actor display name (`hold-by-other`). */
  actorName?: string;
  counterpartyLabel?: string;
  onResume?: () => void;
}

export default function HoldCallBanner({
  holdState: holdStateProp,
  variant,
  actorName,
  counterpartyLabel,
  onResume,
}: HoldCallBannerProps) {
  const handleResumeClick = useCallback(() => {
    onResume?.();
  }, [onResume]);

  const resolvedState: CallHoldState | null =
    holdStateProp ??
    (variant === "self"
      ? "hold-by-self"
      : variant === "counterparty"
        ? "hold-by-other"
        : null);

  if (!resolvedState || resolvedState === "live") {
    return null;
  }

  const counterpartyName =
    actorName?.trim() && actorName.trim().length > 0
      ? actorName.trim()
      : counterpartyLabel?.trim() && counterpartyLabel.trim().length > 0
        ? counterpartyLabel.trim()
        : "the other party";

  const headline = "On hold";
  const body =
    resolvedState === "hold-by-self"
      ? "You stepped away."
      : `${counterpartyName} stepped away.`;
  const waitingCopy =
    resolvedState === "hold-by-other"
      ? "Waiting for them to resume…"
      : null;

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-gray-900/55 p-4"
      role="status"
      aria-live="polite"
      data-testid="hold-call-banner"
      data-hold-state={resolvedState}
    >
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-amber-200 bg-white px-5 py-4 text-center shadow-lg">
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900">
          {headline}
        </span>
        <p className="text-sm text-gray-800">{body}</p>
        {waitingCopy ? (
          <p className="text-xs text-amber-900/90">{waitingCopy}</p>
        ) : null}
        {resolvedState === "hold-by-self" ? (
          <button
            type="button"
            onClick={handleResumeClick}
            className="mt-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
          >
            Resume
          </button>
        ) : null}
      </div>
    </div>
  );
}
