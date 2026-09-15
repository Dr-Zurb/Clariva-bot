"use client";

import { useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DeskCancelDialog({
  busy,
  disabled,
  error,
  triggerClassName,
  onConfirm,
}: {
  busy?: boolean;
  disabled?: boolean;
  error?: string | null;
  triggerClassName?: string;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-8 px-2 text-muted-foreground", triggerClassName)}
          disabled={disabled || busy}
        >
          {busy ? "Removing…" : "Cancel"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove from today’s list?</AlertDialogTitle>
          <AlertDialogDescription>
            They leave the open day list. You can book them again after.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep</AlertDialogCancel>
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              void onConfirm()
                .then(() => setOpen(false))
                .catch(() => undefined);
            }}
          >
            {busy ? "Removing…" : "Remove"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
