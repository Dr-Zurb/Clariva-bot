"use client";

import type { ReactElement, ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Instant call-chrome tooltip. Prefer this over native `title=` so hover
 * help matches the rest of the cockpit and appears quickly.
 *
 * Owns its own TooltipProvider so call icons work outside a stage/dock
 * provider (e.g. NetworkBars on CallerCardOverlay).
 */
export default function CallControlTooltip({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
}): ReactNode {
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} className="z-[90]">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
