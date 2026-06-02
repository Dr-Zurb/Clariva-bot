"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listPrescriptionsByPatient } from "@/lib/api";
import type { PrescriptionWithRelations } from "@/types/prescription";
import { filterPriorRxList, type PriorRxChip } from "@/lib/cockpit/prior-rx-filter";

export interface UsePriorRxListInput {
  patientId: string | null;
  token: string;
  chip: PriorRxChip;
  search: string;
  currentDx: string;
  activeConditions: string[];
}

export interface UsePriorRxListResult {
  all: PrescriptionWithRelations[];
  filtered: PrescriptionWithRelations[];
  isLoading: boolean;
  error?: Error;
  reload: () => void;
}

export function usePriorRxList(input: UsePriorRxListInput): UsePriorRxListResult {
  const [all, setAll] = useState<PrescriptionWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!input.patientId) {
      setAll([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    listPrescriptionsByPatient(input.token, input.patientId)
      .then((res) => {
        if (cancelled) return;
        setAll(res.data.prescriptions ?? []);
        setError(undefined);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err as Error);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [input.patientId, input.token, reloadToken]);

  const filtered = useMemo(
    () =>
      filterPriorRxList(all, {
        chip: input.chip,
        search: input.search,
        currentDx: input.currentDx,
        activeConditions: input.activeConditions,
      }),
    [all, input.chip, input.search, input.currentDx, input.activeConditions],
  );

  return { all, filtered, isLoading, error, reload };
}
