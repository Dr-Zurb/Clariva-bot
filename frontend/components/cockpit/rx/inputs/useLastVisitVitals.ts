"use client";

import { useQuery } from "@tanstack/react-query";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { getLastPrescriptionInEpisode } from "@/lib/api";
import type { GhostVitals } from "@/components/cockpit/rx/inputs/VitalsExtended";
import { vitalsByStorage, type ColumnVitalKey } from "@/lib/cockpit/vitals-schema";
import type { PrescriptionWithRelations } from "@/types/prescription";
import { queryKeys } from "@/lib/query/keys";
import { STALE } from "@/lib/query/stale";

/** Maps each column-backed vital key to its canonical column on a prescription row. */
const GHOST_COLUMN: Record<ColumnVitalKey, keyof PrescriptionWithRelations> = {
  vitalsBpSystolic: "vitals_bp_systolic",
  vitalsBpDiastolic: "vitals_bp_diastolic",
  vitalsHr: "vitals_hr",
  vitalsRr: "vitals_rr",
  vitalsTempC: "vitals_temp_c",
  vitalsSpo2: "vitals_spo2",
  vitalsWtKg: "vitals_wt_kg",
  vitalsHtCm: "vitals_ht_cm",
  vitalsPainScore: "vitals_pain_score",
  vitalsGlucoseMgDl: "vitals_glucose_mg_dl",
  vitalsGcsTotal: "vitals_gcs_total",
  vitalsHeadCircumferenceCm: "vitals_head_circumference_cm",
  vitalsMuacCm: "vitals_muac_cm",
  vitalsWaistCm: "vitals_waist_cm",
};

function extractGhostVitals(rx: PrescriptionWithRelations): GhostVitals {
  const ghost: GhostVitals = {};
  for (const key of vitalsByStorage("column").map((v) => v.key)) {
    const columnKey = key as ColumnVitalKey;
    const value = rx[GHOST_COLUMN[columnKey]];
    if (typeof value === "number" && Number.isFinite(value)) {
      ghost[key] = value;
    }
  }
  return ghost;
}

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
    queryKey: queryKeys.consult(appointmentId).lastVisitVitals(),
    queryFn: async (): Promise<GhostVitals | null> => {
      const res = await getLastPrescriptionInEpisode(token, appointmentId);
      const rx = res.data.prescription;
      return rx ? extractGhostVitals(rx) : null;
    },
    enabled: Boolean(token) && Boolean(appointmentId),
    staleTime: STALE.CLINICAL,
  });

  return query.data ?? null;
}
