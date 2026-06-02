"use client";

import { useEffect, useRef } from "react";
import type { LocalVideoTrack, RemoteVideoTrack } from "twilio-video";

/**
 * Sub-batch C · task-video-C5 — Generic screen-share tile.
 *
 * Renders a Twilio video track (local OR remote) inside a tile
 * sized to be the dominant element in the call canvas while
 * sharing is active. Layout displacement is owned by the parent
 * (`<VideoRoom>`); this component is dumb on purpose so it can
 * also be used in a hypothetical "screen-share preview" surface
 * (precall lobby v1.5, recording playback D2, etc.).
 *
 *   `videoTrack` — the Twilio track to attach. `null` is a
 *                  no-op, so the parent can mount/unmount the
 *                  same component as the active share changes
 *                  without rebuilding the JSX subtree.
 *   `variant`    — `'self'` adds a "Stop sharing" overlay
 *                  button (only the user sharing can stop).
 *                  `'remote'` shows a plain "Shared screen"
 *                  label so the user knows whose share they're
 *                  looking at.
 *   `label`      — caption (e.g. "Dr. Sharma's screen" / "Your
 *                  screen"). Optional; falls back to a generic
 *                  string per variant.
 *   `onStop`     — only used when `variant === 'self'`. Invoked
 *                  when the user clicks the "Stop sharing"
 *                  overlay button.
 *
 * The tile uses the same dark-frame + rounded-corner aesthetic
 * as the existing `<VideoTile>` (B6) so the visual transition
 * "camera tile → screen tile" is a "different content, same
 * frame" — minimal eye-jolt for the user when sharing starts.
 *
 * `<video playsInline autoPlay muted>` mirrors the convention
 * the rest of the codebase uses for self-tile attachments — the
 * `muted` is critical because some browsers (Chrome) refuse to
 * autoplay UNmuted media even for a same-origin local stream.
 * For a remote screen track it's still safe (no audio is on the
 * track per `getDisplayMedia({ audio: false })`).
 *
 * Twilio's `track.attach(videoEl)` / `track.detach(videoEl)`
 * is the supported way to wire a track into a `<video>` ref —
 * it sets `srcObject` AND wires the track lifecycle. We attach
 * on mount, detach on unmount, and re-attach when the
 * `videoTrack` ref-identity changes (track replaced after a
 * stop+restart).
 */

interface BaseProps {
  videoTrack: LocalVideoTrack | RemoteVideoTrack | null;
  label?: string;
}

interface SelfProps extends BaseProps {
  variant: "self";
  onStop: () => void;
}

interface RemoteProps extends BaseProps {
  variant: "remote";
  onStop?: never;
}

export type ScreenShareTileProps = SelfProps | RemoteProps;

export default function ScreenShareTile(props: ScreenShareTileProps) {
  const { videoTrack, variant, label } = props;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Attach + detach lifecycle. Re-runs when the track identity
  // changes (e.g. user stops + restarts share, getting a fresh
  // track). The cleanup detaches the OLD track before the
  // effect re-runs, so we don't leak Twilio bindings.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoTrack) return;
    videoTrack.attach(el);
    return () => {
      try {
        videoTrack.detach(el);
      } catch {
        // ignore — track may already be detached / stopped.
      }
    };
  }, [videoTrack]);

  const fallbackLabel =
    variant === "self" ? "Your screen" : "Shared screen";
  const displayLabel = label ?? fallbackLabel;

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-black">
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="block h-full w-full object-contain"
      />
      {/*
       * Bottom-left label pill — same convention as `<VideoTile>`'s
       * participant labels. `pointer-events-none` so it doesn't
       * intercept clicks on the underlying tile (e.g. for a
       * future "click to fullscreen" surface).
       */}
      <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white">
        {displayLabel}
      </span>
      {/*
       * Self-only "Stop sharing" overlay. Always visible (not
       * hover-gated) on this tile because it's a destructive
       * action the user needs to find quickly when sharing
       * something private accidentally — same precedent as
       * the End-call button being always visible (A4).
       */}
      {variant === "self" ? (
        <button
          type="button"
          onClick={props.onStop}
          className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-black"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
            <line x1="4" y1="4" x2="20" y2="20" />
          </svg>
          <span>Stop sharing</span>
        </button>
      ) : null}
    </div>
  );
}
