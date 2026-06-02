import { HydrationBoundary } from "@tanstack/react-query";
import { NowNextCard } from "@/components/dashboard/cockpit/NowNextCard";
import { getQueryClient } from "@/lib/query/client";
import { dehydrateMatchingQueries, queryKeyStartsWith } from "@/lib/query/dehydrate";
import { prefetchCockpitAppointmentsQuery } from "@/lib/query/prefetch/cockpit";

interface CockpitNowNextSectionProps {
  token: string;
}

export async function CockpitNowNextSection({ token }: CockpitNowNextSectionProps) {
  const queryClient = getQueryClient();
  await prefetchCockpitAppointmentsQuery(queryClient, token);

  const dehydratedState = dehydrateMatchingQueries(queryClient, (query) =>
    queryKeyStartsWith(query, ["dashboard", "appointments"]),
  );

  return (
    <HydrationBoundary state={dehydratedState}>
      <NowNextCard token={token} />
    </HydrationBoundary>
  );
}
