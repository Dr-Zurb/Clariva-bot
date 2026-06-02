"use client";

import { type KeyboardEvent, type ReactNode, type Ref } from "react";
import { actorInitials, actorColor } from "@/lib/call/actor-avatar";

/**
 * Sub-batch A · task-video-A2 — generic video tile for `<VideoRoom>`.
 *
 * Renders a Twilio `<video>` element bound to a parent-owned ref AND a
 * "Camera off" placeholder overlay (avatar + label) that appears when
 * `cameraOff === true`. One component for both self and remote tiles —
 * the task draft calls this `<VideoSelfTile>` but ALSO asks for the
 * exact same placeholder on the remote side ("Same placeholder for
 * remote — the existing remote tile in `<VideoRoom>` should ALSO render
 * this avatar when the remote participant's video track reports
 * enabled === false"), so a generic name fits both surfaces. A6 (mirror
 * toggle) will pass `mirror={true}` through; this PR ships the prop
 * stub but leaves the transform off by default.
 *
 * Sub-batch A · task-video-A5 — when the optional `floating` prop is
 * provided, the tile renders as an absolute-positioned PiP overlay
 * (one of four corners) over its parent's `relative` container instead
 * of as an inline tile. The heading is suppressed (no headroom in a
 * 128×96 PiP), the camera-off + pending overlays are stretched to
 * `inset-0` (no heading offset to clear), and the top-left badge slot
 * is suppressed too (the call-duration chip belongs on the full-canvas
 * remote tile, not the floating self-view). When `onTap` is provided
 * the tile becomes a keyboard-focusable click target that the parent
 * uses to cycle the position; when `onTap` is omitted (e.g. read-only
 * mounts) the tile is non-interactive but still floats.
 *
 * Why parent-owned `videoRef`:
 *   - `<VideoRoom>` already does `videoTrack.attach(localVideoRef.current)`
 *     and `track.attach(remoteVideoRef.current)` from inside its Twilio
 *     `connectRoom` effect. Keeping the ref owned by the parent means
 *     this PR is a near-zero-risk swap for the existing inline
 *     `<video>` JSX — no track-attachment logic moves.
 *   - The `<video>` element MUST stay mounted across `cameraOff`
 *     transitions; otherwise we'd lose Twilio's attach binding and
 *     would need a re-attach effect on every toggle. Layering the
 *     placeholder as an `absolute inset-0` overlay keeps the element
 *     mounted and just hides it visually.
 *
 * No system-message emit yet — that's voice A7's `mute_changed` /
 * `camera_changed` infrastructure landing later. See task-video-A2's
 * implementation log for the deferral rationale.
 */
export interface VideoTileProps {
  /**
   * Parent-owned `<video>` ref. `<VideoRoom>` attaches Twilio tracks
   * here directly. Typed as the broader `Ref<HTMLVideoElement>` to
   * cover both `RefObject` (React 18 typing) and `RefObject<T | null>`
   * (React 19 typing) the parent's `useRef<HTMLVideoElement>(null)`
   * may produce — JSX accepts both shapes.
   */
  videoRef: Ref<HTMLVideoElement>;
  /** Tile heading rendered above the video ("You" / "Doctor" / "Patient"). */
  label: string;
  /**
   * Hide the video and show the avatar+label placeholder when true.
   *  - For the SELF tile: parent flips this on mic-button click via
   *    `LocalVideoTrack.disable()`.
   *  - For the REMOTE tile: parent flips this in response to
   *    `RemoteVideoTrack.on('disabled' | 'enabled')` events.
   */
  cameraOff: boolean;
  /**
   * Display name used to compute the avatar initials + background
   * color. Distinct from `label` because the label is a fixed UX
   * heading ("You") while the actor name varies ("Doctor" / "Patient" /
   * a real provider name once `doctor_settings.display_name` lands).
   */
  actorName: string;
  /**
   * Mute the local audio output of THIS `<video>` element to prevent
   * self-echo on the SELF tile (Twilio's RTC track handles peer audio
   * separately). Defaults `false` — set `true` only on the self tile.
   */
  muteSelf?: boolean;
  /**
   * A6 prop stub — when `true`, applies `transform: scaleX(-1)` to the
   * `<video>` element (mirror the self-view). Default `false`. A2 just
   * exposes the prop; A6 will wire the toggle button.
   */
  mirror?: boolean;
  /**
   * Optional one-line overlay rendered while the room/track is still
   * spinning up ("Starting camera…" on self, "Waiting for doctor…" on
   * remote). Hidden once the video is live OR the camera is off.
   */
  pendingText?: string | null;
  /**
   * Sub-batch A · task-video-A3 — optional badge anchored top-left of
   * the video area (below the heading). Renders on top of the video,
   * the camera-off placeholder, AND the pending overlay so it's visible
   * regardless of state. Used by `<VideoRoom>` for the call-duration
   * chip; B2 will reuse the same slot for the caller-card overlay.
   *
   * Suppressed in floating mode — the PiP is too small to host a chip.
   */
  topLeftBadge?: ReactNode;
  /**
   * Sub-batch A · task-video-A8 — symmetric to `topLeftBadge`. Anchored
   * to the top-right corner of the video area; used by `<VideoRoom>`
   * for the remote participant's network-quality bars. Stacks below
   * the absolute-positioned `<VideoRecordingIndicator>` (the indicator
   * sits at `right-3 top-3` on the parent container; this badge sits
   * inside the tile at `right-2 top-2` / `top-9` so the two slots
   * don't visually fight when both are mounted).
   *
   * Like `topLeftBadge`, this slot is suppressed in floating mode.
   */
  topRightBadge?: ReactNode;
  /**
   * Sub-batch A · task-video-A5 — when `true`, suppresses the inline
   * `<p>` heading and stretches the camera-off / pending overlays to
   * `inset-0` (no headroom to clear). Used by the full-canvas REMOTE
   * tile in the new PiP layout where the heading would visually
   * collide with the floating self-tile's TL/TR corner anchors.
   * Defaults `false` so existing inline mounts keep their headings.
   */
  hideLabel?: boolean;
  /**
   * Sub-batch A · task-video-A5 — when set, renders the tile as an
   * absolute-positioned PiP overlay over the parent's `relative`
   * container. Parent owns the position state (and persistence); this
   * component just renders the chosen corner and forwards click /
   * keyboard events to `onTap` for cycling. Omit `floating` entirely
   * for the regular inline-tile layout.
   */
  floating?: {
    position: SelfViewPosition;
    /** When omitted, the tile renders as a non-interactive overlay. */
    onTap?: () => void;
  };
}

