"use client";

import { type ReactNode } from "react";
import type { Room } from "twilio-video";
import NetworkBars from "./NetworkBars";
import { useCallDuration } from "@/hooks/useCallDuration";
import { useNetworkQuality } from "@/hooks/useNetworkQuality";
import { actorColor, actorInitials } from "@/lib/call/actor-avatar";

/**
 * Sub-batch A · task-voice-A8 — rich caller-card header for voice consults.
 * Single source-of-truth for counterparty identity, call duration, local
 * network quality, and lifecycle status. Replaces the minimal practice +
 * duration pill that `<VoiceConsultRoom>` used to render.
 *
 * Layout variants (three-host parity):
 *   - `standalone` — full-width sticky bar (mobile voice page).
 *   - `panel`      — compact horizontal bar (desktop with companion chat).
 *   - `canvas`     — centered card on the voice-only canvas overlay.
 */
export type CallerCardHeaderStatus =
  | "live"
  | "hold"
  | "reconnecting"
  | "connecting"
  | "ended";

export type CallerCardHeaderLayout = "standalone" | "panel" | "canvas";

export interface CallerCardCounterparty {
  name: string;
  role: "doctor" | "patient";
  avatarUrl?: string;
  practiceName?: string;
}

export interface CallerCardHeaderProps {
  counterparty: CallerCardCounterparty;
  connectedAt: Date | null;
  /** Twilio room — local network bars subscribe to `room.localParticipant`. */
  room: Room | null;
  status: CallerCardHeaderStatus;
  layout?: CallerCardHeaderLayout;
  /**
   * Plan 07 readonly — static duration label (e.g. `Duration: 12:34`).
   * When set, the live timer hook is not used and network bars are hidden.
   */
  staticDurationLabel?: string;
  /** Stats popover body; parent owns `useVideoCallStats` polling. */
  networkStatsTooltip?: ReactNode;
  onNetworkStatsOpenChange?: (open: boolean) => void;
  className?: string;
}

const ROLE_LABEL: Record<CallerCardCounterparty["role"], string> = {
  doctor: "Doctor",
  patient: "Patient",
};

export default function CallerCardHeader({
  counterparty,
  connectedAt,
  room,
  status,
  layout = "standalone",
  staticDurationLabel,
  networkStatsTooltip,
  onNetworkStatsOpenChange,
  className,
}: CallerCardHeaderProps) {
  const isEnded = status === "ended";
  const { formatted: liveDuration } = useCallDuration(
    isEnded || staticDurationLabel ? null : connectedAt,
  );
  const localNetwork = useNetworkQuality(
    isEnded ? null : room?.localParticipant ?? null,
  );

  const durationLabel = staticDurationLabel ?? liveDuration;
  const roleLabel = ROLE_LABEL[counterparty.role];
  const showPractice =
    counterparty.role === "doctor" &&
    Boolean(counterparty.practiceName?.trim());
  const initials = actorInitials(counterparty.name);
  const colorClass = actorColor(counterparty.name);

  const shellClass =
    layout === "canvas"
      ? "mx-auto w-full max-w-md rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-md backdrop-blur-sm"
      : layout === "panel"
        ? "border-b border-gray-200 bg-white px-3 py-2"
        : "sticky top-0 z-10 border-b border-gray-200 bg-white px-3 py-2.5 shadow-sm";

  return (
    <div
      data-testid="caller-card-header"
      data-layout={layout}
      data-status={status}
      className={[shellClass, className].filter(Boolean).join(" ")}
      aria-label="Call participant"
    >
      <div
        className={
          layout === "canvas"
            ? "flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left"
            : "flex items-center gap-3"
        }
      >
        <Avatar
          name={counterparty.name}
          avatarUrl={counterparty.avatarUrl}
          initials={initials}
          colorClass={colorClass}
          layout={layout}
        />
        <div
          className={
            "flex min-w-0 flex-1 flex-col " +
            (layout === "canvas" ? "items-center sm:items-start" : "")
          }
        >
          <p
            className={
              "truncate font-semibold text-gray-900 " +
              (layout === "canvas" ? "text-lg" : "text-base")
            }
          >
            {counterparty.name}
          </p>
          <p className="truncate text-xs text-gray-500">{roleLabel}</p>
          {showPractice ? (
            <p className="truncate text-[11px] text-gray-400">
              {counterparty.practiceName!.trim()}
            </p>
          ) : null}
        </div>
        <div
          className={
            "flex shrink-0 flex-col items-end gap-1 " +
            (layout === "canvas" ? "sm:items-end" : "")
          }
        >
          <StatusPill status={status} />
          {durationLabel ? (
            <span
              className="tabular-nums text-xs font-medium text-gray-700"
              aria-label={
                staticDurationLabel
                  ? durationLabel
                  : `Call duration ${durationLabel}`
              }
            >
              {staticDurationLabel ?? durationLabel}
            </span>
          ) : null}
          {!isEnded ? (
            <NetworkBars
              level={localNetwork.level}
              label="Your network"
              tooltip={networkStatsTooltip}
              onOpenChange={onNetworkStatsOpenChange}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Avatar({
  name,
  avatarUrl,
  initials,
  colorClass,
  layout,
}: {
  name: string;
  avatarUrl?: string;
  initials: string;
  colorClass: string;
  layout: CallerCardHeaderLayout;
}) {
  const sizeClass =
    layout === "canvas"
      ? "h-14 w-14 text-base"
      : "h-11 w-11 text-sm md:h-14 md:w-14 md:text-base";
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={
          "shrink-0 rounded-full object-cover ring-2 ring-gray-200 " + sizeClass
        }
      />
    );
  }
  return (
    <div
      aria-hidden
      className={
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-gray-200 " +
        sizeClass +
        " " +
        colorClass
      }
    >
      {initials}
    </div>
  );
}

function StatusPill({ status }: { status: CallerCardHeaderStatus }) {
  const config = STATUS_PILL[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={
        "inline-flex min-w-[5.5rem] items-center justify-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium " +
        config.className
      }
    >
      {config.pulse ? (
        <span
          aria-hidden
          className={
            "inline-block h-1.5 w-1.5 rounded-full bg-current " +
            config.pulseClassName
          }
        />
      ) : null}
      {config.label}
    </span>
  );
}

const STATUS_PILL: Record<
  CallerCardHeaderStatus,
  { label: string; className: string; pulse?: boolean; pulseClassName?: string }
> = {
  live: {
    label: "Live",
    className: "bg-emerald-100 text-emerald-800",
  },
  hold: {
    label: "On hold",
    className: "bg-amber-100 text-amber-900",
  },
  reconnecting: {
    label: "Reconnecting…",
    className: "bg-red-100 text-red-800",
    pulse: true,
    pulseClassName: "animate-pulse",
  },
  connecting: {
    label: "Connecting…",
    className: "bg-gray-100 text-gray-700",
    pulse: true,
    pulseClassName: "animate-pulse",
  },
  ended: {
    label: "Ended",
    className: "bg-gray-100 text-gray-600",
  },
};
