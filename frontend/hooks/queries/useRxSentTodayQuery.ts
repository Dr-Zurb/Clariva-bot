"use client";

import { useQuery } from "@tanstack/react-query";
import { rxSentTodayQueryOptions } from "@/lib/query/options";

export function useRxSentTodayQuery(token: string) {
  return useQuery({
    ...rxSentTodayQueryOptions(token),
    enabled: Boolean(token),
  });
}
