"use client";

import { useQuery } from "@tanstack/react-query";
import { getVerificationStatus } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

/**
 * doctor-verification-v1 · the doctor's own verification status.
 */
export function useVerificationStatusQuery(token: string) {
  return useQuery({
    queryKey: queryKeys.dashboard.verificationStatus(),
    queryFn: async () => {
      const res = await getVerificationStatus(token);
      return res.data;
    },
    enabled: Boolean(token),
  });
}
