import { QueryClient } from "@tanstack/react-query";
import { cache } from "react";
import { STALE } from "@/lib/query/stale";

const GC_TIME_MS = 5 * 60 * 1000;

function isClientError(error: unknown): boolean {
  const status = (error as Error & { status?: number })?.status;
  return typeof status === "number" && status >= 400 && status < 500;
}

/** Shared factory for browser and server QueryClients (np-08). */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE.LIVE,
        gcTime: GC_TIME_MS,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (isClientError(error)) return false;
          return failureCount < 2;
        },
      },
    },
  });
}

/**
 * One QueryClient per RSC request — all server prefetches in a navigation
 * share this instance before scoped dehydrate (np-08).
 */
export const getQueryClient = cache(makeQueryClient);
