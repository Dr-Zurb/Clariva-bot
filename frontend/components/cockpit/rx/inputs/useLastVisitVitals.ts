"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import type { GhostVitals } from "@/components/cockpit/rx/inputs/VitalsExtended";
import { patchEmptyFieldsFromDeskVitals } from "@/lib/cockpit/desk-vitals-seed";
import { useRxSectionLock } from "@/components/cockpit/rx/useRxLock";
import {
  deskVitalsQueryOptions,
  lastVisitVitalsQueryOptions,
} from "@/lib/cockpit/desk-vitals-query";

/**
 * Read-only previous-visit vitals (P2-D5), sourced from the episode's last
 * prescription. Never writes back into the form — purely a ghost reference.
 * Returns null until loaded, when no prior prescription exists, or on error.
 */
export function useLastVisitVitals(): GhostVitals | null {
  const { token, appointmentId } = useRxForm();

  // React Query cache (P2-D5): the ghost is a read-only reference, so a pane
  // re-add serves it from cache instead of re-hitting last-in-episode.
  const query = useQuery({
    ...lastVisitVitalsQueryOptions(token, appointmentId),
    enabled: Boolean(token) && Boolean(appointmentId),
  });

  return query.data ?? null;
}

function useDeskVisitVitalsQuery() {
  const { token, appointmentId } = useRxForm();

  return useQuery({
    ...deskVitalsQueryOptions(token, appointmentId),
    enabled: Boolean(token) && Boolean(appointmentId),
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
