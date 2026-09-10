"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  cancelDeskAppointment,
  checkInDeskAppointment,
  collectDeskVisitPayment,
  deskErrorMessage,
  getDeskClinicContext,
  getDeskHisab,
  leaveDeskAppointment,
  listDeskAppointments,
} from "@/lib/desk/api";
import type { DeskPaymentMethod, DeskReturnMethod } from "@/lib/desk/payment";
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

  const hisabQuery = useQuery({
    queryKey: queryKeys.desk.hisab(selectedDate ?? ""),
    queryFn: async () => {
      const res = await getDeskHisab(token, selectedDate!);
      return res.data.hisab;
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

  const collectMutation = useMutation({
    mutationFn: (input: {
      appointmentId: string;
      method: DeskPaymentMethod;
      amountMinor?: number;
    }) => collectDeskVisitPayment(token, input.appointmentId, input),
    onSuccess: () => {
      if (selectedDate) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.desk.hisab(selectedDate),
        });
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelDeskAppointment(token, id),
    onSuccess: () => {
      if (selectedDate) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.desk.today(selectedDate),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.desk.hisab(selectedDate),
        });
      }
    },
  });

  const leaveMutation = useMutation({
    mutationFn: (input: { id: string; returnMethod?: DeskReturnMethod }) =>
      leaveDeskAppointment(token, input.id, input.returnMethod),
    onSuccess: () => {
      if (selectedDate) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.desk.today(selectedDate),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.desk.hisab(selectedDate),
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
      : hisabQuery.error
        ? deskErrorMessage(
            hisabQuery.error,
            "Could not load today's collection"
          )
        : arriveMutation.error
          ? deskErrorMessage(arriveMutation.error, "Could not check in")
          : collectMutation.error
            ? deskErrorMessage(
                collectMutation.error,
                "Could not record payment"
              )
            : leaveMutation.error
              ? deskErrorMessage(leaveMutation.error, "Could not mark left")
              : null;

  const loading =
    (contextQuery.isPending && !contextQuery.data) ||
    (Boolean(selectedDate) && listQuery.isPending && !listQuery.data);

  return {
    doctorId: contextQuery.data?.doctorId ?? "",
    today: clinicToday,
    selectedDate,
    timezone,
    rows,
    counts,
    error,
    loading,
    hisab: hisabQuery.data ?? null,
    refreshing:
      contextQuery.isFetching || listQuery.isFetching || hisabQuery.isFetching,
    arriveMutation,
    collectMutation,
    cancelMutation,
    leaveMutation,
    refetch: () => {
      void contextQuery.refetch();
      void listQuery.refetch();
      void hisabQuery.refetch();
    },
  };
}
