import type { QueryClient } from "@tanstack/react-query";
import { deskVitalsQueryOptions } from "@/lib/cockpit/desk-vitals-query";
import { lastVisitSummaryQueryOptions } from "@/lib/cockpit/last-visit-summary-query";
import {
  patientAllergiesQueryOptions,
  patientConditionsQueryOptions,
  patientMedicalBackgroundQueryOptions,
} from "@/lib/query/options";

async function safePrefetch(
  queryClient: QueryClient,
  options: Parameters<QueryClient["prefetchQuery"]>[0]
): Promise<void> {
  try {
    await queryClient.prefetchQuery(options);
  } catch {
    // The next cockpit refetches on miss.
  }
}

export interface NextConsultPrefetchTarget {
  appointmentId: string;
  patientId?: string | null;
}

/**
 * Warm the queries the next cockpit reads on first paint: consult vitals
 * plus ribbon/chart allergies, PMH, and conditions.
 */
export async function prefetchNextConsultQueries(
  queryClient: QueryClient,
  token: string,
  next: NextConsultPrefetchTarget | null | undefined
): Promise<void> {
  if (!token || !next?.appointmentId) return;
  const tasks: Array<Promise<void>> = [
    safePrefetch(
      queryClient,
      deskVitalsQueryOptions(token, next.appointmentId)
    ),
  ];
  if (next.patientId) {
    tasks.push(
      safePrefetch(
        queryClient,
        lastVisitSummaryQueryOptions(token, next.patientId, next.appointmentId)
      ),
      safePrefetch(
        queryClient,
        patientAllergiesQueryOptions(token, next.patientId)
      ),
      safePrefetch(
        queryClient,
        patientMedicalBackgroundQueryOptions(token, next.patientId)
      ),
      safePrefetch(
        queryClient,
        patientConditionsQueryOptions(token, next.patientId)
      )
    );
  }
  await Promise.allSettled(tasks);
}

/** Fire-and-forget wrapper for hover / live-consult warmup. */
export function prefetchNextConsult(
  queryClient: QueryClient,
  token: string,
  next: NextConsultPrefetchTarget | null | undefined
): void {
  void prefetchNextConsultQueries(queryClient, token, next);
}
