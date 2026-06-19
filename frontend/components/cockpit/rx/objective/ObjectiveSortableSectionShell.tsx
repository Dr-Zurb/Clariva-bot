"use client";

import type { DragEvent, HTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { GripVertical } from "lucide-react";
import type {
  ObjectiveSectionId,
  SectionDropIntent,
} from "@/lib/cockpit/objective-section-order";
import { cn } from "@/lib/utils";

const DRAG_HANDLE_CLASS =
  "flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground/50 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary active:cursor-grabbing";

export interface ObjectiveSectionDragHandleProps {
  dragHandleProps: HTMLAttributes<HTMLDivElement>;
  ariaLabel: string;
  disabled?: boolean;
  index: number;
  count: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/** Six-dot reorder grip rendered inside `CollapsibleContainer.leadingActions`. */
export function ObjectiveSectionDragHandle({
  dragHandleProps,
  ariaLabel,
  disabled = false,
  index,
  count,
  onMoveUp,
  onMoveDown,
}: ObjectiveSectionDragHandleProps) {
  return (
    <div
      {...dragHandleProps}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-testid="objective-section-drag-handle"
      className={cn(DRAG_HANDLE_CLASS, disabled && "cursor-not-allowed opacity-40")}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (disabled) return;
        if (e.key === "ArrowUp" && index > 0) {
          e.preventDefault();
          e.stopPropagation();
          onMoveUp();
        } else if (e.key === "ArrowDown" && index < count - 1) {
          e.preventDefault();
          e.stopPropagation();
          onMoveDown();
        }
      }}
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </div>
  );
}

export interface ObjectiveSortableSectionShellProps {
  sectionId: ObjectiveSectionId;
  disabled?: boolean;
  children: ReactNode;
  dropIntent?: SectionDropIntent | null;
  isDropTarget?: boolean;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}

/**
 * Drop-target wrapper for one objective section block. Mirrors the shipped
 * subjective `SortableSectionShell` (drop indicators + stable id) but emits
 * `data-objective-section-id` and is typed to `ObjectiveSectionId`. The reorder
 * grip itself is passed by the caller into `CollapsibleContainer.leadingActions`.
 */
export function ObjectiveSortableSectionShell({
  sectionId,
  disabled = false,
  children,
  dropIntent = null,
  isDropTarget = false,
  onDragOver,
  onDragLeave,
  onDrop,
}: ObjectiveSortableSectionShellProps) {
  return (
    <div
      className="relative"
      data-objective-section-id={sectionId}
      onDragOver={disabled ? undefined : onDragOver}
      onDragLeave={disabled ? undefined : onDragLeave}
      onDrop={disabled ? undefined : onDrop}
    >
      {isDropTarget && dropIntent === "before" ? (
        <div
          className="pointer-events-none absolute -top-1 left-0 right-0 z-10 h-0.5 rounded-full bg-primary"
          aria-hidden
        />
      ) : null}

      {children}

      {isDropTarget && dropIntent === "after" ? (
        <div
          className="pointer-events-none absolute -bottom-1 left-0 right-0 z-10 h-0.5 rounded-full bg-primary"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
