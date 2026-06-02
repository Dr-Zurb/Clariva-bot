"use client";

/**
 * URL-backed filter state for the patients v2 list (pr-06 / DL-4).
 */

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { PatientListFilters, PatientListSortId, PatientSegmentId } from "@/types/patient";

const VALID_SEGMENTS = new Set<PatientSegmentId>([
  "active-90d",
  "new-30d",
  "at-risk-followup",
  "no-show-prone",
  "has-allergies",
  "has-open-episodes",
  "untagged",
]);

const VALID_SORTS = new Set<PatientListSortId>([
  "last-visit-desc",
  "last-visit-asc",
  "created-at-desc",
  "created-at-asc",
  "name-asc",
]);

export function readFiltersFromUrl(searchParams: URLSearchParams): PatientListFilters {
  const filters: PatientListFilters = {};
  const q = searchParams.get("q");
  if (q) filters.q = q;

  const segment = searchParams.get("segment") as PatientSegmentId | null;
  if (segment && VALID_SEGMENTS.has(segment)) filters.segment = segment;

  const sort = searchParams.get("sort") as PatientListSortId | null;
  if (sort && VALID_SORTS.has(sort)) filters.sort = sort;

  const pageRaw = searchParams.get("page");
  if (pageRaw) {
    const page = Number.parseInt(pageRaw, 10);
    if (Number.isFinite(page) && page >= 1) filters.page = page;
  }

  const pageSizeRaw = searchParams.get("pageSize");
  if (pageSizeRaw) {
    const pageSize = Number.parseInt(pageSizeRaw, 10);
    if (Number.isFinite(pageSize) && pageSize >= 1) filters.pageSize = pageSize;
  }

  return filters;
}

/** True when any list-driving query param is present (used for default-view bootstrap). */
export function hasListFilterParams(searchParams: URLSearchParams): boolean {
  return (
    searchParams.has("q") ||
    searchParams.has("segment") ||
    searchParams.has("sort") ||
    searchParams.has("page") ||
    searchParams.has("pageSize")
  );
}

export interface UsePatientsListFiltersResult {
  filters: PatientListFilters;
  q: string;
  activeSegment: PatientSegmentId | null;
  setQ: (next: string) => void;
  setSegment: (next: PatientSegmentId | null) => void;
  toggleSegment: (segment: PatientSegmentId) => void;
  setSort: (sort: PatientListSortId | undefined) => void;
  setPage: (page: number) => void;
  clearListFilters: () => void;
  applyFilters: (next: PatientListFilters) => void;
}

export function usePatientsListFilters(): UsePatientsListFiltersResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => readFiltersFromUrl(searchParams), [searchParams]);
  const q = filters.q ?? "";
  const activeSegment = filters.segment ?? null;

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setQ = useCallback(
    (next: string) => {
      replaceParams((params) => {
        if (next.trim()) params.set("q", next.trim());
        else params.delete("q");
        params.delete("page");
      });
    },
    [replaceParams],
  );

  const setSegment = useCallback(
    (next: PatientSegmentId | null) => {
      replaceParams((params) => {
        if (next) params.set("segment", next);
        else params.delete("segment");
        params.delete("page");
      });
    },
    [replaceParams],
  );

  const toggleSegment = useCallback(
    (segment: PatientSegmentId) => {
      setSegment(activeSegment === segment ? null : segment);
    },
    [activeSegment, setSegment],
  );

  const setSort = useCallback(
    (sort: PatientListSortId | undefined) => {
      replaceParams((params) => {
        if (sort) params.set("sort", sort);
        else params.delete("sort");
        params.delete("page");
      });
    },
    [replaceParams],
  );

  const setPage = useCallback(
    (page: number) => {
      replaceParams((params) => {
        if (page > 1) params.set("page", String(page));
        else params.delete("page");
      });
    },
    [replaceParams],
  );

  const clearListFilters = useCallback(() => {
    replaceParams((params) => {
      params.delete("q");
      params.delete("segment");
      params.delete("sort");
      params.delete("page");
    });
  }, [replaceParams]);

  const applyFilters = useCallback(
    (next: PatientListFilters) => {
      replaceParams((params) => {
        params.delete("q");
        params.delete("segment");
        params.delete("sort");
        params.delete("page");
        params.delete("pageSize");

        if (next.q?.trim()) params.set("q", next.q.trim());
        if (next.segment) params.set("segment", next.segment);
        if (next.sort) params.set("sort", next.sort);
        if (next.page !== undefined && next.page > 1) params.set("page", String(next.page));
        if (next.pageSize !== undefined) params.set("pageSize", String(next.pageSize));
      });
    },
    [replaceParams],
  );

  return {
    filters,
    q,
    activeSegment,
    setQ,
    setSegment,
    toggleSegment,
    setSort,
    setPage,
    clearListFilters,
    applyFilters,
  };
}
