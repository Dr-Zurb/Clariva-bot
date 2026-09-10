"use client";

/**
 * Fetches attested medicine+sig habits once per browser session.
 * Capture bar filters client-side as the doctor types a bare drug name.
 *
 * Failure mode: empty list — hint stays hidden (cold start).
 */

import { useEffect, useRef, useState } from "react";
import {
  fetchDoctorMedicineCombos,
  type DoctorMedicineCombo,
} from "@/lib/api/doctor-medicine-combos";

export interface UseDoctorMedicineCombosResult {
  combos: DoctorMedicineCombo[];
  isLoading: boolean;
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

  return { combos, isLoading };
}
