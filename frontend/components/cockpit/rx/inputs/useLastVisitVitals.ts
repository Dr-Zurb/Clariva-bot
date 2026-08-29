"use client";

import { useQuery } from "@tanstack/react-query";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { getAppointmentDeskVitals, getLastPrescriptionInEpisode } from "@/lib/api";
import type { GhostVitals } from "@/components/cockpit/rx/inputs/VitalsExtended";
import { vitalsByStorage, type ColumnVitalKey } from "@/lib/cockpit/vitals-schema";
import type { PatientVitalsReading } from "@/types/patient-chart";
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

function extractDeskGhost(row: PatientVitalsReading): GhostVitals {
  const ghost: GhostVitals = {};
  if (typeof row.bp_systolic === "number") ghost.vitalsBpSystolic = row.bp_systolic;
  if (typeof row.bp_diastolic === "number") ghost.vitalsBpDiastolic = row.bp_diastolic;
  if (typeof row.heart_rate === "number") ghost.vitalsHr = row.heart_rate;
  if (typeof row.temperature_c === "number") ghost.vitalsTempC = row.temperature_c;
  if (typeof row.spo2 === "number") ghost.vitalsSpo2 = row.spo2;
  if (typeof row.weight_kg === "number") ghost.vitalsWtKg = row.weight_kg;
  if (typeof row.height_cm === "number") ghost.vitalsHtCm = row.height_cm;
  return ghost;
}

function hasGhostValues(ghost: GhostVitals): boolean {
  return Object.values(ghost).some((value) => typeof value === "number" && Number.isFinite(value));
}

/** Same-visit front-desk reading. Empty/error → null; never overwrites the Rx form. */
export function useDeskVisitVitals(): GhostVitals | null {
  const { token, appointmentId } = useRxForm();

  const query = useQuery({
    queryKey: queryKeys.consult(appointmentId).deskVitals(),
    queryFn: async (): Promise<GhostVitals | null> => {
      try {
        const res = await getAppointmentDeskVitals(token, appointmentId);
        const row = res.data.vitals;
        if (!row) return null;
        const ghost = extractDeskGhost(row);
        return hasGhostValues(ghost) ? ghost : null;
      } catch {
        return null;
      }
    },
    enabled: Boolean(token) && Boolean(appointmentId),
    staleTime: STALE.CLINICAL,
  });

  return query.data ?? null;
}
