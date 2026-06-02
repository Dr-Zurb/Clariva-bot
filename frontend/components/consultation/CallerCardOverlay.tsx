"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import NetworkBars from "./NetworkBars";
import { useCallDuration } from "@/hooks/useCallDuration";
import { actorColor, actorInitials } from "@/lib/call/actor-avatar";

/**
 * Sub-batch B · task-video-B2 — translucent caller-card overlay that
 * sits over the top of the remote video tile.
 *
 * Replaces the disparate `topLeftBadge` (duration chip) and
 * `topRightBadge` (network bars) mounts the remote `<VideoTile>` was
 * carrying. Consolidates:
 *
 *   - Counterparty avatar (initials hash; same color as the camera-off
 *     placeholder via the shared `actor-avatar.ts` helpers).
 *   - Counterparty name + role.
 *   - Call duration (consumes A3's `useCallDuration` hook directly).
 *   - Counterparty network-quality bars (parent passes the level + the
 *     rich tooltip body — keeps this component pure and lets `<VideoRoom>`
 *     stay the single owner of the network-quality + stats subscriptions).
 *   - Right-edge slot reserved for B10's recording-status pill (today
 *     a tiny inline indicator when `recordingStatus !== 'idle'`; B10
 *     will replace with the proper pill primitive).
 *
 * Auto-hide behavior (Meet / FaceTime / Zoom convention):
 *   - Card fades to ~30% opacity after 5s of no pointer activity.
 *   - Pointer-move OR pointer-down on the parent tile reveals it
 *     (and resets the 5s timer).
 *   - Does NOT fully hide — the card stays at low opacity so the
 *     status / recording / hold banners remain glanceable.
 *
 * Status banner (small inline pill at the top of the card):
 *   `connecting`  → blue pulse + "Connecting…"
 *   `reconnecting`→ amber pulse + "Reconnecting…"
 *   `hold`        → amber static + "On hold"
 *   `live`        → no banner
 *
 * Z-index: the card mounts at `z-[15]` so the floating self-tile
 * (`z-20` from `<VideoTile>` floating mode) renders ABOVE it. This
 * matches the spec's "overlay sits above remote video but below
 * `<VideoSelfTile>`" requirement — when the user has the self-tile
 * pinned to the TR/TL corner, it overlaps the card and stays
 * clickable.
 */

export type CallerCardStatus = "live" | "hold" | "reconnecting" | "connecting";
export type CallerCardRecording = "idle" | "recording" | "paused";

export interface CallerCardCounterparty {
  /** Display name (today often the same as `role` until real names land). */
  name: string;
  /** "Doctor" / "Patient" / specialty. Suppressed when name === role to avoid duplication. */
  role: string;
  /** Future hookup — `doctor_settings.avatar_url` or similar. Falls back to initials when omitted. */
  avatarUrl?: string;
  /** Practice / clinic name; rendered in the (deferred) expand slot. */
  practiceName?: string;
}

export interface CallerCardOverlayProps {
  counterparty: CallerCardCounterparty;
  /** When the call connected — passed straight into `useCallDuration`. */
  connectedAt: Date | null;
  /** Counterparty's network-quality level (Twilio scale 0-5). null = measuring. */
  remoteNetworkLevel: number | null;
  /** Stats popover body for the bars (parent owns; usually built from `useVideoCallStats`). */
  remoteStatsTooltip?: ReactNode;
  /**
   * Lifecycle status. Drives the small status banner at the top of the
   * card. Today only `'live'` and `'connecting'` fire from `<VideoRoom>`;
   * `'hold'` and `'reconnecting'` are wired by B3 / B4 when they land.
   */
  status: CallerCardStatus;
  /**
   * Recording state. Renders the right-edge pill when !== 'idle'.
   * Sub-batch B · task-video-B10 — the pill is now the SECOND surface
   * for the existing `<VideoRecordingIndicator>` (the corner light is
   * the primary; this pill is the patient-facing "wait, are we being
   * recorded?" reassurance). Per Note #3 in the B10 task, the corner
   * indicator stays — they don't compete because each pulls from the
   * same upstream state.
   */
  recordingStatus?: CallerCardRecording;
  /**
   * Sub-batch B · task-video-B10 — explanatory text shown as a hover
   * tooltip on the recording pill. The card itself stays dumb about
   * audio-vs-video recording; `<VideoRoom>` derives the right copy
   * (e.g. "Audio + video is being recorded …") and passes it in.
   * Falls back to a generic recording / paused message when omitted.
   */
  recordingTooltip?: string;
  /**
   * Hide-control opt-out. When true, the card stays at full opacity
   * forever (no auto-hide). Useful for `mode='readonly'` history-viewer
   * mounts where there's no live interaction to gate visibility on.
   */
  alwaysVisible?: boolean;
  /** Optional override of the default 5s hide delay. */
  hideDelayMs?: number;
}

