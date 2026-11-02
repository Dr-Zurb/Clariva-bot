"use client";

import { useCallback, useMemo } from "react";
import { todayLocalIso } from "@/lib/dates";
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
 * Fetches the doctor's appointments for one clinic day.
 *
 * Shared by C2 (NowNextCard) and C5 (TodaysSchedule) via one query key.
 * `dateOverride` is YYYY-MM-DD; omit it to keep the dashboard on today.
 * The server applies the doctor's timezone to that date, so the hook does
 * not download other days and filter them in the browser.
 */
export function useTodaysAppointments(
  token: string,
  dateOverride?: string,
): UseTodaysAppointmentsResult {
  const day = dateOverride && dateOverride.length > 0 ? dateOverride : todayLocalIso();
  const query = useAppointmentsQuery(token, day);

  const appointments = useMemo((): Appointment[] | null => {
    const list = query.data?.data?.appointments;
    if (!Array.isArray(list)) return null;
    return list;
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
