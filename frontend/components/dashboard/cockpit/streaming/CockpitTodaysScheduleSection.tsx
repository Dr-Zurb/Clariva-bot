import { HydrationBoundary } from "@tanstack/react-query";
import { TodaysSchedule } from "@/components/dashboard/cockpit/TodaysSchedule";
import { getQueryClient } from "@/lib/query/client";
import { dehydrateMatchingQueries, queryKeyStartsWith } from "@/lib/query/dehydrate";
import { prefetchCockpitAppointmentsQuery } from "@/lib/query/prefetch/cockpit";

interface CockpitTodaysScheduleSectionProps {
  token: string;
}

export async function CockpitTodaysScheduleSection({
  token,
}: CockpitTodaysScheduleSectionProps) {
  const queryClient = getQueryClient();
  await prefetchCockpitAppointmentsQuery(queryClient, token);

  const dehydratedState = dehydrateMatchingQueries(queryClient, (query) =>
    queryKeyStartsWith(query, ["dashboard", "appointments"]),
  );

  return (
    <HydrationBoundary state={dehydratedState}>
      <TodaysSchedule token={token} />
    </HydrationBoundary>
  );
}
