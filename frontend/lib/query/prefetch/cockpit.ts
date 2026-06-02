import type { QueryClient } from "@tanstack/react-query";
import { todayLocalIso } from "@/lib/dates";
import {
  appointmentsQueryOptions,
  dashboardEventsUnreadCountQueryOptions,
  doctorSettingsQueryOptions,
  opdQueueSessionQueryOptions,
  pendingReviewsCountQueryOptions,
  rxSentTodayQueryOptions,
} from "@/lib/query/options";

async function safePrefetch(
  queryClient: QueryClient,
  options: Parameters<QueryClient["prefetchQuery"]>[0],
): Promise<void> {
  try {
    await queryClient.prefetchQuery(options);
  } catch {
    // Client hooks retry on prefetch failure (np-08 §4.2).
  }
}

export async function prefetchCockpitKpiQueries(
  queryClient: QueryClient,
  token: string,
): Promise<void> {
  const today = todayLocalIso();
  await Promise.allSettled([
    safePrefetch(queryClient, appointmentsQueryOptions(token)),
    safePrefetch(queryClient, rxSentTodayQueryOptions(token)),
    safePrefetch(queryClient, pendingReviewsCountQueryOptions(token)),
    safePrefetch(queryClient, opdQueueSessionQueryOptions(token, today)),
    safePrefetch(queryClient, dashboardEventsUnreadCountQueryOptions(token)),
  ]);
}

export async function prefetchCockpitAppointmentsQuery(
  queryClient: QueryClient,
  token: string,
): Promise<void> {
  await safePrefetch(queryClient, appointmentsQueryOptions(token));
}

export async function prefetchCockpitOpdStripQueries(
  queryClient: QueryClient,
  token: string,
): Promise<void> {
  const today = todayLocalIso();
  await Promise.allSettled([
    safePrefetch(queryClient, doctorSettingsQueryOptions(token)),
    safePrefetch(queryClient, opdQueueSessionQueryOptions(token, today)),
  ]);
}
