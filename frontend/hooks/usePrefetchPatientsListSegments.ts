"use client";

import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  prefetchPatientsListSegment,
  patientsListQueryOptions,
} from "@/lib/query/prefetch/patients-list";
import type { PatientListFilters, PatientSegmentId } from "@/types/patient";

const ROSTER_FILTERS: PatientListFilters = { page: 1, pageSize: 200 };

/**
 * Prefetch the enriched roster (client-filter source of truth).
 * Hover still warms server-only segments like `no-show-prone`.
 */
export function usePrefetchPatientsListSegments(
  token: string,
  _filters: PatientListFilters,
): (segment: PatientSegmentId | null) => void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token.trim()) return;
    if (typeof window === "undefined") return;

    let idleHandle: number | undefined;
    let timeoutHandle: number | undefined;

    const start = () => {
      void queryClient.prefetchQuery(patientsListQueryOptions(token, ROSTER_FILTERS));
    };

    if ("requestIdleCallback" in window) {
      idleHandle = window.requestIdleCallback(start, { timeout: 1200 });
    } else {
      timeoutHandle = window.setTimeout(start, 300);
    }

    return () => {
      if (idleHandle !== undefined && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== undefined) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [queryClient, token]);

  return useCallback(
    (segment: PatientSegmentId | null) => {
      // Roster covers client-filtered segments; warm server-only ones by key.
      if (
        segment === "no-show-prone" ||
        segment === "incomplete-consult" ||
        segment === "new-30d" ||
        segment === "revisit-30d"
      ) {
        void prefetchPatientsListSegment(queryClient, token, {}, segment);
      } else {
        void queryClient.prefetchQuery(patientsListQueryOptions(token, ROSTER_FILTERS));
      }
    },
    [queryClient, token],
  );
}
