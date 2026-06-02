import { HydrationBoundary } from "@tanstack/react-query";
import PatientV2Page from "@/components/patients-v2/PatientV2Page";
import { getQueryClient } from "@/lib/query/client";
import { dehydrateMatchingQueries, queryKeyStartsWith } from "@/lib/query/dehydrate";
import { prefetchPatientDetailQueries } from "@/lib/query/prefetch/patient-detail";
import type { Patient } from "@/types/patient";

interface PatientDetailHydratedProps {
  patient: Patient;
  token: string;
  userId: string;
}

export async function PatientDetailHydrated({
  patient,
  token,
  userId,
}: PatientDetailHydratedProps) {
  const queryClient = getQueryClient();
  await prefetchPatientDetailQueries(queryClient, token, patient.id);

  const dehydratedState = dehydrateMatchingQueries(queryClient, (query) =>
    queryKeyStartsWith(query, ["patient", patient.id]),
  );

  return (
    <HydrationBoundary state={dehydratedState}>
      <PatientV2Page patient={patient} token={token} userId={userId} />
    </HydrationBoundary>
  );
}
