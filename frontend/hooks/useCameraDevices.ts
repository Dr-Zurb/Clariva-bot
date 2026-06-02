"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Sub-batch A · task-video-A7 — camera + mic device enumeration.
 *
 * Wraps `navigator.mediaDevices.enumerateDevices()` and exposes the
 * filtered video-input + audio-input lists, plus a `refresh()` action
 * the caller can fire after acquiring permission (iOS Safari only
 * populates device LABELS after the first `getUserMedia` grant — the
 * initial mount returns generic `"Camera 1"` / `""` strings).
 *
 * Also re-fetches on `'devicechange'` (USB camera plug/unplug,
 * AirPods (dis)connect, headphone unplug) so the dropdowns stay
 * accurate without the user reloading.
 *
 * SSR safety: returns empty arrays + a no-op `refresh` when
 * `navigator.mediaDevices` is unavailable (server / locked-down
 * browser). The pre-call screen handles the empty list gracefully.
 *
 * Pulled FORWARD: voice batch's pre-call (voice A6) hasn't shipped
 * yet. When it does, voice imports this hook from the same path.
 * F1 (camera switch) ALSO consumes this hook for the in-call
 * camera-flip dropdown; the API was designed with that consumer in
 * mind (no extra surface needed).
 */

export interface MediaDeviceInfoLite {
  deviceId: string;
  label: string;
  kind: "videoinput" | "audioinput";
  /**
   * `groupId` from `MediaDeviceInfo` — surfaced so F1 can group
   * front/back cameras of the same physical device. Unused in A7.
   */
  groupId: string;
}

export interface CameraDevicesState {
  cameras: MediaDeviceInfoLite[];
  mics: MediaDeviceInfoLite[];
  /**
   * `true` once `enumerateDevices` has resolved at least once. The
   * pre-call screen renders a "Detecting devices…" placeholder until
   * this flips to `true`, so an SSR-empty initial state doesn't
   * flash the "No camera found" branch.
   */
  enumerated: boolean;
}

const EMPTY_STATE: CameraDevicesState = {
  cameras: [],
  mics: [],
  enumerated: false,
};

function toLite(device: MediaDeviceInfo): MediaDeviceInfoLite {
  return {
    deviceId: device.deviceId,
    label: device.label,
    kind: device.kind as "videoinput" | "audioinput",
    groupId: device.groupId,
  };
}

/**
 * React hook returning the current camera + mic lists plus a
 * `refresh()` action the caller fires after a successful
 * `getUserMedia` grant (to re-read labels on iOS Safari).
 */
export function useCameraDevices(): CameraDevicesState & {
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<CameraDevicesState>(EMPTY_STATE);

  const enumerate = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.enumerateDevices !== "function"
    ) {
      // Fixed empty state on SSR / unsupported browsers; mark
      // `enumerated: true` so the UI doesn't spin forever.
      setState({ cameras: [], mics: [], enumerated: true });
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras: MediaDeviceInfoLite[] = [];
      const mics: MediaDeviceInfoLite[] = [];
      for (const device of devices) {
        if (device.kind === "videoinput") cameras.push(toLite(device));
        else if (device.kind === "audioinput") mics.push(toLite(device));
      }
      setState({ cameras, mics, enumerated: true });
    } catch {
      // Some browsers (older Firefox, locked-down corp profiles)
      // can throw on enumerateDevices(). Fail open: empty lists,
      // `enumerated: true` so the UI shows the "No devices" path
      // rather than a perpetual spinner.
      setState({ cameras: [], mics: [], enumerated: true });
    }
  }, []);

  // First mount + `'devicechange'` listener wiring. The device-change
  // event covers USB / Bluetooth (un)plug events transparently; we
  // re-enumerate on each.
  useEffect(() => {
    void enumerate();
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.addEventListener !== "function"
    ) {
      return;
    }
    const handler = () => {
      void enumerate();
    };
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => {
      // `removeEventListener` is required despite our handler being a
      // local closure — without cleanup, every component remount adds
      // another listener and the hook leaks until full reload.
      navigator.mediaDevices.removeEventListener("devicechange", handler);
    };
  }, [enumerate]);

  return {
    ...state,
    refresh: enumerate,
  };
}
