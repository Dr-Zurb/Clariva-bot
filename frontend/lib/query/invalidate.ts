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
    queryClient.invalidateQueries({ queryKey: queryKeys.patients.all }),
  ]);
}
