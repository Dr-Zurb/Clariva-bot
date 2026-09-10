"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getDoctorOpdSession } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { POLL_INTERVAL, pollingOptions } from "@/lib/query/polling";
import { STALE } from "@/lib/query/stale";

export function useOpdSessionQuery(token: string, dateIso: string) {
  return useQuery({
    queryKey: queryKeys.opd.session(dateIso),
    queryFn: () => getDoctorOpdSession(token, dateIso),
    enabled: Boolean(token) && Boolean(dateIso),
    staleTime: STALE.LIVE,
    // Keep prior day's response while the new date fetches so the OPD chrome
    // doesn't tear down — callers must ignore placeholders whose `date` ≠ sessionDate.
    placeholderData: keepPreviousData,
    ...pollingOptions(POLL_INTERVAL.COUNTS),
  });
}
