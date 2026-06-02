"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LocalVideoTrack,
  type Room,
} from "twilio-video";
import { isScreenShareSupported } from "@/lib/video/screen-share-support";

/**
 * Sub-batch C · task-video-C5 — Screen-share state hook.
 *
 * Owns the local screen-share lifecycle:
 *
 *   - Capability detection (mirrors `isScreenShareSupported`).
 *   - `start()` action — opens the OS picker via
 *     `getDisplayMedia({ video: { cursor: 'always' }, audio: false })`,
 *     wraps the resulting `MediaStreamTrack` in a Twilio
 *     `LocalVideoTrack` with `name: 'screen'` so the remote side can
 *     distinguish from the camera, then publishes via
 *     `room.localParticipant.publishTrack`.
 *   - `stop()` action — unpublishes + stops the track. Idempotent.
 *   - **OS-stop event** — Chrome / Firefox / Edge surface a "Stop
 *     sharing" notification at the bottom of the viewport; clicking
 *     it doesn't go through our `stop()`, but the underlying
 *     `MediaStreamTrack` fires `'ended'` (mapped to Twilio
 *     `LocalVideoTrack`'s `'stopped'` event). The hook subscribes
 *     and cleans up on its own — without this, the user would see
 *     a stale "You're sharing" banner forever.
 *   - Auto-stop on hook unmount so a route change / call disconnect
 *     doesn't leave a stranded screen track published to a dead
 *     room.
 *
 * Why a hook (not in-component state):
 *   - The OS picker → MediaStreamTrack → Twilio track → publish
 *     chain has four async steps; centralizing it avoids
 *     scattered try/catch blocks in `<VideoRoom>`.
 *   - `'stopped'` event handling has a footgun (Twilio's track
 *     fires `'stopped'` AFTER `unpublishTrack` too, so we'd
 *     double-clean if we naively unwound state in the listener);
 *     the hook serializes via a `cleanupInflightRef`.
 *   - Same call shape as `usePictureInPicture` (B7) and
 *     `useTwilioReconnectState` (B4) — capability + state +
 *     two actions, errors as typed string rejects so the
 *     parent can map to a localised toast.
 *
 * Returns `null` for `localScreenTrack` when not sharing.
 *
 * Error surfaces (rejected `start()`):
 *
 *   `'permission-denied'` — user clicked Cancel on the OS picker,
 *     OR enterprise policy blocks screen capture. UA-distinguishable
 *     via `DOMException.name === 'NotAllowedError'`. Expected and
 *     silent — caller should NOT toast (the user just declined).
 *   `'no-room'`           — `room` is null. Defensive — the parent
 *     should gate the Share button on `status === 'connected'`.
 *   `'no-track'`          — picker returned a stream with no video
 *     tracks. Vanishingly rare; defensive guard.
 *   `'unknown'`           — anything else (Twilio publish reject,
 *     codec-not-supported, etc.). Caller should toast.
 *
 * The `'permission-denied'` case is split out so the parent can
 * silently swallow it (matches Slack / Zoom UX — declining the
 * picker is a non-event).
 */

export type ScreenShareError =
  | "permission-denied"
  | "no-room"
  | "no-track"
  | "unknown";

export interface UseScreenShareApi {
  /**
   * Whether the browser exposes a usable `getDisplayMedia` API.
   * `false` on iOS Safari and any browser without the W3C
   * Screen Capture API. Caller should hide the Share button
   * entirely when `false` (decision §15 / §8 precedent).
   */
  isSupported: boolean;
  /**
   * The currently-published local screen `LocalVideoTrack`, or
   * `null` when not sharing. The parent uses this to mount a
   * `<ScreenShareTile videoTrack={localScreenTrack} ... />`
   * showing the user their own share (so they can verify what
   * the remote side sees).
   */
  localScreenTrack: LocalVideoTrack | null;
  /**
   * Whether `start()` is currently in flight (between the
   * `getDisplayMedia` resolve and the Twilio publish). Used by
   * the parent to disable the Share button so a fast double-click
   * doesn't try to publish twice.
   */
  isStarting: boolean;
  /** Open the OS picker + publish to the room. */
  start: () => Promise<void>;
  /** Unpublish + stop. No-op when not sharing. */
  stop: () => Promise<void>;
}

interface UseScreenShareOptions {
  /**
   * The active Twilio `Room` to publish into. Pass `null` while
   * connecting / disconnected; `start()` will reject with
   * `'no-room'` until the room is live.
   */
  room: Room | null;
}

