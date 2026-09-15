"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote, CreditCard, Loader2, Pencil, Smartphone } from "lucide-react";

import { formatDeskAmountMinor } from "@/lib/desk/format";
import { rupeesToMinor, type DeskPaymentMethod } from "@/lib/desk/payment";
import { cn } from "@/lib/utils";

const PAY_METHODS: Array<{
  id: Exclude<DeskPaymentMethod, "no_charge">;
  label: string;
  Icon: typeof Banknote;
}> = [
  { id: "cash", label: "Cash", Icon: Banknote },
  { id: "upi", label: "UPI", Icon: Smartphone },
  { id: "card", label: "Card", Icon: CreditCard },
];

export function DeskPaymentStep({
  tokenNo,
  suggestedAmountMinor,
  currency,
  saving,
  onRecord,
}: {
  tokenNo: number | null;
  suggestedAmountMinor: number | null;
  currency: string;
  saving: boolean;
  onRecord: (input: { method: DeskPaymentMethod; amountMinor?: number }) => Promise<void>;
}) {
  const amountRef = useRef<HTMLInputElement>(null);
  const [rupees, setRupees] = useState(
    suggestedAmountMinor != null && suggestedAmountMinor > 0
      ? String(Math.round(suggestedAmountMinor / 100))
      : ""
  );
  const [editingAmount, setEditingAmount] = useState(
    !(suggestedAmountMinor != null && suggestedAmountMinor > 0)
  );
  const [pending, setPending] = useState<DeskPaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (suggestedAmountMinor != null && suggestedAmountMinor > 0) {
      setRupees(String(Math.round(suggestedAmountMinor / 100)));
      setEditingAmount(false);
    }
  }, [suggestedAmountMinor]);

  useEffect(() => {
    if (editingAmount) amountRef.current?.focus();
  }, [editingAmount]);

  const amountValue = Number(rupees);
  const amountReady = Number.isFinite(amountValue) && amountValue > 0;
  const busy = saving || pending != null;

  function closeAmount() {
    if (amountReady) setEditingAmount(false);
  }

  async function pay(method: DeskPaymentMethod) {
    setError(null);
    if (method !== "no_charge" && !amountReady) {
      setEditingAmount(true);
      setError("Enter the amount first");
      return;
    }
    setPending(method);
    try {
      await onRecord(
        method === "no_charge"
          ? { method: "no_charge" }
          : { method, amountMinor: rupeesToMinor(amountValue) }
      );
    } catch {
      setError("Could not record payment");
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Payment
        </p>
        <p className="text-sm font-medium tabular-nums text-muted-foreground">
          Token {tokenNo != null ? `#${tokenNo}` : "—"}
        </p>
      </div>

      <div>
        {editingAmount ? (
          <label className="flex items-baseline gap-1.5 border-b border-input pb-1 focus-within:border-primary">
            <span className="text-2xl font-medium text-muted-foreground">₹</span>
            <input
              ref={amountRef}
              inputMode="numeric"
              value={rupees}
              onChange={(event) => setRupees(event.target.value.replace(/[^\d]/g, ""))}
              onBlur={closeAmount}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  closeAmount();
                }
              }}
              placeholder="0"
              aria-label="Amount in rupees"
              className="w-full min-w-0 bg-transparent text-3xl font-semibold tabular-nums tracking-tight text-foreground placeholder:text-muted-foreground/40 focus-visible:outline-none"
            />
          </label>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditingAmount(true)}
            className="group flex items-baseline gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {formatDeskAmountMinor(rupeesToMinor(amountValue), currency)}
            </span>
            <Pencil
              className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground"
              aria-hidden
            />
            <span className="sr-only">Edit amount</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {PAY_METHODS.map((item) => {
          const active = pending === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={busy}
              onClick={() => void pay(item.id)}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3.5",
                "text-sm font-semibold transition-colors",
                "ring-1 ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:opacity-60",
                active
                  ? "bg-primary text-primary-foreground ring-primary"
                  : "bg-secondary/70 text-foreground ring-transparent hover:bg-secondary hover:ring-border"
              )}
            >
              {active ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <item.Icon className="h-5 w-5 text-current opacity-80" aria-hidden />
              )}
              {item.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void pay("no_charge")}
          className={cn(
            "inline-flex h-8 items-center rounded-full px-3 text-sm font-medium",
            "bg-secondary text-secondary-foreground ring-1 ring-inset ring-border/80",
            "hover:bg-secondary/80",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:opacity-60"
          )}
        >
          {pending === "no_charge" ? "Saving…" : "No charge"}
        </button>
      </div>
    </div>
  );
}
