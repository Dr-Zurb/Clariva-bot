"use client";

/**
 * useDashboardCounts (task-ui-B3, np-05)
 *
 * Three parallel reads aggregated locally via TanStack Query shared keys:
 *   - bookingReviewsUnconfirmed: pending service-staff reviews
 *   - opdLive: active queue entries for today
 *   - dashboardEventsUnread: unread dashboard events
 *
 * Polling: every 30 s per query, paused while tab is hidden.
 * Stale-while-revalidate: TanStack keeps last good values on partial errors.
 */

import { useMemo } from "react";
import { todayLocalIso } from "@/lib/dates";
import { useDashboardEventsUnreadCount } from "@/hooks/queries/useDashboardEventsUnreadCount";
import { useOpdQueueSessionQuery } from "@/hooks/queries/useOpdQueueSessionQuery";
import { usePendingReviewsCountQuery } from "@/hooks/queries/usePendingReviewsCountQuery";

export interface DashboardCounts {
  bookingReviewsUnconfirmed: number;
  opdLive: number;
  dashboardEventsUnread: number;
}

/** Queue statuses that count as "live in queue" (sidebar badge semantics). */
const OPD_ACTIVE_STATUSES = new Set(["waiting", "called", "in_progress"]);

export function useDashboardCounts(token: string): {
  counts: DashboardCounts | null;
  isLoading: boolean;
  error: Error | null;
} {
  const today = todayLocalIso();

  const reviewsQuery = usePendingReviewsCountQuery(token);
  const queueQuery = useOpdQueueSessionQuery(token, today);
  const eventsQuery = useDashboardEventsUnreadCount(token);

  const counts = useMemo((): DashboardCounts | null => {
    if (!token) return null;

    const awaitingInitial =
      reviewsQuery.isPending &&
      reviewsQuery.data === undefined &&
      queueQuery.isPending &&
      queueQuery.data === undefined &&
      eventsQuery.isPending &&
      eventsQuery.data === undefined;

    if (awaitingInitial) return null;

    const opdLive = queueQuery.data
      ? queueQuery.data.data.entries.filter((entry) =>
          OPD_ACTIVE_STATUSES.has(entry.queueStatus),
        ).length
      : 0;

    return {
      bookingReviewsUnconfirmed: reviewsQuery.data ?? 0,
      opdLive,
      dashboardEventsUnread: eventsQuery.data ?? 0,
    };
  }, [
    token,
    reviewsQuery.data,
    reviewsQuery.isPending,
    queueQuery.data,
    queueQuery.isPending,
    eventsQuery.data,
    eventsQuery.isPending,
  ]);

  const isLoading = Boolean(token) && counts === null;

  const error =
    reviewsQuery.error ??
    queueQuery.error ??
    eventsQuery.error ??
    null;

  return { counts, isLoading, error };
}
