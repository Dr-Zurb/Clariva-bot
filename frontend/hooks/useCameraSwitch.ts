"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  createLocalVideoTrack,
  type LocalTrack,
  type LocalVideoTrack,
  type Room,
} from "twilio-video";

import { useCameraDevices, type MediaDeviceInfoLite } from "./useCameraDevices";

/**
 * Sub-batch F · task-video-F1 — in-call camera switch (front ↔ back).
 *
 * `useCameraDevices` (A7) gives us the raw enumeration. This sibling
 * hook adds the "switch the active LocalVideoTrack to a new deviceId
 * while the call is running" dance — Twilio doesn't have a clean
 * `replaceTrack` for camera changes (it works for some browsers but
 * silently drops the new feed on Safari Mobile + Firefox), so we
 * unpublish + stop the old `LocalVideoTrack`, create a new one
 * constrained to the requested deviceId, and publish it back.
 *
 * The host (`<VideoRoom>`) keeps owning:
 *   - The Twilio `Room` itself (we never touch its lifecycle).
 *   - `localTracksRef` (we mutate-in-place so the host's republish
 *     paths — handleQualityChange, handleTryVideoAgain,
 *     applyAdaptiveLevel — keep seeing the right tracks).
 *   - The `<video>` element the new track must attach to.
 *   - The persisted virtual background (C2) that must re-apply.
 *   - The `cameraOff` state (A2) that must carry across switches.
 *
 * We expose those concerns as callbacks (`onAttachLocal`,
 * `onApplyBackground`, `cameraOffRef`) rather than letting the hook
 * grow tentacles into the room. Same callback ergonomics as
 * `useBatterySaver` (F.4) so the patterns rhyme.
 *
 * **Hook NAME divergence from spec:** the spec calls this hook
 * `useCameraDevices`, but A7 already shipped a hook with that exact
 * file name and a *different* return shape (`{ cameras, mics,
 * enumerated, refresh }`) consumed by `<VideoConsultPreCall>`. To
 * avoid breaking A7 we ship F1 as a sibling hook (`useCameraSwitch`)
 * that internally consumes `useCameraDevices()` for the raw
 * enumeration. Documented in the F.1 task log and EXECUTION-ORDER
 * Sub-batch F log.
 *
 * **iOS Safari quirk:** before the user grants camera permission,
 * `enumerateDevices()` returns `videoinput` entries with empty
 * `label` strings — the spec calls this out as a "facing fallback by
 * device order" requirement (index 0 = front, index 1 = back). The
 * pre-call screen (A7) has already triggered a permission grant by
 * the time we're in the call so labels are populated 99% of the
 * time, but the fallback keeps us functional in the 1% where the
 * patient revoked permission, then re-granted, then enumerated
 * before labels caught up.
 */

// localStorage key for the LAST in-call camera the user picked.
// Distinct from the pre-call key (`video-precall-camera-id` —
// owned by `<VideoConsultPreCall>`); these are two separate
// concerns and were intentionally split per F.1 spec.
export const CAMERA_DEVICE_STORAGE_KEY = "video-camera-device-id";

// `isFlipping` debounce window before we accept another flip(). Twilio
// publishTrack returns once the SDK accepts the track, but the actual
// negotiation can take ~500ms; 800ms is an empirically safe lower
// bound that prevents double-tap thrash on slow Android hardware
// without feeling laggy on fast desktop.
const FLIP_DEBOUNCE_MS = 800;

export type CameraFacing = "front" | "back" | "unknown";

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
  facing: CameraFacing;
  isCurrent: boolean;
  groupId: string;
}

export interface UseCameraSwitchOpts {
  /** Twilio Room reference. `null` while connecting / disconnected. */
  room: Room | null;

  /** Mutable ref the host owns. Mutated in place so the host's
   *  republish paths (handleQualityChange / handleTryVideoAgain /
   *  applyAdaptiveLevel) keep seeing the post-switch state. */
  localTracksRef: MutableRefObject<LocalTrack[]>;

