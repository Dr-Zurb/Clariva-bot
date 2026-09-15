"use client";

import { useEffect } from "react";

export interface RxRevisionDeliveryPromptProps {
  open: boolean;
  canResend: boolean;
  canReprint: boolean;
  busy?: boolean;
  onDismiss: () => void;
  onResend: () => void;
  onReprint: () => void;
}

export function RxRevisionDeliveryPrompt({
  open,
  canResend,
  canReprint,
  busy = false,
  onDismiss,
  onResend,
  onReprint,
}: RxRevisionDeliveryPromptProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onDismiss]);

  if (!open || (!canResend && !canReprint)) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={() => {
        if (!busy) onDismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rx-revision-delivery-title"
        data-testid="rx-revision-delivery-prompt"
        className="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="rx-revision-delivery-title"
          className="text-base font-semibold text-foreground"
        >
          The earlier slip was already given out
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Send or print this version only if you choose to. Nothing is
          sent automatically.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onDismiss}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/60 disabled:opacity-50"
          >
            Not now
          </button>
          {canReprint ? (
            <button
              type="button"
              data-testid="rx-revision-delivery-reprint"
              disabled={busy}
              onClick={onReprint}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/60 disabled:opacity-50"
            >
              Reprint
            </button>
          ) : null}
          {canResend ? (
            <button
              type="button"
              data-testid="rx-revision-delivery-resend"
              disabled={busy}
              onClick={onResend}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Resend
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
