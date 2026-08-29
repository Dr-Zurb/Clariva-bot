"use client";

import { useQuery } from "@tanstack/react-query";
import { patientAllergiesQueryOptions } from "@/lib/query/options";

/**
 * Shared read of the patient's allergies (+ section notes). The Subjective
 * Allergies zone header preview and the section body share this key so a
 * tab-switch remount paints count/preview from cache instead of waiting on a
 * fresh network round-trip.
 */
export function usePatientAllergiesQuery(token: string, patientId: string) {
  return useQuery({
    ...patientAllergiesQueryOptions(token, patientId),
    enabled: Boolean(token) && Boolean(patientId),
  });
}
