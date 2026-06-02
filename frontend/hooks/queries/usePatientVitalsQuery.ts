"use client";

import { useQuery } from "@tanstack/react-query";
import { patientVitalsQueryOptions } from "@/lib/query/options";

export function usePatientVitalsQuery(token: string, patientId: string) {
  return useQuery({
    ...patientVitalsQueryOptions(token, patientId),
    enabled: Boolean(token) && Boolean(patientId),
  });
}