  /** Connect-time camera ID from pre-call (A7). Used as the
   *  fallback "current" value when localStorage is empty AND the
   *  hook can't deduce the active track's deviceId. */
  initialDeviceId?: string | null;

  /** True iff the local video track is currently `.disable()`'d
   *  (A2 — Camera off). New track will be `.disable()`'d on creation
   *  to preserve the invariant. */
  cameraOffRef: MutableRefObject<boolean>;

  /** Called after `publishTrack` so the host can attach the new
   *  track to its local <video> element. Fired synchronously inside
   *  the same React tick as the publish so the self-tile doesn't
   *  go black between unpublish and attach. */
  onAttachLocal?: (track: LocalVideoTrack) => void;

  /** Called after `publishTrack` so the host can re-apply C2's
   *  virtual background to the new track. Returning a rejected
   *  promise is logged but does NOT roll back the switch. */
  onApplyBackground?: (track: LocalVideoTrack) => Promise<void> | void;

  /** Called when the deviceId successfully changed (post-publish,
   *  before the `isFlipping` flag clears). The host wires this to
   *  patch the E.4 rejoin cache + emit telemetry. */
  onDeviceChanged?: (deviceId: string, facing: CameraFacing) => void;

  /** Called when the user taps the button before the room is
   *  connected (status !== 'connected'), or when there are no
   *  alternate cameras to flip to. Allows the host to surface a
   *  toast. Defaults to a console.warn. */
  onSwitchUnavailable?: (
    reason: "not-connected" | "no-other-camera" | "permission-denied",
  ) => void;
}

export interface UseCameraSwitchReturn {
  /** All `videoinput` devices with facing-heuristic + isCurrent. */
  devices: CameraDeviceInfo[];
  /** The currently-active deviceId (best-effort). `null` until
   *  the hook has resolved the active source.
   *
   *  **Field name divergence from spec:** the F1 spec calls this
   *  field `current`, but that name shadows React's ref-`.current`
   *  convention and confuses ESLint's `react-hooks/exhaustive-deps`
   *  rule (it treats any `.current` read as an opaque mutable
   *  value not worth re-rendering for). We rename to
   *  `currentDeviceId` for clarity at host call-sites; the
   *  semantics are identical. */
  currentDeviceId: string | null;
  /** Mutable ref mirroring `currentDeviceId` — the host's republish
   *  paths read from this to override the connect-time
   *  `chosenCameraId`. */
  currentDeviceIdRef: MutableRefObject<string | null>;
  /** Switch the active LocalVideoTrack to `deviceId`. Resolves once
   *  the new track is published; rejects on Twilio errors. */
  switchTo: (deviceId: string) => Promise<void>;
  /** Convenience: switch to the FIRST device whose facing differs
   *  from the current. Resolves silently if no alternate exists. */
  flip: () => Promise<void>;
  /** True between `switchTo` invocation and the
   *  `FLIP_DEBOUNCE_MS` cooldown. Drives the button's disabled state. */
  isFlipping: boolean;
  /** True iff there are 2+ cameras available (i.e. the button
   *  should be visible at all). */
  hasMultipleCameras: boolean;
}

// ---------------------------------------------------------------------------
// Facing heuristic
// ---------------------------------------------------------------------------

/**
 * Best-effort facing detection. Empty labels → `'unknown'`; the
 * caller (or the post-enumeration index fallback) decides what to
 * do with that.
 */
