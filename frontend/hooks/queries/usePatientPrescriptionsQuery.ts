"use client";

import { useQuery } from "@tanstack/react-query";
import { patientPrescriptionsQueryOptions } from "@/lib/query/options";

export function usePatientPrescriptionsQuery(token: string, patientId: string) {
  return useQuery({
    ...patientPrescriptionsQueryOptions(token, patientId),
    enabled: Boolean(token) && Boolean(patientId),
  });
}
