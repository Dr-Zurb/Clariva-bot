/**
 * React Query options for last-visit-context · lvc-02.
 */

import { getLastVisitSummary } from "@/lib/api/last-visit-summary";
import { queryKeys } from "@/lib/query/keys";
import { STALE } from "@/lib/query/stale";

export function lastVisitSummaryQueryOptions(
  token: string,
  patientId: string,
  appointmentId: string
) {
  return {
    queryKey: queryKeys.consult(appointmentId).lastVisitSummary(),
    queryFn: async () => {
      const res = await getLastVisitSummary(token, patientId, appointmentId);
      return res.data.summary;
    },
    staleTime: STALE.CLINICAL,
  } as const;
}
