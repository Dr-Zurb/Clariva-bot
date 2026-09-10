"use client";

import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useOptionalRxForm } from "@/components/cockpit/rx/RxFormContext";
import { lastVisitSummaryQueryOptions } from "@/lib/cockpit/last-visit-summary-query";
import type { LastVisitSummary } from "@/lib/api/last-visit-summary";

const LastVisitSummaryContext = createContext<LastVisitSummary | null>(null);

/**
 * Live cockpit fetch. Mount once above SOAP so strips share one query (LVC-DL-6).
 * Isolated section tests omit this provider and see `null`.
 */
export function LastVisitSummaryProvider({
  children,
  value,
}: {
  children: ReactNode;
  /** Test / story override — skips the network read when provided. */
  value?: LastVisitSummary | null;
}): JSX.Element {
  const rx = useOptionalRxForm();
  const token = rx?.token ?? "";
  const appointmentId = rx?.appointmentId ?? "";
  const patientId = rx?.patientId ?? "";
  const enabled =
    value === undefined &&
    Boolean(token) &&
    Boolean(appointmentId) &&
    Boolean(patientId);

  const query = useQuery({
    ...lastVisitSummaryQueryOptions(token, patientId, appointmentId),
    enabled,
  });

  return createElement(
    LastVisitSummaryContext.Provider,
    { value: value !== undefined ? value : (query.data ?? null) },
    children
  );
}

export function useLastVisitSummary(): LastVisitSummary | null {
  return useContext(LastVisitSummaryContext);
}
