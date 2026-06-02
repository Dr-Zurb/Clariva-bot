"use client";

import { useQuery } from "@tanstack/react-query";
import { patientOverviewQueryOptions } from "@/lib/query/options";

export function usePatientOverviewQuery(token: string, patientId: string) {
  return useQuery({
    ...patientOverviewQueryOptions(token, patientId),
    enabled: Boolean(token) && Boolean(patientId),
  });
}
