"use client";

import { useQuery } from "@tanstack/react-query";
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
    ...pollingOptions(POLL_INTERVAL.COUNTS),
  });
}
