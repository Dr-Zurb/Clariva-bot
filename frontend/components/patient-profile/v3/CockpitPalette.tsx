"use client";

import { useCallback, useMemo } from "react";
import { LayoutGrid, RotateCcw } from "lucide-react";
import type { PaneDefinition } from "@/lib/patient-profile/v3/foundation";
import { assertFlatLeafRegistry } from "@/lib/patient-profile/v3/blankLayout";
import type { CockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
import { toastOnCapRejection } from "@/lib/patient-profile/v3/cockpit-cap-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface CockpitPaletteProps {
  panes: PaneDefinition[];
  layout: CockpitV3Layout;
  className?: string;
}

export default function CockpitPalette({
  panes,
  layout,
  className,
}: CockpitPaletteProps) {
  const paneById = useMemo(
    () => new Map(panes.map((p) => [p.id, p])),
    [panes],
  );

  const handleToggle = useCallback(
    (paneId: string) => {
      const hidden = layout.paneState[paneId]?.hidden ?? true;
      const result = hidden
        ? layout.addPane(paneId)
        : layout.removePane(paneId);
      toastOnCapRejection(result);
    },
    [layout],
  );

  if (panes.length === 0) return null;

  assertFlatLeafRegistry(panes);

  return (
    <TooltipProvider delayDuration={150}>
      <div
        role="toolbar"
        aria-label="Pane palette"
        data-testid="cockpit-v3-palette"
        className={cn(
          "flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border/60 bg-muted/30 px-2 py-1",
          className,
        )}
      >
        {panes.map((pane) => {
          const hidden = layout.paneState[pane.id]?.hidden ?? true;
          const Icon = pane.icon ?? LayoutGrid;
          const tooltipLabel = hidden
            ? `Add ${pane.title}`
            : `Remove ${pane.title}`;

          return (
            <Tooltip key={pane.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-palette-pane-id={pane.id}
                  data-palette-on-canvas={hidden ? "false" : "true"}
                  onClick={() => handleToggle(pane.id)}
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                    !hidden && "bg-primary/15 text-primary hover:bg-primary/25",
                    hidden &&
                      "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  aria-pressed={!hidden}
                  aria-label={tooltipLabel}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {tooltipLabel}
              </TooltipContent>
            </Tooltip>
          );
        })}
        <div className="mx-1 h-4 w-px bg-border/60" aria-hidden />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-testid="cockpit-v3-reset"
              onClick={() => layout.resetLayout()}
              aria-label="Reset to blank"
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
                "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              )}
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            Reset to blank
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
