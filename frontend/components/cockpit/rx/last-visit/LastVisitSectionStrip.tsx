"use client";

import { cn } from "@/lib/utils";

export interface LastVisitStripAction {
  label: string;
  onClick: () => void;
  testId?: string;
  pressed?: boolean;
}

export interface LastVisitStripItem {
  key: string;
  label: string;
  applied?: boolean;
  actions?: LastVisitStripAction[];
}

export interface LastVisitSectionStripProps {
  visitDate: string;
  summary: string;
  items: LastVisitStripItem[];
  primaryAction?: {
    label: string;
    onClick: () => void;
    testId?: string;
  };
  undoAction?: {
    label?: string;
    onClick: () => void;
    testId?: string;
  };
  disabled?: boolean;
  testId?: string;
}

/**
 * Always-open last-visit reference strip (LVC-DL-1′ / LVC-DL-8).
 * Item actions are type=button and sit outside any capture-bar tab cycle (LVC-DL-7).
 */
export function LastVisitSectionStrip({
  visitDate,
  summary,
  items,
  primaryAction,
  undoAction,
  disabled = false,
  testId,
}: LastVisitSectionStripProps): JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <div
      className="mb-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-2 py-1.5"
      data-testid={testId}
    >
      <div className="flex items-center gap-2">
        <div
          className="min-w-0 flex-1 text-left text-[11px] text-muted-foreground"
          data-testid={testId ? `${testId}-header` : undefined}
        >
          Last visit ({visitDate}){summary ? ` · ${summary}` : ""}
        </div>
        {undoAction ? (
          <button
            type="button"
            className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            disabled={disabled}
            onClick={undoAction.onClick}
            data-testid={undoAction.testId}
          >
            {undoAction.label ?? "Undo"}
          </button>
        ) : null}
        {primaryAction ? (
          <button
            type="button"
            className="shrink-0 text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            disabled={disabled}
            onClick={primaryAction.onClick}
            data-testid={primaryAction.testId}
          >
            {primaryAction.label}
          </button>
        ) : null}
      </div>
      <ul
        className="mt-1.5 space-y-1"
        data-testid={testId ? `${testId}-items` : undefined}
      >
        {items.map((item) => (
          <li
            key={item.key}
            className="flex items-start justify-between gap-2"
            data-testid={testId ? `${testId}-item-${item.key}` : undefined}
          >
            <span
              className={cn(
                "min-w-0 flex-1 border-l-2 border-dashed border-muted-foreground/40 pl-2 text-[11px] text-muted-foreground",
                item.applied && "text-muted-foreground/70"
              )}
            >
              {item.label}
            </span>
            {item.actions && item.actions.length > 0 && !disabled ? (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5">
                {item.actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] leading-tight",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                      action.pressed
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:underline"
                    )}
                    aria-pressed={action.pressed}
                    onClick={action.onClick}
                    data-testid={action.testId}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
