"use client";

import { useQuery } from "@tanstack/react-query";
import { practiceHealthQueryOptions } from "@/lib/query/options";

/**
 * insights-v1 · Tier-1 practice-health overview for a selected date range.
 * Mirror of `useRxSentTodayQuery` — thin wrapper over query options.
 */
export function usePracticeHealthQuery(
  token: string,
  range: { from: string; to: string },
) {
  return useQuery({
    ...practiceHealthQueryOptions(token, range),
    enabled: Boolean(token) && Boolean(range.from) && Boolean(range.to),
  });
}
