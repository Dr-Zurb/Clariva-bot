/**
 * Front / back camera heuristics shared by the in-call switch hook and
 * the pre-call preview. Kept free of Twilio / React so it unit-tests
 * without a media mock.
 *
 * iOS Safari often reports a single `videoinput` even when the phone
 * has two cameras. In that case deviceId switching is a no-op and the
 * only working flip is `facingMode: 'user' | 'environment'`.
 */

export type CameraFacing = "front" | "back" | "unknown";

export type CameraFacingMode = "user" | "environment";

/** Default Auto publish — kept in lockstep with twilio-connect-profile. */
const SWITCH_VIDEO_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
} as const;

export function deriveFacingFromLabel(label: string): CameraFacing {
  const lower = label.toLowerCase();
  if (
    lower.includes("front") ||
    lower.includes("user") ||
    lower.includes("selfie") ||
    lower.includes("facetime")
  ) {
    return "front";
  }
  if (
    lower.includes("back") ||
    lower.includes("rear") ||
    lower.includes("environment") ||
    lower.includes("world")
  ) {
    return "back";
  }
  return "unknown";
}

export function facingFromFacingMode(
  facingMode: string | undefined | null,
): CameraFacing {
  if (facingMode === "user") return "front";
  if (facingMode === "environment") return "back";
  return "unknown";
}

export function facingModeFor(facing: CameraFacing): CameraFacingMode | null {
  if (facing === "front") return "user";
  if (facing === "back") return "environment";
  return null;
}

/**
 * First tap from an unknown facing goes to the back camera — that's
 * the derm-exam case (patient showing a lesion).
 */
export function oppositeFacing(facing: CameraFacing): CameraFacing {
  return facing === "back" ? "front" : "back";
}

export function nextFacingMode(facing: CameraFacing): CameraFacingMode {
  return facing === "back" ? "user" : "environment";
}

/**
 * After the per-label pass, if all facings are 'unknown' (iOS
 * pre-permission, or cryptic Android labels), fall back to device
 * order: index 0 → front, index 1 → back.
 */
export function annotateFacings<T extends { label: string }>(
  cameras: T[],
): Array<T & { facing: CameraFacing }> {
  const labelled = cameras.map((cam) => ({
    ...cam,
    facing: deriveFacingFromLabel(cam.label),
  }));

  const allUnknown = labelled.every((cam) => cam.facing === "unknown");
  if (!allUnknown) return labelled;

  return labelled.map((cam, idx) => {
    if (idx === 0) return { ...cam, facing: "front" as CameraFacing };
    if (idx === 1) return { ...cam, facing: "back" as CameraFacing };
    return cam;
  });
}

/**
 * Whether a flip control should render.
 *
 * - 2+ enumerated cameras: always (deviceId switch).
 * - Live track reports user/environment: iOS single-device case.
 * - Narrow viewport with at least one camera (or a live track): last
 *   resort so iPhone still gets a button before settings populate.
 * Desktop laptops with one webcam stay hidden.
 */
export function canFlipCameras(opts: {
  cameraCount: number;
  hasLiveVideo: boolean;
  liveFacing: CameraFacing;
  isNarrowViewport: boolean;
}): boolean {
  if (opts.cameraCount >= 2) return true;
  if (!opts.hasLiveVideo && opts.cameraCount < 1) return false;
  if (opts.liveFacing === "front" || opts.liveFacing === "back") return true;
  if (opts.isNarrowViewport && (opts.hasLiveVideo || opts.cameraCount >= 1)) {
    return true;
  }
  return false;
}

/**
 * Identity of the camera that is actually publishing.
 *
 * localStorage is a last-session preference and must not win over the
 * live track — that mismatch made Flip a no-op after the first
 * successful switch (stored id === requested id, live camera unchanged).
 */
export function resolveLiveCameraIdentity(opts: {
  liveDeviceId: string | null;
  liveFacing: CameraFacing;
  initialDeviceId?: string | null;
}): { deviceId: string | null; facing: CameraFacing } {
  return {
    deviceId: opts.liveDeviceId ?? opts.initialDeviceId ?? null,
    facing: opts.liveFacing,
  };
}

/**
 * Skip a deviceId switch only when the *live* track is already that
 * device. A stale stored / current id must not suppress the flip.
 */
export function isAlreadyOnRequestedDevice(
  requestedDeviceId: string | undefined,
  liveDeviceId: string | null,
): boolean {
  return Boolean(
    requestedDeviceId && liveDeviceId && requestedDeviceId === liveDeviceId,
  );
}

/**
 * Constraints for a mid-call / pre-call camera republish. Always
 * carries 720p30 so a flip doesn't silently drop back to VGA.
 *
 * User-initiated flips pass `deviceIdExact` so the browser cannot
 * silently keep the current camera (`ideal` is advisory).
 */
export function videoConstraintsForCameraSwitch(opts: {
  deviceId?: string;
  facingMode?: CameraFacingMode;
  facingModeExact?: boolean;
  deviceIdExact?: boolean;
}): {
  width: { ideal: number };
  height: { ideal: number };
  frameRate: { ideal: number };
  deviceId?: { exact: string } | { ideal: string };
  facingMode?: { exact: CameraFacingMode } | { ideal: CameraFacingMode };
} {
  const constraints: ReturnType<typeof videoConstraintsForCameraSwitch> = {
    ...SWITCH_VIDEO_CONSTRAINTS,
  };
  if (opts.deviceId) {
    constraints.deviceId = opts.deviceIdExact
      ? { exact: opts.deviceId }
      : { ideal: opts.deviceId };
  }
  if (opts.facingMode) {
    constraints.facingMode = opts.facingModeExact
      ? { exact: opts.facingMode }
      : { ideal: opts.facingMode };
  }
  return constraints;
}

/** Stamp the active camera onto an existing Twilio track-options object. */
export function assignActiveCameraToTrackOptions(
  trackOptions: {
    deviceId?: { ideal: string };
    facingMode?: { ideal: string };
  },
  opts: { deviceId?: string | null; facing: CameraFacing },
): void {
  if (opts.deviceId) {
    trackOptions.deviceId = { ideal: opts.deviceId };
    return;
  }
  const mode = facingModeFor(opts.facing);
  if (mode) {
    trackOptions.facingMode = { ideal: mode };
  }
}