const DEFAULT_HIDE_DELAY_MS = 5000;

export default function CallerCardOverlay({
  counterparty,
  connectedAt,
  remoteNetworkLevel,
  remoteStatsTooltip,
  status,
  recordingStatus = "idle",
  recordingTooltip,
  alwaysVisible = false,
  hideDelayMs = DEFAULT_HIDE_DELAY_MS,
}: CallerCardOverlayProps) {
  const { formatted: durationLabel } = useCallDuration(connectedAt);

  // Visibility is binary (full / dimmed); the dimmed state is ~30%
  // opacity so banners stay glanceable. Spec called for full-hide
  // ("fades out") but that defeats the purpose of the status banners
  // — a doctor watching for the "On hold" indicator can't see it
  // when the card is fully gone. Documented as a deviation in the
  // task file.
  const [visible, setVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const armHideTimer = useCallback(() => {
    if (alwaysVisible) return;
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
    }, hideDelayMs);
  }, [alwaysVisible, clearHideTimer, hideDelayMs]);

  const reveal = useCallback(() => {
    setVisible(true);
    armHideTimer();
  }, [armHideTimer]);

  // Bind pointer + touch listeners to the PARENT element (the relative
  // wrapper that hosts the remote tile). Querying via ref-then-parent
  // means the parent doesn't have to thread an interaction-target prop
  // through. Re-bind on alwaysVisible change (when toggled on we tear
  // down the listeners).
  useEffect(() => {
    if (alwaysVisible) {
      setVisible(true);
      return;
    }
    const node = containerRef.current?.parentElement;
    if (!node) return;

    const handlePointerActivity = () => {
      reveal();
    };

    node.addEventListener("pointermove", handlePointerActivity);
    node.addEventListener("pointerdown", handlePointerActivity);
    node.addEventListener("touchstart", handlePointerActivity, { passive: true });

    // Arm the initial timer so the card auto-dims even if the user
    // never interacts with the tile after mount.
    armHideTimer();

    return () => {
      node.removeEventListener("pointermove", handlePointerActivity);
      node.removeEventListener("pointerdown", handlePointerActivity);
      node.removeEventListener("touchstart", handlePointerActivity);
      clearHideTimer();
    };
  }, [alwaysVisible, armHideTimer, clearHideTimer, reveal]);

  // Reveal on status changes — when the call transitions to
  // reconnecting / hold / connecting, the user wants to SEE the
  // banner immediately, not wait for a pointer move.
  useEffect(() => {
    if (status !== "live") {
      setVisible(true);
      armHideTimer();
    }
  }, [status, armHideTimer]);

  // Sub-batch B · task-video-B10 — also reveal on every recording
  // transition (idle → recording, recording → paused, paused →
  // recording, anything → idle). Recording state is the single
  // most anxiety-loaded signal in the call header; users should
  // never have to mouse-over to confirm it.
  useEffect(() => {
    setVisible(true);
    armHideTimer();
  }, [recordingStatus, armHideTimer]);

  const initials = actorInitials(counterparty.name);
  const colorClass = actorColor(counterparty.name);

  // De-dup: when the legacy "name === role" mount fires (today's
  // <VideoRoom> passes remoteLabel for both because real names
  // haven't landed), suppress the role row so we don't show
  // "Doctor / Doctor" stacked.
  const showRoleRow =
    counterparty.role && counterparty.role !== counterparty.name;

  const banner = renderStatusBanner(status);
  const recordingPill = renderRecordingPill(recordingStatus, recordingTooltip);

  return (
    <div
      ref={containerRef}
      data-testid="caller-card-overlay"
      data-visible={visible ? "true" : "false"}
      data-status={status}
      className={
        "absolute inset-x-2 top-2 z-[15] flex flex-col gap-1 rounded-lg " +
        "bg-gradient-to-b from-black/70 via-black/55 to-transparent " +
        "px-3 py-2 text-white shadow-lg backdrop-blur-sm " +
        "transition-opacity duration-300 " +
        (visible ? "opacity-100" : "opacity-30 hover:opacity-100")
      }
      // Prevent click-through on the card itself; the surrounding
      // (transparent) wrapper area still bubbles to the parent's
      // pointer listeners (which is how the reveal effect works).
      onMouseEnter={reveal}
      onFocus={reveal}
    >
      {banner ? (
        <div className="flex justify-center">{banner}</div>
      ) : null}
      <div className="flex items-center gap-3">
        <div className="flex shrink-0">
          {counterparty.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={counterparty.avatarUrl}
              alt=""
              className="h-9 w-9 rounded-full object-cover ring-2 ring-white/30"
            />
          ) : (
            <div
              className={
                "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ring-2 ring-white/30 " +
                colorClass
              }
              aria-hidden
            >
              {initials}
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-sm font-semibold leading-tight">
            {counterparty.name}
          </p>
          <div className="flex items-center gap-2 text-xs leading-tight text-white/80">
            {showRoleRow ? (
              <>
                <span className="truncate">{counterparty.role}</span>
                <span aria-hidden className="text-white/40">·</span>
              </>
            ) : null}
            {durationLabel ? (
              <span
                className="font-mono"
                aria-label={`Call duration ${durationLabel}`}
              >
                {durationLabel}
              </span>
            ) : (
              <span className="text-white/60">{statusFallbackLabel(status)}</span>
            )}
            {durationLabel ? (
              <span aria-hidden className="text-white/40">·</span>
            ) : null}
            <NetworkBars
              level={remoteNetworkLevel}
              label={`${counterparty.role || counterparty.name} network`}
              tooltip={remoteStatsTooltip}
            />
          </div>
        </div>
        {recordingPill ? (
          <div className="flex shrink-0 items-center">{recordingPill}</div>
        ) : null}
      </div>
    </div>
  );
}

