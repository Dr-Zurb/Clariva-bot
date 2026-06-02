"use client";

import React, { useEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { postDoctorSessionDelay } from "@/lib/api";
import { formatTimeShort } from "@/lib/format-date";
import { trackOpdQueueEvent, trackOpdSlotEvent } from "../opdQueueTelemetry";

const DELAY_QUICK_PICKS = [5, 10, 15, 30] as const;

export interface BroadcastDelayPopoverTarget {
  appointmentId: string;
  patientName: string;
  tokenNumber?: number | null;
  scheduledAt?: string;
  /** `queueStatus` (queue) or `slotStatus` (slot) — PHI-free telemetry only. */
  statusOfTargetRow: string;
}

export interface BroadcastDelayPopoverProps {
  token: string;
  /**
   * The appointment to attach the delay to. Resolver lives in the parent
   * (queue or slot toolbar). Pass `null` to disable the trigger with a
   * tooltip.
   */
  target: BroadcastDelayPopoverTarget | null;
  onSuccess: () => void;
  /**
   * Optional copy override for the popover header. Default is "Set running-late delay".
   * Slot mode may override to "Delay (next/current): …" for clarity.
   */
  headerLabel?: string;
  telemetryPrefix?: "opd_queue" | "opd_slot";
}

export function BroadcastDelayPopover({
  token,
  target,
  onSuccess,
  headerLabel = "Set running-late delay",
  telemetryPrefix = "opd_queue",
}: BroadcastDelayPopoverProps) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [activeDelayMinutes, setActiveDelayMinutes] = useState<number | null>(
    null
  );
  const [activeDelayApptId, setActiveDelayApptId] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (
      activeDelayApptId &&
      target?.appointmentId !== activeDelayApptId
    ) {
      setActiveDelayMinutes(null);
      setActiveDelayApptId(null);
    }
  }, [target?.appointmentId, activeDelayApptId]);

  const emitAction = (
    action: "broadcast_delay_set" | "broadcast_delay_cleared",
    outcome: "success" | "error"
  ) => {
    const base = {
      action,
      statusOfTargetRow: target?.statusOfTargetRow ?? null,
      outcome,
    } as const;
    if (telemetryPrefix === "opd_slot") {
      trackOpdSlotEvent({
        event: "opd_slot.action",
        kind: action,
        slotStatus: target?.statusOfTargetRow ?? null,
        entryId: target?.appointmentId,
        outcome,
      });
    } else {
      trackOpdQueueEvent({ event: "opd_queue.action", ...base });
    }
  };

  const handleApply = async (mins: number | null) => {
    if (!target) return;
    setBusy(true);
    setError(null);
    const action = mins === null ? "broadcast_delay_cleared" : "broadcast_delay_set";
    try {
      await postDoctorSessionDelay(token, target.appointmentId, mins);
      emitAction(action, "success");
      if (mins === null) {
        setActiveDelayMinutes(null);
        setActiveDelayApptId(null);
      } else {
        setActiveDelayMinutes(mins);
        setActiveDelayApptId(target.appointmentId);
      }
      setOpen(false);
      onSuccess();
    } catch (err) {
      emitAction(action, "error");
      setError(err instanceof Error ? err.message : "Failed to apply delay");
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => handleApply(null);

  const handleCustomApply = () => {
    const parsed = parseInt(minutes, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setError("Enter a valid number of minutes (≥ 1).");
      return;
    }
    void handleApply(parsed);
  };

  const isActive = activeDelayMinutes !== null;

  const appliesSuffix =
    target && target.tokenNumber != null
      ? ` (token #${target.tokenNumber})`
      : target?.scheduledAt
        ? ` (${formatTimeShort(target.scheduledAt)})`
        : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 text-xs",
            isActive &&
              "border-amber-500/60 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-400/50 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
          )}
          aria-label={
            isActive
              ? `Broadcast delay active — ${activeDelayMinutes} minutes`
              : "Broadcast delay"
          }
        >
          <Radio className="h-3.5 w-3.5" />
          {isActive ? `Delay ${activeDelayMinutes}m` : "Broadcast delay"}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64"
        align="start"
        role="dialog"
        aria-label="Broadcast delay"
      >
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium leading-none">{headerLabel}</p>
            {target ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Applies to:{" "}
                <span className="font-medium">{target.patientName}</span>
                {appliesSuffix}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                No active consultation or waiting patient.
              </p>
            )}
            {isActive && (
              <p
                className={cn(
                  "mt-2 rounded-md border border-amber-500/40 bg-amber-50 px-2 py-1 text-xs text-amber-900",
                  "dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-200"
                )}
                role="status"
              >
                Active delay: {activeDelayMinutes} min — patients see the
                running-late banner.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {DELAY_QUICK_PICKS.map((mins) => (
              <button
                key={mins}
                disabled={!target || busy}
                onClick={() => void handleApply(mins)}
                className={cn(
                  "rounded border border-input bg-background px-2 py-1 text-xs font-medium",
                  "hover:bg-accent hover:text-accent-foreground",
                  "disabled:pointer-events-none disabled:opacity-50"
                )}
              >
                {mins} min
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="number"
              min={1}
              placeholder="Custom…"
              value={minutes}
              onChange={(e) => {
                setMinutes(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCustomApply();
              }}
              disabled={!target || busy}
              className={cn(
                "flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm",
                "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            />
            <Button
              size="sm"
              className="h-8 shrink-0"
              disabled={!target || busy}
              onClick={handleCustomApply}
            >
              Apply
            </Button>
          </div>

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-7 self-start text-xs text-muted-foreground"
            disabled={!target || busy}
            onClick={handleClear}
          >
            Clear delay
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
