import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";

/** Invalidate dashboard appointment reads after booking / no-show mutations. */
export function invalidateAppointments(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.dashboard.appointments(),
  });
}

/** Invalidate OPD queue-session reads (cockpit strip + sidebar counts). */
export function invalidateOpdQueueSession(
  queryClient: QueryClient,
  dateIso: string,
) {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.opd.queueSession(dateIso),
  });
}

/** Invalidate unified OPD session reads (opd-today page). */
export function invalidateOpdSession(queryClient: QueryClient, dateIso: string) {
  return queryClient.invalidateQueries({
    queryKey: queryKeys.opd.session(dateIso),
  });
}

/** Invalidate patient chart reads after clinical writes. */
export function invalidatePatientChart(
  queryClient: QueryClient,
  patientId: string,
) {
  const patient = queryKeys.patient(patientId);
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: patient.overview() }),
    queryClient.invalidateQueries({ queryKey: patient.vitals() }),
    queryClient.invalidateQueries({ queryKey: patient.prescriptions() }),
    queryClient.invalidateQueries({ queryKey: patient.allergies() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.patients.all }),
  ]);
}

/**
 * Which condition surface already holds an authoritative optimistic cache.
 * That surface is marked stale without an immediate refetch — otherwise the
 * network GET can briefly overwrite the optimistic drop and the card flickers
 * back for a frame. The sibling surface still active-refetches so the other
 * pane stays in sync. Use `"all"` when both caches were patched optimistically
 * (e.g. PMH remove that also drops the flat conditions list).
 */
export type PatientConditionsActingSurface =
  | "conditions"
  | "medicalBackground"
  | "all";

export interface InvalidatePatientConditionsOptions {
  /**
   * Surface that just wrote an optimistic cache update. Defaults to neither
   * (both keys active-refetch) for callers that did not mutate either cache.
   */
  actingSurface?: PatientConditionsActingSurface;
}

/**
 * Invalidate BOTH condition read surfaces after a chronic-condition write.
 *
 * A chronic condition is shown in two places that read it differently — the
 * Assessment "Known conditions" zone (flat `conditions`) and the Subjective PMH
 * section (grouped `medical-background`). A write in either surface must refresh
 * the other, so we invalidate both keys. This is what makes the two tabs stay in
 * sync without a manual reload.
 */
export function invalidatePatientConditions(
  queryClient: QueryClient,
  patientId: string,
  options?: InvalidatePatientConditionsOptions,
) {
  const patient = queryKeys.patient(patientId);
  const acting = options?.actingSurface;
  const skipConditions =
    acting === "conditions" || acting === "all";
  const skipMedicalBackground =
    acting === "medicalBackground" || acting === "all";
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: patient.conditions(),
      ...(skipConditions ? { refetchType: "none" as const } : {}),
    }),
    queryClient.invalidateQueries({
      queryKey: patient.medicalBackground(),
      ...(skipMedicalBackground ? { refetchType: "none" as const } : {}),
    }),
  ]);
}
