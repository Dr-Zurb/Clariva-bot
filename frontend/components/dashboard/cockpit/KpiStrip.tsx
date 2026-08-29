"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { todayLocalIso } from "@/lib/dates";
import { useAppointmentsQuery } from "@/hooks/queries/useAppointmentsQuery";
import { useRxSentTodayQuery } from "@/hooks/queries/useRxSentTodayQuery";
import { useDashboardCounts } from "@/hooks/useDashboardCounts";

interface KpiCardProps {
  label: string;
  value: string | number | null;
  isLoading: boolean;
}

function KpiCard({ label, value, isLoading }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {/* Always the same <span> tree. Loading uses a pulse shell — never swap
            a Skeleton <div> for a value <span> (hydration mismatch). */}
        <span
          className={
            isLoading
              ? "mt-1.5 inline-block h-7 w-16 animate-pulse rounded-md bg-muted"
              : "mt-1.5 flex h-8 items-center text-2xl font-semibold font-tabular tabular-nums leading-none"
          }
          aria-hidden={isLoading || undefined}
        >
          {isLoading ? "\u00a0" : (value ?? "—")}
        </span>
      </CardContent>
    </Card>
  );
}

interface KpiStripProps {
  token: string;
}

/**
 * KPI strip — three ambient numbers at a glance:
 *   1. Today's consults (done / total)
 *   2. Pending DMs (match-review unconfirmed)
 *   3. Rx sent today
 */
export function KpiStrip({ token }: KpiStripProps) {
  // Query cache can differ SSR vs first client paint (partial dehydrate /
  // failed rx prefetch). Keep the loading shell until mount so text never
  // mismatches (" " vs "0").
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const appointmentsQuery = useAppointmentsQuery(token);
  const rxQuery = useRxSentTodayQuery(token);
  const { counts } = useDashboardCounts(token);

  const kpi = useMemo(() => {
    if (!appointmentsQuery.data) return null;
    const today = todayLocalIso();
    const todayAppts = appointmentsQuery.data.data.appointments.filter((appt) =>
      (appt.appointment_date ?? "").startsWith(today),
    );
    return {
      consultsTotal: todayAppts.length,
      consultsDone: todayAppts.filter(
        (appt) => appt.consultation_session?.status === "ended",
      ).length,
    };
  }, [appointmentsQuery.data]);

  const consultsReady = mounted && kpi !== null && !appointmentsQuery.isLoading;
  const pendingDmsReady = mounted && counts !== null;
  const rxReady =
    mounted &&
    !rxQuery.isLoading &&
    (rxQuery.isSuccess || rxQuery.isError);

  const consultsValue =
    kpi !== null ? `${kpi.consultsDone}/${kpi.consultsTotal}` : null;

  const pendingDmsValue =
    counts !== null ? counts.bookingReviewsUnconfirmed : null;

  // Broken list endpoint (needs patientId) → show em dash, not a fake 0.
  const rxValue = rxQuery.isSuccess ? (rxQuery.data ?? 0) : null;

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      aria-label="Today's KPI summary"
    >
      <KpiCard
        label="Today's consults"
        value={consultsValue}
        isLoading={!consultsReady}
      />
      <KpiCard
        label="Pending DMs"
        value={pendingDmsValue}
        isLoading={!pendingDmsReady}
      />
      <KpiCard
        label="Rx sent today"
        value={rxValue}
        isLoading={!rxReady}
      />
    </div>
  );
}
