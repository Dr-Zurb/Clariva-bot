"use client";

/**
 * useRecentDiagnosisTags (pf-04)
 *
 * Fetches `GET /v1/diagnoses/recent?limit=N` once per browser session for
 * the diagnosis-tag autocomplete chips inside <WrapUpDialog>.
 *
 * Session caching: results are stored in a module-level Map keyed on the
 * first 16 characters of the auth token. Subsequent dialog mounts in the
 * same session skip the network round-trip entirely.
 *
 * Failure mode: silently swallowed — the chips are an enhancement; the
 * dialog still works with no suggestions.
 */

import { useEffect, useRef, useState } from "react";
import { requireApiBaseUrl } from "@/lib/api-base";

export interface DiagnosisTagSuggestion {
  tag: string;
  uses: number;
}

export interface UseRecentDiagnosisTagsResult {
  tags: DiagnosisTagSuggestion[];
  isLoading: boolean;
}

// Module-level session cache — shared across all mounted hook instances.
const SESSION_CACHE = new Map<string, DiagnosisTagSuggestion[]>();

function tokenCacheKey(token: string): string {
  // Use a short prefix: enough to distinguish tokens, avoids storing PII.
  return token.slice(0, 16);
}

export function useRecentDiagnosisTags(
  token: string,
  limit = 20
): UseRecentDiagnosisTagsResult {
  const cacheKey = tokenCacheKey(token);
  const cached = SESSION_CACHE.get(cacheKey);

  const [tags, setTags] = useState<DiagnosisTagSuggestion[]>(cached ?? []);
  const [isLoading, setIsLoading] = useState(!cached);
  const fetchedRef = useRef(!!cached);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function load() {
      try {
        const res = await fetch(
          `${requireApiBaseUrl()}/api/v1/diagnoses/recent?limit=${limit}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          }
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          data?: { tags: DiagnosisTagSuggestion[] };
        };
        const fetched = json?.data?.tags ?? [];
        SESSION_CACHE.set(cacheKey, fetched);
        setTags(fetched);
      } catch {
        // Enhancement only — swallow errors silently.
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [token, limit, cacheKey]);

  return { tags, isLoading };
}
