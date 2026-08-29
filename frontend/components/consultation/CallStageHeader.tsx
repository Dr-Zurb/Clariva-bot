"use client";

/**
 * Non-overlay call chrome for cockpit video — sits above the tile stage
 * so faces aren't covered by the translucent CallerCardOverlay band.
 * Matches light card / border tokens used by SOAP panes.
 */

import { Maximize2, Minimize2 } from "lucide-react";
import type { ReactNode } from "react";
import CallControlTooltip from "./CallControlTooltip";
import NetworkBars from "./NetworkBars";
import { useCallDuration } from "@/hooks/useCallDuration";
import { actorColor, actorInitials } from "@/lib/call/actor-avatar";
import {
  COCKPIT_STAGE_HEADER,
  COCKPIT_STAGE_HEADER_BTN,
} from "@/lib/call/cockpit-call-controls";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type CallStageHeaderStatus =
  | "live"
  | "hold"
  | "reconnecting"
  | "connecting";

export interface CallStageHeaderProps {
  counterpartyName: string;
  connectedAt: Date | null;
  remoteNetworkLevel: number | null;
  remoteStatsTooltip?: ReactNode;
  /** When set, replaces the built-in remote `<NetworkBars>`. */
  remoteNetworkBars?: ReactNode;
  status: CallStageHeaderStatus;
  recordingActive?: boolean;
  recordingPaused?: boolean;
  /**
   * @deprecated Fill-Consult expand was removed from the call chrome —
   * video already fills the Consult column; use cockpit layout focus
   * elsewhere if needed. Kept optional so older call sites typecheck.
   */
  onExpandFillTab?: () => void;
  /** Browser fullscreen on the video stage element. */
  onExpandFullscreen?: () => void;
  fillTabActive?: boolean;
  fullscreenActive?: boolean;
  onExitExpand?: () => void;
  className?: string;
}

export default function CallStageHeader({
  counterpartyName,
  connectedAt,
  remoteNetworkLevel,
  remoteStatsTooltip,
  remoteNetworkBars,
  status,
  recordingActive = false,
  recordingPaused = false,
  onExpandFullscreen,
  fillTabActive = false,
  fullscreenActive = false,
  onExitExpand,
  className,
}: CallStageHeaderProps) {
  const { formatted: duration } = useCallDuration(connectedAt);
  const initials = actorInitials(counterpartyName);
  const colorClass = actorColor(counterpartyName);
  const expanded = fillTabActive || fullscreenActive;

  const statusLabel =
    status === "connecting"
      ? "Connecting…"
      : status === "reconnecting"
        ? "Reconnecting…"
        : status === "hold"
          ? "On hold"
          : null;

  return (
    <TooltipProvider delayDuration={250}>
      <div
        data-testid="call-stage-header"
        className={cn(COCKPIT_STAGE_HEADER, className)}
      >
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white",
            colorClass,
          )}
          aria-hidden
        >
          {initials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="truncate text-sm font-medium text-foreground">
              {counterpartyName}
            </p>
            {statusLabel ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  status === "hold" || status === "reconnecting"
                    ? "bg-amber-100 text-amber-900"
                    : "bg-sky-100 text-sky-900",
                )}
              >
                {statusLabel}
              </span>
            ) : null}
            {recordingPaused ? (
              <CallControlTooltip label="Recording paused" side="bottom">
                <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                  Paused
                </span>
              </CallControlTooltip>
            ) : recordingActive ? (
              <CallControlTooltip label="Recording in progress" side="bottom">
                <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                  REC
                </span>
              </CallControlTooltip>
            ) : null}
          </div>
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {duration || "00:00"}
          </p>
        </div>

        <div className="flex h-7 items-center rounded-full px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          {remoteNetworkBars ?? (
            <NetworkBars
              level={remoteNetworkLevel}
              label={`${counterpartyName}'s connection`}
              caption="Patient"
              tooltip={remoteStatsTooltip}
            />
          )}
        </div>

        {expanded && onExitExpand ? (
          <CallControlTooltip label="Exit expand" side="bottom">
            <button
              type="button"
              onClick={onExitExpand}
              className={COCKPIT_STAGE_HEADER_BTN}
              aria-label="Exit expand"
            >
              <Minimize2 className="h-3.5 w-3.5" aria-hidden />
              Exit
            </button>
          </CallControlTooltip>
        ) : onExpandFullscreen ? (
          <CallControlTooltip label="Full screen" side="bottom">
            <button
              type="button"
              onClick={onExpandFullscreen}
              className={COCKPIT_STAGE_HEADER_BTN}
              aria-label="Full screen"
              data-testid="call-stage-expand"
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Full screen</span>
            </button>
          </CallControlTooltip>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
