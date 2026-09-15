"use client";

import { useCallback, useMemo } from "react";
import { formatDateISO } from "@/lib/format-date";
import type { Appointment } from "@/types/appointment";
import { useAppointmentsQuery } from "@/hooks/queries/useAppointmentsQuery";

export interface UseTodaysAppointmentsResult {
  /** Today's appointments, or null while loading for the first time. */
  appointments: Appointment[] | null;
  loading: boolean;
  error: string | null;
  /** Trigger a manual refetch (stale-while-revalidate). */
  refetch: () => void;
}

/**
 * Fetches the doctor's appointments for one local calendar day.
 *
 * Shared by C2 (NowNextCard) and C5 (TodaysSchedule) via one query key.
 * `dateOverride` is YYYY-MM-DD; omit it to keep the dashboard on today.
 */
export function useTodaysAppointments(
  token: string,
  dateOverride?: string,
): UseTodaysAppointmentsResult {
  const query = useAppointmentsQuery(token);

  const appointments = useMemo((): Appointment[] | null => {
    const appointments = query.data?.data?.appointments;
    if (!Array.isArray(appointments)) return null;
    const dayStr = dateOverride ?? formatDateISO(new Date());
    return appointments.filter((appt) => {
      const apptStr = formatDateISO(appt.appointment_date);
      return apptStr === dayStr;
    });
  }, [query.data, dateOverride]);

  const refetch = useCallback(() => {
    void query.refetch();
  }, [query]);

  return {
    appointments,
    loading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : "Failed to load appointments"
      : null,
    refetch,
  };
}
