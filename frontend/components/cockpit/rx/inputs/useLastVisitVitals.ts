"use client";

import { useEffect, useState } from "react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { getLastPrescriptionInEpisode } from "@/lib/api";
import type { GhostVitals } from "@/components/cockpit/rx/inputs/VitalsExtended";
import type { VitalKey } from "@/lib/cockpit/vitals-schema";
import type { PrescriptionWithRelations } from "@/types/prescription";

/** Maps each numeric vital key to its canonical column on a prescription row. */
const GHOST_COLUMN: Record<VitalKey, keyof PrescriptionWithRelations> = {
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
  for (const key of Object.keys(GHOST_COLUMN) as VitalKey[]) {
    const value = rx[GHOST_COLUMN[key]];
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
  const [ghost, setGhost] = useState<GhostVitals | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLastPrescriptionInEpisode(token, appointmentId)
      .then((res) => {
        if (cancelled) return;
        const rx = res.data.prescription;
        setGhost(rx ? extractGhostVitals(rx) : null);
      })
      .catch(() => {
        if (!cancelled) setGhost(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, appointmentId]);

  return ghost;
}
