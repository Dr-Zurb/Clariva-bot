"use client";

import { useQuery } from "@tanstack/react-query";
import { pendingReviewsCountQueryOptions } from "@/lib/query/options";

export function usePendingReviewsCountQuery(token: string) {
  return useQuery({
    ...pendingReviewsCountQueryOptions(token),
    enabled: Boolean(token),
  });
}
