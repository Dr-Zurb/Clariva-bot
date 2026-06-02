"use client";

/**
 * useFavorites (rx-polish-favorites · rxf-04 / rxf-06)
 *
 * Loads the doctor's drug favorites for the chip strip in PlanSection.
 */

import { useCallback, useEffect, useState } from "react";
import {
  listFavorites,
  type DoctorDrugFavorite,
} from "@/lib/api/doctor-drug-favorites";

export interface UseFavoritesResult {
  data: DoctorDrugFavorite[];
  isLoading: boolean;
  refetch: () => Promise<DoctorDrugFavorite[]>;
}

export function useFavorites(token: string): UseFavoritesResult {
  const [data, setData] = useState<DoctorDrugFavorite[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    const rows = await listFavorites(token);
    setData(rows);
    return rows;
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const rows = await listFavorites(token);
        if (!cancelled) setData(rows);
      } catch {
        if (!cancelled) setData([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return { data, isLoading, refetch };
}
