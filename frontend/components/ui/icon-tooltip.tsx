"use client";

import type { ReactElement, ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Fast show — native `title` waits ~1s and cannot be styled. */
export const ICON_TOOLTIP_DELAY_MS = 150;

/** One provider per icon cluster so adjacent hovers feel instant. */
export function IconTooltipGroup({
  children,
  delayDuration = ICON_TOOLTIP_DELAY_MS,
}: {
  children: ReactNode;
  delayDuration?: number;
}) {
  return (
    <TooltipProvider delayDuration={delayDuration} skipDelayDuration={0}>
      {children}
    </TooltipProvider>
  );
}

export function IconTooltip({
  label,
  side = "top",
  children,
}: {
  label: string;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={6} className="max-w-[14rem] text-center">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