/**
 * Sub-batch A · task-video-A5 — corner anchors for the floating self
 * tile. Exported so `<VideoRoom>` can type its persisted state and the
 * value-set guard in the localStorage restore path.
 */
export type SelfViewPosition = "TL" | "TR" | "BL" | "BR";

export const SELF_VIEW_POSITIONS: readonly SelfViewPosition[] = [
  "TL",
  "TR",
  "BL",
  "BR",
];

const FLOATING_POSITION_CLASSES: Record<SelfViewPosition, string> = {
  TL: "top-4 left-4",
  TR: "top-4 right-4",
  BL: "bottom-4 left-4",
  BR: "bottom-4 right-4",
};

// Sub-batch B · task-video-B2 — `actorInitials` + `actorColor` lifted
// to `frontend/lib/call/actor-avatar.ts` so `<CallerCardOverlay>` uses
// the same hash; otherwise the camera-off avatar and the caller-card
// avatar for the same actor would drift over time.

export default function VideoTile({
  videoRef,
  label,
  cameraOff,
  actorName,
  muteSelf = false,
  mirror = false,
  pendingText = null,
  topLeftBadge = null,
  topRightBadge = null,
  hideLabel = false,
  floating,
}: VideoTileProps) {
  const initials = actorInitials(actorName);
  const colorClass = actorColor(actorName);
  const isFloating = Boolean(floating);
  const onTap = floating?.onTap;
  const interactive = Boolean(onTap);
  // Floating mode never shows a heading; inline mode honors `hideLabel`.
  const showLabel = !isFloating && !hideLabel;

  // Sub-batch A · task-video-A5 — keyboard parity with the click target.
  // Pointer users tap; keyboard users hit Enter/Space on the focused tile.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onTap) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onTap();
    }
  };

  // Sub-batch A · task-video-A5 — outer container split:
  //   • Inline mode  → `relative` block with a heading + aspect-video tile.
  //   • Floating PiP → `absolute` overlay anchored to one of four corners
  //     of the parent's `relative` container. Sized w-32 h-24 (mobile,
  //     ~128×96) / md:w-44 md:h-32 (desktop, ~176×128) per A5 spec.
  //     Margin from the corner is the `top-4 / right-4 / bottom-4 /
  //     left-4` in the position class map (16 px). The transition runs
  //     on every position-class change so corner-cycles animate.
  //
  // Sub-batch F · task-video-F2 — landscape sizing override.
  //   In mobile landscape the viewport is short (≈360px tall) — the
  //   default 96px-tall PiP eats ~27% of the canvas. We trim to
  //   w-24 h-16 (≈96×64, ~18% width on a 540px-wide landscape
  //   canvas) using Tailwind's built-in `landscape:` variant. The
  //   `md:` desktop sizing is unaffected — landscape variants only
  //   override the base mobile sizes; once we're above the `md:`
  //   breakpoint (typical desktop), the desktop dimensions win.
  //   Spec asked for "18% width vs 25% in portrait" — fixed-px
  //   approximations land in the right ratio neighbourhood and
  //   match the rest of the tile sizing strategy.
  const containerClass = isFloating
    ? "absolute z-20 w-32 h-24 landscape:w-24 landscape:h-16 md:w-44 md:h-32 md:landscape:w-44 md:landscape:h-32 overflow-hidden rounded-lg border border-white/40 bg-gray-900 shadow-lg transition-all duration-200 ease-in-out " +
      FLOATING_POSITION_CLASSES[floating!.position] +
      (interactive
        ? " cursor-pointer hover:ring-2 hover:ring-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        : "")
    : "relative";

  // Inline tiles size the `<video>` themselves via aspect-video; floating
  // tiles let the container set the box and just fill it.
  const videoClass =
    (isFloating
      ? "h-full w-full object-cover "
      : "w-full rounded-lg border border-gray-200 bg-gray-900 aspect-video object-cover ") +
    (cameraOff ? "opacity-0 " : "") +
    (mirror ? "scale-x-[-1] " : "");

  // Overlays clear the heading (`top-7`) only when the heading is
  // present. Floating mode AND `hideLabel` modes both stretch to
  // `inset-0` so the overlay covers the entire tile.
  const overlayInsetClass = showLabel ? "inset-x-0 bottom-0 top-7" : "inset-0";

  // Avatar shrinks in PiP so the initials + label fit in 128×96.
  const avatarBoxClass = isFloating ? "h-10 w-10 text-sm" : "h-16 w-16 text-xl";
  const cameraOffLabelClass = isFloating ? "text-[10px]" : "text-sm";

  return (
    <div
      className={containerClass}
      onClick={onTap}
      onKeyDown={handleKeyDown}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? "Move self-view to next corner" : undefined}
    >
      {showLabel ? (
        <p className="mb-2 text-sm font-medium text-gray-500">{label}</p>
      ) : null}
      {/*
       * IMPORTANT: never unmount this `<video>` based on `cameraOff` —
       * Twilio's `track.attach(...)` binding lives on this element.
       * Hide via opacity instead so the binding survives toggles.
       */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muteSelf}
        className={videoClass}
      />
      {cameraOff ? (
        <div
          className={
            "pointer-events-none absolute flex flex-col items-center justify-center gap-2 rounded-lg bg-gray-900 " +
            overlayInsetClass
          }
        >
          <div
            className={
              "flex items-center justify-center rounded-full font-semibold text-white shadow " +
              avatarBoxClass +
              " " +
              colorClass
            }
            aria-hidden
          >
            {initials}
          </div>
          <p className={"font-medium text-white " + cameraOffLabelClass}>
            Camera off
          </p>
        </div>
      ) : pendingText ? (
        <div
          className={
            "pointer-events-none absolute flex items-center justify-center rounded-lg bg-gray-900/80 " +
            overlayInsetClass
          }
        >
          <p className={"text-white " + (isFloating ? "text-[10px]" : "text-sm")}>
            {pendingText}
          </p>
        </div>
      ) : null}
      {/*
       * topLeftBadge layered last so it sits above the camera-off and
       * pending overlays. When the heading is shown (`showLabel`),
       * `top-9` (32+4 px) clears the heading + its `mb-2` margin; in
       * `hideLabel` / full-canvas mode the badge anchors flush to the
       * tile top (`top-2`). Suppressed in floating mode (PiP is too
       * small for a chip; the duration chip lives on the remote
       * full-canvas tile, not the self-view).
       */}
      {!isFloating && topLeftBadge ? (
        <div
          className={
            "pointer-events-none absolute left-2 z-10 " +
            (showLabel ? "top-9" : "top-2")
          }
        >
          {topLeftBadge}
        </div>
      ) : null}
      {/*
       * topRightBadge — symmetric to topLeftBadge. Used by `<VideoRoom>`
       * for the remote-side network bars. NOT `pointer-events-none` so
       * the bars' click target works (the badge body itself owns its
       * click + keyboard handlers); the layer DOES block clicks on the
       * underlying `<video>` in the small region the badge occupies,
       * which is fine — there's nothing interactive on the video.
       */}
      {!isFloating && topRightBadge ? (
        <div
          className={
            "absolute right-2 z-10 " + (showLabel ? "top-9" : "top-2")
          }
        >
          {topRightBadge}
        </div>
      ) : null}
    </div>
  );
}
