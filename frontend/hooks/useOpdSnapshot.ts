"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getOpdSessionSnapshot } from "@/lib/api";
import type { PatientOpdSnapshot } from "@/types/opd-session";

const FALLBACK_POLL_MS = 20_000;

export interface UseOpdSnapshotResult {
  snapshot: PatientOpdSnapshot | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Polls GET /bookings/session/snapshot with consultation token (e-task-opd-05).
 * Does not log tokens (avoid analytics/PHI).
 */
export function useOpdSnapshot(
  consultationToken: string | null | undefined
): UseOpdSnapshotResult {
  const [snapshot, setSnapshot] = useState<PatientOpdSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(consultationToken);

  useEffect(() => {
    tokenRef.current = consultationToken;
  }, [consultationToken]);

  const fetchSnapshot = useCallback(async () => {
    const t = tokenRef.current;
    if (!t?.trim()) return;
    try {
      const res = await getOpdSessionSnapshot(t);
      setSnapshot(res.data.snapshot);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load visit status";
      setError(msg);
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!consultationToken?.trim()) {
      setLoading(false);
      setError(
        "Missing visit link. Open this page from the link shared by your doctor."
      );
      return;
    }
    setLoading(true);
    void fetchSnapshot();
  }, [consultationToken, fetchSnapshot]);

  useEffect(() => {
    if (!consultationToken?.trim()) return;
    if (error) return;

    const ms =
      snapshot?.suggestedPollSeconds != null
        ? Math.max(15, snapshot.suggestedPollSeconds) * 1000
        : FALLBACK_POLL_MS;
    const id = setInterval(() => {
      void fetchSnapshot();
    }, ms);
    return () => clearInterval(id);
  }, [
    consultationToken,
    snapshot?.suggestedPollSeconds,
    fetchSnapshot,
    error,
  ]);

  return { snapshot, loading, error, refetch: fetchSnapshot };
}
