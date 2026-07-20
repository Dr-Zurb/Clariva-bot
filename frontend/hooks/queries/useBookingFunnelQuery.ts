"use client";

import { useQuery } from "@tanstack/react-query";
import { bookingFunnelQueryOptions } from "@/lib/query/options";

/**
 * insights-v1 · Tier-2 booking funnel + review SLA for a selected date range.
 * Mirror of `usePracticeHealthQuery`.
 */
export function useBookingFunnelQuery(
  token: string,
  range: { from: string; to: string },
) {
  return useQuery({
    ...bookingFunnelQueryOptions(token, range),
    enabled: Boolean(token) && Boolean(range.from) && Boolean(range.to),
  });
}
