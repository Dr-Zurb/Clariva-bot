"use client";

import { useQuery } from "@tanstack/react-query";
import { patientMedicalBackgroundQueryOptions } from "@/lib/query/options";

/**
 * Shared PMH read (conditions + chart medications). Subjective PMH and the
 * cockpit ribbon subscribe to this key so a write in one surface updates
 * the other without a page reload.
 */
export function usePatientMedicalBackgroundQuery(
  token: string,
  patientId: string,
) {
  return useQuery({
    ...patientMedicalBackgroundQueryOptions(token, patientId),
    enabled: Boolean(token) && Boolean(patientId),
  });
}
