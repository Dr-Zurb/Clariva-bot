"use client";

import { useQuery } from "@tanstack/react-query";
import { getRecordingAttestationStatus } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";

export function useRecordingAttestationQuery(token: string) {
  return useQuery({
    queryKey: queryKeys.dashboard.recordingAttestation(),
    queryFn: async () => {
      const res = await getRecordingAttestationStatus(token);
      return res.data;
    },
    enabled: Boolean(token),
  });
}
