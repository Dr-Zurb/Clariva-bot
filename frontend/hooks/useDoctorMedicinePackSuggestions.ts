"use client";

/**
 * Loads recurring medicine-pack suggestions for the medicines template picker.
 * Failure mode: empty list — icon stays quiet.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  dismissDoctorMedicinePackSuggestion,
  fetchDoctorMedicinePackSuggestions,
  markDoctorMedicinePackSuggestionsSeen,
  type DoctorMedicinePackSuggestion,
  type DoctorMedicinePackSuggestionList,
} from "@/lib/api/doctor-medicine-pack-suggestions";

export interface UseDoctorMedicinePackSuggestionsResult {
  suggestions: DoctorMedicinePackSuggestion[];
  unseenCount: number;
  isLoading: boolean;
  dismissPack: (pack: DoctorMedicinePackSuggestion) => Promise<void>;
  markSeen: () => Promise<void>;
  removePack: (pack: DoctorMedicinePackSuggestion) => void;
}

const SESSION_CACHE = new Map<string, DoctorMedicinePackSuggestionList>();

function tokenCacheKey(token: string): string {
  return token.slice(0, 16);
}

function samePack(
  a: DoctorMedicinePackSuggestion,
  b: DoctorMedicinePackSuggestion
): boolean {
  if (a.medicines.length !== b.medicines.length) return false;
  const keys = (pack: DoctorMedicinePackSuggestion) =>
    pack.medicines
      .map((row) =>
        [
          row.nameKey,
          row.dosage,
          row.doseQty,
          row.doseUnit,
          row.frequencyCode,
          row.frequency,
          row.durationValue,
          row.durationUnit,
          row.duration,
          row.foodTiming,
          row.routeCode,
          row.form,
        ].join("|")
      )
      .sort()
      .join("||");
  return keys(a) === keys(b);
}

export function useDoctorMedicinePackSuggestions(
  token: string
): UseDoctorMedicinePackSuggestionsResult {
  const cacheKey = tokenCacheKey(token);
  const cached = SESSION_CACHE.get(cacheKey);

  const [suggestions, setSuggestions] = useState<DoctorMedicinePackSuggestion[]>(
    cached?.suggestions ?? []
  );
  const [unseenCount, setUnseenCount] = useState(cached?.unseenCount ?? 0);
  const [isLoading, setIsLoading] = useState(!cached);
  const fetchedRef = useRef(!!cached);

  useEffect(() => {
    if (!token || fetchedRef.current) return;
    fetchedRef.current = true;

    async function load() {
      try {
        const fetched = await fetchDoctorMedicinePackSuggestions(token);
        SESSION_CACHE.set(cacheKey, fetched);
        setSuggestions(fetched.suggestions);
        setUnseenCount(fetched.unseenCount);
      } catch {
        // Enhancement only — swallow errors; picker stays on saved templates.
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [token, cacheKey]);

  const persist = useCallback(
    (next: DoctorMedicinePackSuggestionList) => {
      SESSION_CACHE.set(cacheKey, next);
      setSuggestions(next.suggestions);
      setUnseenCount(next.unseenCount);
    },
    [cacheKey]
  );

  const removePack = useCallback(
    (pack: DoctorMedicinePackSuggestion) => {
      persist({
        suggestions: suggestions.filter((row) => !samePack(row, pack)),
        unseenCount: 0,
      });
    },
    [persist, suggestions]
  );

  const dismissPack = useCallback(
    async (pack: DoctorMedicinePackSuggestion) => {
      if (!token) return;
      await dismissDoctorMedicinePackSuggestion(token, pack.medicines);
      persist({
        suggestions: suggestions.filter((row) => !samePack(row, pack)),
        unseenCount: Math.max(0, unseenCount - 1),
      });
    },
    [persist, suggestions, token, unseenCount]
  );

  const markSeen = useCallback(async () => {
    if (!token || unseenCount === 0) {
      setUnseenCount(0);
      return;
    }
    try {
      await markDoctorMedicinePackSuggestionsSeen(token);
    } catch {
      // Badge can retry next load.
    }
    persist({ suggestions, unseenCount: 0 });
  }, [persist, suggestions, token, unseenCount]);

  return {
    suggestions,
    unseenCount,
    isLoading,
    dismissPack,
    markSeen,
    removePack,
  };
}
