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

import {
  annotateFacings,
  canFlipCameras,
  facingFromFacingMode,
  facingModeFor,
  isAlreadyOnRequestedDevice,
  nextFacingMode,
  oppositeFacing,
  resolveLiveCameraIdentity,
  videoConstraintsForCameraSwitch,
  type CameraFacing,
} from "@/lib/video/camera-facing";
import { useCameraDevices } from "./useCameraDevices";

export type { CameraFacing };

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
 * **iOS Safari quirk:** `enumerateDevices()` often returns a single
 * `videoinput` even when the phone has front + back cameras. DeviceId
 * switching is then a no-op; `flip()` falls back to
 * `facingMode: 'user' | 'environment'`, which is the WebKit-correct
 * path. Empty labels still use the index fallback (0 = front, 1 = back)
 * when two devices *do* enumerate before labels populate.
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
const FLIP_DEBOUNCE_MS = 520;

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
  /** True iff there are 2+ cameras available (deviceId switch). */
  hasMultipleCameras: boolean;
  /**
   * True iff a flip control should render. Broader than
   * `hasMultipleCameras`: iOS often enumerates one camera but still
   * supports `facingMode` user ↔ environment.
   */
  canFlip: boolean;
  /** Best-effort facing of the live track. */
  currentFacing: CameraFacing;
  /**
   * Mutable ref mirroring `currentFacing` so republish paths can
   * keep iOS facingMode when deviceId is missing.
   */
  currentFacingRef: MutableRefObject<CameraFacing>;
}

function readLiveFacing(track: LocalVideoTrack | undefined): CameraFacing {
  if (!track) return "unknown";
  try {
    const mode = track.mediaStreamTrack.getSettings().facingMode;
    return facingFromFacingMode(typeof mode === "string" ? mode : undefined);
  } catch {
    return "unknown";
  }
}

type RestartableLocalVideo = LocalVideoTrack & {
  restart: (constraints?: MediaTrackConstraints) => Promise<unknown>;
};

function canRestartTrack(
  track: LocalVideoTrack | undefined,
): track is RestartableLocalVideo {
  return Boolean(track && typeof (track as RestartableLocalVideo).restart === "function");
}

function readLiveDeviceId(track: LocalVideoTrack | undefined): string | null {
  if (!track) return null;
  try {
    const settings = track.mediaStreamTrack.getSettings();
    return typeof settings.deviceId === "string" ? settings.deviceId : null;
  } catch {
    return null;
  }
}

const TOUCH_LIKE_VIEWPORT = "(max-width: 1023px), (pointer: coarse)";

function readTouchLikeViewport(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(TOUCH_LIKE_VIEWPORT).matches;
}

function useIsNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(readTouchLikeViewport);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(TOUCH_LIKE_VIEWPORT);
    const apply = (e: MediaQueryListEvent | MediaQueryList) => {
      setNarrow(e.matches);
    };
    apply(query);
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", apply);
      return () => query.removeEventListener("change", apply);
    }
    query.addListener(apply);
    return () => {
      query.removeListener(apply);
    };
  }, []);
  return narrow;
}

