"use client";

import { useQuery } from "@tanstack/react-query";
import { clinicalMixQueryOptions } from "@/lib/query/options";

/**
 * insights-v1 · Tier-3 de-identified clinical mix for a selected date range.
 * Mirror of `usePracticeHealthQuery` / `useBookingFunnelQuery`.
 */
export function useClinicalMixQuery(
  token: string,
  range: { from: string; to: string },
  limit = 10,
) {
  return useQuery({
    ...clinicalMixQueryOptions(token, range, limit),
    enabled: Boolean(token) && Boolean(range.from) && Boolean(range.to),
  });
}
