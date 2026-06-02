"use client";

/**
 * Sub-batch F · task-video-F4 — Battery-saver auto-downgrade hook.
 *
 * Watches the W3C Battery Status API and surfaces three lifecycle
 * callbacks to the consumer:
 *
 *   - `onPromptLow`  → battery dropped below 15% AND not charging.
 *                       Fired AT MOST ONCE per call (the host renders a
 *                       "Switch to audio-only?" prompt; if the user
 *                       declines, we don't re-nag).
 *   - `onForceLow`   → battery dropped below 5% AND not charging.
 *                       Fired AT MOST ONCE per call. Host should engage
 *                       audio-only fallback unconditionally.
 *   - `onRecover`    → charger plugged in OR battery climbed back
 *                       above 20% (and stayed there). Resets the
 *                       prompt + force latches so a subsequent
 *                       drain-recharge-drain cycle re-prompts.
 *
 * UX rationale (anti-nag):
 *   - 15%/5% thresholds match macOS/iOS notification semantics —
 *     users already associate them with "you should plug in".
 *   - `hasPrompted` + `hasForced` latches stop us from re-firing the
 *     prompt every `levelchange` event the OS dispatches (Chrome
 *     fires once per percentage point on Android — we'd nag 10×
 *     between 15% and 5% without latching).
 *   - The recovery threshold (20%) is intentionally HIGHER than the
 *     prompt threshold (15%) to debounce flapping — a battery wobbling
 *     between 14% and 16% won't yo-yo the prompt.
 *   - `chargingchange → charging:true` ALSO clears the latch (faster
 *     than waiting for the level to climb to 20%) — the user
 *     plugging in is the strongest possible "I'm safe" signal.
 *
 * Browser support:
 *   - Android Chrome / Edge / Samsung Internet — full support.
 *   - Desktop Chrome — full support (level reflects laptop battery).
 *   - iOS Safari — `getBattery` undefined; hook returns
 *     `supported: false`; no callbacks fire; no behaviour. The host
 *     simply renders nothing battery-related.
 *   - Firefox 52+ — partial; the API is gated behind a pref. We
 *     handle the rejected promise gracefully.
 *   - All HTTPS contexts only — Chrome already restricts the API.
 *
 * The hook is intentionally small and OWNS NO RENDER OUTPUT — the
 * consumer (`<VideoRoom>`) renders `<BatteryWarningBanner>` based on
 * its own state machine, fed by these callbacks. Mirrors the
 * shape of `useNetworkQuality` (also a callback-shaped hook with
 * minimal returned state).
 *
 * Decision §34 — the action triggered by these callbacks REUSES the
 * E.2 audio-fallback path with `reason: 'battery_low' | 'battery_critical'`
 * threaded through `applyAdaptiveLevel(...)`. No new fallback enum
 * value; no new banner stack on the doctor side. See the host wiring
 * in `<VideoRoom>` for the full integration.
 */

import { useEffect, useRef, useState } from "react";

// ----------------------------------------------------------------------------
// W3C Battery Status API typings — the DOM lib doesn't ship these
// (the API is technically deprecated for non-secure contexts but
// remains shipped on Chromium for HTTPS pages, which is all we serve).
// We type the surface we actually consume to avoid `any` everywhere.
// ----------------------------------------------------------------------------

interface BatteryManager extends EventTarget {
  /** 0..1 fractional level. */
  readonly level: number;
  /** True when AC is connected. */
  readonly charging: boolean;
  // chargingTime / dischargingTime intentionally ignored — they're
  // unreliable on Chrome (often Infinity) and we don't need them.
  addEventListener(
    type: "levelchange" | "chargingchange",
    listener: () => void,
  ): void;
  removeEventListener(
    type: "levelchange" | "chargingchange",
    listener: () => void,
  ): void;
}

interface NavigatorWithBattery {
  getBattery: () => Promise<BatteryManager>;
}

// ----------------------------------------------------------------------------
// Threshold constants. Calibrate post-launch per spec §128.
// ----------------------------------------------------------------------------

/**
 * Below this level (and not charging) we PROMPT the user to switch to
 * audio-only. They can decline; we don't re-prompt within the same call.
 * Values in [0, 1] (matching `BatteryManager.level` units).
 */
export const BATTERY_PROMPT_THRESHOLD = 0.15;

/**
 * Below this level (and not charging) we FORCE audio-only without
 * asking. Crossed strictly after the prompt threshold (the prompt
 * branch latches first; the force branch unconditionally engages
 * fallback even if the prompt was declined).
 */
export const BATTERY_FORCE_THRESHOLD = 0.05;

/**
 * AT or above this level — OR `charging === true` — we consider the
 * patient "safe" and reset the prompt + force latches. Higher than
 * the prompt threshold to debounce flapping (see header notes).
 */
export const BATTERY_RECOVER_THRESHOLD = 0.2;

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export interface UseBatterySaverOpts {
  /**
   * Battery dropped below 15% and is not charging. Fired AT MOST ONCE
   * per call (host renders a one-shot prompt; user declining is
   * remembered). Reset via `onRecover`.
   */
  onPromptLow: () => void;
  /**
   * Battery dropped below 5% and is not charging. Fired AT MOST ONCE
   * per call. Host should engage audio-only unconditionally and
   * render the forced banner.
   */
  onForceLow: () => void;
  /**
   * Charger plugged in OR battery climbed back above 20%. Resets
   * the prompt + force latches so a subsequent drain-recharge-drain
   * cycle re-prompts. Host should clear any "battery banner" state.
   */
  onRecover: () => void;
}