// ---------------------------------------------------------------------------
// localStorage helpers (SSR-safe; quota-error tolerant)
// ---------------------------------------------------------------------------

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
  const isNarrowViewport = useIsNarrowViewport();

  // ------------------------------------------------------------------------
  // Current device tracking
  //
  // The live published track is the source of truth. localStorage is
  // written after a successful switch (next-session preference) but
  // must not describe "what camera am I on now" — that mismatch made
  // Flip a silent no-op after the first successful switch + reload.
  //
  // Resolution priority:
  //   1. Live LocalVideoTrack deviceId / facingMode.
  //   2. `initialDeviceId` (pre-call's chosen) when the track has none.
  //   3. `null` (Twilio picked default; flip still works via facingMode).
  //
  // Resolves once on mount + room transition; subsequent updates
  // come exclusively from `switchTo` / facingMode flip.
  // ------------------------------------------------------------------------
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const currentDeviceIdRef = useRef<string | null>(null);
  const [currentFacing, setCurrentFacing] = useState<CameraFacing>("unknown");
  const currentFacingRef = useRef<CameraFacing>("unknown");
  const hasResolvedCurrentRef = useRef(false);

  // Keep ref + state in lockstep so the host's republish paths can
  // synchronously read the latest deviceId without waiting for a
  // re-render.
  useEffect(() => {
    currentDeviceIdRef.current = currentDeviceId;
  }, [currentDeviceId]);
  useEffect(() => {
    currentFacingRef.current = currentFacing;
  }, [currentFacing]);

  // Resolve `current` from the published track once the room is
  // connected. Re-runs if the room reference changes (rejoin).
  useEffect(() => {
    if (hasResolvedCurrentRef.current) return;
    if (!room || room.state !== "connected") return;

    const liveVideo = localTracksRef.current.find(
      (t) => t.kind === "video",
    ) as LocalVideoTrack | undefined;
    const resolved = resolveLiveCameraIdentity({
      liveDeviceId: readLiveDeviceId(liveVideo),
      liveFacing: readLiveFacing(liveVideo),
      initialDeviceId,
    });
    if (resolved.facing !== "unknown") {
      setCurrentFacing(resolved.facing);
    }
    if (resolved.deviceId) {
      setCurrentDeviceId(resolved.deviceId);
    }
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
  const hasLiveVideo = Boolean(
    localTracksRef.current.find((t) => t.kind === "video"),
  );
  const canFlip = canFlipCameras({
    cameraCount: devices.length,
    hasLiveVideo: hasLiveVideo || Boolean(room && room.state === "connected"),
    liveFacing: currentFacing,
    isNarrowViewport,
  });

  // ------------------------------------------------------------------------
  // Republish helper — shared by deviceId switch and facingMode flip.
  // ------------------------------------------------------------------------
  const isFlippingRef = useRef(false);
  const [isFlipping, setIsFlipping] = useState(false);

  const republishVideo = useCallback(
    async (opts: {
      deviceId?: string;
      facingMode?: "user" | "environment";
    }): Promise<void> => {
      if (!room || room.state !== "connected") {
        onSwitchUnavailable?.("not-connected");
        return;
      }

      const oldVideoTrack = localTracksRef.current.find(
        (t) => t.kind === "video",
      ) as LocalVideoTrack | undefined;
      const liveDeviceId = readLiveDeviceId(oldVideoTrack);
      // Skip only when the *live* track is already the requested
      // device. A stale stored id must not suppress the flip.
      if (isAlreadyOnRequestedDevice(opts.deviceId, liveDeviceId)) {
        return;
      }
      if (isFlippingRef.current) return;

      isFlippingRef.current = true;
      setIsFlipping(true);

      const clearCooldown = () => {
        window.setTimeout(() => {
          isFlippingRef.current = false;
          setIsFlipping(false);
        }, FLIP_DEBOUNCE_MS);
      };

      // Prefer exact deviceId on a user-initiated switch. Do not
      // combine it with facingMode on the first attempt — some
      // browsers OverconstrainedError when both are exact.
      const switchConstraints = videoConstraintsForCameraSwitch({
        deviceId: opts.deviceId,
        facingMode: opts.deviceId ? undefined : opts.facingMode,
        facingModeExact: Boolean(opts.facingMode) && !opts.deviceId,
        deviceIdExact: Boolean(opts.deviceId),
      });
      const facingFallbackConstraints = opts.facingMode
        ? videoConstraintsForCameraSwitch({
            facingMode: opts.facingMode,
            facingModeExact: false,
          })
        : null;
      const liveFacingNow = readLiveFacing(oldVideoTrack);
      const previousConstraints = videoConstraintsForCameraSwitch({
        deviceId: liveDeviceId ?? currentDeviceIdRef.current ?? undefined,
        facingMode:
          facingModeFor(
            liveFacingNow !== "unknown"
              ? liveFacingNow
              : currentFacingRef.current,
          ) ?? undefined,
      });

      const finishSwitch = async (track: LocalVideoTrack): Promise<void> => {
        if (cameraOffRef.current) {
          try {
            (track as { disable?: () => void }).disable?.();
          } catch {
            // Test environments may not expose .disable().
          }
        }
        if (onApplyBackground) {
          try {
            await onApplyBackground(track);
          } catch (err) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("Camera switch: onApplyBackground failed:", err);
            }
          }
        }
        const resolvedId = readLiveDeviceId(track) ?? opts.deviceId ?? null;
        const fromTrack = readLiveFacing(track);
        const resolvedFacing: CameraFacing =
          fromTrack !== "unknown"
            ? fromTrack
            : opts.facingMode
              ? facingFromFacingMode(opts.facingMode)
              : (annotateFacings(cameras).find((c) => c.deviceId === resolvedId)
                  ?.facing ?? "unknown");
        if (resolvedId) {
          writeStoredDeviceId(resolvedId);
          currentDeviceIdRef.current = resolvedId;
          setCurrentDeviceId(resolvedId);
        }
        currentFacingRef.current = resolvedFacing;
        setCurrentFacing(resolvedFacing);
        try {
          onDeviceChanged?.(resolvedId ?? "", resolvedFacing);
        } catch (err) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("Camera switch: onDeviceChanged threw:", err);
          }
        }
      };

      const tryCreate = async (
        constraints: ReturnType<typeof videoConstraintsForCameraSwitch>,
      ): Promise<LocalVideoTrack | null> => {
        try {
          return await createLocalVideoTrack(constraints);
        } catch {
          return null;
        }
      };

      const releaseOldVideo = (): void => {
        if (!oldVideoTrack) return;
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
      };

      const restorePreviousCamera = async (): Promise<void> => {
        const restored = await tryCreate(previousConstraints);
        if (!restored || room.state !== "connected") {
          try {
            restored?.stop();
          } catch {
            // Best-effort.
          }
          return;
        }
        try {
          onAttachLocal?.(restored);
        } catch {
          // Best-effort attach.
        }
        try {
          await room.localParticipant.publishTrack(restored);
          localTracksRef.current = [...localTracksRef.current, restored];
        } catch {
          try {
            restored.stop();
          } catch {
            // Best-effort.
          }
        }
      };

      // Prefer restart() — same published track and <video> node, so the
      // self-view does not go black while the other camera comes up.
      if (canRestartTrack(oldVideoTrack) && room.state === "connected") {
        try {
          await oldVideoTrack.restart(switchConstraints);
          const afterId = readLiveDeviceId(oldVideoTrack);
          const restartMissedTarget = Boolean(
            opts.deviceId && afterId && afterId !== opts.deviceId,
          );
          if (!restartMissedTarget) {
            await finishSwitch(oldVideoTrack);
            clearCooldown();
            return;
          }
        } catch {
          // Safari / Firefox can reject restart; fall through to republish.
        }
      }

      let newVideoTrack = await tryCreate(switchConstraints);
      let releasedOld = false;
      if (!newVideoTrack) {
        // Android often refuses to open a second camera while the
        // first is still live. Free it, then retry.
        releaseOldVideo();
        releasedOld = true;
        newVideoTrack = await tryCreate(switchConstraints);
      }
      if (!newVideoTrack && facingFallbackConstraints) {
        newVideoTrack = await tryCreate(facingFallbackConstraints);
      }
      if (!newVideoTrack) {
        onSwitchUnavailable?.(
          opts.facingMode || opts.deviceId
            ? "no-other-camera"
            : "permission-denied",
        );
        if (releasedOld) {
          await restorePreviousCamera();
        }
        clearCooldown();
        return;
      }

      if (room.state !== "connected") {
        try {
          newVideoTrack.stop();
        } catch {
          // Best-effort cleanup.
        }
        clearCooldown();
        return;
      }

      try {
        onAttachLocal?.(newVideoTrack);
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Camera switch: onAttachLocal threw:", err);
        }
      }

      if (!releasedOld && oldVideoTrack) {
        releaseOldVideo();
      }

      try {
        await room.localParticipant.publishTrack(newVideoTrack);
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Camera switch: publishTrack failed:", err);
        }
        try {
          newVideoTrack.stop();
        } catch {
          // Best-effort.
        }
        onSwitchUnavailable?.("no-other-camera");
        await restorePreviousCamera();
        clearCooldown();
        return;
      }

      localTracksRef.current = [...localTracksRef.current, newVideoTrack];
      await finishSwitch(newVideoTrack);
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

  const switchTo = useCallback(
    async (deviceId: string): Promise<void> => {
      const targetFacing = annotateFacings(cameras).find(
        (c) => c.deviceId === deviceId,
      )?.facing;
      await republishVideo({
        deviceId,
        facingMode: targetFacing
          ? (facingModeFor(targetFacing) ?? undefined)
          : undefined,
      });
    },
    [cameras, republishVideo],
  );

  // ------------------------------------------------------------------------
  // flip — deviceId when 2+ cameras, otherwise facingMode (iOS).
  // Always pass a facingMode fallback so a failed deviceId open can
  // retry via user/environment (Android busy-camera + iOS).
  // ------------------------------------------------------------------------
  const flip = useCallback(async (): Promise<void> => {
    const annotated = annotateFacings(cameras);
    const liveVideo = localTracksRef.current.find(
      (t) => t.kind === "video",
    ) as LocalVideoTrack | undefined;
    const liveId = readLiveDeviceId(liveVideo);
    const liveFacing = readLiveFacing(liveVideo);
    const fromDevices: CameraFacing =
      annotated.find((c) => c.deviceId === (liveId ?? currentDeviceIdRef.current))
        ?.facing ?? "unknown";
    const facing: CameraFacing =
      liveFacing !== "unknown"
        ? liveFacing
        : currentFacingRef.current !== "unknown"
          ? currentFacingRef.current
          : fromDevices !== "unknown"
            ? fromDevices
            : "front";

    if (annotated.length >= 2) {
      const targetFacing = oppositeFacing(facing);
      const target =
        annotated.find((c) => c.facing === targetFacing) ??
        annotated.find(
          (c) => c.deviceId !== (liveId ?? currentDeviceIdRef.current),
        );
      if (target) {
        await republishVideo({
          deviceId: target.deviceId,
          facingMode:
            facingModeFor(target.facing) ?? nextFacingMode(facing),
        });
        return;
      }
    }

    await republishVideo({ facingMode: nextFacingMode(facing) });
  }, [cameras, localTracksRef, republishVideo]);

  return {
    devices,
    currentDeviceId,
    currentDeviceIdRef,
    switchTo,
    flip,
    isFlipping,
    hasMultipleCameras,
    canFlip,
    currentFacing,
    currentFacingRef,
  };
}
