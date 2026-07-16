"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ClearAllConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Lead sentence under the title. */
  descriptionLead: string;
  /** Optional bullet list of what will be cleared. */
  bullets?: readonly string[];
  confirmLabel?: string;
  busy?: boolean;
  testId: string;
  onConfirm: () => void | Promise<void>;
}

/** Safety gate before destructive Clear all actions (subjective + exam). */
export function ClearAllConfirmDialog({
  open,
  onOpenChange,
  title,
  descriptionLead,
  bullets = [],
  confirmLabel = "Clear all",
  busy = false,
  testId,
  onConfirm,
}: ClearAllConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid={testId}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>{descriptionLead}</p>
              {bullets.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {bullets.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid={`${testId}-confirm`}
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
          >
            {busy ? "Clearing…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
