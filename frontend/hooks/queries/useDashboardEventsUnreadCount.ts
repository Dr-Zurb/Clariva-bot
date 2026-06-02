"use client";

import { useQuery } from "@tanstack/react-query";
import {
  DASHBOARD_EVENTS_FILTERS,
  dashboardEventsUnreadCountQueryOptions,
} from "@/lib/query/options";

export { DASHBOARD_EVENTS_FILTERS };

export function useDashboardEventsUnreadCount(token: string) {
  return useQuery({
    ...dashboardEventsUnreadCountQueryOptions(token),
    enabled: Boolean(token),
  });
}
