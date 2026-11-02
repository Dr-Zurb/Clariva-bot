"use client";

/**
 * Sidebar badges and the header bell share one 30s poll of
 * GET /api/v1/dashboard/counts. Paused while the tab is hidden.
 */

import { useQuery } from "@tanstack/react-query";
import { dashboardCountsQueryOptions } from "@/lib/query/options";

export interface DashboardCounts {
  bookingReviewsUnconfirmed: number;
  opdLive: number;
  dashboardEventsUnread: number;
}

export function useDashboardCounts(token: string): {
  counts: DashboardCounts | null;
  isLoading: boolean;
  error: Error | null;
} {
  const query = useQuery({
    ...dashboardCountsQueryOptions(token),
    enabled: Boolean(token),
  });

  const counts = token && query.data ? query.data : null;
  const isLoading = Boolean(token) && query.isPending && query.data === undefined;
  const error = query.error instanceof Error ? query.error : null;

  return { counts, isLoading, error };
}
