"use client";

/**
 * Fetches attested chief-complaint habits once per browser session.
 * Capture bar filters client-side as the doctor types a name.
 *
 * Failure mode: empty list — hint stays hidden (cold start).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearDoctorComplaintCombo,
  fetchDoctorComplaintCombos,
  sameComplaintComboHabit,
  type DoctorComplaintCombo,
} from "@/lib/api/doctor-complaint-combos";

export interface UseDoctorComplaintCombosResult {
  combos: DoctorComplaintCombo[];
  isLoading: boolean;
  clearCombo: (combo: DoctorComplaintCombo) => Promise<void>;
}

const SESSION_CACHE = new Map<string, DoctorComplaintCombo[]>();

function tokenCacheKey(token: string): string {
  return token.slice(0, 16);
}

export function useDoctorComplaintCombos(
  token: string
): UseDoctorComplaintCombosResult {
  const cacheKey = tokenCacheKey(token);
  const cached = SESSION_CACHE.get(cacheKey);

  const [combos, setCombos] = useState<DoctorComplaintCombo[]>(cached ?? []);
  const [isLoading, setIsLoading] = useState(!cached);
  const fetchedRef = useRef(!!cached);

  useEffect(() => {
    if (!token || fetchedRef.current) return;
    fetchedRef.current = true;

    async function load() {
      try {
        const fetched = await fetchDoctorComplaintCombos(token);
        SESSION_CACHE.set(cacheKey, fetched);
        setCombos(fetched);
      } catch {
        // Enhancement only — swallow errors; capture bar stays silent.
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [token, cacheKey]);

  const clearCombo = useCallback(
    async (combo: DoctorComplaintCombo) => {
      if (!token) return;
      await clearDoctorComplaintCombo(token, combo);
      setCombos((prev) => {
        const next = prev.filter((row) => !sameComplaintComboHabit(row, combo));
        SESSION_CACHE.set(cacheKey, next);
        return next;
      });
    },
    [cacheKey, token]
  );

  return { combos, isLoading, clearCombo };
}
