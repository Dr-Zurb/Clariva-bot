"use client";

import type { ExamSystemCardStatus } from "@/components/cockpit/rx/inputs/ExamSystemCard";
import { cn } from "@/lib/utils";

export interface ExamSystemStatusToolbarProps {
  systemId: string;
  status: ExamSystemCardStatus;
  normalLine: string;
  disabled?: boolean;
  onMarkNormal: () => void;
  onClear: () => void;
}

export function ExamSystemStatusToolbar({
  systemId,
  status,
  normalLine,
  disabled = false,
  onMarkNormal,
  onClear,
}: ExamSystemStatusToolbarProps) {
  const canClear = status !== "not_examined";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={onMarkNormal}
        aria-pressed={status === "normal"}
        data-testid={`exam-mark-normal-${systemId}`}
        className={cn(
          "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
          status === "normal"
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
        )}
      >
        Mark normal
      </button>
      <button
        type="button"
        disabled={disabled || !canClear}
        onClick={onClear}
        aria-label="Clear examination section"
        data-testid={`exam-clear-section-${systemId}`}
        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-50"
      >
        Clear
      </button>
      {status === "normal" ? (
        <span className="text-xs text-muted-foreground">{normalLine}</span>
      ) : null}
    </div>
  );
}
