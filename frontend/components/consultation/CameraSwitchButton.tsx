"use client";

import { useEffect, useId, useRef, useState } from "react";

import type {
  CameraDeviceInfo,
  CameraFacing,
} from "@/hooks/useCameraSwitch";

/**
 * Sub-batch F · task-video-F1 — camera switch button.
 *
 * Two presentations driven by viewport width (decision §31):
 *   - **Mobile** (`< 768px`): single circular flip glyph button. Tap
 *     to call `flip()` (front ↔ back). Optimised for thumb reach
 *     while holding a phone in one hand during a derm exam.
 *   - **Desktop** (`>= 768px`): native `<select>` dropdown listing
 *     all cameras by label. Selecting one calls `switchTo(deviceId)`.
 *     Optimised for the doctor with USB scopes / dermatoscopes /
 *     external webcams plugged in.
 *
 * Decision §31 explicitly chose VIEWPORT (not user-agent) detection
 * because:
 *   - UA strings lie (Chrome on iPad reports as desktop Mac).
 *   - The Pixel Fold and other foldables can be either depending on
 *     posture; viewport correctly tracks the actual visible width.
 *   - It makes responsive previews in dev tools work correctly.
 *
 * The whole component renders nothing when `hasMultipleCameras` is
 * false — there's only one camera, the button would do nothing, and
 * empty UI is better than a disabled-forever control. The host
 * (`<VideoRoom>`) is responsible for the audio-only / hold gates.
 *
 * Visual conventions match the existing controls bar (mute, camera-
 * off, mirror, hold buttons): same height (`h-9`), same gray
 * border, same focus ring. The mobile flip glyph uses an inline SVG
 * (Lucide is not in the deps yet — see VideoRoom.tsx line ~4577 for
 * the rationale) drawn at 18×18 to match the row metrics.
 */

const DESKTOP_BREAKPOINT_PX = 768;

interface CameraSwitchButtonProps {
  devices: CameraDeviceInfo[];
  current: string | null;
  flip: () => Promise<void> | void;
  switchTo: (deviceId: string) => Promise<void> | void;
  isFlipping: boolean;
  hasMultipleCameras: boolean;
  /** Optional override for breakpoint detection. Useful in tests
   *  + Storybook. Defaults to `window.matchMedia(min-width:768px)`. */
  forceLayout?: "mobile" | "desktop";
}

// ---------------------------------------------------------------------------
// Viewport-driven layout selector
// ---------------------------------------------------------------------------

function useIsDesktopViewport(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(
      `(min-width: ${DESKTOP_BREAKPOINT_PX}px)`,
    );
    const apply = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsDesktop(e.matches);
    };
    apply(query);
    // Modern browsers: addEventListener('change'). Legacy Safari:
    // addListener (deprecated but still works). Use feature-detect
    // so SSR + jsdom don't blow up.
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", apply);
      return () => query.removeEventListener("change", apply);
    }
    // Legacy Safari (< 14) didn't ship `addEventListener` on
    // MediaQueryList — only the deprecated `addListener` /
    // `removeListener`. Lib types still expose them as deprecated;
    // no `@ts-expect-error` needed.
    query.addListener(apply);
    return () => {
      query.removeListener(apply);
    };
  }, []);

  return isDesktop;
}

// ---------------------------------------------------------------------------
// Glyph
//
// Inline SVG of a "flip camera" icon — two arrowed quarter-arcs
// suggesting rotation around a central camera. 18×18 to match the
// other button text glyphs.
// ---------------------------------------------------------------------------

function FlipCameraGlyph(): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* Camera body */}
      <rect x="3" y="7" width="18" height="12" rx="2" />
      {/* Lens */}
      <circle cx="12" cy="13" r="2.5" />
      {/* Top mount + flash slit */}
      <path d="M9 4h6l1 3H8l1-3z" />
      {/* Rotation arrows: small chevrons at NE + SW corners */}
      <path d="M19 11l1.5 1.5L19 14" />
      <path d="M5 14l-1.5-1.5L5 11" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Mobile renderer
// ---------------------------------------------------------------------------

