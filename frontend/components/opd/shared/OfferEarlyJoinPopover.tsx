"use client";

import React, { useState } from "react";
import { UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { postDoctorOfferEarlyJoin } from "@/lib/api";
import { formatTimeShort } from "@/lib/format-date";
import { trackOpdQueueEvent, trackOpdSlotEvent } from "../opdQueueTelemetry";

export interface OfferEarlyJoinPopoverTarget {
  appointmentId: string;
  patientName: string;
  tokenNumber?: number | null;
  scheduledAt?: string;
  statusOfTargetRow: string;
}

export interface OfferEarlyJoinPopoverProps {
  token: string;
  target: OfferEarlyJoinPopoverTarget | null;
  onSuccess: () => void;
  /** Disabled-state tooltip copy. Default: "No eligible upcoming patient to invite." */
  disabledTooltip?: string;
  telemetryPrefix?: "opd_queue" | "opd_slot";
}

export function OfferEarlyJoinPopover({
  token,
  target,
  onSuccess,
  disabledTooltip = "No eligible upcoming patient to invite.",
  telemetryPrefix = "opd_queue",
}: OfferEarlyJoinPopoverProps) {
  const [open, setOpen] = useState(false);
  const [expiresIn, setExpiresIn] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!target) return;
    const mins = parseInt(expiresIn, 10);
    if (!Number.isFinite(mins) || mins < 1) {
      setError("Enter a valid expiry in minutes (≥ 1).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postDoctorOfferEarlyJoin(token, target.appointmentId, {
        expiresInMinutes: mins,
      });
      if (telemetryPrefix === "opd_slot") {
        trackOpdSlotEvent({
          event: "opd_slot.action",
          kind: "offer_early_join_sent",
          slotStatus: target.statusOfTargetRow,
          entryId: target.appointmentId,
          outcome: "success",
        });
      } else {
        trackOpdQueueEvent({
          event: "opd_queue.action",
          action: "offer_early_join_sent",
          statusOfTargetRow: target.statusOfTargetRow,
          outcome: "success",
        });
      }
      setOpen(false);
      onSuccess();
    } catch (err) {
      if (telemetryPrefix === "opd_slot") {
        trackOpdSlotEvent({
          event: "opd_slot.action",
          kind: "offer_early_join_sent",
          slotStatus: target.statusOfTargetRow,
          entryId: target.appointmentId,
          outcome: "error",
        });
      } else {
        trackOpdQueueEvent({
          event: "opd_queue.action",
          action: "offer_early_join_sent",
          statusOfTargetRow: target.statusOfTargetRow,
          outcome: "error",
        });
      }
      setError(
        err instanceof Error ? err.message : "Failed to send early join invite"
      );
    } finally {
      setBusy(false);
    }
  };

  const disabled = target === null;

  const toSuffix =
    target && target.tokenNumber != null
      ? ` (token #${target.tokenNumber})`
      : target?.scheduledAt
        ? ` (${formatTimeShort(target.scheduledAt)})`
        : "";

  const trigger = (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 text-xs"
      aria-label="Offer early join"
      disabled={disabled}
    >
      <UserCheck className="h-3.5 w-3.5" />
      Offer early join
    </Button>
  );

  return (
    <TooltipProvider>
      <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
        {disabled ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">{trigger}</span>
            </TooltipTrigger>
            <TooltipContent>{disabledTooltip}</TooltipContent>
          </Tooltip>
        ) : (
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        )}

        <PopoverContent
          className="w-72"
          align="start"
          role="dialog"
          aria-label="Offer early join"
        >
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-medium leading-none">
                Offer early join
              </p>
              {target && (
                <p className="mt-1 text-xs text-muted-foreground">
                  To:{" "}
                  <span className="font-medium">{target.patientName}</span>
                  {toSuffix}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                Expires in (minutes)
              </label>
              <input
                type="number"
                min={1}
                value={expiresIn}
                onChange={(e) => {
                  setExpiresIn(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSend();
                }}
                disabled={busy}
                className={cn(
                  "flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm",
                  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              />
            </div>

            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button
              size="sm"
              className="h-8"
              disabled={busy}
              onClick={() => void handleSend()}
            >
              {busy ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
