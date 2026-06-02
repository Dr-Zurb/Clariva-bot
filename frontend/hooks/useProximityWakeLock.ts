"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * voice-C8 / T6.37 — proximity-driven screen wake-lock on Chrome Android.
 *
 * During an active voice call on earpiece, keeps the screen awake via
 * `navigator.wakeLock` while the phone is away from the face. When the
 * proximity sensor reports "near" (held to ear), releases the lock so the
 * OS can blank the display and avoid cheek-touches.
 *
 * Unsupported platforms (iOS, Firefox, desktop, speakerphone-only) degrade
 * silently — no errors, no wake-lock management from this hook.
 *
 * @see docs/Work/Product plans/voice-consult/plan-t6-voice-mobile-native.md
 */

export interface WakeLockSentinel {
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
  removeEventListener?: (type: "release", listener: () => void) => void;
}

export interface ProximitySensorLike {
  near: boolean | null;
  start: () => void;
  stop: () => void;
  onreading: (() => void) | null;
  onerror: ((event: { error?: { name?: string } }) => void) | null;
}

export interface UseProximityWakeLockResult {
  /** True when Chrome Android + wakeLock + ProximitySensor are available. */
  supported: boolean;
  /** Latest proximity reading; null when inactive or unknown. */
  near: boolean | null;
}

type ProximitySensorConstructor = new () => ProximitySensorLike;

let unsupportedLogged = false;

/** Test-only reset for the one-shot debug log. */
export function resetProximityWakeLockDebugLog(): void {
  unsupportedLogged = false;
}

function isChromeAndroidUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /Android/i.test(ua) &&
    /Chrome/i.test(ua) &&
    !/Edg|OPR|Firefox|SamsungBrowser/i.test(ua)
  );
}

/**
 * Chrome Android with wakeLock + Generic Sensor ProximitySensor.
 * Exported for unit tests and diagnostics.
 */
export function isSupportedProximityPlatform(): boolean {
  if (typeof window === "undefined") return false;
  if (!isChromeAndroidUserAgent()) return false;
  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
  };
  if (!nav.wakeLock?.request) return false;
  if (!("ProximitySensor" in window)) return false;
  return true;
}

async function requestScreenWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
    };
    if (!nav.wakeLock?.request) return null;
    return await nav.wakeLock.request("screen");
  } catch {
    return null;
  }
}

function createProximitySensor(): ProximitySensorLike | null {
  if (typeof window === "undefined") return null;
  if (!("ProximitySensor" in window)) return null;
  try {
    const Ctor = (window as Window & { ProximitySensor?: ProximitySensorConstructor })
      .ProximitySensor;
    if (!Ctor) return null;
    return new Ctor();
  } catch {
    return null;
  }
}

/**
 * @param inCall — voice session connected (not readonly / not tab-kicked).
 * @param proximityEnabled — when false, keeps screen awake but ignores proximity
 *   (speakerphone). Defaults to true.
 */
