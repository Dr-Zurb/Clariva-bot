import { HydrationBoundary } from "@tanstack/react-query";
import { KpiStrip } from "@/components/dashboard/cockpit/KpiStrip";
import { getQueryClient } from "@/lib/query/client";
import { dehydrateMatchingQueries, queryKeyStartsWith } from "@/lib/query/dehydrate";
import { prefetchCockpitKpiQueries } from "@/lib/query/prefetch/cockpit";

interface CockpitKpiStripSectionProps {
  token: string;
}

export async function CockpitKpiStripSection({ token }: CockpitKpiStripSectionProps) {
  const queryClient = getQueryClient();
  await prefetchCockpitKpiQueries(queryClient, token);

  const dehydratedState = dehydrateMatchingQueries(
    queryClient,
    (query) =>
      queryKeyStartsWith(query, ["dashboard"]) ||
      queryKeyStartsWith(query, ["opd", "queue-session"]),
  );

  return (
    <HydrationBoundary state={dehydratedState}>
      <KpiStrip token={token} />
    </HydrationBoundary>
  );
}
