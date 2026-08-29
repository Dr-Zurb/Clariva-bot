"use client";

/**
 * URL-backed filter state for the patients v2 list (pr-06 / DL-4).
 *
 * Local state updates synchronously on click so KPI/chip UI and the list
 * query start immediately; `router.replace` syncs the URL afterward (avoids
 * waiting on App Router soft-nav + server auth before the table reacts).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { patientListFiltersKey } from "@/lib/patients-v2/client-list-filter";
import type { PatientListFilters, PatientListSortId, PatientSegmentId } from "@/types/patient";

export { patientListFiltersKey };

const VALID_SEGMENTS = new Set<PatientSegmentId>([
  "active-90d",
  "new-30d",
  "revisit-30d",
  "at-risk-followup",
  "no-show-prone",
  "has-allergies",
  "has-open-episodes",
  "incomplete-consult",
  "untagged",
]);

const VALID_SORTS = new Set<PatientListSortId>([
  "last-visit-desc",
  "last-visit-asc",
  "created-at-desc",
  "created-at-asc",
  "name-asc",
]);

const TAG_MAX = 64;

export function readFiltersFromUrl(searchParams: URLSearchParams): PatientListFilters {
  const filters: PatientListFilters = {};
  const q = searchParams.get("q");
  if (q) filters.q = q;

  const segment = searchParams.get("segment") as PatientSegmentId | null;
  if (segment && VALID_SEGMENTS.has(segment)) filters.segment = segment;

  const tag = searchParams.get("tag");
  if (tag?.trim()) {
    const trimmed = tag.trim().slice(0, TAG_MAX);
    if (trimmed) filters.tag = trimmed;
  }

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
    searchParams.has("tag") ||
    searchParams.has("sort") ||
    searchParams.has("page") ||
    searchParams.has("pageSize")
  );
}

function writeFiltersToParams(params: URLSearchParams, next: PatientListFilters): void {
  params.delete("q");
  params.delete("segment");
  params.delete("tag");
  params.delete("sort");
  params.delete("page");
  params.delete("pageSize");

  if (next.q?.trim()) params.set("q", next.q.trim());
  if (next.segment) params.set("segment", next.segment);
  if (next.tag?.trim()) params.set("tag", next.tag.trim());
  if (next.sort) params.set("sort", next.sort);
  if (next.page !== undefined && next.page > 1) params.set("page", String(next.page));
  if (next.pageSize !== undefined) params.set("pageSize", String(next.pageSize));
}

export interface UsePatientsListFiltersResult {
  filters: PatientListFilters;
  q: string;
  activeSegment: PatientSegmentId | null;
  activeTag: string | null;
  setQ: (next: string) => void;
  setSegment: (next: PatientSegmentId | null) => void;
  toggleSegment: (segment: PatientSegmentId) => void;
  setTag: (next: string | null) => void;
  toggleTag: (tag: string) => void;
  setSort: (sort: PatientListSortId | undefined) => void;
  setPage: (page: number) => void;
  clearListFilters: () => void;
  applyFilters: (next: PatientListFilters) => void;
}

export function usePatientsListFilters(): UsePatientsListFiltersResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<PatientListFilters>(() =>
    readFiltersFromUrl(searchParams),
  );
  /** True while a local update is ahead of the URL (ignore stale searchParams). */
  const pendingUrlSyncRef = useRef(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Sync from URL only (back/forward). Do not depend on `filters` — that
  // re-fired setState every render when keys briefly disagreed.
  useEffect(() => {
    const fromUrl = readFiltersFromUrl(searchParams);
    const urlKey = patientListFiltersKey(fromUrl);
    const localKey = patientListFiltersKey(filtersRef.current);

    if (urlKey === localKey) {
      pendingUrlSyncRef.current = false;
      return;
    }
    if (pendingUrlSyncRef.current) {
      return;
    }
    setFilters(fromUrl);
  }, [searchParams]);

  const commitFilters = useCallback(
    (next: PatientListFilters) => {
      pendingUrlSyncRef.current = true;
      setFilters(next);
      const params = new URLSearchParams(searchParams.toString());
      writeFiltersToParams(params, next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const q = filters.q ?? "";
  const activeSegment = filters.segment ?? null;
  const activeTag = filters.tag?.trim() || null;

  const setQ = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      commitFilters({
        ...filters,
        q: trimmed || undefined,
        page: 1,
      });
    },
    [commitFilters, filters],
  );

  const setSegment = useCallback(
    (next: PatientSegmentId | null) => {
      const nextFilters: PatientListFilters = {
        ...filters,
        segment: next ?? undefined,
        page: 1,
      };
      // Untagged vs specific tag are mutually exclusive.
      if (next === "untagged") {
        delete nextFilters.tag;
      }
      commitFilters(nextFilters);
    },
    [commitFilters, filters],
  );

  const toggleSegment = useCallback(
    (segment: PatientSegmentId) => {
      setSegment(activeSegment === segment ? null : segment);
    },
    [activeSegment, setSegment],
  );

  const setTag = useCallback(
    (next: string | null) => {
      const trimmed = next?.trim().slice(0, TAG_MAX) || "";
      const nextFilters: PatientListFilters = {
        ...filters,
        tag: trimmed || undefined,
        page: 1,
      };
      if (trimmed && nextFilters.segment === "untagged") {
        delete nextFilters.segment;
      }
      commitFilters(nextFilters);
    },
    [commitFilters, filters],
  );

  const toggleTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed) return;
      setTag(
        activeTag && activeTag.toLowerCase() === trimmed.toLowerCase()
          ? null
          : trimmed,
      );
    },
    [activeTag, setTag],
  );

  const setSort = useCallback(
    (sort: PatientListSortId | undefined) => {
      commitFilters({
        ...filters,
        sort,
        page: 1,
      });
    },
    [commitFilters, filters],
  );

  const setPage = useCallback(
    (page: number) => {
      commitFilters({
        ...filters,
        page: page > 1 ? page : undefined,
      });
    },
    [commitFilters, filters],
  );

  const clearListFilters = useCallback(() => {
    commitFilters({});
  }, [commitFilters]);

  const applyFilters = useCallback(
    (next: PatientListFilters) => {
      commitFilters({ ...next, page: next.page && next.page > 1 ? next.page : 1 });
    },
    [commitFilters],
  );

  return {
    filters,
    q,
    activeSegment,
    activeTag,
    setQ,
    setSegment,
    toggleSegment,
    setTag,
    toggleTag,
    setSort,
    setPage,
    clearListFilters,
    applyFilters,
  };
}
