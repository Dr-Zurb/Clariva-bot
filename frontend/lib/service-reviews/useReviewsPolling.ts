"use client";

/**
 * Visibility-aware polling for service-staff review lists.
 * Mirrors the interval + visibility + stale-while-revalidate pattern in useDashboardCounts.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getServiceStaffReviews } from "@/lib/api";
import type {
  ServiceStaffReviewListItem,
  ServiceStaffReviewListQueryStatus,
} from "@/types/service-staff-review";

export const REVIEWS_POLL_INTERVAL_MS = 30_000;

export interface UseReviewsPollingOptions {
  token: string;
  tab: ServiceStaffReviewListQueryStatus;
  intervalMs?: number;
  paused?: boolean;
}

export interface UseReviewsPollingResult {
  rows: ServiceStaffReviewListItem[] | null;
  isFetching: boolean;
  refetch: () => Promise<void>;
}

export function useReviewsPolling({
  token,
  tab,
  intervalMs = REVIEWS_POLL_INTERVAL_MS,
  paused = false,
}: UseReviewsPollingOptions): UseReviewsPollingResult {
  const [rows, setRows] = useState<ServiceStaffReviewListItem[] | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const mountedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRef = useRef(token);
  const tabRef = useRef(tab);
  const pausedRef = useRef(paused);
  const prevPausedRef = useRef(paused);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const fetchRows = useCallback(async () => {
    if (pausedRef.current) return;

    const tok = tokenRef.current;
    if (!tok) return;

    const requestTab = tabRef.current;
    setIsFetching(true);

    try {
      const res = await getServiceStaffReviews(tok, requestTab);
      if (!mountedRef.current) return;
      if (tabRef.current !== requestTab) return;
      setRows(res.data.reviews);
    } catch {
      // Stale-while-revalidate: keep last good rows on error (no PHI logging).
    } finally {
      if (mountedRef.current) setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    setRows(null);
  }, [tab]);

  useEffect(() => {
    if (!token) return;

    mountedRef.current = true;

    const clearPollingInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const startPollingInterval = () => {
      clearPollingInterval();
      if (pausedRef.current) return;

      intervalRef.current = setInterval(() => {
        if (document.visibilityState === "visible" && !pausedRef.current) {
          fetchRows().catch(() => {});
        }
      }, intervalMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (!pausedRef.current) {
          fetchRows().catch(() => {});
        }
        startPollingInterval();
      } else {
        clearPollingInterval();
      }
    };

    if (prevPausedRef.current && !paused) {
      fetchRows().catch(() => {});
    }
    prevPausedRef.current = paused;

    startPollingInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      clearPollingInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [token, tab, intervalMs, paused, fetchRows]);

  return { rows, isFetching, refetch: fetchRows };
}
