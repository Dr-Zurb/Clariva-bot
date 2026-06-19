"use client";

import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RemoveIconButtonProps {
  /** Accessible label, e.g. `Remove Travel history`. */
  label: string;
  disabled?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  testId?: string;
}

/**
 * Icon-only remove control for subjective-tab rows and cards.
 * Matches ComplaintCard delete affordance (Trash2 + destructive hover).
 */
export function RemoveIconButton({
  label,
  disabled,
  onClick,
  className,
  testId,
}: RemoveIconButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-destructive disabled:opacity-40",
        className,
      )}
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}
