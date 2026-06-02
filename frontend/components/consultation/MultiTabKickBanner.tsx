"use client";

/**
 * <MultiTabKickBanner> — surface for `useTabPresenceClaim` status.
 *
 * Sub-batch E · task-video-E3 (foundation; voice C4 + text D2 will reuse).
 *
 * Branches by `status` (matches the hook's `TabPresenceStatus`):
 *
 *   - `'sole'`             → renders nothing.
 *   - `'multi-tab-warned'` → DOCTOR-only. Small pill at the top of the video
 *                             canvas: "Open in N tabs · audio routes to the
 *                             newest tab". Non-blocking; no CTA. Doctors
 *                             legitimately use multi-monitor setups (chart
 *                             on one screen, video on the other) — we surface
 *                             the situation without yanking them off the
 *                             call. Decision §29 video / §10 voice.
 *
 *   - `'kicked'`           → PATIENT-only. Full-screen overlay (z-50, covers
 *                             the entire `<VideoRoom>`): "This consultation
 *                             is open in another tab. [Take over]". Clicking
 *                             [Take over] re-asserts THIS tab's claim with a
 *                             newer timestamp; the OTHER tab will flip to
 *                             `'kicked'` on its next presence sync.
 *
 * Why we ship the doctor pill AND the patient overlay in the SAME component:
 * the parent (`<VideoRoom>`) just renders one element regardless of role,
 * and the component decides what to surface. Keeps the parent tidy and
 * keeps the role-asymmetry in one file (next reviewer can see both
 * affordances at once).
 *
 * Mounting contract (`<VideoRoom>`):
 *   - Mount unconditionally inside the `relative` wrapper. The component
 *     itself returns `null` for the `'sole'` case.
 *   - The kick overlay is `absolute inset-0 z-50` so it covers ALL room
 *     UI (controls, banners, recording indicator). Once kicked, NOTHING
 *     interactive should be reachable except [Take over].
 *   - The doctor pill is `absolute top-2 left-1/2 -translate-x-1/2` so it
 *     sits above the video without obscuring controls.
 *
 * Accessibility:
 *   - The kick overlay has `role="dialog"` + `aria-modal="true"` and traps
 *     focus on the [Take over] button (the only interactive element).
 *   - The doctor pill is `role="status"` with `aria-live="polite"` so AT
 *     announces "Open in 2 tabs" when it changes, not when the page loads.
 */

import { useEffect, useRef } from "react";

import type {
  TabPresenceStatus,
  TabPresenceRole,
} from "@/hooks/useTabPresenceClaim";

export interface MultiTabKickBannerProps {
  /** Current presence status from `useTabPresenceClaim`. */
  status: TabPresenceStatus;
  /** Number of OTHER tabs of the same role. Drives the pill copy. */
  otherTabsCount: number;
  /** Caller role — informs which surface to render. Mismatched roles render
   *  nothing (defensive: e.g. `status === 'kicked'` from a doctor caller is
   *  a logic error in the hook; we don't want to ship a kick overlay to a
   *  doctor by accident). */
  role: TabPresenceRole;
  /** Re-broadcast a fresh claim. Wired to `useTabPresenceClaim().takeOver`. */
  onTakeOver: () => void;
  /** Voice rooms pass `'audio'` for audio-only copy; video is the default. */
  mediaMode?: "audio" | "audio-video";
}

export default function MultiTabKickBanner({
  status,
  otherTabsCount,
  role,
  onTakeOver,
  mediaMode = "audio-video",
}: MultiTabKickBannerProps) {
  const takeOverButtonRef = useRef<HTMLButtonElement | null>(null);

  // Auto-focus the [Take over] button when the kick overlay mounts. Patients
  // arriving here may be panicked ("did the call drop?"); a focused CTA is
  // both an a11y win (focus-trap candidate) and a UX nudge ("this is the
  // way out").
  useEffect(() => {
    if (status === "kicked" && role === "patient") {
      takeOverButtonRef.current?.focus();
    }
  }, [role, status]);

  if (status === "sole") return null;

  // ------------------------------------------------------------------------
  // Doctor: tolerated multi-tab pill
  // ------------------------------------------------------------------------
  if (status === "multi-tab-warned" && role === "doctor") {
    const tabsTotal = otherTabsCount + 1;
    return (
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2"
      >
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-amber-100/95 px-3 py-1 text-xs font-medium text-amber-900 shadow-sm ring-1 ring-amber-300/60 backdrop-blur">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 12.5v-8Zm9.5 12.5h-5a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5Z"
              clipRule="evenodd"
            />
          </svg>
          <span>
            Open in {tabsTotal} tabs &middot;{" "}
            {mediaMode === "audio"
              ? "audio routes to the most-recent tab"
              : "audio & video route to the newest tab"}
          </span>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------------
  // Patient: full-screen kick overlay
  // ------------------------------------------------------------------------
  if (status === "kicked" && role === "patient") {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="multi-tab-kick-title"
        aria-describedby="multi-tab-kick-desc"
        className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/95 px-6 text-center backdrop-blur-sm"
      >
        <div className="max-w-sm">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="13" height="11" rx="2" />
              <rect x="8" y="9" width="13" height="11" rx="2" />
            </svg>
          </div>
          <h2
            id="multi-tab-kick-title"
            className="text-lg font-semibold text-gray-900"
          >
            {mediaMode === "audio"
              ? "Opened in another window"
              : "This consultation is open in another tab"}
          </h2>
          <p
            id="multi-tab-kick-desc"
            className="mt-2 text-sm text-gray-600"
          >
            {mediaMode === "audio"
              ? "This window has been disconnected. Switch to the other tab to continue, or take back over here. Your microphone has been released from this tab."
              : "Switch to that tab to continue your consultation, or take over here. Your camera and microphone have been released from this tab."}
          </p>
          <button
            ref={takeOverButtonRef}
            type="button"
            onClick={onTakeOver}
            className="mt-5 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {mediaMode === "audio" ? "Take back over" : "Take over"}
          </button>
        </div>
      </div>
    );
  }

  // Defensive: any role/status mismatch (e.g. a doctor reporting `'kicked'`,
  // which would be a logic bug in the hook) renders nothing rather than
  // surfacing UI that doesn't make sense for the role.
  return null;
}
