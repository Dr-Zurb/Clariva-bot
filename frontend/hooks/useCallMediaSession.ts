"use client";

import { useEffect, useRef, useState } from "react";
import {
  isSupportedProximityPlatform,
  type WakeLockSentinel,
} from "@/hooks/useProximityWakeLock";

/**
 * Sub-batch F · task-video-F3 (and voice C10 sibling) —
 * MediaSession + persistent foreground notification glue.
 *
 * Bears the foundation that voice C10 will reuse later:
 *   - Modality-aware (`'voice' | 'video'`) so the same hook drives
 *     both consult surfaces.
 *   - Lazily registers `/sw.js` on mount (no global registration
 *     in `app/layout.tsx`; SW only loads when a call actually
 *     starts).
 *   - Declares the call as media playback via `MediaSession`. On
 *     Android Chrome (PWA install) this is the signal that
 *     promotes the tab to foreground-service-equivalent priority.
 *   - Posts `'show-call-notification'` to the SW when the page
 *     hides, `'hide-call-notification'` when it returns. The SW
 *     pins a `requireInteraction` notification keyed by
 *     `tag: call:${sessionId}` (see `frontend/public/sw.js`).
 *   - Listens for SW `message` events with
 *     `type: 'call-notification-action'` (mute / end) and routes
 *     them to the parent's `onPause` / `onStop` callbacks so the
 *     in-app handlers (Twilio Room mute / disconnect) run.
 *
 * Decision §14 (locked, voice C10) — `pause` action ALWAYS maps to
 * mute toggle; never to hold. B3 owns hold; pause is the lighter
 * affordance that doesn't change call routing semantics.
 *
 * Browser support:
 *   - Chrome (Android, fullscreen + PWA): full support; pinned
 *     notifications survive 5+ min background.
 *   - Firefox (Android): MediaSession yes; persistent notifications
 *     work but vary by OEM customizations.
 *   - Safari (iOS PWA): MediaSession yes; persistent notifications
 *     don't pin the same way — call may drop earlier when
 *     backgrounded. `<IOSPWABanner>` surfaces the degradation UX.
 *   - Desktop browsers: MediaSession works (you'll see the call
 *     metadata on the OS lock screen / hardware media keys);
 *     persistent notification works if Notification permission is
 *     granted.
 *
 * OEM degradation matrix (sub-batch F · task-video-F5 closes):
 *
 *   - **Android Chrome PWA — Pixel / stock Android.** Full support.
 *     Lock-screen widget shows "{Voice|Video} consult / {caller}",
 *     pause action toggles mute (decision §14), end action calls
 *     `stoptransport`. Hardware volume keys route to call audio by
 *     browser default — no code needed; the browser auto-routes
 *     hw-volume input to the media-session-tagged `<audio>` /
 *     `<video>` element once `playbackState === 'playing'` is set.
 *
 *   - **Samsung Galaxy.** Same as Pixel for the most part; some
 *     One UI builds add a Samsung-branded "Phone call" widget
 *     INSTEAD of the standard MediaSession surface — actions still
 *     work but the title bar reads "Internet call" not "Video
 *     consult". Out of our control; documented for QA.
 *
 *   - **Xiaomi MIUI.** Notorious for stripping MediaSession on
 *     aggressive battery-saver modes; the widget may not appear
 *     at all even with `playbackState='playing'` declared. No
 *     code-side patch possible — MIUI's Battery Saver intercepts
 *     SW + MediaSession before the browser engine sees them. The
 *     defensive null-setters below (F.5) keep the OEM's stripped
 *     widget tidy when it DOES show.
 *
 *   - **iOS Safari (regular tab).** MediaSession metadata + action
 *     handlers work for the lock-screen "Now Playing" widget
 *     (iOS 15+). Hardware volume keys route to call audio by
 *     default. Persistent SW notification doesn't pin the same way.
 *
 *   - **iOS Safari (PWA / standalone).** Apple gates lock-screen
 *     call controls — they require a native shell (Capacitor /
 *     RN). Out of scope per F.3 + F.5 specs. `<IOSPWABanner>`
 *     warns the user up-front so it's not a surprise.
 *
 *   - **Bluetooth headset media buttons.** Not directly handled
 *     here; voice T6.34 owns the explicit Bluetooth button mapping
 *     work. Pause/play actions DO route through MediaSession on
 *     most BT stacks, so practically Bluetooth pause = mute is
 *     already wired by inheritance.
 *
 * What this hook deliberately does NOT do:
 *   - **No `Notification.requestPermission()` prompt.** The first
 *     visibility-hidden post will silently fail if permission
 *     isn't granted; the page should request permission at a
 *     higher-trust moment (e.g. patient lobby pre-call). For F.3
 *     v1 we ship the foundation and let permission gating land
 *     later.
 *   - **No retry / exponential backoff** on SW registration. If
 *     the registration fails, the page logs a warning and the
 *     call proceeds without the foreground-notification benefit
 *     (graceful degradation).
 *   - **No track keep-alive (5s no-op canvas tick).** Twilio's
 *     internal heartbeat handles WebRTC keep-alive; the spec's
 *     hidden-iframe trick was a "decision §33 maybe" — deferred
 *     until we see real-world track suspension reports.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CallModality = "voice" | "video";

export interface UseCallMediaSessionOpts {
  /** Stable identifier; used as the notification `tag` suffix so
   *  multiple consults can coexist without colliding. */
  sessionId: string;
  /** Counterparty display name (passes through to the notification
   *  title and `MediaSession.metadata.artist`). Roles like
   *  `"Doctor"` / `"Patient"` are fine — no PHI requirement. */
  callerName: string;
  /** Drives modality-specific copy in the notification + metadata
   *  title ("Voice consult" vs "Video consult"). */
  modality: CallModality;
  /** Mute state — informs MediaSession `playbackState` (paused
   *  when muted) and the notification `mute` action label. */
  isMuted: boolean;
  /** Hold state (B3). When true, MediaSession `playbackState =
   *  'paused'` and the notification body switches to "Call paused".
   *  Per decision §14, the `pause` action still routes to mute —
   *  hold has its own UI affordances. */
  isOnHold: boolean;
  /** Mute toggle. Wired from MediaSession `pause` action AND the
   *  SW notification `mute` action. */
  onPause: () => void;
  /** Unmute (or resume from a non-mute pause source — same call
   *  site as `onPause` in practice). MediaSession `play` action. */
  onPlay: () => void;
  /** End-call. Wired from MediaSession `stoptransport` action AND
   *  the SW notification `end` action. */
  onStop: () => void;
  /** When false, skip all MediaSession + SW wiring (e.g. readonly
   *  replay mounts). Default true. */
  enabled?: boolean;
}

