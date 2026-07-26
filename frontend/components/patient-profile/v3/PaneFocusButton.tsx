/**
 * PaneFocusButton — visual layout picker on the focused leaf (ctf-17 / CTF-D22).
 *
 * Idle → diagram menu: Full · ⅔ · ½ · ⅓.
 * Active → Restore + same diagrams.
 * Ratios are local share (siblings stay visible); Full hides others.
 * No free fraction chips (CTF-D1 / D15).
 */

"use client";

import { Check, Maximize2, Minimize2 } from "lucide-react";
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
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PaneSplitRatio } from "@/lib/patient-profile/v3/focus-leaf";
import LayoutRatioIcon from "./LayoutRatioIcon";

/** True when the Focus session targets this leaf (host id or a pane in it). */
export function isFocusTargetForLeaf(
  focusedLeafId: string | null | undefined,
  nodeId: string,
  paneIds: readonly string[],
): boolean {
  if (!focusedLeafId) return false;
  if (focusedLeafId === nodeId) return true;
  return paneIds.includes(focusedLeafId);
}

const RATIO_ITEMS: ReadonlyArray<{
  ratio: PaneSplitRatio;
  label: string;
  testId: string;
}> = [
  { ratio: "full", label: "Full", testId: "pane-focus-ratio-full" },
  { ratio: "wide", label: "⅔", testId: "pane-focus-ratio-wide" },
  { ratio: "even", label: "½", testId: "pane-focus-ratio-even" },
  { ratio: "narrow", label: "⅓", testId: "pane-focus-ratio-narrow" },
];

export interface PaneFocusButtonProps {
  /** Human title used in labels (e.g. "Plan"). */
  paneTitle: string;
  /** True when this leaf is the active session target. */
  pressed: boolean;
  /** Active session ratio when pressed. */
  ratio?: PaneSplitRatio | null;
  onSelectRatio: (ratio: PaneSplitRatio) => void;
  onRestore: () => void;
  className?: string;
}

function ratioItemLabel(paneTitle: string, ratio: PaneSplitRatio): string {
  if (ratio === "full") return `Full ${paneTitle}`;
  if (ratio === "wide") return `${paneTitle} ⅔`;
  if (ratio === "even") return `${paneTitle} ½`;
  return `${paneTitle} ⅓`;
}

export default function PaneFocusButton({
  paneTitle,
  pressed,
  ratio = null,
  onSelectRatio,
  onRestore,
  className,
}: PaneFocusButtonProps) {
  const triggerLabel = pressed
    ? `${paneTitle} layout session`
    : `${paneTitle} layout options`;
  const tooltip = pressed
    ? `Restore or change layout for ${paneTitle}`
    : `Layout options for ${paneTitle}`;
  const Icon = pressed ? Minimize2 : Maximize2;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="pane-focus-button"
              aria-label={triggerLabel}
              aria-haspopup="menu"
              aria-pressed={pressed}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground",
                "transition-colors hover:bg-accent hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                pressed && "bg-accent/80 text-foreground",
                className,
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltip}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-[11rem]">
        {pressed ? (
          <DropdownMenuItem
            data-testid="pane-focus-restore"
            onSelect={() => onRestore()}
          >
            <Minimize2 className="h-3.5 w-3.5" aria-hidden />
            Restore {paneTitle}
          </DropdownMenuItem>
        ) : null}
        {pressed ? <DropdownMenuSeparator /> : null}
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Layout
        </DropdownMenuLabel>
        {RATIO_ITEMS.map((item) => {
          const selected = pressed && ratio === item.ratio;
          const label = ratioItemLabel(paneTitle, item.ratio);
          return (
            <DropdownMenuItem
              key={item.ratio}
              data-testid={item.testId}
              aria-label={label}
              onSelect={() => onSelectRatio(item.ratio)}
              className={cn(selected && "bg-accent")}
            >
              <LayoutRatioIcon ratio={item.ratio} />
              <span className="flex-1">{item.label}</span>
              {selected ? (
                <Check className="h-3.5 w-3.5 opacity-70" aria-hidden />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
