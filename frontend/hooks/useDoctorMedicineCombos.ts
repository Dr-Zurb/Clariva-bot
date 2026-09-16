"use client";

/**
 * Fetches attested medicine+sig habits once per browser session.
 * Capture bar filters client-side as the doctor types a bare drug name.
 *
 * Failure mode: empty list — hint stays hidden (cold start).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearDoctorMedicineCombo,
  fetchDoctorMedicineCombos,
  sameMedicineComboHabit,
  type DoctorMedicineCombo,
} from "@/lib/api/doctor-medicine-combos";

export interface UseDoctorMedicineCombosResult {
  combos: DoctorMedicineCombo[];
  isLoading: boolean;
  clearCombo: (combo: DoctorMedicineCombo) => Promise<void>;
}

const SESSION_CACHE = new Map<string, DoctorMedicineCombo[]>();

function tokenCacheKey(token: string): string {
  return token.slice(0, 16);
}

export function useDoctorMedicineCombos(
  token: string
): UseDoctorMedicineCombosResult {
  const cacheKey = tokenCacheKey(token);
  const cached = SESSION_CACHE.get(cacheKey);

  const [combos, setCombos] = useState<DoctorMedicineCombo[]>(cached ?? []);
  const [isLoading, setIsLoading] = useState(!cached);
  const fetchedRef = useRef(!!cached);

  useEffect(() => {
    if (!token || fetchedRef.current) return;
    fetchedRef.current = true;

    async function load() {
      try {
        const fetched = await fetchDoctorMedicineCombos(token);
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
    async (combo: DoctorMedicineCombo) => {
      if (!token) return;
      await clearDoctorMedicineCombo(token, combo);
      setCombos((prev) => {
        const next = prev.filter((row) => !sameMedicineComboHabit(row, combo));
        SESSION_CACHE.set(cacheKey, next);
        return next;
      });
    },
    [cacheKey, token]
  );

  return { combos, isLoading, clearCombo };
}