export interface UseBatterySaverReturn {
  /**
   * `true` when the browser exposes `navigator.getBattery`. iOS
   * Safari, older Firefox without the pref, and any non-secure
   * context return `false`. The host should NOT render any
   * battery-related UI when this is `false` (graceful degradation
   * is the entire UX contract on those platforms).
   */
  supported: boolean;
  /**
   * Last-known battery level (0..1). `null` while the
   * `navigator.getBattery()` promise is unresolved (~one tick after
   * mount on supported browsers) or when unsupported.
   */
  level: number | null;
  /**
   * Last-known charging state. `null` until the API resolves.
   */
  charging: boolean | null;
}

// ----------------------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------------------

function isNavigatorWithBattery(
  nav: Navigator | undefined,
): nav is Navigator & NavigatorWithBattery {
  return (
    typeof nav !== "undefined" &&
    "getBattery" in nav &&
    typeof (nav as Partial<NavigatorWithBattery>).getBattery === "function"
  );
}

// ----------------------------------------------------------------------------
// Hook
// ----------------------------------------------------------------------------

export function useBatterySaver(
  opts: UseBatterySaverOpts,
): UseBatterySaverReturn {
  const [supported, setSupported] = useState<boolean>(false);
  const [level, setLevel] = useState<number | null>(null);
  const [charging, setCharging] = useState<boolean | null>(null);

  // Mirror the latest callbacks into refs so the API listener (which
  // owns a stable closure) always reaches the freshest handler — the
  // consumer commonly wraps the callbacks in `useCallback` but we
  // can't depend on that. Same pattern as `useTwilioReconnectState`
  // and `useNetworkQuality` callback bridges.
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  // Prompt + force latches. Refs (not state) so flipping them inside
  // the levelchange listener doesn't trigger a re-render — the
  // consumer doesn't need to know. Both reset on `onRecover`.
  const hasPromptedRef = useRef(false);
  const hasForcedRef = useRef(false);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!isNavigatorWithBattery(navigator)) {
      // iOS Safari, older Firefox without the pref, or any
      // non-secure context. Stay `supported: false`; render nothing.
      return;
    }

    let cancelled = false;
    let battery: BatteryManager | null = null;

    /**
     * Evaluate the current (level, charging) snapshot and fire the
     * appropriate callback(s). Idempotent: callers can invoke this
     * after every event tick without worrying about duplicate fires
     * — the latches gate it.
     */
    const evaluate = (lvl: number, isCharging: boolean) => {
      // Recovery branch FIRST so a charger-plugged-in event during a
      // drained state immediately resets the latches before the
      // level branches re-evaluate.
      if (isCharging || lvl >= BATTERY_RECOVER_THRESHOLD) {
        if (hasPromptedRef.current || hasForcedRef.current) {
          hasPromptedRef.current = false;
          hasForcedRef.current = false;
          optsRef.current.onRecover();
        }
        return;
      }

      // Force branch — independent of the prompt latch. If we hit 5%
      // without ever having prompted (e.g. the call started below 15%
      // and the user dismissed the prompt that auto-fired on mount),
      // the force still fires.
      if (lvl < BATTERY_FORCE_THRESHOLD && !hasForcedRef.current) {
        hasForcedRef.current = true;
        optsRef.current.onForceLow();
        return;
      }

      // Prompt branch — only fires if the force hasn't already
      // engaged (no point prompting after we've already forced).
      if (
        lvl < BATTERY_PROMPT_THRESHOLD &&
        !hasPromptedRef.current &&
        !hasForcedRef.current
      ) {
        hasPromptedRef.current = true;
        optsRef.current.onPromptLow();
      }
    };

    const handleChange = () => {
      if (!battery || cancelled) return;
      const lvl = battery.level;
      const isCharging = battery.charging;
      setLevel(lvl);
      setCharging(isCharging);
      evaluate(lvl, isCharging);
    };

    navigator
      .getBattery()
      .then((mgr) => {
        if (cancelled) return;
        battery = mgr;
        setSupported(true);
        setLevel(mgr.level);
        setCharging(mgr.charging);
        // Initial evaluation — covers the case where the call mounts
        // with the patient already below the prompt threshold (e.g.
        // they joined at 12% — we should prompt immediately).
        evaluate(mgr.level, mgr.charging);
        mgr.addEventListener("levelchange", handleChange);
        mgr.addEventListener("chargingchange", handleChange);
      })
      .catch(() => {
        // Firefox can reject when the pref is off; some Chrome
        // configurations reject on iframes. Silent no-op — the
        // hook stays in its `supported: false` initial state and
        // the consumer renders nothing battery-related.
        if (!cancelled) {
          setSupported(false);
        }
      });

    return () => {
      cancelled = true;
      if (battery) {
        battery.removeEventListener("levelchange", handleChange);
        battery.removeEventListener("chargingchange", handleChange);
      }
      // Latches stay set across the cleanup — if the consumer
      // unmounts mid-call (e.g. session-end teardown), there's
      // nothing to "recover" to. The next mount will start with
      // fresh refs (the `useRef(false)` initial values above).
    };
  }, []);

  return { supported, level, charging };
}
