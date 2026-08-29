"use client";

import { useQuery } from "@tanstack/react-query";
import { telehealthQualityQueryOptions } from "@/lib/query/options";

/**
 * insights-v1 · Tier-4 telehealth quality for a selected date range.
 * Mirror of `usePracticeHealthQuery` / `useBookingFunnelQuery`.
 */
export function useTelehealthQualityQuery(
  token: string,
  range: { from: string; to: string },
) {
  return useQuery({
    ...telehealthQualityQueryOptions(token, range),
    enabled: Boolean(token) && Boolean(range.from) && Boolean(range.to),
  });
}
