"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import type { GhostVitals } from "@/components/cockpit/rx/inputs/VitalsExtended";
import { patchEmptyFieldsFromDeskVitals } from "@/lib/cockpit/desk-vitals-seed";
import { useRxSectionLock } from "@/components/cockpit/rx/useRxLock";
import {
  deskVitalsQueryOptions,
  ghostVitalsFromLastVisitSummary,
} from "@/lib/cockpit/desk-vitals-query";
import { useLastVisitSummary } from "@/hooks/useLastVisitSummary";

/**
 * Read-only previous-visit vitals (P2-D5 / lvc-14), sourced from the
 * canonical last-visit summary. Display writes nothing (LVC-DL-5).
 */
export function useLastVisitVitals(): GhostVitals | null {
  return ghostVitalsFromLastVisitSummary(useLastVisitSummary());
}

function useDeskVisitVitalsQuery() {
  const { token, appointmentId } = useRxForm();
  const { contentLocked } = useRxSectionLock();
  const options = deskVitalsQueryOptions(token, appointmentId);

  return useQuery({
    ...options,
    enabled: Boolean(token) && Boolean(appointmentId),
    // A closed visit never seeds, so stop watching for a late desk reading.
    refetchInterval: contentLocked ? false : options.refetchInterval,
  });
}

/** Same-visit front-desk reading. Empty/error → null. Seed writes empty fields only. */
export function useDeskVisitVitals(): GhostVitals | null {
  return useDeskVisitVitalsQuery().data?.ghost ?? null;
}

/** Visit-level desk note. Empty/error → null. */
export function useDeskVisitVitalsNote(): string | null {
  return useDeskVisitVitalsQuery().data?.note ?? null;
}

/**
 * Seed empty cockpit vitals (numbers + visit note) from the same-visit desk
 * reading. Last-visit ghosts stay click-to-apply; desk values fill the fields.
 */
export function DeskVitalsSectionNoteSeed(): null {
  const { state, seedFields } = useRxForm();
  const { contentLocked } = useRxSectionLock();
  const query = useDeskVisitVitalsQuery();

  useEffect(() => {
    if (!query.isSuccess) return;
    if (contentLocked) return;
    const desk = query.data ?? { ghost: null, note: null };
    const patch = patchEmptyFieldsFromDeskVitals(state.fields, desk);
    if (Object.keys(patch).length === 0) return;
    seedFields(patch);
  }, [contentLocked, query.data, query.isSuccess, seedFields, state.fields]);

  return null;
}