export interface UseCallMediaSessionReturn {
  /** True iff `'mediaSession' in navigator` — the OS-level call
   *  metadata path is available. */
  supported: boolean;
  /** True iff the page is launched in standalone PWA mode
   *  (install-from-browser, opened from home screen). */
  isStandalone: boolean;
  /** Subset of `isStandalone` — true on iOS standalone where the
   *  notification path is unreliable. The host can use this to
   *  render `<IOSPWABanner>`. */
  isIOSPWA: boolean;
  /** True iff the SW registered successfully. False on browsers
   *  without SW support OR if registration threw. */
  serviceWorkerReady: boolean;
}

// ---------------------------------------------------------------------------
// Browser narrowing
// ---------------------------------------------------------------------------

interface MediaSessionLike {
  metadata: unknown;
  playbackState?: string;
  setActionHandler: (
    action: string,
    handler: (() => void) | null,
  ) => void;
}

interface MediaMetadataInitLike {
  title?: string;
  artist?: string;
  album?: string;
  artwork?: ReadonlyArray<{ src: string; sizes?: string; type?: string }>;
}

function getMediaSession(): MediaSessionLike | null {
  if (typeof navigator === "undefined") return null;
  if (!("mediaSession" in navigator)) return null;
  return (navigator as unknown as { mediaSession: MediaSessionLike })
    .mediaSession;
}

