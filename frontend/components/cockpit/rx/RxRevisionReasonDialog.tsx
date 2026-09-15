"use client";

import { useEffect, useState } from "react";
import {
  REVISION_REASON_LABELS,
} from "@/components/cockpit/rx/rxRevise";
import {
  REVISION_REASONS,
  type RevisionReason,
} from "@/types/prescription";

export interface RxRevisionReasonDialogProps {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  replacesLine?: string;
  onCancel: () => void;
  onConfirm: (reason: RevisionReason, otherNote?: string) => void;
}

export function RxRevisionReasonDialog({
  open,
  busy = false,
  error = null,
  replacesLine = "Replaces the issued slip.",
  onCancel,
  onConfirm,
}: RxRevisionReasonDialogProps): JSX.Element | null {
  const [reason, setReason] = useState<RevisionReason | null>(null);
  const [otherNote, setOtherNote] = useState("");

  useEffect(() => {
    if (!open) {
      setReason(null);
      setOtherNote("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rx-revision-reason-title"
        data-testid="rx-revision-reason-dialog"
        className="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="rx-revision-reason-title"
          className="text-base font-semibold text-foreground"
        >
          New slip
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{replacesLine}</p>
        <p className="mt-4 text-sm font-medium text-foreground">Reason</p>
        <div className="mt-2 flex flex-col gap-2">
          {REVISION_REASONS.map((value) => (
            <button
              key={value}
              type="button"
              disabled={busy}
              data-testid={`rx-revision-reason-${value}`}
              aria-pressed={reason === value}
              onClick={() => setReason(value)}
              className={`rounded-md border px-3 py-2 text-left text-sm ${
                reason === value
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted/60"
              } disabled:opacity-50`}
            >
              {REVISION_REASON_LABELS[value]}
            </button>
          ))}
        </div>
        {reason === "other" ? (
          <label className="mt-3 block text-sm text-muted-foreground">
            Optional note
            <textarea
              data-testid="rx-revision-reason-other-note"
              value={otherNote}
              onChange={(e) => setOtherNote(e.target.value)}
              disabled={busy}
              rows={2}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            />
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/60 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="rx-revision-reason-confirm"
            disabled={busy || reason == null}
            onClick={() => {
              if (!reason) return;
              onConfirm(
                reason,
                reason === "other" ? otherNote.trim() || undefined : undefined,
              );
            }}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "Issuing…" : "Issue new slip"}
          </button>
        </div>
      </div>
    </div>
  );
}
