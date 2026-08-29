"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  patientListFiltersKey,
  projectPatientsListClientSide,
  segmentNeedsServerFetch,
} from "@/lib/patients-v2/client-list-filter";
import {
  normalizePatientsListFilters,
  PATIENTS_LIST_PAGE_SIZE,
  patientsListQueryOptions,
} from "@/lib/query/prefetch/patients-list";
import type { PatientListFilters, PatientsListPagedData } from "@/types/patient";

/** One enriched roster page — client filters segments/search/sort locally. */
const ROSTER_FILTERS: PatientListFilters = {
  page: 1,
  pageSize: 200,
};

export function usePatientsListQuery(
  token: string,
  filters: PatientListFilters,
  refreshKey = 0,
) {
  const filtersKey = patientListFiltersKey(filters);
  const normalized = useMemo(
    () => normalizePatientsListFilters(filters),
    // filtersKey is the stable content fingerprint for `filters`.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
    [filtersKey],
  );
  const needsServer = segmentNeedsServerFetch(normalized.segment);

  const rosterQuery = useQuery({
    ...patientsListQueryOptions(token, ROSTER_FILTERS, refreshKey),
    enabled: Boolean(token) && !needsServer,
    placeholderData: keepPreviousData,
  });

  const serverQuery = useQuery({
    ...patientsListQueryOptions(token, normalized, refreshKey),
    enabled: Boolean(token) && needsServer,
    placeholderData: keepPreviousData,
  });

  const rosterIncomplete =
    Boolean(rosterQuery.data) &&
    (rosterQuery.data?.total ?? 0) > (rosterQuery.data?.patients.length ?? 0);

  const serverFallbackQuery = useQuery({
    ...patientsListQueryOptions(token, normalized, refreshKey),
    enabled: Boolean(token) && !needsServer && rosterIncomplete,
    placeholderData: keepPreviousData,
  });

  const clientProjected = useMemo((): PatientsListPagedData | undefined => {
    if (needsServer || !rosterQuery.data || rosterIncomplete) return undefined;
    return (
      projectPatientsListClientSide(rosterQuery.data, {
        ...normalized,
        pageSize: normalized.pageSize ?? PATIENTS_LIST_PAGE_SIZE,
      }) ?? undefined
    );
  }, [needsServer, normalized, rosterIncomplete, rosterQuery.data]);

  const rosterPatients = rosterQuery.data?.patients;

  if (needsServer) {
    return {
      data: serverQuery.data,
      isLoading: serverQuery.isLoading,
      isFetching: serverQuery.isFetching,
      isPlaceholderData: serverQuery.isPlaceholderData,
      error: serverQuery.error,
      refetch: serverQuery.refetch,
      rosterPatients: undefined,
    };
  }

  if (rosterIncomplete) {
    return {
      data: serverFallbackQuery.data,
      isLoading: serverFallbackQuery.isLoading || rosterQuery.isLoading,
      isFetching: serverFallbackQuery.isFetching || rosterQuery.isFetching,
      isPlaceholderData: serverFallbackQuery.isPlaceholderData,
      error: serverFallbackQuery.error ?? rosterQuery.error,
      refetch: serverFallbackQuery.refetch,
      rosterPatients,
    };
  }

  return {
    data: clientProjected,
    isLoading: rosterQuery.isLoading && !rosterQuery.data,
    // Segment/search/sort are sync once the roster is in memory.
    isFetching: rosterQuery.isFetching && !rosterQuery.data,
    isPlaceholderData: Boolean(rosterQuery.isPlaceholderData && !clientProjected),
    error: rosterQuery.error,
    refetch: rosterQuery.refetch,
    rosterPatients,
  };
}