export function useScreenShare(options: UseScreenShareOptions): UseScreenShareApi {
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [localScreenTrack, setLocalScreenTrack] = useState<LocalVideoTrack | null>(null);
  const [isStarting, setIsStarting] = useState<boolean>(false);

  // Hold the active track in a ref too — the `start()` and
  // `stop()` callbacks read this synchronously to short-circuit
  // duplicate calls before React re-renders the state. The
  // 'stopped'-event listener also reads it.
  const activeTrackRef = useRef<LocalVideoTrack | null>(null);
  // Serialize cleanup so the OS-stop listener doesn't race
  // with an explicit `stop()` call from the UI.
  const cleanupInflightRef = useRef<boolean>(false);

  // Capability check on mount. Same shape as
  // `usePictureInPicture` (B7).
  useEffect(() => {
    setIsSupported(isScreenShareSupported());
  }, []);

  /**
   * Tear down the active screen track:
   *   - Unpublish from the room (best-effort; the room may
   *     have disconnected behind our back).
   *   - Stop the underlying media track (releases the OS
   *     screen-capture handle so the user's "you're sharing
   *     this window" indicator clears).
   *   - Clear React state + ref.
   *
   * Reentrancy-safe via `cleanupInflightRef`.
   */
  const cleanup = useCallback(
    (room: Room | null) => {
      if (cleanupInflightRef.current) return;
      cleanupInflightRef.current = true;
      const track = activeTrackRef.current;
      activeTrackRef.current = null;
      if (track) {
        try {
          if (room && room.state === "connected") {
            room.localParticipant.unpublishTrack(track);
          }
        } catch {
          // Ignore — the track may already be unpublished
          // (Twilio fires the event regardless of how it
          // ended). Surfacing this would just be noise.
        }
        try {
          track.stop();
        } catch {
          // ignore — likewise.
        }
      }
      setLocalScreenTrack(null);
      cleanupInflightRef.current = false;
    },
    [],
  );

  // Auto-stop on unmount. Captures the latest `room` via a ref
  // wrapper so we don't get a stale closure to a now-disconnected
  // room.
  const roomRef = useRef<Room | null>(null);
  useEffect(() => {
    roomRef.current = options.room;
  }, [options.room]);

  useEffect(() => {
    return () => {
      cleanup(roomRef.current);
    };
  }, [cleanup]);

  const start = useCallback(async (): Promise<void> => {
    const room = options.room;
    if (!room || room.state !== "connected") {
      throw "no-room" satisfies ScreenShareError;
    }
    if (activeTrackRef.current) {
      // Already sharing — second click on Share is a no-op.
      // Same defensive precedent as B6's "click active layout
      // = no-op."
      return;
    }
    if (typeof navigator === "undefined") {
      throw "unknown" satisfies ScreenShareError;
    }
    const mediaDevices = navigator.mediaDevices as MediaDevices & {
      getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
    };
    if (!mediaDevices || typeof mediaDevices.getDisplayMedia !== "function") {
      // Should be impossible (the Share button is gated on
      // `isSupported`), but defensive — don't crash if a future
      // browser change pulls the API mid-session.
      throw "unknown" satisfies ScreenShareError;
    }

    setIsStarting(true);
    let stream: MediaStream | null = null;
    let twilioTrack: LocalVideoTrack | null = null;
    try {
      stream = await mediaDevices.getDisplayMedia({
        // `cursor: 'always'` keeps the cursor visible in the
        // capture so the doctor can point at the lab result
        // they're discussing. The W3C draft notes this is
        // a hint — Chrome respects it; Safari ignores.
        video: { cursor: "always" } as MediaTrackConstraints,
        audio: false,
      });
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length === 0) {
        throw "no-track" satisfies ScreenShareError;
      }
      // Wrap the raw MediaStreamTrack in a Twilio LocalVideoTrack
      // so it can be published. The `name: 'screen'` is the
      // contract with the remote side — `<VideoRoom>`'s
      // `wireRemoteVideoTrack` checks `track.name === 'screen'`
      // to route the screen track to the share tile vs. the
      // camera tile. Per task file Notes/Open decisions §4.
      twilioTrack = new LocalVideoTrack(videoTracks[0], { name: "screen" });

      // The user might have clicked away (Leave) during the
      // OS-picker await. Bail before publishing into a dead
      // room — same defensive guard as the quality-swap path
      // (`handleQualityChange` line ~1726).
      if (room.state !== "connected") {
        twilioTrack.stop();
        throw "no-room" satisfies ScreenShareError;
      }

      await room.localParticipant.publishTrack(twilioTrack);

      // Wire the OS-stop event. Twilio's `'stopped'` fires when
      // the underlying MediaStreamTrack ends — covers BOTH our
      // explicit stop() AND the browser's "Stop sharing"
      // notification at the viewport edge. The cleanup is
      // reentrancy-safe so the redundant fire from our own
      // stop() doesn't double-clean.
      twilioTrack.on("stopped", () => {
        cleanup(roomRef.current);
      });

      activeTrackRef.current = twilioTrack;
      setLocalScreenTrack(twilioTrack);
    } catch (err) {
      // Cleanup any partial state before propagating.
      if (twilioTrack) {
        try { twilioTrack.stop(); } catch { /* ignore */ }
      } else if (stream) {
        // Picker resolved but Twilio wrap failed — release the
        // raw OS handle.
        stream.getTracks().forEach((t) => {
          try { t.stop(); } catch { /* ignore */ }
        });
      }
      // Re-throw the error so the caller can map.
      const errorName =
        err && typeof err === "object" && "name" in err
          ? String((err as { name?: unknown }).name ?? "")
          : "";
      if (errorName === "NotAllowedError") {
        throw "permission-denied" satisfies ScreenShareError;
      }
      // If we already threw a typed error above, pass it through.
      if (typeof err === "string") {
        throw err;
      }
      throw "unknown" satisfies ScreenShareError;
    } finally {
      setIsStarting(false);
    }
  }, [options.room, cleanup]);

  const stop = useCallback(async (): Promise<void> => {
    cleanup(options.room);
  }, [options.room, cleanup]);

  return {
    isSupported,
    localScreenTrack,
    isStarting,
    start,
    stop,
  };
}
