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
  listDeskLabPending,
  type DeskLabPendingItem,
} from "@/lib/desk/api";
import type { DeskPaymentMethod, DeskReturnMethod } from "@/lib/desk/payment";
import {
  deskShowsLabsPending,
  hasDeskCapability,
  isDeskLabsOnly,
} from "@/lib/desk/capabilities";
import { deskPrepFromFlags, type DeskTodayRow } from "@/lib/desk/prep";
import { countDeskQueue, isOpenDeskAppointment } from "@/lib/desk/queue";
import { queryKeys } from "@/lib/query/keys";
import { POLL_INTERVAL, pollingOptions } from "@/lib/query/polling";
import type { Appointment } from "@/types/appointment";

function asAppointmentStatus(value: string): Appointment["status"] {
  if (
    value === "pending" ||
    value === "confirmed" ||
    value === "cancelled" ||
    value === "completed" ||
    value === "no_show"
  ) {
    return value;
  }
  return "completed";
}

function asPatientSex(value: string | null): Appointment["patient_sex"] {
  if (value === "male" || value === "female" || value === "other") return value;
  return null;
}

function deskTodayRowFromLabPending(item: DeskLabPendingItem): DeskTodayRow {
  return {
    id: item.appointmentId,
    doctor_id: "",
    patient_id: item.patientId,
    patient_name: item.patientName ?? "",
    patient_phone: item.patientPhone,
    patient_mrn: item.patientMrn,
    patient_age: item.patientAge,
    patient_sex: asPatientSex(item.patientSex),
    appointment_date: item.appointmentDate,
    status: asAppointmentStatus(item.status),
    patient_checked_in_at: item.patientCheckedInAt,
    created_at: item.appointmentDate,
    updated_at: item.appointmentDate,
    deskPrep: deskPrepFromFlags({
      has_visit_documents: item.hasVisitDocuments,
      visit_document_count: item.visitDocumentCount,
    }),
    daysPending: item.daysPending,
    reportUploaded: item.reportUploaded,
    labOrders: item.orders,
  };
}

export function useDeskTodayQuery(
  token: string,
  date?: string,
  options?: { labsPendingMode?: boolean }
) {
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
  const capabilities = contextQuery.data?.capabilities;
  const canBill = hasDeskCapability(capabilities, "front_desk");
  const canLabs = deskShowsLabsPending(capabilities);
  const labsOnly = isDeskLabsOnly(capabilities);
  const labsPendingMode =
    labsOnly || (Boolean(options?.labsPendingMode) && canLabs);

  const listQuery = useQuery({
    queryKey: queryKeys.desk.today(selectedDate ?? ""),
    queryFn: async () => {
      const list = await listDeskAppointments(token, selectedDate!);
      return list.data.appointments.filter(isOpenDeskAppointment);
    },
    enabled: Boolean(token) && Boolean(selectedDate) && !labsOnly,
    ...pollingOptions(POLL_INTERVAL.COUNTS),
  });

  const pendingQuery = useQuery({
    queryKey: queryKeys.desk.labPending(),
    queryFn: async () => {
      const res = await listDeskLabPending(token);
      return res.data.items;
    },
    enabled: Boolean(token) && contextQuery.isSuccess && canLabs,
    ...pollingOptions(POLL_INTERVAL.COUNTS),
  });

  const hisabQuery = useQuery({
    queryKey: queryKeys.desk.hisab(selectedDate ?? ""),
    queryFn: async () => {
      const res = await getDeskHisab(token, selectedDate!);
      return res.data.hisab;
    },
    enabled: Boolean(token) && Boolean(selectedDate) && canBill,
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

  const dateRows: DeskTodayRow[] = useMemo(
    () =>
      (listQuery.data ?? []).map((row) => ({
        ...row,
        deskPrep: deskPrepFromFlags(row),
      })),
    [listQuery.data]
  );
  const pendingRows: DeskTodayRow[] = useMemo(
    () => (pendingQuery.data ?? []).map(deskTodayRowFromLabPending),
    [pendingQuery.data]
  );
  const outstandingRows = useMemo(
    () => pendingRows.filter((row) => !row.reportUploaded),
    [pendingRows]
  );
  const rows = labsOnly
    ? pendingRows
    : labsPendingMode
      ? outstandingRows
      : dateRows;
  const counts = useMemo(
    () => countDeskQueue(listQuery.data ?? []),
    [listQuery.data]
  );
  const labsPendingCount = outstandingRows.length;

  const error = contextQuery.error
    ? deskErrorMessage(contextQuery.error, "Could not load today")
    : labsPendingMode && pendingQuery.error
      ? deskErrorMessage(pendingQuery.error, "Could not load labs pending")
      : !labsPendingMode && listQuery.error
        ? deskErrorMessage(listQuery.error, "Could not load today")
        : canBill && hisabQuery.error
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
    (labsPendingMode
      ? pendingQuery.isPending && !pendingQuery.data
      : Boolean(selectedDate) && listQuery.isPending && !listQuery.data);

  return {
    doctorId: contextQuery.data?.doctorId ?? "",
    today: clinicToday,
    selectedDate,
    timezone,
    rows,
    counts,
    error,
    loading,
    capabilities,
    canBill,
    canLabs,
    labsOnly,
    labsPendingCount,
    hisab: canBill ? hisabQuery.data ?? null : null,
    refreshing:
      contextQuery.isFetching ||
      listQuery.isFetching ||
      hisabQuery.isFetching ||
      pendingQuery.isFetching,
    arriveMutation,
    collectMutation,
    cancelMutation,
    leaveMutation,
    refetch: () => {
      void contextQuery.refetch();
      void listQuery.refetch();
      void hisabQuery.refetch();
      void pendingQuery.refetch();
    },
  };
}
