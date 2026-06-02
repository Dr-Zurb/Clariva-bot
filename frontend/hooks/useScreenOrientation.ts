"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Sub-batch F · task-video-F2 — screen orientation tracking + lock.
 *
 * Two concerns split into one hook because they share the same
 * underlying browser primitive (`screen.orientation`) and the
 * caller (`<VideoRoom>`) needs both to reactively pick layouts:
 *
 *   1. **Orientation tracking** — `'portrait' | 'landscape'` derived
 *      from `matchMedia('(orientation: portrait)')`. We use
 *      matchMedia (not `screen.orientation.angle`) for max
 *      compatibility — iOS Safari implements matchMedia reliably
 *      but its `screen.orientation` object is broken / stub-only on
 *      older iOS versions.
 *
 *   2. **Orientation lock** — wraps `screen.orientation.lock()`
 *      which is only reliable when the page is fullscreen OR
 *      installed as a PWA (Android Chrome's most common case).
 *      Returns `false` from `lock()` on rejection so the caller
 *      can degrade the UI silently rather than throw.
 *
 * The hook is conservative about WHO owns the lock: a flag
 * (`isLockedByUsRef`) tracks lock acquired through THIS hook so
 * that an `unmount` doesn't unlock something a different
 * component or browser default arranged. The visible `isLocked`
 * state mirrors the flag so the UI button can render the right
 * icon.
 *
 * Browser support matrix (verified at audit time, see F.2 log):
 *   - Chrome (Android, fullscreen + PWA) — full support.
 *   - Firefox (Android, fullscreen) — full support.
 *   - Safari (iOS) — `matchMedia` only; `screen.orientation`
 *     stub returns undefined `lock`. Hook reports `canLock: false`
 *     and never invokes the API.
 *   - Edge (Windows desktop) — matchMedia works for devtools-driven
 *     rotation; lock works only in fullscreen on tablet mode.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScreenOrientation = "portrait" | "landscape";

/**
 * Subset of the W3C `OrientationLockType` enum we accept from
 * callers. We drop `'any'` (caller-meaningless — same as unlock)
 * and the `-primary` / `-secondary` variants (no UI for those).
 */
export type OrientationLockTarget = "portrait" | "landscape" | "natural";

export interface UseScreenOrientationReturn {
  /** Current orientation derived from matchMedia. */
  orient: ScreenOrientation;
  /** True iff `screen.orientation.lock` is callable (PWA / fullscreen
   *  contexts on Chrome / Firefox; iOS Safari is always false). */
  canLock: boolean;
  /** True iff THIS hook successfully locked the orientation and
   *  hasn't unlocked yet. Tracks lock-by-us, NOT lock-by-anyone. */
  isLocked: boolean;
  /** Attempt to lock the screen to `target`. Resolves `true` on
   *  success, `false` on rejection (permission, fullscreen
   *  required, etc.) or unsupported browser. */
  lock: (target: OrientationLockTarget) => Promise<boolean>;
  /** Unlock the screen if THIS hook locked it. No-op when
   *  `isLockedByUsRef` is false. */
  unlock: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Browser-specific narrowing
//
// W3C `lib.dom.d.ts` types `screen.orientation` as a non-optional
// `ScreenOrientation` interface, but in practice the property is
// missing or stub-only on iOS Safari (older versions). We can't
// `extends Screen { orientation?: ... }` because the lib's
// non-optional declaration makes that an incompatible override —
// instead, treat `screen` as `unknown` at the access boundary and
// duck-type the orientation surface via our own minimal interface.
// ---------------------------------------------------------------------------

interface ScreenOrientationLike {
  type: string;
  angle?: number;
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
}

function readScreenOrientation(): ScreenOrientationLike | null {
  if (typeof window === "undefined") return null;
  if (typeof window.screen === "undefined") return null;
  // `screen.orientation` is typed as required in lib.dom.d.ts but
  // can be undefined at runtime on iOS Safari — cast through
  // `unknown` so the duck-typed access doesn't fight the lib types.
  const candidate = (
    window.screen as unknown as { orientation?: ScreenOrientationLike }
  ).orientation;
  return candidate ?? null;
}

function detectCanLock(): boolean {
  const so = readScreenOrientation();
  return Boolean(so && typeof so.lock === "function");
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useScreenOrientation(): UseScreenOrientationReturn {
  const [orient, setOrient] = useState<ScreenOrientation>("portrait");
  const [isLocked, setIsLocked] = useState(false);
  const [canLock, setCanLock] = useState(false);

  // Tracks "did THIS hook acquire the lock". Independent from
  // `isLocked` (which is what the UI shows). On unmount we only
  // unlock if WE locked — preserving lock state set by other
  // surfaces (e.g. a parent route that locked at a higher level).
  const isLockedByUsRef = useRef(false);

  // ------------------------------------------------------------------------
  // Orientation tracking via matchMedia
  //
  // `matchMedia('(orientation: portrait)')` is the most compatible
  // signal: iOS Safari, all desktop browsers, and Android Chrome
  // / Firefox all fire `change` events on rotation. We deliberately
  // do NOT subscribe to `screen.orientation.change` because iOS
  // Safari's `screen.orientation` is a stub — events never fire.
  // ------------------------------------------------------------------------
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const portraitQuery = window.matchMedia("(orientation: portrait)");

    const apply = (matches: boolean) => {
      setOrient(matches ? "portrait" : "landscape");
    };
    apply(portraitQuery.matches);

    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    if (typeof portraitQuery.addEventListener === "function") {
      portraitQuery.addEventListener("change", handler);
      return () => portraitQuery.removeEventListener("change", handler);
    }
    // Legacy Safari < 14 fallback. Same pattern as
    // <CameraSwitchButton>'s viewport hook.
    if (
      typeof (portraitQuery as { addListener?: unknown }).addListener ===
      "function"
    ) {
      (portraitQuery as {
        addListener: (cb: (e: MediaQueryListEvent) => void) => void;
      }).addListener(handler);
      return () => {
        if (
          typeof (portraitQuery as { removeListener?: unknown })
            .removeListener === "function"
        ) {
          (portraitQuery as {
            removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
          }).removeListener(handler);
        }
      };
    }
  }, []);

  // ------------------------------------------------------------------------
  // canLock detection
  //
  // Re-runs on mount only. The capability is browser-static — once
  // we know whether `screen.orientation.lock` is a function, the
  // value won't change for the session. (The PWA-vs-tab distinction
  // can change capability AT INSTALL TIME, but installation reloads
  // the document so the next mount re-detects.)
  // ------------------------------------------------------------------------
  useEffect(() => {
    setCanLock(detectCanLock());
  }, []);

  // ------------------------------------------------------------------------
  // lock / unlock
  // ------------------------------------------------------------------------

  const lock = useCallback(
    async (target: OrientationLockTarget): Promise<boolean> => {
      const so = readScreenOrientation();
      if (!so || typeof so.lock !== "function") {
        return false;
      }
      try {
        // The W3C type accepts more variants ('any', '-primary'
        // etc.) but our public surface is intentionally smaller.
        // 'natural' = the device's default (portrait for phones,
        // landscape for most tablets).
        await so.lock(target);
        isLockedByUsRef.current = true;
        setIsLocked(true);
        return true;
      } catch (err) {
        // Common rejection reasons: not in fullscreen, browser
        // refuses (Safari iOS even in PWA mode), user permission
        // denied. We report `false` and let the caller decide
        // whether to surface a toast.
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "useScreenOrientation: lock failed:",
            err instanceof Error ? err.message : err,
          );
        }
        return false;
      }
    },
    [],
  );

  const unlock = useCallback(async (): Promise<void> => {
    if (!isLockedByUsRef.current) return;
    const so = readScreenOrientation();
    try {
      so?.unlock?.();
    } catch (err) {
      // unlock() is sync per spec but some browsers throw on
      // double-unlock; swallow.
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "useScreenOrientation: unlock threw:",
          err instanceof Error ? err.message : err,
        );
      }
    }
    isLockedByUsRef.current = false;
    setIsLocked(false);
  }, []);

  // ------------------------------------------------------------------------
  // Auto-unlock on unmount
  //
  // If the user navigates away (or the component is removed from
  // the tree by route change / parent re-render) while we hold the
  // lock, release it so we don't leave the next page locked into
  // landscape. We deliberately call the underlying API directly
  // (not the memoised `unlock` callback) because the closure
  // captures the latest `isLockedByUsRef` either way and the
  // cleanup runs synchronously once.
  // ------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (!isLockedByUsRef.current) return;
      const so = readScreenOrientation();
      try {
        so?.unlock?.();
      } catch {
        // Best-effort.
      }
      isLockedByUsRef.current = false;
    };
  }, []);

  return {
    orient,
    canLock,
    isLocked,
    lock,
    unlock,
  };
}
