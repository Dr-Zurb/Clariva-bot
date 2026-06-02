import { HydrationBoundary } from "@tanstack/react-query";
import { OpdQueueStrip } from "@/components/dashboard/cockpit/OpdQueueStrip";
import { getQueryClient } from "@/lib/query/client";
import { dehydrateMatchingQueries, queryKeyStartsWith } from "@/lib/query/dehydrate";
import { prefetchCockpitOpdStripQueries } from "@/lib/query/prefetch/cockpit";

interface CockpitOpdQueueSectionProps {
  token: string;
}

export async function CockpitOpdQueueSection({ token }: CockpitOpdQueueSectionProps) {
  const queryClient = getQueryClient();
  await prefetchCockpitOpdStripQueries(queryClient, token);

  const dehydratedState = dehydrateMatchingQueries(
    queryClient,
    (query) =>
      queryKeyStartsWith(query, ["opd", "doctor-settings"]) ||
      queryKeyStartsWith(query, ["opd", "queue-session"]),
  );

  return (
    <HydrationBoundary state={dehydratedState}>
      <OpdQueueStrip token={token} />
    </HydrationBoundary>
  );
}
