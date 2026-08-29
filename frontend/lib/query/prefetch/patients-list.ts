import type { QueryClient } from "@tanstack/react-query";
import { getPatientsList } from "@/lib/api/patients";
import { queryKeys } from "@/lib/query/keys";
import { STALE } from "@/lib/query/stale";
import type { PatientListFilters, PatientSegmentId } from "@/types/patient";

/** Default page size used by PatientsTable — keep prefetch keys identical. */
export const PATIENTS_LIST_PAGE_SIZE = 50;

/**
 * KPI + secondary segment toggles we warm on idle / hover so first click
 * is a cache hit (same key as `usePatientsListQuery`).
 */
export const PATIENTS_LIST_PREFETCH_SEGMENTS: ReadonlyArray<PatientSegmentId | null> = [
  null,
  "incomplete-consult",
  "at-risk-followup",
  "new-30d",
  "revisit-30d",
  "no-show-prone",
  "has-allergies",
  "untagged",
];

/** Stable filter shape for list query keys (page/pageSize always present). */
export function normalizePatientsListFilters(
  filters: PatientListFilters,
): PatientListFilters {
  const next: PatientListFilters = {
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? PATIENTS_LIST_PAGE_SIZE,
  };
  if (filters.q?.trim()) next.q = filters.q.trim();
  if (filters.segment) next.segment = filters.segment;
  if (filters.tag?.trim()) next.tag = filters.tag.trim();
  if (filters.sort) next.sort = filters.sort;
  return next;
}

export function patientsListQueryOptions(
  token: string,
  filters: PatientListFilters,
  refreshKey = 0,
) {
  const normalized = normalizePatientsListFilters(filters);
  return {
    queryKey: [...queryKeys.patients.list({ ...normalized }), refreshKey] as const,
    queryFn: () => getPatientsList(token, normalized),
    staleTime: STALE.COUNTS,
  };
}

async function safePrefetch(
  queryClient: QueryClient,
  options: ReturnType<typeof patientsListQueryOptions>,
): Promise<void> {
  try {
    await queryClient.prefetchQuery(options);
  } catch {
    // Click path retries via usePatientsListQuery.
  }
}

/** Prefetch one segment (or unfiltered list when `segment` is null). */
export async function prefetchPatientsListSegment(
  queryClient: QueryClient,
  token: string,
  baseFilters: PatientListFilters,
  segment: PatientSegmentId | null,
  refreshKey = 0,
): Promise<void> {
  if (!token.trim()) return;
  const filters: PatientListFilters = {
    ...baseFilters,
    segment: segment ?? undefined,
    page: 1,
  };
  // Drop segment key when clearing so it matches "no segment" list queries.
  if (!segment) {
    delete filters.segment;
  }
  await safePrefetch(
    queryClient,
    patientsListQueryOptions(token, filters, refreshKey),
  );
}

/** Idle warm-up: walk common segments with a small gap (avoid stampede). */
export async function prefetchPatientsListSegmentsIdle(
  queryClient: QueryClient,
  token: string,
  baseFilters: PatientListFilters,
  options?: { signal?: AbortSignal; gapMs?: number },
): Promise<void> {
  const gapMs = options?.gapMs ?? 40;
  for (const segment of PATIENTS_LIST_PREFETCH_SEGMENTS) {
    if (options?.signal?.aborted) return;
    await prefetchPatientsListSegment(queryClient, token, baseFilters, segment);
    if (gapMs > 0) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, gapMs);
      });
    }
  }
}
