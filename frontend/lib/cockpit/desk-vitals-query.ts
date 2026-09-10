import type { QueryClient } from "@tanstack/react-query";
import {
  getAppointmentDeskVitals,
  getLastPrescriptionInEpisode,
} from "@/lib/api";
import type { GhostVitals } from "@/components/cockpit/rx/inputs/VitalsExtended";
import type { PatientVitalsReading } from "@/types/patient-chart";
import type { DeskVitalsSeedPayload } from "@/lib/cockpit/desk-vitals-seed";
import {
  vitalsByStorage,
  type ColumnVitalKey,
} from "@/lib/cockpit/vitals-schema";
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

export function extractLastVisitGhostVitals(
  rx: PrescriptionWithRelations
): GhostVitals {
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

function extractDeskGhost(row: PatientVitalsReading): GhostVitals {
  const ghost: GhostVitals = {};
  if (typeof row.bp_systolic === "number")
    ghost.vitalsBpSystolic = row.bp_systolic;
  if (typeof row.bp_diastolic === "number")
    ghost.vitalsBpDiastolic = row.bp_diastolic;
  if (typeof row.heart_rate === "number") ghost.vitalsHr = row.heart_rate;
  if (typeof row.temperature_c === "number")
    ghost.vitalsTempC = row.temperature_c;
  if (typeof row.spo2 === "number") ghost.vitalsSpo2 = row.spo2;
  if (typeof row.weight_kg === "number") ghost.vitalsWtKg = row.weight_kg;
  if (typeof row.height_cm === "number") ghost.vitalsHtCm = row.height_cm;
  return ghost;
}

function hasGhostValues(ghost: GhostVitals): boolean {
  return Object.values(ghost).some(
    (value) => typeof value === "number" && Number.isFinite(value)
  );
}

export function deskVitalsSeedFromReading(
  row: PatientVitalsReading | null | undefined,
): DeskVitalsSeedPayload {
  if (!row) return { ghost: null, note: null };
  const ghost = extractDeskGhost(row);
  const note = row.note?.trim() ? row.note.trim() : null;
  return { ghost: hasGhostValues(ghost) ? ghost : null, note };
}

export async function fetchDeskVisitVitalsPayload(
  token: string,
  appointmentId: string
): Promise<DeskVitalsSeedPayload> {
  try {
    const res = await getAppointmentDeskVitals(token, appointmentId);
    return deskVitalsSeedFromReading(res.data.vitals);
  } catch {
    return { ghost: null, note: null };
  }
}

export function deskVitalsQueryOptions(token: string, appointmentId: string) {
  return {
    queryKey: queryKeys.consult(appointmentId).deskVitals(),
    queryFn: () => fetchDeskVisitVitalsPayload(token, appointmentId),
    staleTime: STALE.LIVE,
    refetchOnWindowFocus: true,
  } as const;
}

export function lastVisitVitalsQueryOptions(
  token: string,
  appointmentId: string
) {
  return {
    queryKey: queryKeys.consult(appointmentId).lastVisitVitals(),
    queryFn: async (): Promise<GhostVitals | null> => {
      const res = await getLastPrescriptionInEpisode(token, appointmentId);
      const rx = res.data.prescription;
      return rx ? extractLastVisitGhostVitals(rx) : null;
    },
    staleTime: STALE.CLINICAL,
  } as const;
}

/** Warm the React Query cache before the cockpit mounts (OPD click / next rail). */
export function prefetchAppointmentDeskVitals(
  queryClient: QueryClient,
  token: string,
  appointmentId: string | null | undefined
): void {
  if (!token || !appointmentId) return;
  void queryClient.prefetchQuery(deskVitalsQueryOptions(token, appointmentId));
}
