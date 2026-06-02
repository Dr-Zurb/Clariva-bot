import React from "react";
import { cn } from "@/lib/utils";

export interface PaneHeaderProps {
  /** Title text shown at the left of the header. Required. */
  title: string;
  /** Optional ARIA id for the title — useful when callers want to label the column body. */
  titleId?: string;
  /** Right-aligned actions (e.g. collapse chevron, drag handle). Optional. */
  actions?: React.ReactNode;
  /**
   * Drag handle slot rendered to the LEFT of the title. Optional. cc-07
   * fills this with a `<DragHandle>` button; today it stays empty so the
   * cc-02 / cc-03 ship doesn't introduce drag affordance prematurely.
   */
  dragHandle?: React.ReactNode;
  /** Optional sub-header line, e.g. "Last visit 12 Mar". */
  subtitle?: React.ReactNode;
  /** Sets `data-cockpit-pane-id` on the root header (shell drag-reorder). */
  paneId?: string;
  /** Extra class hook for the outer wrapper. */
  className?: string;
}

/**
 * Shared column-header strip rendered at the top of every cockpit
 * column / pane on lg+. Hosts the column title, the (future) drag handle
 * for reorder (cc-07), column-specific actions like the collapse
 * chevron, and an optional subtitle line (cpv-05).
 *
 * Unified DL-5 treatment:
 * `border-b border-border bg-card text-sm font-semibold px-3 py-2`
 */
export default function PaneHeader({
  title,
  titleId,
  actions,
  dragHandle,
  subtitle,
  paneId,
  className,
}: PaneHeaderProps) {
  return (
    <header
      data-cockpit-pane-id={paneId}
      className={cn(
        "flex shrink-0 flex-col border-b border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {dragHandle}
          <h3
            id={titleId}
            className="truncate text-sm font-semibold text-foreground"
          >
            {title}
          </h3>
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        ) : null}
      </div>
      {subtitle ? (
        <div className="px-3 pb-1.5 text-xs text-muted-foreground">{subtitle}</div>
      ) : null}
    </header>
  );
}
