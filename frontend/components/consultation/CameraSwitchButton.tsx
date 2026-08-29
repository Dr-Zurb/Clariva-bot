"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SwitchCamera } from "lucide-react";

import type {
  CameraDeviceInfo,
  CameraFacing,
} from "@/hooks/useCameraSwitch";
import { COCKPIT_CTRL } from "@/lib/call/cockpit-call-controls";
import CallControlTooltip from "./CallControlTooltip";

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
 * The whole component renders nothing when neither `canFlip` nor
 * `hasMultipleCameras` is true.
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
  /** Broader than `hasMultipleCameras` — iOS single-device facingMode. */
  canFlip?: boolean;
  /** Live-track facing; wins over the device-list heuristic for the label. */
  currentFacing?: CameraFacing;
  /** Optional override for breakpoint detection. Useful in tests
   *  + Storybook. Defaults to `window.matchMedia(min-width:768px)`. */
  forceLayout?: "mobile" | "desktop";
  /** Cockpit dock uses icon-only circular buttons. */
  tone?: "default" | "cockpit";
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
// Glyph — Lucide SwitchCamera (camera + circling arrows). The old
// body-plus-chevrons mark read as a still camera, not a flip.
// ---------------------------------------------------------------------------

export function FlipCameraGlyph({
  className = "h-[18px] w-[18px]",
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <SwitchCamera
      className={className}
      strokeWidth={2}
      aria-hidden
    />
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
  tone?: "default" | "cockpit";
}): React.JSX.Element {
  const { flip, isFlipping, nextFacingLabel, tone = "default" } = props;

  const handleClick = () => {
    if (isFlipping) return;
    void flip();
  };

  const button = (
    <button
      type="button"
      onClick={handleClick}
      disabled={isFlipping}
      aria-label={nextFacingLabel}
      title={tone === "cockpit" ? undefined : nextFacingLabel}
      data-testid="camera-flip-button"
      className={
        tone === "cockpit"
          ? COCKPIT_CTRL
          : "flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      <FlipCameraGlyph />
    </button>
  );

  if (tone === "cockpit") {
    return (
      <CallControlTooltip label={nextFacingLabel}>{button}</CallControlTooltip>
    );
  }
  return button;
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
    canFlip,
    currentFacing: currentFacingProp,
    forceLayout,
    tone = "default",
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

  if (!(canFlip ?? hasMultipleCameras)) return null;

  // Compute the affordance label for the mobile button. Looks at
  // the CURRENT device's facing and offers the OTHER facing's
  // copy. Live-track facing wins — iOS may list one device whose
  // label still says "front" after a facingMode flip.
  const currentDevice =
    current != null ? devices.find((d) => d.deviceId === current) : undefined;
  const currentFacing: CameraFacing =
    currentFacingProp && currentFacingProp !== "unknown"
      ? currentFacingProp
      : (currentDevice?.facing ?? "unknown");
  const nextFacingLabel = (() => {
    if (currentFacing === "front") return "Switch to back camera";
    if (currentFacing === "back") return "Switch to front camera";
    return "Switch camera";
  })();

  // Cockpit dock is icon-only; a <select> breaks the cluster. Always
  // flip. Desktop dropdown stays for the patient/legacy toolbar when
  // there are labelled cameras to pick from.
  if (isDesktop && tone !== "cockpit" && hasMultipleCameras) {
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
      tone={tone}
    />
  );
}
