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
 * Fetches today's appointments for the authenticated doctor.
 *
 * Shared by C2 (NowNextCard) and C5 (TodaysSchedule) via one query key.
 */
export function useTodaysAppointments(
  token: string,
): UseTodaysAppointmentsResult {
  const query = useAppointmentsQuery(token);

  const appointments = useMemo((): Appointment[] | null => {
    if (!query.data) return null;
    const todayStr = formatDateISO(new Date());
    return query.data.data.appointments.filter((appt) => {
      const apptStr = formatDateISO(appt.appointment_date);
      return apptStr === todayStr;
    });
  }, [query.data]);

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
