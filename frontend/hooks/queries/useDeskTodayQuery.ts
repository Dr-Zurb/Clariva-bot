"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  checkInDeskAppointment,
  deskErrorMessage,
  getDeskClinicContext,
  listDeskAppointments,
} from "@/lib/desk/api";
import { countDeskQueue, isOpenDeskAppointment } from "@/lib/desk/queue";
import { queryKeys } from "@/lib/query/keys";
import { POLL_INTERVAL, pollingOptions } from "@/lib/query/polling";

export function useDeskTodayQuery(token: string, date?: string) {
  const queryClient = useQueryClient();

  const contextQuery = useQuery({
    queryKey: queryKeys.desk.context(),
    queryFn: async () => {
      const res = await getDeskClinicContext(token);
      return res.data;
    },
    enabled: Boolean(token),
  });

  const clinicToday = contextQuery.data?.today;
  const selectedDate = date && date.length > 0 ? date : clinicToday;
  const timezone = contextQuery.data?.timezone ?? "Asia/Kolkata";

  const listQuery = useQuery({
    queryKey: queryKeys.desk.today(selectedDate ?? ""),
    queryFn: async () => {
      const list = await listDeskAppointments(token, selectedDate!);
      return list.data.appointments.filter(isOpenDeskAppointment);
    },
    enabled: Boolean(token) && Boolean(selectedDate),
    ...pollingOptions(POLL_INTERVAL.COUNTS),
  });

  const arriveMutation = useMutation({
    mutationFn: (id: string) => checkInDeskAppointment(token, id),
    onSuccess: () => {
      if (selectedDate) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.desk.today(selectedDate),
        });
      }
    },
  });

  const rows = listQuery.data ?? [];
  const counts = useMemo(
    () => countDeskQueue(listQuery.data ?? []),
    [listQuery.data]
  );

  const error = contextQuery.error
    ? deskErrorMessage(contextQuery.error, "Could not load today")
    : listQuery.error
      ? deskErrorMessage(listQuery.error, "Could not load today")
      : arriveMutation.error
        ? deskErrorMessage(arriveMutation.error, "Could not check in")
        : null;

  const loading =
    (contextQuery.isPending && !contextQuery.data) ||
    (Boolean(selectedDate) && listQuery.isPending && !listQuery.data);

  return {
    today: clinicToday,
    selectedDate,
    timezone,
    rows,
    counts,
    error,
    loading,
    refreshing: contextQuery.isFetching || listQuery.isFetching,
    arriveMutation,
    refetch: () => {
      void contextQuery.refetch();
      void listQuery.refetch();
    },
  };
}