function MobileFlipButton(props: {
  flip: () => Promise<void> | void;
  isFlipping: boolean;
  /** Cosmetic hint: shows the OTHER facing in the title for
   *  affordance ("Switch to back camera"). Falls back to a generic
   *  copy when facing is unknown. */
  nextFacingLabel: string;
}): React.JSX.Element {
  const { flip, isFlipping, nextFacingLabel } = props;

  const handleClick = () => {
    if (isFlipping) return;
    void flip();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isFlipping}
      aria-label={nextFacingLabel}
      title={nextFacingLabel}
      data-testid="camera-flip-button"
      className={
        "flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      <FlipCameraGlyph />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Desktop renderer
// ---------------------------------------------------------------------------

function facingShortLabel(facing: CameraFacing): string {
  if (facing === "front") return "Front";
  if (facing === "back") return "Back";
  return "";
}

function deviceDropdownLabel(device: CameraDeviceInfo, idx: number): string {
  const baseLabel = device.label || `Camera ${idx + 1}`;
  const facing = facingShortLabel(device.facing);
  return facing ? `${baseLabel} · ${facing}` : baseLabel;
}

function DesktopDropdown(props: {
  devices: CameraDeviceInfo[];
  current: string | null;
  switchTo: (deviceId: string) => Promise<void> | void;
  isFlipping: boolean;
}): React.JSX.Element {
  const { devices, current, switchTo, isFlipping } = props;
  const selectId = useId();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = e.target.value;
    if (!deviceId || deviceId === current) return;
    void switchTo(deviceId);
  };

  return (
    <div className="flex h-9 items-center rounded-md border border-gray-300 bg-white px-2">
      <label
        htmlFor={selectId}
        className="mr-2 text-xs font-medium text-gray-600"
      >
        Camera
      </label>
      <select
        id={selectId}
        value={current ?? ""}
        onChange={handleChange}
        disabled={isFlipping}
        title="Switch active camera"
        data-testid="camera-switch-dropdown"
        className="bg-transparent text-sm text-gray-700 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {/* Empty placeholder option only if `current` is null (we
         *  haven't resolved which device is live yet). Once
         *  resolved, the placeholder disappears. */}
        {current == null ? (
          <option value="" disabled>
            Detecting…
          </option>
        ) : null}
        {devices.map((device, idx) => (
          <option key={device.deviceId} value={device.deviceId}>
            {deviceDropdownLabel(device, idx)}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export function CameraSwitchButton(
  props: CameraSwitchButtonProps,
): React.JSX.Element | null {
  const {
    devices,
    current,
    flip,
    switchTo,
    isFlipping,
    hasMultipleCameras,
    forceLayout,
  } = props;

  const isDesktopViewport = useIsDesktopViewport();
  const isDesktop = forceLayout
    ? forceLayout === "desktop"
    : isDesktopViewport;

  // First-render guard. On SSR + before the first useEffect tick,
  // useIsDesktopViewport returns `false` (= mobile). To avoid a
  // hydration flash on desktop (mobile button → dropdown), we hide
  // until the viewport state has been measured at least once. This
  // pattern is used elsewhere in the codebase (see e.g.
  // useBatterySaver supported flag).
  const hasMeasuredRef = useRef(false);
  useEffect(() => {
    hasMeasuredRef.current = true;
  }, []);

  if (!hasMultipleCameras) return null;

  // Compute the affordance label for the mobile button. Looks at
  // the CURRENT device's facing and offers the OTHER facing's
  // copy.
  const currentDevice =
    current != null ? devices.find((d) => d.deviceId === current) : undefined;
  const currentFacing: CameraFacing = currentDevice?.facing ?? "unknown";
  const nextFacingLabel = (() => {
    if (currentFacing === "front") return "Switch to back camera";
    if (currentFacing === "back") return "Switch to front camera";
    return "Switch camera";
  })();

  if (isDesktop) {
    return (
      <DesktopDropdown
        devices={devices}
        current={current}
        switchTo={switchTo}
        isFlipping={isFlipping}
      />
    );
  }

  return (
    <MobileFlipButton
      flip={flip}
      isFlipping={isFlipping}
      nextFacingLabel={nextFacingLabel}
    />
  );
}
