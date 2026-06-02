"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
        <div className="mt-1.5 h-8 flex items-center">
          {isLoading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <span className="text-2xl font-semibold font-tabular tabular-nums leading-none">
              {value ?? "—"}
            </span>
          )}
        </div>
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
      rxSentToday: rxQuery.data ?? 0,
    };
  }, [appointmentsQuery.data, rxQuery.data]);

  const isLoading =
    appointmentsQuery.isLoading || rxQuery.isLoading;

  const consultsValue =
    kpi !== null ? `${kpi.consultsDone}/${kpi.consultsTotal}` : null;

  const pendingDmsValue =
    counts !== null ? counts.bookingReviewsUnconfirmed : null;

  const rxValue = kpi !== null ? kpi.rxSentToday : null;

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      aria-label="Today's KPI summary"
    >
      <KpiCard
        label="Today's consults"
        value={consultsValue}
        isLoading={isLoading}
      />
      <KpiCard
        label="Pending DMs"
        value={pendingDmsValue}
        isLoading={counts === null}
      />
      <KpiCard
        label="Rx sent today"
        value={rxValue}
        isLoading={isLoading}
      />
    </div>
  );
}
