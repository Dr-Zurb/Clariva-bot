import type { QueryClient } from "@tanstack/react-query";
import {
  patientOverviewQueryOptions,
  patientVitalsQueryOptions,
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

/** Prefetch first-paint patient detail reads in parallel (np-08). */
export async function prefetchPatientDetailQueries(
  queryClient: QueryClient,
  token: string,
  patientId: string,
): Promise<void> {
  await Promise.allSettled([
    safePrefetch(queryClient, patientOverviewQueryOptions(token, patientId)),
    safePrefetch(queryClient, patientVitalsQueryOptions(token, patientId)),
  ]);
}
