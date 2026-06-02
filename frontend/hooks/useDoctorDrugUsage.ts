"use client";

/**
 * useDoctorDrugUsage (rx-polish-favorites · rxf-05)
 *
 * Fetches `GET /api/v1/doctors/me/drug-usage` once per browser session.
 * Powers DrugAutocomplete personal ranking — silent re-rank only.
 *
 * Session caching: scores stored in a module-level Map keyed on the first
 * 16 characters of the auth token. Subsequent mounts skip the network call.
 *
 * Failure mode: empty scores — cold-start ordering matches pre-batch behaviour.
 */

import { useEffect, useRef, useState } from "react";
import { fetchDoctorDrugUsage } from "@/lib/api/doctor-drug-usage";

export interface UseDoctorDrugUsageResult {
  scores: Record<string, number>;
  isLoading: boolean;
}

const SESSION_CACHE = new Map<string, Record<string, number>>();

function tokenCacheKey(token: string): string {
  return token.slice(0, 16);
}

export function useDoctorDrugUsage(token: string): UseDoctorDrugUsageResult {
  const cacheKey = tokenCacheKey(token);
  const cached = SESSION_CACHE.get(cacheKey);

  const [scores, setScores] = useState<Record<string, number>>(cached ?? {});
  const [isLoading, setIsLoading] = useState(!cached);
  const fetchedRef = useRef(!!cached);

  useEffect(() => {
    if (!token || fetchedRef.current) return;
    fetchedRef.current = true;

    async function load() {
      try {
        const fetched = await fetchDoctorDrugUsage(token);
        SESSION_CACHE.set(cacheKey, fetched);
        setScores(fetched);
      } catch {
        // Ranking enhancement only — swallow errors; cold-start ordering applies.
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [token, cacheKey]);

  return { scores, isLoading };
}
