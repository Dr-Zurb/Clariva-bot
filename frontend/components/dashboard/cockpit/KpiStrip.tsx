"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { todayLocalIso } from "@/lib/dates";
import { useAppointmentsQuery } from "@/hooks/queries/useAppointmentsQuery";

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
 * KPI strip — two ambient numbers at a glance:
 *   1. Today's consults (done / total)
 *   2. Rx sent today
 */
export function KpiStrip({ token }: KpiStripProps) {
  // Keep the loading shell until mount so the server render and the first
  // client paint don't disagree on the number.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const today = todayLocalIso();
  const appointmentsQuery = useAppointmentsQuery(token, today);

  const kpi = useMemo(() => {
    const appointments = appointmentsQuery.data?.data?.appointments;
    if (!Array.isArray(appointments)) return null;
    return {
      consultsTotal: appointments.length,
      consultsDone: appointments.filter(
        (appt) => appt.consultation_session?.status === "ended",
      ).length,
    };
  }, [appointmentsQuery.data]);

  const consultsReady = mounted && kpi !== null && !appointmentsQuery.isLoading;
  // No doctor-wide "sent today" endpoint. The old poll called
  // GET /prescriptions?date_from=…, which the API rejects (it requires a
  // patient or appointment id) and still retried every minute.
  const rxReady = mounted;

  const consultsValue =
    kpi !== null ? `${kpi.consultsDone}/${kpi.consultsTotal}` : null;

  const rxValue = null;

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      aria-label="Today's KPI summary"
    >
      <KpiCard
        label="Today's consults"
        value={consultsValue}
        isLoading={!consultsReady}
      />
      <KpiCard
        label="Rx sent today"
        value={rxValue}
        isLoading={!rxReady}
      />
    </div>
  );
}
