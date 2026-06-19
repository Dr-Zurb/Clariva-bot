"use client";

import type { DragEvent, HTMLAttributes, ReactNode } from "react";
import { SectionReorderProvider } from "@/components/cockpit/rx/subjective/section-reorder-context";
import type { SectionDropIntent } from "@/lib/cockpit/section-drag";
import type { SubjectiveSectionId } from "@/lib/cockpit/subjective-section-order";

export {
  SectionDragHandle,
  SectionReorderLeadingAction,
  type SectionDragHandleProps,
} from "@/components/cockpit/rx/subjective/section-reorder-context";

export interface SortableSectionShellProps {
  sectionId: SubjectiveSectionId;
  label: string;
  index: number;
  count: number;
  disabled?: boolean;
  children: ReactNode;
  dropIntent?: SectionDropIntent | null;
  isDropTarget?: boolean;
  dragHandleProps: HTMLAttributes<HTMLDivElement>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}

export function SortableSectionShell({
  sectionId,
  label,
  index,
  count,
  disabled = false,
  children,
  dropIntent = null,
  isDropTarget = false,
  dragHandleProps,
  onMoveUp,
  onMoveDown,
  onDragOver,
  onDragLeave,
  onDrop,
}: SortableSectionShellProps) {
  return (
    <SectionReorderProvider
      value={{
        sectionId,
        label,
        index,
        count,
        disabled: disabled ?? false,
        dragHandleProps,
        onMoveUp,
        onMoveDown,
      }}
    >
      <div
        className="relative"
        data-subjective-section-id={sectionId}
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
    </SectionReorderProvider>
  );
}
