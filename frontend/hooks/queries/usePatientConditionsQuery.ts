"use client";

import { useQuery } from "@tanstack/react-query";
import { patientConditionsQueryOptions } from "@/lib/query/options";

/**
 * Shared read of the patient's chronic conditions (flat list). Both the
 * Assessment "Known conditions" zone and the Subjective PMH section read
 * conditions through the same query key so a write in one surface invalidates
 * and instantly refreshes the other (no manual page reload).
 */
export function usePatientConditionsQuery(token: string, patientId: string) {
  return useQuery({
    ...patientConditionsQueryOptions(token, patientId),
    enabled: Boolean(token) && Boolean(patientId),
  });
}
