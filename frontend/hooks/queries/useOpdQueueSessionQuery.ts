"use client";

import { useQuery } from "@tanstack/react-query";
import { opdQueueSessionQueryOptions } from "@/lib/query/options";

export function useOpdQueueSessionQuery(token: string, dateIso: string) {
  return useQuery({
    ...opdQueueSessionQueryOptions(token, dateIso),
    enabled: Boolean(token) && Boolean(dateIso),
  });
}
