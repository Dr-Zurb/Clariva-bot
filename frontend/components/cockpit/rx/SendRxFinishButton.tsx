"use client";

import { cn } from "@/lib/utils";

export interface SendRxFinishButtonProps {
  onClick: () => void;
  disabled?: boolean;
  sending?: boolean;
  /** Tighter sizing for the cockpit shell footer bar. */
  compact?: boolean;
  className?: string;
}

/**
 * Cockpit primary CTA — DL-9 lock: label and styling unchanged from legacy
 * PrescriptionForm footer.
 */
export function SendRxFinishButton({
  onClick,
  disabled = false,
  sending = false,
  compact = false,
  className,
}: SendRxFinishButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-md bg-primary font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring",
        compact
          ? "h-9 px-3.5 text-sm focus:ring-offset-1"
          : "px-3 py-2 text-sm focus:ring-offset-2",
        className,
      )}
      title="Send prescription and wrap up this visit"
    >
      {sending ? "Sending…" : "Send Rx & finish ▸"}
    </button>
  );
}
