"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isPictureInPictureSupported } from "@/lib/call/pip-support";

/**
 * Sub-batch B · task-video-B7 — Picture-in-Picture state hook.
 *
 * Wraps the W3C PiP API around a target `<video>` element ref:
 *
 *   - Capability detection (mirrors `isPictureInPictureSupported`
 *     so the parent doesn't have to import + check separately).
 *   - `enter()` / `exit()` actions returning Promise<void> with
 *     human-readable error strings on failure.
 *   - Reactive `isActive` state synced to the browser's
 *     `'enterpictureinpicture'` / `'leavepictureinpicture'` events
 *     (the browser fires these even when the user closes the PiP
 *     window via its own X button — `isActive` follows reality,
 *     not just our calls).
 *   - Auto-exit on hook unmount so a route change / call disconnect
 *     doesn't leave a stranded PiP window pointing at a dead `<video>`.
 *
 * Why a hook (not in-component state):
 *   - The same machine is consumed by `<VideoRoom>` today; voice
 *     could consume it later for a future "voice + companion-doc
 *     PiP" surface (out of scope today).
 *   - The PiP API has three event sources to coordinate (the
 *     ref's `enterpictureinpicture` event, its `leavepictureinpicture`
 *     event, and `document.exitPictureInPicture()`); centralizing
 *     them here avoids subtle race conditions in callers.
 *
 * Returns `null` for the entire API surface (`enter`, `exit`,
 * `isActive`) when `isSupported === false` so parents can render
 * the button only when the API is usable. The button itself is
 * conditional on `isSupported` per decision §8 ("hide PiP button
 * entirely on unsupported browsers").
 *
 * Error surfaces:
 *
 *   `'user-gesture-required'` — Safari / iOS path; the user
 *     clicked too far in the past for the gesture to count, or
 *     the call was made outside a user-gesture stack frame.
 *     Caller should toast: "Tap the video to enter Picture-in-Picture."
 *   `'denied'`               — Browser policy / enterprise gate
 *     denied the request. Caller should toast: "Picture-in-Picture
 *     unavailable in this browser."
 *   `'no-element'`           — Target ref is null. Defensive — the
 *     parent should always have the `<video>` mounted before
 *     calling `enter()`.
 *   `'unknown'`              — Anything else. Caller should toast
 *     a generic "Picture-in-Picture unavailable; try again."
 */

export type PictureInPictureError =
  | "user-gesture-required"
  | "denied"
  | "no-element"
  | "unknown";

export interface UsePictureInPictureApi {
  /**
   * Whether the browser exposes a usable PiP API (capability check
   * + in-app webview heuristic). `false` → caller should not render
   * the PiP button at all (decision §8).
   */
  isSupported: boolean;
  /**
   * Whether the hook's target `<video>` is currently displaying
   * in a PiP window. Reactive — browser-driven (the user closing
   * the PiP via its X button flips this to `false` automatically).
   */
  isActive: boolean;
  /**
   * Request PiP for the target video. Resolves on success; rejects
   * with one of `PictureInPictureError`. The reject is the caller's
   * cue to toast.
   */
  enter: () => Promise<void>;
  /**
   * Exit PiP if active. No-op when not active. Resolves silently
   * (browser doesn't typically reject `exitPictureInPicture()`,
   * but we type-guard anyway).
   */
  exit: () => Promise<void>;
}

interface VideoElementWithPiP extends HTMLVideoElement {
  requestPictureInPicture(): Promise<PictureInPictureWindow>;
}

interface DocumentWithPiP extends Document {
  pictureInPictureElement: Element | null;
  exitPictureInPicture(): Promise<void>;
}

