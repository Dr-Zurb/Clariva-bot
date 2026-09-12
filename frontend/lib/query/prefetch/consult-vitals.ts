import type { QueryClient } from "@tanstack/react-query";
import { deskVitalsQueryOptions } from "@/lib/cockpit/desk-vitals-query";
import { lastVisitSummaryQueryOptions } from "@/lib/cockpit/last-visit-summary-query";

async function safePrefetch(
  queryClient: QueryClient,
  options: Parameters<QueryClient["prefetchQuery"]>[0]
): Promise<void> {
  try {
    await queryClient.prefetchQuery(options);
  } catch {
    // Client hooks retry on prefetch failure (np-08 §4.2).
  }
}

/** Prefetch first-paint consult vitals in parallel (np-08). */
export async function prefetchConsultVitalsQueries(
  queryClient: QueryClient,
  token: string,
  appointmentId: string,
  patientId?: string | null
): Promise<void> {
  if (!token || !appointmentId) return;
  const tasks = [
    safePrefetch(queryClient, deskVitalsQueryOptions(token, appointmentId)),
  ];
  if (patientId) {
    tasks.push(
      safePrefetch(
        queryClient,
        lastVisitSummaryQueryOptions(token, patientId, appointmentId)
      )
    );
  }
  await Promise.allSettled(tasks);
}
