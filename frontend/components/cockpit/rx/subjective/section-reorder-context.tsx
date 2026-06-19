"use client";

import {
  createContext,
  useContext,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { GripVertical } from "lucide-react";
import type { SubjectiveSectionId } from "@/lib/cockpit/subjective-section-order";
import { cn } from "@/lib/utils";

const DRAG_HANDLE_CLASS =
  "flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground/50 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary active:cursor-grabbing";

export interface SectionDragHandleProps {
  dragHandleProps: HTMLAttributes<HTMLDivElement>;
  ariaLabel: string;
  disabled?: boolean;
  index: number;
  count: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function SectionDragHandle({
  dragHandleProps,
  ariaLabel,
  disabled = false,
  index,
  count,
  onMoveUp,
  onMoveDown,
}: SectionDragHandleProps) {
  return (
    <div
      {...dragHandleProps}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-testid="subjective-section-drag-handle"
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

export interface SectionReorderContextValue {
  sectionId: SubjectiveSectionId;
  label: string;
  index: number;
  count: number;
  disabled: boolean;
  dragHandleProps: HTMLAttributes<HTMLDivElement>;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const SectionReorderContext = createContext<SectionReorderContextValue | null>(null);

export function SectionReorderProvider({
  value,
  children,
}: {
  value: SectionReorderContextValue;
  children: ReactNode;
}) {
  return (
    <SectionReorderContext.Provider value={value}>{children}</SectionReorderContext.Provider>
  );
}

export function useSectionReorder(): SectionReorderContextValue | null {
  return useContext(SectionReorderContext);
}

/** Renders the top-level section reorder grip for `CollapsibleContainer.leadingActions`. */
export function SectionReorderLeadingAction({
  sectionId,
  ariaLabel,
}: {
  sectionId: SubjectiveSectionId;
  /** Override the default "Reorder {label}" aria-label when a grip needs clearer copy. */
  ariaLabel?: string;
}) {
  const ctx = useSectionReorder();
  if (!ctx || ctx.disabled || ctx.sectionId !== sectionId) return null;

  return (
    <SectionDragHandle
      dragHandleProps={ctx.dragHandleProps}
      ariaLabel={ariaLabel ?? `Reorder ${ctx.label}. Use arrow keys to move.`}
      disabled={ctx.disabled}
      index={ctx.index}
      count={ctx.count}
      onMoveUp={ctx.onMoveUp}
      onMoveDown={ctx.onMoveDown}
    />
  );
}
