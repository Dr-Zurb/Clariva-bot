"use client";

import { useQuery } from "@tanstack/react-query";
import { getOnboardingStatus } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

/**
 * doctor-onboarding-v1 · go-live checklist status.
 */
export function useOnboardingStatusQuery(token: string) {
  return useQuery({
    queryKey: queryKeys.dashboard.onboardingStatus(),
    queryFn: async () => {
      const res = await getOnboardingStatus(token);
      return res.data;
    },
    enabled: Boolean(token),
  });
}