export function usePictureInPicture(
  videoRef: React.RefObject<HTMLVideoElement | null>,
): UsePictureInPictureApi {
  // Capability check is computed once on mount. Browsers don't
  // change PiP support across a session lifetime; if a user
  // resizes a webview window, the API surface stays put.
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isActive, setIsActive] = useState<boolean>(false);

  // Track whether the video element ref is bound, so cleanup +
  // event listener wiring fire only when there's something to
  // attach to. The ref OBJECT identity is stable (parent's
  // `useRef`); we re-check `.current` on each render via the
  // `videoRef` dependency below.
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  // Run capability + listener setup once on mount, AND whenever
  // the underlying DOM node identity changes (parent unmounts
  // and remounts the video — shouldn't happen mid-call, but
  // belt + braces). The empty-ref short-circuit handles the
  // "ref hasn't bound yet" race during the first paint.
  useEffect(() => {
    setIsSupported(isPictureInPictureSupported());

    const video = videoRef.current;
    videoElRef.current = video;
    if (!video) {
      return;
    }

    const handleEnter = () => {
      setIsActive(true);
    };
    const handleLeave = () => {
      setIsActive(false);
    };

    video.addEventListener("enterpictureinpicture", handleEnter);
    video.addEventListener("leavepictureinpicture", handleLeave);

    // Sync initial state — covers the (rare) case where PiP was
    // already active before this hook mounted (e.g. fast remount
    // after a layout swap that re-parented the video).
    if (typeof document !== "undefined") {
      const docPip = document as DocumentWithPiP;
      if (docPip.pictureInPictureElement === video) {
        setIsActive(true);
      }
    }

    return () => {
      video.removeEventListener("enterpictureinpicture", handleEnter);
      video.removeEventListener("leavepictureinpicture", handleLeave);
    };
  }, [videoRef]);

  // Auto-exit on unmount — the parent might unmount the
  // `<VideoRoom>` (call ended, route change) while PiP is still
  // active. The browser would otherwise leave the window open
  // pointing at a dead `<video>`, which on Chrome shows a
  // "Tab crashed" placeholder until the user closes it.
  useEffect(() => {
    return () => {
      if (typeof document === "undefined") return;
      const docPip = document as DocumentWithPiP;
      const video = videoElRef.current;
      if (video && docPip.pictureInPictureElement === video) {
        // Best-effort; some browsers reject `exitPictureInPicture`
        // when the page is unloading. Swallow — there's no UI to
        // surface the error to anyway.
        docPip.exitPictureInPicture().catch(() => {
          /* unmounting; can't toast */
        });
      }
    };
  }, []);

  const enter = useCallback(async (): Promise<void> => {
    const video = videoRef.current as VideoElementWithPiP | null;
    if (!video) {
      throw "no-element" satisfies PictureInPictureError;
    }
    if (typeof video.requestPictureInPicture !== "function") {
      throw "denied" satisfies PictureInPictureError;
    }
    try {
      await video.requestPictureInPicture();
    } catch (err) {
      // Most browsers reject with a DOMException whose `name`
      // is `'NotAllowedError'` for the user-gesture and policy
      // cases; `'InvalidStateError'` for "no video data yet"
      // (not an issue once the call is connected; the parent
      // gates the button on `status === 'connected'`).
      const errorName =
        err && typeof err === "object" && "name" in err
          ? String((err as { name?: unknown }).name ?? "")
          : "";
      if (errorName === "NotAllowedError") {
        throw "user-gesture-required" satisfies PictureInPictureError;
      }
      throw "unknown" satisfies PictureInPictureError;
    }
  }, [videoRef]);

  const exit = useCallback(async (): Promise<void> => {
    if (typeof document === "undefined") return;
    const docPip = document as DocumentWithPiP;
    if (typeof docPip.exitPictureInPicture !== "function") return;
    if (docPip.pictureInPictureElement === null) return;
    try {
      await docPip.exitPictureInPicture();
    } catch {
      // Browser already exiting (e.g. page lifecycle); nothing
      // for the caller to do.
    }
  }, []);

  return {
    isSupported,
    isActive,
    enter,
    exit,
  };
}
