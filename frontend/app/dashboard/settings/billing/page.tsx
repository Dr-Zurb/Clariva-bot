"use client";

import { useCallback, useEffect, useState } from "react";
import { getMyBilling } from "@/lib/api";
import { formatCurrencyINR, formatDate, formatDateTime } from "@/lib/format-date";
import { SettingsPageShell } from "@/components/settings/SettingsPageShell";
import { useSessionAccessToken } from "@/hooks/useSessionAccessToken";
import type { DoctorBillingSnapshot } from "@/types/billing";

function rupeesFromMinor(minor: number): string {
  return formatCurrencyINR(minor / 100);
}

function monthTitle(period: string): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return formatDate(new Date(Date.UTC(year, month - 1, 1)), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Settings → Billing (P2a). Meter the doctor can audit before the invoice.
 * Never shows commission, their consult fee, or patient names.
 */
export default function BillingSettingsPage() {
  const { token, isLoading } = useSessionAccessToken();
  const [data, setData] = useState<DoctorBillingSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const res = await getMyBilling(token);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load billing");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading || !token || (!data && !error)) {
    return (
      <SettingsPageShell
        title="Billing"
        description="Your Halo Aid subscription and this month’s completed consults."
        isLoading
      />
    );
  }

  if (error || !data) {
    return (
      <SettingsPageShell
        title="Billing"
        description="Your Halo Aid subscription and this month’s completed consults."
        loadError={error ?? "Could not load billing"}
        onRetry={() => void load()}
      />
    );
  }

  const billed = data.consults.filter((row) => row.status === "billable");
  const notBilled = data.consults.filter((row) => row.status !== "billable");

  return (
    <SettingsPageShell
      title="Billing"
      description="Halo Aid bills you on a monthly invoice. This is the count we will use — check it against your own records."
    >
      <div className="mt-6 space-y-6">
        {data.capReachedCopy ? (
          <p
            className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground"
            role="status"
          >
            {data.capReachedCopy}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {data.consultsUntilCap} more completed consult
            {data.consultsUntilCap === 1 ? "" : "s"} before the monthly maximum
            of {formatCurrencyINR(data.bill.inclusiveRupees.cap)} (incl. GST).
          </p>
        )}

        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-medium text-foreground">
            This month · {monthTitle(data.billingPeriod)}
          </h2>
          <p className="mt-3 text-3xl font-semibold text-foreground">
            {formatCurrencyINR(data.bill.inclusiveRupees.total)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              incl. GST
            </span>
          </p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Completed consults</dt>
              <dd className="font-medium text-foreground">{data.billableCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Subscription</dt>
              <dd className="font-medium text-foreground">
                {data.subscription.baseWaivedThisPeriod
                  ? "Waived this month"
                  : `${formatCurrencyINR(data.bill.inclusiveRupees.base)} incl. GST`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Usage after the included 20</dt>
              <dd className="font-medium text-foreground">
                {rupeesFromMinor(data.bill.meteredMinor)} ex-GST
                {" · "}
                {formatCurrencyINR(data.bill.inclusiveRupees.perConsult)} incl. GST
                each
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">GST (18%)</dt>
              <dd className="font-medium text-foreground">
                {rupeesFromMinor(data.bill.gstMinor)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            This is a platform subscription and usage charge. It is not taken
            from a patient payment, and it does not depend on your consultation
            price.
          </p>
        </section>

        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-medium text-foreground">
            Completed consults
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {billed.length} billed this month. Times are when the consult was
            recorded.
          </p>
          {billed.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No completed consults yet this month.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {billed.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
                >
                  <span className="font-medium capitalize text-foreground">
                    {row.modality.replace("_", " ")}
                  </span>
                  <span className="text-muted-foreground">
                    {formatDateTime(row.occurredAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-medium text-foreground">Not billed</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No-shows and cancelled visits never appear on this meter. Same-day
            reconnects under two minutes are recorded here and not charged.
          </p>
          {notBilled.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing held back this month.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {notBilled.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
                >
                  <span className="font-medium text-foreground">
                    {row.notBilledLabel ?? "Not billed"}
                  </span>
                  <span className="text-muted-foreground">
                    {formatDateTime(row.occurredAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-medium text-foreground">Invoices</h2>
          {data.invoices.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No invoices yet. We raise them at month-end and send them
              separately.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {data.invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
                >
                  <span className="font-medium text-foreground">
                    {inv.invoiceNumber}
                  </span>
                  <span className="text-muted-foreground">
                    {monthTitle(inv.billingPeriod)} · {inv.billableCount}{" "}
                    consults · {rupeesFromMinor(inv.totalMinor)} · {inv.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </SettingsPageShell>
  );
}
