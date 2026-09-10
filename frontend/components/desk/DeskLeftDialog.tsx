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
import { formatDeskAmountMinor } from "@/lib/desk/format";
import {
  deskPaymentMethodLabel,
  type DeskReturnMethod,
} from "@/lib/desk/payment";
import { cn } from "@/lib/utils";

const RETURN_METHODS: DeskReturnMethod[] = ["cash", "upi", "card"];

export function DeskLeftDialog({
  busy,
  disabled,
  error,
  paid,
  collectedMinor,
  currency,
  defaultReturnMethod,
  triggerClassName,
  onConfirm,
}: {
  busy?: boolean;
  disabled?: boolean;
  error?: string | null;
  paid: boolean;
  collectedMinor: number;
  currency: string;
  defaultReturnMethod?: DeskReturnMethod | null;
  triggerClassName?: string;
  onConfirm: (returnMethod?: DeskReturnMethod) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [returnMethod, setReturnMethod] = useState<DeskReturnMethod>(
    defaultReturnMethod ?? "cash"
  );

  const amount = formatDeskAmountMinor(collectedMinor, currency);
  const methodLabel = deskPaymentMethodLabel(returnMethod);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) setReturnMethod(defaultReturnMethod ?? "cash");
        setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-8 px-2 text-muted-foreground", triggerClassName)}
          disabled={disabled || busy}
        >
          {busy ? "Leaving…" : "Left"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>They left?</AlertDialogTitle>
          <AlertDialogDescription>
            {paid
              ? `They left. Return ${amount} via ${methodLabel}?`
              : "They leave the open day list."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {paid ? (
          <div className="flex flex-wrap gap-1.5">
            {RETURN_METHODS.map((method) => (
              <Button
                key={method}
                type="button"
                size="sm"
                variant={returnMethod === method ? "default" : "outline"}
                onClick={() => setReturnMethod(method)}
              >
                {deskPaymentMethodLabel(method)}
              </Button>
            ))}
          </div>
        ) : null}
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
              void onConfirm(paid ? returnMethod : undefined)
                .then(() => setOpen(false))
                .catch(() => undefined);
            }}
          >
            {busy ? "Leaving…" : paid ? `Return ${amount}` : "They left"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
