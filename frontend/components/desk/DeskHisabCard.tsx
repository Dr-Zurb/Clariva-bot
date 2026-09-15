"use client";

import { formatDeskAmountMinor } from "@/lib/desk/format";
import type { DeskHisabSnapshot } from "@/lib/desk/payment";

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export function DeskHisabCard({ hisab }: { hisab: DeskHisabSnapshot | null }) {
  if (!hisab) return null;
  const { totals, currency } = hisab;
  return (
    <section
      aria-label="Today's collection"
      className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Today&apos;s collection</h2>
        <p className="text-sm font-semibold tabular-nums">
          {formatDeskAmountMinor(totals.collectedMinor, currency)}
        </p>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-3">
        <Line label="Cash" value={formatDeskAmountMinor(totals.cashMinor, currency)} />
        <Line label="UPI" value={formatDeskAmountMinor(totals.upiMinor, currency)} />
        <Line label="Card" value={formatDeskAmountMinor(totals.cardMinor, currency)} />
      </div>
      {hisab.noChargeCount > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No charge{" "}
          <span className="tabular-nums font-medium text-foreground">{hisab.noChargeCount}</span>
        </p>
      ) : null}
    </section>
  );
}
