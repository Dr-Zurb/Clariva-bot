"use client";

export interface SendRxFinishButtonProps {
  onClick: () => void;
  disabled?: boolean;
  sending?: boolean;
}

/**
 * Cockpit primary CTA — DL-9 lock: label and styling unchanged from legacy
 * PrescriptionForm footer.
 */
export function SendRxFinishButton({
  onClick,
  disabled = false,
  sending = false,
}: SendRxFinishButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      title="Send prescription and wrap up this visit"
    >
      {sending ? "Sending…" : "Send Rx & finish ▸"}
    </button>
  );
}
