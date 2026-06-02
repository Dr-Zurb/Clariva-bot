"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { OpdSessionDayMode } from "@/types/opd-session";
import { SessionModeConversionDialog } from "../SessionModeConversionDialog";

export interface OpdSessionModePillDropdownProps {
  token: string;
  date: string;
  mode: OpdSessionDayMode;
  modeChangeCount: number;
  isPastDate: boolean;
  onConverted: () => void;
}

function modeLabel(mode: OpdSessionDayMode): string {
  return mode === "slot" ? "Slot" : "Queue";
}

const pillClassName =
  "inline-flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground";

export function OpdSessionModePillDropdown({
  token,
  date,
  mode,
  modeChangeCount,
  isPastDate,
  onConverted,
}: OpdSessionModePillDropdownProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetMode, setTargetMode] = useState<OpdSessionDayMode | null>(null);

  if (isPastDate) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <span
                className={cn(pillClassName, "cursor-not-allowed opacity-60")}
                aria-disabled="true"
              >
                {modeLabel(mode)}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent>Past dates can&apos;t be reconfigured.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const handleSelectMode = (target: OpdSessionDayMode) => {
    if (target === mode) return;
    setTargetMode(target);
    setDialogOpen(true);
  };

  const showDl14Nudge = modeChangeCount >= 2;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              pillClassName,
              "cursor-pointer hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            )}
            aria-label={`${modeLabel(mode)} mode — switch day mode`}
          >
            {modeLabel(mode)}
            <ChevronDown className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Switch this day to…</DropdownMenuLabel>
          {showDl14Nudge && (
            <>
              <div
                role="alert"
                className="mx-1 mb-1 mt-0.5 flex items-start gap-1.5 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs dark:border-amber-700 dark:bg-amber-950/30"
              >
                <AlertCircle
                  className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden
                />
                <span>
                  You&apos;ve changed this day&apos;s mode {modeChangeCount}{" "}
                  {modeChangeCount === 1 ? "time" : "times"} already — patients
                  have been re-notified each time.
                </span>
              </div>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            disabled={mode === "slot"}
            onSelect={() => handleSelectMode("slot")}
          >
            {mode === "slot" ? "✓ Slot mode (current)" : "Slot mode"}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={mode === "queue"}
            onSelect={() => handleSelectMode("queue")}
          >
            {mode === "queue" ? "✓ Queue mode (current)" : "Queue mode"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {targetMode && (
        <SessionModeConversionDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setTargetMode(null);
          }}
          token={token}
          date={date}
          fromMode={mode}
          toMode={targetMode}
          modeChangeCount={modeChangeCount}
          source="opd_tab"
          onConfirmed={() => {
            setDialogOpen(false);
            setTargetMode(null);
            onConverted();
          }}
        />
      )}
    </>
  );
}
