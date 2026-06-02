"use client";

import type {
  OrientationLockTarget,
  ScreenOrientation,
} from "@/hooks/useScreenOrientation";

/**
 * Sub-batch F · task-video-F2 — orientation lock toggle.
 *
 * Renders a single icon button that locks the current orientation
 * when tapped (so a derm doctor examining a wound in landscape
 * doesn't have the layout flip if the patient briefly tilts
 * their phone) and unlocks on the second tap.
 *
 * **Placement deviation from spec.** Decision §32 calls for the
 * button to live in a `<VideoControlsBar>` overflow menu. No
 * overflow menu exists in the controls bar today (A4 was supposed
 * to extract `<VideoControlsBar>` and add an overflow surface; A4
 * never shipped). We render the button inline next to
 * `<VideoLayoutSwitcher>` instead — semantically the right
 * neighborhood (both control how the video is presented) and the
 * compact icon-only design keeps it from dominating the strip.
 * When A4 (or a future controls-bar refactor) ships an overflow
 * menu, this button can move with no API changes.
 *
 * **Silent degradation.** When `canLock` is false (iOS Safari, any
 * non-PWA browser without fullscreen, etc.) the component renders
 * `null`. Per spec: "If `!canLock`: don't render (silent
 * degradation)." The user never sees a disabled-forever button.
 *
 * Visual conventions match the existing controls bar (h-9 height,
 * gray border, focus ring). Icon-only because the button lives in
 * a dense neighbourhood; `aria-label` carries the full semantic
 * description for SR users.
 */

interface OrientationLockButtonProps {
  canLock: boolean;
  isLocked: boolean;
  orient: ScreenOrientation;
  lock: (target: OrientationLockTarget) => Promise<boolean>;
  unlock: () => Promise<void>;
  /** Hidden when true (parent may want to suppress alongside other
   *  controls — e.g. while on hold). */
  hidden?: boolean;
}

export function OrientationLockButton({
  canLock,
  isLocked,
  orient,
  lock,
  unlock,
  hidden = false,
}: OrientationLockButtonProps): React.JSX.Element | null {
  if (!canLock) return null;
  if (hidden) return null;

  const handleClick = () => {
    if (isLocked) {
      void unlock();
      return;
    }
    // Lock to whatever orientation we're currently in. The W3C
    // enum accepts our `OrientationLockTarget` values directly;
    // 'portrait' / 'landscape' map cleanly. We don't try to refine
    // to '-primary' / '-secondary' — those distinctions matter for
    // upside-down landscape, which UX-wise we don't care about.
    void lock(orient);
  };

  const orientLabel = orient === "portrait" ? "portrait" : "landscape";
  const title = isLocked
    ? `Orientation locked to ${orientLabel} — click to unlock`
    : `Lock orientation to ${orientLabel}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={isLocked}
      aria-label={title}
      title={title}
      data-testid="orientation-lock-button"
      data-locked={isLocked ? "true" : "false"}
      data-orient={orient}
      className={
        "flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 " +
        (isLocked
          ? "bg-blue-50 text-blue-900 ring-1 ring-blue-300 focus:ring-blue-400"
          : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-gray-300")
      }
    >
      {isLocked ? <LockClosedGlyph /> : <LockOpenGlyph />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Glyphs
//
// Inline SVGs (Lucide isn't in deps yet — same constraint flagged
// in B6 / B8 / F1 comments). 16×16 keeps them readable inside the
// 36×36 button cell. `currentColor` so the active/inactive tint
// passes through naturally.
// ---------------------------------------------------------------------------

function LockClosedGlyph(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function LockOpenGlyph(): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      {/* Open shackle — pivots away from the body to signal "unlocked". */}
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}
