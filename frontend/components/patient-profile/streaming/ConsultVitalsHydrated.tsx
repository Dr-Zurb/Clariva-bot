import { HydrationBoundary } from "@tanstack/react-query";
import PatientProfilePage from "@/components/patient-profile/PatientProfilePage";
import { getQueryClient } from "@/lib/query/client";
import {
  dehydrateMatchingQueries,
  queryKeyStartsWith,
} from "@/lib/query/dehydrate";
import { prefetchConsultVitalsQueries } from "@/lib/query/prefetch/consult-vitals";
import type { Appointment } from "@/types/appointment";

interface ConsultVitalsHydratedProps {
  appointment: Appointment;
  token: string;
}

/**
 * np-08: server-prefetch + scoped dehydrate for consult vitals so the
 * cockpit strip and Objective grid read a warm cache on first paint.
 * Dehydrates only `["consult", appointmentId]` (same PHI-in-payload
 * precedent as patients-v2 chart vitals).
 */
export async function ConsultVitalsHydrated({
  appointment,
  token,
}: ConsultVitalsHydratedProps) {
  const queryClient = getQueryClient();
  // The visit page already started this prefetch beside the appointment
  // read. Do not hold the name strip for desk vitals or last-visit;
  // dehydrate whatever has already landed.
  void prefetchConsultVitalsQueries(
    queryClient,
    token,
    appointment.id,
    appointment.patient_id
  );

  const dehydratedState = dehydrateMatchingQueries(queryClient, (query) =>
    queryKeyStartsWith(query, ["consult", appointment.id])
  );

  return (
    <HydrationBoundary state={dehydratedState}>
      <PatientProfilePage appointment={appointment} token={token} />
    </HydrationBoundary>
  );
}
