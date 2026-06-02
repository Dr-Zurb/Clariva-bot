"use client";

import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Field label with optional info icon and tooltip.
 * Composes shadcn Label + Tooltip primitives.
 */
export function FieldLabel({
  htmlFor,
  children,
  tooltip,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  tooltip?: string;
}) {
  if (!tooltip) {
    return (
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {children}
      </Label>
    );
  }

  return (
    <Label htmlFor={htmlFor} className="flex items-center gap-1.5 text-sm font-medium">
      {children}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              tabIndex={0}
              aria-label={tooltip}
            >
              <Info className="h-3 w-3" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </Label>
  );
}
