/**
 * PaneShowHereButton — always-on icon to put another pane in this leaf slot
 * (p6 · CTF-D18 / D22). Durable swap / tab activate via caller `onSelect`.
 */

"use client";

import { ArrowLeftRight, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface CompanionOption {
  id: string;
  title: string;
}

export interface PaneShowHereButtonProps {
  /** Title of the pane currently filling this slot. */
  currentTitle: string;
  /** Panes that can fill this slot. */
  options: readonly CompanionOption[];
  /** Id to mark selected (active pane in this slot). */
  selectedId?: string | null;
  onSelect: (paneId: string) => void;
  className?: string;
}

export default function PaneShowHereButton({
  currentTitle,
  options,
  selectedId = null,
  onSelect,
  className,
}: PaneShowHereButtonProps) {
  const canPick = options.length >= 1;
  const triggerLabel = `Swap into this slot: ${currentTitle}`;
  const tooltip = canPick
    ? "Swap another pane into this slot"
    : `Only ${currentTitle} is available here`;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="pane-show-here-button"
              aria-label={triggerLabel}
              aria-haspopup="menu"
              disabled={!canPick}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground",
                "transition-colors hover:bg-accent hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:pointer-events-none disabled:opacity-50",
                className,
              )}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltip}</TooltipContent>
      </Tooltip>
      {canPick ? (
        <DropdownMenuContent align="end" className="min-w-[10rem]">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Swap into this slot
          </DropdownMenuLabel>
          {options.map((c) => {
            const selected = c.id === selectedId;
            return (
              <DropdownMenuItem
                key={c.id}
                data-testid={`pane-show-here-pick-${c.id}`}
                onSelect={() => onSelect(c.id)}
                className={cn(selected && "bg-accent")}
              >
                <span className="flex-1">{c.title}</span>
                {selected ? (
                  <Check className="h-3.5 w-3.5 opacity-70" aria-hidden />
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  );
}
