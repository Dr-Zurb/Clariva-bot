"use client";

import { useQuery } from "@tanstack/react-query";
import { getPatientsList } from "@/lib/api/patients";
import { queryKeys } from "@/lib/query/keys";
import { STALE } from "@/lib/query/stale";
import type { PatientListFilters } from "@/types/patient";

export function usePatientsListQuery(
  token: string,
  filters: PatientListFilters,
  refreshKey = 0,
) {
  return useQuery({
    queryKey: [...queryKeys.patients.list({ ...filters }), refreshKey] as const,
    queryFn: () => getPatientsList(token, filters),
    enabled: Boolean(token),
    staleTime: STALE.COUNTS,
  });
}
