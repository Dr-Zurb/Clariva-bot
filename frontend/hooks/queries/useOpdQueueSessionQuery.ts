"use client";

import { useQuery } from "@tanstack/react-query";
import { opdQueueSessionQueryOptions } from "@/lib/query/options";

export function useOpdQueueSessionQuery(
  token: string,
  dateIso: string,
  refetchIntervalMs?: number,
) {
  return useQuery({
    ...opdQueueSessionQueryOptions(token, dateIso),
    enabled: Boolean(token) && Boolean(dateIso),
    ...(refetchIntervalMs != null
      ? { refetchInterval: refetchIntervalMs, refetchIntervalInBackground: false }
      : {}),
  });
}
