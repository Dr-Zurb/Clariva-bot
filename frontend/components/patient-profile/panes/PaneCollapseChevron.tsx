"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PaneCollapseChevronProps {
  paneTitle: string;
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}

export function PaneCollapseChevron({
  paneTitle,
  collapsed,
  onToggle,
  className,
}: PaneCollapseChevronProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? `Expand ${paneTitle}` : `Collapse ${paneTitle}`}
      aria-expanded={!collapsed}
      className={cn(
        "rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {collapsed ? (
        <ChevronUp className="h-4 w-4" aria-hidden />
      ) : (
        <ChevronDown className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}