function renderStatusBanner(status: CallerCardStatus): ReactNode {
  if (status === "live") return null;
  const palette = STATUS_BANNER_PALETTE[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium " +
        palette.className
      }
    >
      {palette.pulse ? (
        <span
          aria-hidden
          className={
            "inline-block h-1.5 w-1.5 rounded-full " +
            palette.dotClassName +
            " " +
            palette.pulseClassName
          }
        />
      ) : (
        <span
          aria-hidden
          className={
            "inline-block h-1.5 w-1.5 rounded-full " + palette.dotClassName
          }
        />
      )}
      {palette.label}
    </span>
  );
}

const STATUS_BANNER_PALETTE: Record<
  Exclude<CallerCardStatus, "live">,
  {
    label: string;
    className: string;
    dotClassName: string;
    pulseClassName: string;
    pulse: boolean;
  }
> = {
  connecting: {
    label: "Connecting…",
    className: "bg-blue-500/90 text-white",
    dotClassName: "bg-white",
    pulseClassName: "animate-pulse",
    pulse: true,
  },
  reconnecting: {
    label: "Reconnecting…",
    className: "bg-amber-500/90 text-white",
    dotClassName: "bg-white",
    pulseClassName: "animate-pulse",
    pulse: true,
  },
  hold: {
    label: "On hold",
    className: "bg-amber-600/90 text-white",
    dotClassName: "bg-white",
    pulseClassName: "",
    pulse: false,
  },
};

function statusFallbackLabel(status: CallerCardStatus): string {
  switch (status) {
    case "connecting":
      return "Joining…";
    case "reconnecting":
      return "Reconnecting…";
    case "hold":
      return "Paused";
    case "live":
    default:
      return "Live";
  }
}

function renderRecordingPill(
  status: CallerCardRecording,
  tooltip?: string,
): ReactNode {
  if (status === "idle") return null;
  // Sub-batch B · task-video-B10 — second visual surface for the
  // existing recording indicator. Per the B10 task Note #3, the
  // corner `<VideoRecordingIndicator>` STAYS — it owns the
  // `role="status" aria-live="polite"` announcement contract; this
  // pill is a sighted-user reinforcement that lives in the call
  // header where attention naturally lands. To avoid double SR
  // announcements we deliberately omit the `role="status"` /
  // `aria-live` here and rely on the `aria-label` for discovery
  // when an SR user lands on the card.
  const isRecording = status === "recording";
  const fallbackTooltip = isRecording
    ? "Audio is being recorded for the clinical record."
    : "Recording is paused. [More]";
  const titleText = tooltip ?? fallbackTooltip;
  const ariaLabel = isRecording ? "Recording" : "Recording paused";
  return (
    <span
      title={titleText}
      aria-label={ariaLabel}
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium " +
        (isRecording ? "bg-red-600/90 text-white" : "bg-amber-500/90 text-white")
      }
      data-testid="caller-card-recording-pill"
      data-recording-status={status}
    >
      <span
        aria-hidden
        className={
          "inline-block h-1.5 w-1.5 rounded-full bg-white " +
          (isRecording ? "animate-pulse" : "")
        }
      />
      {isRecording ? "Recording" : "Paused"}
    </span>
  );
}
