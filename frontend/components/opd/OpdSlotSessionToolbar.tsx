"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Plus, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SlotSessionRow } from "@/types/opd-doctor";
import { BroadcastDelayPopover } from "./shared/BroadcastDelayPopover";
import { OfferEarlyJoinPopover } from "./shared/OfferEarlyJoinPopover";
import {
  resolveSlotDelayTarget,
  resolveSlotEarlyJoinTarget,
} from "./shared/opdToolbarResolvers";
import { OpdSessionModePillDropdown } from "./session-mode/OpdSessionModePillDropdown";

function timeAgo(ms: number | null): string {
  if (ms == null) return "—";
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export interface OpdSlotSessionToolbarProps {
  token: string;
  entries: SlotSessionRow[];
  lastUpdatedAt: number | null;
  onRefresh: () => void;
  onMutationSuccess: () => void;
  sessionDate: string;
  onChangeSessionDate: (next: string) => void;
  mode?: "slot";
  modeChangeCount?: number;
  isPastDate?: boolean;
  onModeConverted?: () => void;
  /** sl-06: "+ Add slot" in the left rail when provided. */
  onClickAddSlot?: () => void;
}

export function OpdSlotSessionToolbar({
  token,
  entries,
  lastUpdatedAt,
  onRefresh,
  onMutationSuccess,
  sessionDate,
  onChangeSessionDate,
  modeChangeCount = 0,
  isPastDate = false,
  onModeConverted,
  onClickAddSlot,
}: OpdSlotSessionToolbarProps): JSX.Element {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  const [refreshPending, setRefreshPending] = useState(false);

  const dateInputRef = useRef<HTMLInputElement>(null);
  const handleDateClick = () => {
    const el = dateInputRef.current;
    if (!el) return;
    try {
      const withPicker = el as HTMLInputElement & {
        showPicker?: () => void;
      };
      withPicker.showPicker?.();
    } catch {
      /* SecurityError in cross-origin frames */
    }
  };

  const handleRefresh = () => {
    setRefreshPending(true);
    onRefresh();
    setTimeout(() => setRefreshPending(false), 3_000);
  };

  const delayTarget = useMemo(
    () => resolveSlotDelayTarget(entries, Date.now()),
    [entries]
  );
  const earlyJoinTarget = useMemo(
    () => resolveSlotEarlyJoinTarget(entries),
    [entries]
  );

  return (
    <div
      className={cn(
        "flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-2",
        "rounded-md border border-border bg-background/80 px-3 py-1.5",
        "shadow-sm backdrop-blur"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={dateInputRef}
          type="date"
          value={sessionDate}
          onChange={(e) => onChangeSessionDate(e.target.value)}
          onClick={handleDateClick}
          aria-label="Session date"
          className={cn(
            "h-7 cursor-pointer rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          )}
        />
        <OpdSessionModePillDropdown
          token={token}
          date={sessionDate}
          mode="slot"
          modeChangeCount={modeChangeCount}
          isPastDate={isPastDate}
          onConverted={() => onModeConverted?.()}
        />
        <span className="hidden h-5 w-px bg-border md:inline-block" aria-hidden />
        <BroadcastDelayPopover
          token={token}
          target={
            delayTarget
              ? {
                  appointmentId: delayTarget.appointmentId,
                  patientName: delayTarget.patientName,
                  scheduledAt: delayTarget.scheduledAt,
                  statusOfTargetRow: delayTarget.slotStatus,
                }
              : null
          }
          onSuccess={onMutationSuccess}
          headerLabel="Delay (next/current)"
          telemetryPrefix="opd_slot"
        />
        <OfferEarlyJoinPopover
          token={token}
          target={
            earlyJoinTarget
              ? {
                  appointmentId: earlyJoinTarget.appointmentId,
                  patientName: earlyJoinTarget.patientName,
                  scheduledAt: earlyJoinTarget.scheduledAt,
                  statusOfTargetRow: earlyJoinTarget.slotStatus,
                }
              : null
          }
          onSuccess={onMutationSuccess}
          disabledTooltip="No upcoming patient whose preceding slot is completed. Early invite respects slot order."
          telemetryPrefix="opd_slot"
        />
        {onClickAddSlot && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onClickAddSlot}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add slot
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          Last updated {timeAgo(lastUpdatedAt)}
        </span>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Refresh slot session"
                disabled={refreshPending}
                onClick={handleRefresh}
              >
                <RefreshCcw
                  className={cn(
                    "h-3.5 w-3.5",
                    refreshPending && "animate-spin"
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh slot session</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
