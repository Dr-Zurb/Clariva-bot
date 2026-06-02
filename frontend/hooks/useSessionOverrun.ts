"use client";

import { useState, useEffect, useCallback } from "react";
import { getOpdSessionOverrun, type OverrunRow } from "@/lib/api";

export interface UseSessionOverrunResult {
  rows: OverrunRow[];
  count: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSessionOverrun(
  token: string | null,
  date: string | null
): UseSessionOverrunResult {
  const [rows, setRows] = useState<OverrunRow[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!token || !date) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await getOpdSessionOverrun(token, date);
      setRows(data.rows);
      setCount(data.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overrun");
    } finally {
      setIsLoading(false);
    }
  }, [token, date]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { rows, count, isLoading, error, refetch };
}
