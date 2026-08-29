"use client";

/**
 * Visibility-aware polling for Inbox interaction lists (ibi-10 / ibi-16).
 * Supports cursor "Load more". Funnel counts are requested on filter change /
 * visibility refresh / manual refetch — not on every interval poll.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyInteractionStageCounts,
  getInteractions,
  type InteractionFusedStatus,
  type InteractionListItem,
  type InteractionStageCounts,
} from "@/lib/api";
import { POLL_INTERVAL } from "@/lib/query/polling";

export const INBOX_POLL_INTERVAL_MS = POLL_INTERVAL.COUNTS;
const PAGE_LIMIT = 50;

export interface InboxListFilters {
  scope: "signal" | "all";
  channel?: "instagram" | "facebook" | "whatsapp";
  statuses?: InteractionFusedStatus[];
  dateFrom?: string;
  dateTo?: string;
}

export interface UseInboxPollingOptions {
  token: string;
  filters: InboxListFilters;
  intervalMs?: number;
  paused?: boolean;
  initialRows?: InteractionListItem[];
  initialCounts?: InteractionStageCounts;
  initialNextCursor?: string | null;
}

export interface UseInboxPollingResult {
  rows: InteractionListItem[] | null;
  counts: InteractionStageCounts | null;
  nextCursor: string | null;
  isFetching: boolean;
  isLoadingMore: boolean;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
}

function filtersKey(f: InboxListFilters): string {
  return JSON.stringify({
    scope: f.scope,
    channel: f.channel ?? "",
    statuses: f.statuses ?? [],
    dateFrom: f.dateFrom ?? "",
    dateTo: f.dateTo ?? "",
  });
}

export function useInboxPolling({
  token,
  filters,
  intervalMs = INBOX_POLL_INTERVAL_MS,
  paused = false,
  initialRows,
  initialCounts,
  initialNextCursor = null,
}: UseInboxPollingOptions): UseInboxPollingResult {
  const [rows, setRows] = useState<InteractionListItem[] | null>(
    initialRows ?? null
  );
  const [counts, setCounts] = useState<InteractionStageCounts | null>(
    initialCounts ?? null
  );
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [isFetching, setIsFetching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const mountedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRef = useRef(token);
  const filtersRef = useRef(filters);
  const pausedRef = useRef(paused);
  const nextCursorRef = useRef(nextCursor);
  const key = filtersKey(filters);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  const fetchRows = useCallback(async (opts?: { includeCounts?: boolean }) => {
    if (pausedRef.current) return;
    const tok = tokenRef.current;
    if (!tok) return;

    const includeCounts = opts?.includeCounts !== false;
    const requestKey = filtersKey(filtersRef.current);
    setIsFetching(true);
    try {
      const f = filtersRef.current;
      const res = await getInteractions(tok, {
        scope: f.scope,
        channel: f.channel,
        statuses: f.statuses,
        dateFrom: f.dateFrom,
        dateTo: f.dateTo,
        limit: PAGE_LIMIT,
        includeCounts,
      });
      if (!mountedRef.current) return;
      if (filtersKey(filtersRef.current) !== requestKey) return;
      setRows(res.data.interactions);
      if (includeCounts) {
        setCounts(res.data.counts ?? emptyInteractionStageCounts());
      }
      setNextCursor(res.data.nextCursor);
    } catch {
      // Stale-while-revalidate
    } finally {
      if (mountedRef.current) setIsFetching(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (pausedRef.current) return;
    const cursor = nextCursorRef.current;
    if (!cursor) return;
    const tok = tokenRef.current;
    if (!tok) return;

    const requestKey = filtersKey(filtersRef.current);
    setIsLoadingMore(true);
    try {
      const f = filtersRef.current;
      const res = await getInteractions(tok, {
        scope: f.scope,
        channel: f.channel,
        statuses: f.statuses,
        dateFrom: f.dateFrom,
        dateTo: f.dateTo,
        cursor,
        limit: PAGE_LIMIT,
        includeCounts: false,
      });
      if (!mountedRef.current) return;
      if (filtersKey(filtersRef.current) !== requestKey) return;
      setRows((prev) => {
        const seen = new Set((prev ?? []).map((r) => r.id));
        const appended = res.data.interactions.filter((r) => !seen.has(r.id));
        return [...(prev ?? []), ...appended];
      });
      setNextCursor(res.data.nextCursor);
    } catch {
      // Keep existing rows
    } finally {
      if (mountedRef.current) setIsLoadingMore(false);
    }
  }, []);

  const refetch = useCallback(async () => {
    await fetchRows({ includeCounts: true });
  }, [fetchRows]);

  const prevKeyRef = useRef(key);
  useEffect(() => {
    if (prevKeyRef.current === key) return;
    prevKeyRef.current = key;
    // Filter change: clear until the matching fetch lands (keep SSR seed on first mount).
    setRows(null);
    setCounts(null);
    setNextCursor(null);
  }, [key]);

  useEffect(() => {
    mountedRef.current = true;
    // Filter change / mount / resume: refresh list + counts.
    void fetchRows({ includeCounts: true });

    const clear = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const start = () => {
      clear();
      if (pausedRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      // Interval polls: list only — keep last known funnel counts.
      intervalRef.current = setInterval(() => {
        void fetchRows({ includeCounts: false });
      }, intervalMs);
    };

    start();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchRows({ includeCounts: true });
        start();
      } else {
        clear();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mountedRef.current = false;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchRows, intervalMs, key, token, paused]);

  return {
    rows,
    counts,
    nextCursor,
    isFetching,
    isLoadingMore,
    loadMore,
    refetch,
  };
}