function buildMetadata(init: MediaMetadataInitLike): unknown | null {
  if (typeof window === "undefined") return null;
  const Ctor = (window as unknown as { MediaMetadata?: new (i: MediaMetadataInitLike) => unknown })
    .MediaMetadata;
  if (typeof Ctor !== "function") return null;
  try {
    return new Ctor(init);
  } catch {
    return null;
  }
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // Modern path: `display-mode: standalone` MQ. Works on Chrome,
  // Edge, Firefox, Safari (recent).
  if (typeof window.matchMedia === "function") {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
  }
  // iOS Safari pre-iOS-17 path: legacy `navigator.standalone`.
  const nav = navigator as unknown as { standalone?: boolean };
  return nav.standalone === true;
}

function detectIOSPWA(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  if (!isIOS) return false;
  return detectStandalone();
}

/** Post a message to the active SW worker. Uses `ready` + `active`
 *  rather than `controller` alone so the first background transition
 *  after registration still reaches the SW (controller may be null
 *  until `clients.claim()` completes). */
async function postSwMessage(data: Record<string, unknown>): Promise<void> {
  if (typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage(data);
  } catch {
    /* registration unavailable — graceful degradation */
  }
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCallMediaSession(
  opts: UseCallMediaSessionOpts,
): UseCallMediaSessionReturn {
  const {
    sessionId,
    callerName,
    modality,
    isMuted,
    isOnHold,
    onPause,
    onPlay,
    onStop,
    enabled = true,
  } = opts;

  // Capability / environment flags. Mount-time only; these don't
  // change for the session.
  const [supported, setSupported] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOSPWA, setIsIOSPWA] = useState(false);
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);

  // Latest-callback refs — the visibilitychange / SW-message
  // listeners need to read the FRESHEST callbacks, not the ones
  // captured at first mount. This is the same pattern A3 uses
  // for Twilio event listeners.
  const onPauseRef = useRef(onPause);
  const onPlayRef = useRef(onPlay);
  const onStopRef = useRef(onStop);
  useEffect(() => {
    onPauseRef.current = onPause;
    onPlayRef.current = onPlay;
    onStopRef.current = onStop;
  });

  // Latest mute / hold / caller refs — used by the visibilitychange
  // listener so the SW notification body reflects the current
  // state at the moment the user backgrounds the tab (not the
  // state at hook-mount time).
  const isMutedRef = useRef(isMuted);
  const isOnHoldRef = useRef(isOnHold);
  const callerNameRef = useRef(callerName);
  useEffect(() => {
    isMutedRef.current = isMuted;
    isOnHoldRef.current = isOnHold;
    callerNameRef.current = callerName;
  });

  // ------------------------------------------------------------------------
  // Capability detection (mount-only)
  // ------------------------------------------------------------------------
  useEffect(() => {
    setSupported(getMediaSession() !== null);
    setIsStandalone(detectStandalone());
    setIsIOSPWA(detectIOSPWA());
  }, []);

  // ------------------------------------------------------------------------
  // Service worker registration (lazy, mount-time)
  //
  // We register on hook mount rather than on app boot so the SW
  // only loads when a call actually starts. This keeps the
  // marketing pages (`/`, `/book`, `/login`) free of SW overhead.
  //
  // Registration is idempotent — if a previous mount already
  // registered, the second call returns the existing registration.
  // ------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => {
        if (cancelled) return;
        setServiceWorkerReady(true);
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "useCallMediaSession: SW registration failed:",
            err instanceof Error ? err.message : err,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // ------------------------------------------------------------------------
  // MediaSession metadata + action handlers
  //
  // Re-runs when modality / callerName changes (e.g. counterparty
  // joins late and the label resolves). Action handlers route to
  // the latest callback via refs so re-binding doesn't depend on
  // every callback identity.
  // ------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    const ms = getMediaSession();
    if (!ms) return;

    const title =
      modality === "video" ? "Video consult" : "Voice consult";
    const meta = buildMetadata({
      title,
      artist: callerName || "Clariva",
      album: "Clariva",
      artwork: [
        { src: "/brand/logomark.svg", sizes: "any", type: "image/svg+xml" },
      ],
    });
    if (meta !== null) {
      ms.metadata = meta;
    }

    // Action handlers fire when the user uses an OS-level media
    // control surface (lock-screen widget, hardware play/pause
    // button, Bluetooth headset button). Decision §14 from voice
    // C10: `pause` ALWAYS routes to mute, never to hold.
    const handlePause = () => {
      try {
        onPauseRef.current();
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("useCallMediaSession pause handler threw:", err);
        }
      }
    };
    const handlePlay = () => {
      try {
        onPlayRef.current();
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("useCallMediaSession play handler threw:", err);
        }
      }
    };
    const handleStop = () => {
      try {
        onStopRef.current();
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("useCallMediaSession stop handler threw:", err);
        }
      }
    };

    try {
      ms.setActionHandler("pause", handlePause);
      ms.setActionHandler("play", handlePlay);
      ms.setActionHandler("stop", handleStop);
      // Some browsers (Chrome) prefer the more specific
      // 'stoptransport' name over 'stop' for this exact case.
      ms.setActionHandler("stoptransport", handleStop);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("useCallMediaSession setActionHandler threw:", err);
      }
    }

    // -----------------------------------------------------------------
    // Sub-batch F · task-video-F5 — defensive null-setters for actions
    // we do NOT support.
    //
    // The W3C MediaSession spec says: registering `null` for an action
    // tells the OS the action is UNAVAILABLE (so the lock-screen
    // widget hides the corresponding button). Crucially, this is the
    // ONLY way to clear a handler — there's no `removeActionHandler`.
    //
    // Why we explicitly clear them on EVERY mount:
    //   1. **Stale handler hygiene** — if a prior hook revision (or a
    //      different page) registered, say, `seekto`, the OS could
    //      surface a scrub bar even though we never set it in the
    //      current code. The MediaSession is a global singleton on
    //      `navigator`; handlers persist across navigations until
    //      explicitly cleared.
    //   2. **Misleading UX** — a scrub bar / skip button on a LIVE
    //      call (no rewind, no skip-track) would confuse users. Worse,
    //      tapping it on some OEMs throws a JS-level NotSupportedError
    //      and the OS surfaces a "media error" toast.
    //   3. **OEM compliance smoke** — Xiaomi MIUI is known to render
    //      every available action even if `playbackState` says paused;
    //      shipping a fully-cleared action set is the only reliable
    //      way to keep the lock screen tidy on those builds.
    //
    // Each null-set is wrapped in its own try/catch because some
    // browsers throw `NotSupportedError` for action names they don't
    // recognize (rather than silently ignoring) — we want a single
    // unsupported name not to skip the rest.
    // -----------------------------------------------------------------
    const UNSUPPORTED_ACTIONS = [
      "seekto",
      "seekbackward",
      "seekforward",
      "nexttrack",
      "previoustrack",
      "skipad",
    ] as const;
    for (const action of UNSUPPORTED_ACTIONS) {
      try {
        ms.setActionHandler(action, null);
      } catch {
        // NotSupportedError on legacy browsers — safe to ignore;
        // an unsupported action name CAN'T have been registered, so
        // there's nothing to clear.
      }
    }

    return () => {
      // Clear handlers on unmount so a freshly mounted hook (e.g.
      // navigation back to a fresh consult) doesn't inherit stale
      // closures from the previous instance.
      try {
        ms.setActionHandler("pause", null);
        ms.setActionHandler("play", null);
        ms.setActionHandler("stop", null);
        ms.setActionHandler("stoptransport", null);
      } catch {
        /* best-effort */
      }
    };
  }, [enabled, modality, callerName]);

  // ------------------------------------------------------------------------
  // playbackState sync
  //
  // `playbackState` is the OS hint that drives lock-screen widget
  // copy ("Playing" / "Paused"). We map:
  //   - paused if muted OR on hold
  //   - playing otherwise
  //
  // The OS uses this to render the right play/pause icon in
  // hardware media controls.
  // ------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    const ms = getMediaSession();
    if (!ms) return;
    if (typeof ms.playbackState !== "string") return;
    ms.playbackState = isMuted || isOnHold ? "paused" : "playing";
  }, [enabled, isMuted, isOnHold]);

  // ------------------------------------------------------------------------
  // Screen wake lock (voice C10 background keep-alive)
  //
  // Keeps the display awake during an active consult on platforms
  // where `useProximityWakeLock` (voice C8) doesn't run — desktop,
  // iOS, Firefox, speakerphone on Android without proximity, etc.
  // Chrome Android earpiece defers to C8 to avoid double-acquire.
  // ------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;
    if (isSupportedProximityPlatform()) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    void (async () => {
      sentinel = await requestScreenWakeLock();
      if (cancelled && sentinel) {
        try {
          await sentinel.release();
        } catch {
          /* already released */
        }
      }
    })();

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !sentinel) {
        void requestScreenWakeLock().then((s) => {
          if (!cancelled) sentinel = s;
        });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (sentinel) {
        void sentinel.release().catch(() => {
          /* already released */
        });
      }
    };
  }, [enabled]);

  // ------------------------------------------------------------------------
  // visibilitychange → show/hide SW notification
  //
  // When the tab hides, post `'show-call-notification'` to the
  // SW; when it shows again (or the hook unmounts), post
  // `'hide-call-notification'`. Permission gating is implicit —
  // if the user hasn't granted Notification permission, the SW
  // call to `showNotification` silently fails (no error toast,
  // no console noise in production).
  // ------------------------------------------------------------------------
  const buildShowPayload = () => ({
    type: "show-call-notification" as const,
    sessionId,
    callerName: callerNameRef.current,
    modality,
    deeplink: typeof window !== "undefined" ? window.location.href : "/",
    isMuted: isMutedRef.current,
    isOnHold: isOnHoldRef.current,
  });

  const postShow = () => {
    void postSwMessage(buildShowPayload());
  };

  const postHide = () => {
    void postSwMessage({
      type: "hide-call-notification",
      sessionId,
    });
  };

  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;
    if (!sessionId) return;

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        postShow();
      } else if (document.visibilityState === "visible") {
        postHide();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      postHide();
    };
  }, [enabled, sessionId, modality]);

  // Refresh pinned notification copy when mute / hold changes
  // while the tab is already backgrounded.
  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;
    if (!sessionId) return;
    if (document.visibilityState !== "hidden") return;
    postShow();
  }, [enabled, sessionId, isMuted, isOnHold]);

  // ------------------------------------------------------------------------
  // SW message listener — route notification action taps back to
  // in-app handlers.
  //
  // The SW posts `{type: 'call-notification-action', action,
  // sessionId}` when the user taps Mute / End on the pinned
  // notification. We bridge to the React callbacks so the
  // existing handlers (Twilio Room mute / disconnect) run.
  // ------------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!sessionId) return;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== "call-notification-action") return;
      // Only honour messages tagged for THIS session — defensive
      // against multiple consults open in the same browser
      // profile.
      if (String(data.sessionId || "") !== sessionId) return;
      if (data.action === "mute") {
        try {
          onPauseRef.current();
        } catch {
          /* swallow */
        }
      } else if (data.action === "end") {
        try {
          onStopRef.current();
        } catch {
          /* swallow */
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [enabled, sessionId]);

  return {
    supported,
    isStandalone,
    isIOSPWA,
    serviceWorkerReady,
  };
}