export function useProximityWakeLock(
  inCall: boolean,
  proximityEnabled = true,
): UseProximityWakeLockResult {
  const supported = isSupportedProximityPlatform();
  const [near, setNear] = useState<boolean | null>(null);

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const sensorRef = useRef<ProximitySensorLike | null>(null);
  const nearRef = useRef<boolean | null>(null);
  const inCallRef = useRef(inCall);
  const proximityEnabledRef = useRef(proximityEnabled);
  const wakeLockReleaseListenerRef = useRef<(() => void) | null>(null);
  /** Serializes acquire/release so rapid proximity flips cannot race. */
  const wakeLockOpChainRef = useRef(Promise.resolve());

  inCallRef.current = inCall;
  proximityEnabledRef.current = proximityEnabled;

  useEffect(() => {
    if (supported) return;
    if (unsupportedLogged) return;
    unsupportedLogged = true;
    if (process.env.NODE_ENV !== "production") {
      console.debug(
        "[useProximityWakeLock] unsupported platform — proximity wake-lock noop",
      );
    }
  }, [supported]);

  const detachWakeLockReleaseListener = useCallback(() => {
    const sentinel = wakeLockRef.current;
    const listener = wakeLockReleaseListenerRef.current;
    if (sentinel && listener && sentinel.removeEventListener) {
      sentinel.removeEventListener("release", listener);
    }
    wakeLockReleaseListenerRef.current = null;
  }, []);

  const releaseWakeLock = useCallback(async () => {
    detachWakeLockReleaseListener();
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    if (!sentinel) return;
    try {
      await sentinel.release();
    } catch {
      /* already released */
    }
  }, [detachWakeLockReleaseListener]);

  const applyWakeLockPolicyRef = useRef<() => void>(() => {});

  const acquireWakeLock = useCallback(async () => {
    if (wakeLockRef.current) return;
    const sentinel = await requestScreenWakeLock();
    if (!sentinel) return;
    wakeLockRef.current = sentinel;

    const onReleased = () => {
      wakeLockRef.current = null;
      if (!inCallRef.current) return;
      applyWakeLockPolicyRef.current();
    };

    wakeLockReleaseListenerRef.current = onReleased;
    sentinel.addEventListener?.("release", onReleased);
  }, []);

  const runWakeLockPolicy = useCallback(async () => {
    if (!inCallRef.current) {
      await releaseWakeLock();
      return;
    }
    const shouldHoldScreenAwake =
      !proximityEnabledRef.current || nearRef.current !== true;
    if (shouldHoldScreenAwake) {
      await acquireWakeLock();
    } else {
      await releaseWakeLock();
    }
  }, [acquireWakeLock, releaseWakeLock]);

  const applyWakeLockPolicy = useCallback(() => {
    wakeLockOpChainRef.current = wakeLockOpChainRef.current
      .then(() => runWakeLockPolicy())
      .catch(() => {
        /* wakeLock denied or released — leave screen to OS defaults */
      });
  }, [runWakeLockPolicy]);

  applyWakeLockPolicyRef.current = applyWakeLockPolicy;

  const stopSensor = useCallback(() => {
    const sensor = sensorRef.current;
    if (!sensor) return;
    sensor.onreading = null;
    sensor.onerror = null;
    try {
      sensor.stop();
    } catch {
      /* noop */
    }
    sensorRef.current = null;
  }, []);

  const handleProximityReading = useCallback(() => {
    const sensor = sensorRef.current;
    if (!sensor) return;
    const reading = sensor.near;
    if (reading === nearRef.current) return;
    nearRef.current = reading;
    setNear(reading);
    applyWakeLockPolicy();
  }, [applyWakeLockPolicy]);

  const startSensor = useCallback(() => {
    if (!proximityEnabledRef.current) return;
    if (sensorRef.current) return;

    const sensor = createProximitySensor();
    if (!sensor) return;

    sensor.onreading = () => handleProximityReading();
    sensor.onerror = () => {
      /* Permission denied or hardware missing — degrade to always-on screen */
      stopSensor();
      nearRef.current = null;
      setNear(null);
      void applyWakeLockPolicy();
    };

    sensorRef.current = sensor;
    try {
      sensor.start();
    } catch {
      stopSensor();
    }
  }, [applyWakeLockPolicy, handleProximityReading, stopSensor]);

  useEffect(() => {
    if (!supported) {
      return;
    }

    if (!inCall) {
      nearRef.current = null;
      setNear(null);
      stopSensor();
      void releaseWakeLock();
      return;
    }

    if (proximityEnabled) {
      startSensor();
    } else {
      stopSensor();
      nearRef.current = null;
      setNear(null);
    }

    void applyWakeLockPolicy();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void applyWakeLockPolicy();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopSensor();
      void releaseWakeLock();
    };
  }, [
    supported,
    inCall,
    proximityEnabled,
    applyWakeLockPolicy,
    releaseWakeLock,
    startSensor,
    stopSensor,
  ]);

  return { supported, near };
}