function deriveFacingFromLabel(label: string): CameraFacing {
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

/**
 * After the per-label pass, if all facings are 'unknown' (iOS
 * pre-permission case, or Android phones with cryptic camera
 * labels), fall back to device order: index 0 → front, index 1 →
 * back, anything else stays 'unknown'.
 */
function annotateFacings(
  cameras: MediaDeviceInfoLite[],
): Array<MediaDeviceInfoLite & { facing: CameraFacing }> {
  const labelled = cameras.map((cam) => ({
    ...cam,
    facing: deriveFacingFromLabel(cam.label),
  }));

  const allUnknown = labelled.every((cam) => cam.facing === "unknown");
  if (!allUnknown) return labelled;

  // Order-based fallback. Conservative: only promote the first
  // two devices; deeper indices stay 'unknown' (we'd be guessing
  // and the dropdown will still let the user pick by label).
  return labelled.map((cam, idx) => {
    if (idx === 0) return { ...cam, facing: "front" as CameraFacing };
    if (idx === 1) return { ...cam, facing: "back" as CameraFacing };
    return cam;
  });
}

// ---------------------------------------------------------------------------
// localStorage helpers (SSR-safe; quota-error tolerant)
// ---------------------------------------------------------------------------

function readStoredDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CAMERA_DEVICE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredDeviceId(deviceId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CAMERA_DEVICE_STORAGE_KEY, deviceId);
  } catch {
    // Best-effort. Same pattern as A6 mirror persistence.
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCameraSwitch(
  opts: UseCameraSwitchOpts,
): UseCameraSwitchReturn {
  const {
    room,
    localTracksRef,
    initialDeviceId,
    cameraOffRef,
    onAttachLocal,
    onApplyBackground,
    onDeviceChanged,
    onSwitchUnavailable,
  } = opts;

  const { cameras } = useCameraDevices();

  // ------------------------------------------------------------------------
  // Current device tracking
  //
  // Resolution priority (first non-empty wins):
  //   1. localStorage `video-camera-device-id` (last in-call switch).
  //   2. Whatever the published LocalVideoTrack reports
  //      (`mediaStreamTrack.getSettings().deviceId`).
  //   3. `initialDeviceId` (pre-call's chosen).
  //   4. `null` (Twilio picked default; we don't know what).
  //
  // Resolves once on mount + room transition; subsequent updates
  // come exclusively from `switchTo`.
  // ------------------------------------------------------------------------
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const currentDeviceIdRef = useRef<string | null>(null);
  const hasResolvedCurrentRef = useRef(false);

  // Keep ref + state in lockstep so the host's republish paths can
  // synchronously read the latest deviceId without waiting for a
  // re-render.
  useEffect(() => {
    currentDeviceIdRef.current = currentDeviceId;
  }, [currentDeviceId]);

  // Resolve `current` from the published track once the room is
  // connected. Re-runs if the room reference changes (rejoin).
  useEffect(() => {
    if (hasResolvedCurrentRef.current) return;
    if (!room || room.state !== "connected") return;

    // Priority 1 — localStorage.
    const stored = readStoredDeviceId();
    if (stored) {
      setCurrentDeviceId(stored);
      hasResolvedCurrentRef.current = true;
      return;
    }

    // Priority 2 — inspect the published LocalVideoTrack.
    const liveVideo = localTracksRef.current.find(
      (t) => t.kind === "video",
    ) as LocalVideoTrack | undefined;
    const liveDeviceId = liveVideo
      ? (() => {
          try {
            const settings = liveVideo.mediaStreamTrack.getSettings();
            return typeof settings.deviceId === "string"
              ? settings.deviceId
              : null;
          } catch {
            return null;
          }
        })()
      : null;
    if (liveDeviceId) {
      setCurrentDeviceId(liveDeviceId);
      hasResolvedCurrentRef.current = true;
      return;
    }

    // Priority 3 — pre-call's chosen ID.
    if (initialDeviceId) {
      setCurrentDeviceId(initialDeviceId);
      hasResolvedCurrentRef.current = true;
      return;
    }

    // Priority 4 — give up; current stays null. The button still
    // works (flip just picks the first 'back' device).
    hasResolvedCurrentRef.current = true;
  }, [room, room?.state, localTracksRef, initialDeviceId]);

  // Reset the resolver if the room goes away (rejoin path).
  useEffect(() => {
    if (!room || room.state === "disconnected") {
      hasResolvedCurrentRef.current = false;
    }
  }, [room, room?.state]);

  // ------------------------------------------------------------------------
  // Annotated device list
  // ------------------------------------------------------------------------
  const devices = useMemo<CameraDeviceInfo[]>(() => {
    const annotated = annotateFacings(cameras);
    return annotated.map((cam) => ({
      deviceId: cam.deviceId,
      label: cam.label,
      facing: cam.facing,
      groupId: cam.groupId,
      isCurrent: cam.deviceId === currentDeviceId,
    }));
  }, [cameras, currentDeviceId]);

  const hasMultipleCameras = devices.length >= 2;

  // ------------------------------------------------------------------------
  // switchTo — the core dance
  //
  // Mirrors the pattern in `<VideoRoom>`'s `handleQualityChange`
  // (line ~2746) so a shared maintenance burden later (extracting
  // a `republishLocalVideoTrack` util) is straightforward. Steps:
  //
  //   1. Pre-flight: room connected + a different deviceId
  //      requested + no other switch in flight.
  //   2. Create the new `LocalVideoTrack` with the deviceId
  //      constraint. Bail (and stop the new track) if the room
  //      tore down during the await.
  //   3. Unpublish + stop the old track; remove from
  //      `localTracksRef`.
  //   4. Publish new track; push into `localTracksRef`.
  //   5. Fire `onAttachLocal` so the self-tile rebinds.
  //   6. Re-apply `cameraOff` if the user had toggled it before
  //      the switch (`.disable()`).
  //   7. Fire `onApplyBackground` for C2 re-application.
  //   8. Persist the new deviceId to localStorage.
  //   9. Fire `onDeviceChanged` so the host can patch E.4 rejoin
  //      cache + (eventually) emit telemetry.
  // ------------------------------------------------------------------------
  const isFlippingRef = useRef(false);
  const [isFlipping, setIsFlipping] = useState(false);

  const switchTo = useCallback(
    async (deviceId: string): Promise<void> => {
      // Pre-flight 1: room must be live.
      if (!room || room.state !== "connected") {
        onSwitchUnavailable?.("not-connected");
        return;
      }
      // Pre-flight 2: noop if we're already on this device.
      if (currentDeviceIdRef.current === deviceId) return;
      // Pre-flight 3: don't reentrant-switch.
      if (isFlippingRef.current) return;

      isFlippingRef.current = true;
      setIsFlipping(true);

      // Schedule the cooldown clear regardless of success/failure
      // so a permission-denied error doesn't leave the button
      // disabled forever.
      const clearCooldown = () => {
        window.setTimeout(() => {
          isFlippingRef.current = false;
          setIsFlipping(false);
        }, FLIP_DEBOUNCE_MS);
      };

      let newVideoTrack: LocalVideoTrack | null = null;
      try {
        newVideoTrack = await createLocalVideoTrack({
          deviceId: { ideal: deviceId },
        });
      } catch (err) {
        // Permission-denied / device-removed / hardware-busy.
        // Surface to the host (toast) and bail without touching
        // the existing track.
        if (process.env.NODE_ENV !== "production") {
          console.warn("Camera switch: createLocalVideoTrack failed:", err);
        }
        onSwitchUnavailable?.("permission-denied");
        clearCooldown();
        return;
      }

      // Bail if room tore down mid-await.
      if (room.state !== "connected") {
        try {
          newVideoTrack.stop();
        } catch {
          // Best-effort cleanup.
        }
        clearCooldown();
        return;
      }

      const oldVideoTrack = localTracksRef.current.find(
        (t) => t.kind === "video",
      ) as LocalVideoTrack | undefined;

      if (oldVideoTrack) {
        try {
          room.localParticipant.unpublishTrack(oldVideoTrack);
        } catch {
          // Twilio may have already unpublished. Continue.
        }
        try {
          oldVideoTrack.stop();
        } catch {
          // Best-effort cleanup.
        }
        localTracksRef.current = localTracksRef.current.filter(
          (t) => t !== oldVideoTrack,
        );
      }

      try {
        await room.localParticipant.publishTrack(newVideoTrack);
      } catch (err) {
        // Publish failed (rare — usually a Twilio SDK bug or a
        // transport disconnect during the await). Old track is
        // already gone; we stop the new one and bail. The user
        // sees a black self-tile until they refresh / rejoin —
        // not great but consistent with the existing
        // handleQualityChange failure mode.
        if (process.env.NODE_ENV !== "production") {
          console.warn("Camera switch: publishTrack failed:", err);
        }
        try {
          newVideoTrack.stop();
        } catch {
          // Best-effort.
        }
        clearCooldown();
        return;
      }

      localTracksRef.current = [...localTracksRef.current, newVideoTrack];

      // Step 5 — host re-attaches to the local <video> element.
      // We fire even if `onAttachLocal` is undefined (no-op);
      // the host owns the policy.
      try {
        onAttachLocal?.(newVideoTrack);
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Camera switch: onAttachLocal threw:", err);
        }
      }

      // Step 6 — preserve A2 cameraOff state. New tracks default
      // to enabled; if the user had toggled off, we re-disable.
      if (cameraOffRef.current) {
        try {
          (newVideoTrack as { disable?: () => void }).disable?.();
        } catch {
          // Test environments may not expose .disable().
        }
      }

      // Step 7 — re-apply C2 virtual background. Fire-and-forget;
      // host logs failures.
      if (onApplyBackground) {
        try {
          await onApplyBackground(newVideoTrack);
        } catch (err) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("Camera switch: onApplyBackground failed:", err);
          }
        }
      }

      // Step 8 — persist for next session restore + commit to local
      // state.
      writeStoredDeviceId(deviceId);
      currentDeviceIdRef.current = deviceId;
      setCurrentDeviceId(deviceId);

      // Step 9 — host hook (rejoin cache, telemetry). We compute
      // the facing from the freshly-annotated device list so the
      // host doesn't need its own heuristic.
      const facing =
        annotateFacings(cameras).find((c) => c.deviceId === deviceId)
          ?.facing ?? "unknown";
      try {
        onDeviceChanged?.(deviceId, facing);
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Camera switch: onDeviceChanged threw:", err);
        }
      }

      clearCooldown();
    },
    [
      room,
      localTracksRef,
      cameraOffRef,
      onAttachLocal,
      onApplyBackground,
      onDeviceChanged,
      onSwitchUnavailable,
      cameras,
    ],
  );

  // ------------------------------------------------------------------------
  // flip — pick the OTHER facing's first matching device
  // ------------------------------------------------------------------------
  const flip = useCallback(async (): Promise<void> => {
    const annotated = annotateFacings(cameras);
    if (annotated.length < 2) {
      onSwitchUnavailable?.("no-other-camera");
      return;
    }

    // Determine current facing. Prefer the live currentDeviceId
    // mapping; fall back to "front" so the first flip lands on
    // back (common case).
    const currentFacing: CameraFacing =
      annotated.find((c) => c.deviceId === currentDeviceIdRef.current)
        ?.facing ?? "front";

    const targetFacing: CameraFacing =
      currentFacing === "back" ? "front" : "back";

    // Find the FIRST device with the target facing. If none, fall
    // back to "any device that isn't the current one" — safer
    // than refusing the flip on phones with weird heuristics.
    const target =
      annotated.find((c) => c.facing === targetFacing) ??
      annotated.find((c) => c.deviceId !== currentDeviceIdRef.current);
    if (!target) {
      onSwitchUnavailable?.("no-other-camera");
      return;
    }

    await switchTo(target.deviceId);
  }, [cameras, switchTo, onSwitchUnavailable]);

  return {
    devices,
    currentDeviceId,
    currentDeviceIdRef,
    switchTo,
    flip,
    isFlipping,
    hasMultipleCameras,
  };
}
