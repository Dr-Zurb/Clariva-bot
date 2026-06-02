/**
 * GlobalCommandPalette — Cmd-K palette shipped by task-ui-B4.
 *
 * Open via Cmd+K / Ctrl+K (listener lives in DashboardShell) or via the
 * header search trigger (B1, wired by lifting `open` state up to the
 * shell). One source in V1: patients.
 *
 * V1.1 sources to add (registry-ready — drop one entry into
 * `sourceRegistry` and it slots into the palette):
 *   - drugs: GET /api/v1/drugs/search (existing — used by DrugAutocomplete)
 *   - settings: client-side static index of /dashboard/settings/* paths
 *
 * Architecture
 * ------------
 *   - Source registry: each source declares
 *     `{ key, label, icon, search(query, signal): Promise<Item[]> }`.
 *     The palette renders one `<CommandGroup>` per source's results.
 *   - Debounce: React 18 `useDeferredValue` on the input value. React
 *     batches/yields naturally during fast typing — simpler than a
 *     handcrafted setTimeout debounce, and the orchestrator effect
 *     fires on the deferred value.
 *   - Cancellation: each search cycle owns an `AbortController`. Pending
 *     fetches are aborted on next cycle or on close.
 *   - Cache: last 10 distinct queries kept in-memory (LRU-ish — Map
 *     iteration order is insertion order, so we delete + re-set to
 *     promote-on-hit), TTL 30s. Cheap latency win on backspace loops.
 *   - Stale-while-revalidate: while in-flight, the previous results stay
 *     visible; a small inline skeleton row is shown to indicate work.
 *
 * PHI hygiene
 * -----------
 * Telemetry calls (`cmdkOpened`, `cmdkSearched`, `cmdkSelected`) are
 * counts-only — see `frontend/lib/telemetry/cmdk.ts`. No query strings,
 * no patient names, no phone numbers leave this component.
 *
 * @see docs/Work/Daily-plans/May 2026/06-05-2026/Tasks/task-ui-B4-cmd-k-global-search.md
 * @see frontend/components/layout/DashboardShell.tsx (mount point + keyboard listener)
 * @see frontend/components/layout/Header.tsx (trigger click)
 */

"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, User } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import {
  searchPatients,
  type PatientSearchHit,
} from "@/lib/search/patients";
import {
  cmdkOpened,
  cmdkSearched,
  cmdkSelected,
  type CmdkSourceKey,
} from "@/lib/telemetry/cmdk";
import {
  useRecentSearches,
  type RecentSearchItem,
} from "@/hooks/useRecentSearches";

// ---------------------------------------------------------------------------
// Source contract — registry-friendly so V1.1 just appends an entry.
// ---------------------------------------------------------------------------

/** What every source produces. Item shape is intentionally minimal —
 *  per-source rendering can read more fields off `raw` if it wants, but
 *  the palette only relies on these. */
interface SourceItem {
  /** Stable id within the source. Combined with `source` to dedupe. */
  id: string;
  /** Primary display line. */
  label: string;
  /** Secondary muted line. Optional. */
  subtitle?: string | null;
  /** Path to navigate to on select. */
  routedTo: string;
}

interface SearchSource<T extends SourceItem = SourceItem> {
  key: CmdkSourceKey;
  /** Group heading (renders as the `cmdk` group label). */
  label: string;
  /** Lucide icon component for each row. */
  Icon: React.ComponentType<{ className?: string }>;
  /** The actual searcher. Must honor `signal` and re-throw `AbortError`. */
  search: (
    token: string,
    query: string,
    signal: AbortSignal,
  ) => Promise<T[]>;
}

const PATIENTS_SOURCE: SearchSource = {
  key: "patients",
  label: "Patients",
  Icon: User,
  async search(token, query, signal) {
    const hits = await searchPatients(token, query, signal);
    return hits.map(toPatientItem);
  },
};

function toPatientItem(hit: PatientSearchHit): SourceItem {
  return {
    id: hit.id,
    label: hit.name,
    subtitle: hit.phone ?? hit.igHandle ?? null,
    routedTo: `/dashboard/patients-v2/${encodeURIComponent(hit.id)}`,
  };
}

/** V1: only patients. V1.1: append `appointments`, `drugs`, `settings`. */
const sourceRegistry: SearchSource[] = [PATIENTS_SOURCE];

// ---------------------------------------------------------------------------
// Cache — LRU-ish; TTL 30s; cap 10. Per-tab module scope so it survives
// open/close cycles within a session.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 30_000;
const CACHE_CAP = 10;

interface CacheEntry {
  results: SourceResults;
  ts: number;
}

type SourceResults = Record<string, SourceItem[]>;

const queryCache: Map<string, CacheEntry> = new Map();

function readCache(query: string): SourceResults | null {
  const entry = queryCache.get(query);
  if (!entry) return null;
  if (Date.now() - entry.ts >= CACHE_TTL_MS) {
    queryCache.delete(query);
    return null;
  }
  // Promote on hit — delete + re-insert moves to end (most-recent).
  queryCache.delete(query);
  queryCache.set(query, entry);
  return entry.results;
}

function writeCache(query: string, results: SourceResults): void {
  queryCache.set(query, { results, ts: Date.now() });
  while (queryCache.size > CACHE_CAP) {
    const oldest = queryCache.keys().next().value;
    if (oldest === undefined) break;
    queryCache.delete(oldest);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface GlobalCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Supabase access token used by the patients source. Empty string =
   *  unauthenticated; the palette renders an empty state. */
  token: string;
}

export function GlobalCommandPalette({
  open,
  onOpenChange,
  token,
}: GlobalCommandPaletteProps) {
  const router = useRouter();
  const { recents, push: pushRecent } = useRecentSearches();

  const [query, setQuery] = useState("");
  /** React 18 deferred value — the search effect runs on this value, the
   *  input renders on the live value. Naturally batches keystroke storms
   *  without a handcrafted debounce. */
  const deferredQuery = useDeferredValue(query);
  const [results, setResults] = useState<SourceResults>({});
  const [loading, setLoading] = useState(false);

  /** Keep the latest abort controller so a new cycle can cancel it. */
  const inflightRef = useRef<AbortController | null>(null);

  // Telemetry: emit `opened` once per open transition.
  useEffect(() => {
    if (open) cmdkOpened();
  }, [open]);

  // Reset query / results when the palette closes — feels right (open
  // again starts on a clean slate) AND avoids leaking state across
  // unrelated palette uses.
  useEffect(() => {
    if (!open) {
      if (inflightRef.current) {
        inflightRef.current.abort();
        inflightRef.current = null;
      }
      setQuery("");
      setResults({});
      setLoading(false);
    }
  }, [open]);

  // Search orchestrator — runs whenever deferred query / open / token
  // changes. Empty query short-circuits to the recents view (no fetch).
  useEffect(() => {
    if (!open) return undefined;
    const trimmed = deferredQuery.trim();

    // Empty query → don't run sources. The palette renders the
    // "Recent" group instead.
    if (trimmed.length === 0) {
      if (inflightRef.current) {
        inflightRef.current.abort();
        inflightRef.current = null;
      }
      setResults({});
      setLoading(false);
      return undefined;
    }

    // Telemetry: counts-only, no query content.
    cmdkSearched(trimmed.length);

    // Cache hit → resolve synchronously, no fetch.
    const cached = readCache(trimmed);
    if (cached) {
      setResults(cached);
      setLoading(false);
      // Still abort any older in-flight cycle (no longer relevant).
      if (inflightRef.current) {
        inflightRef.current.abort();
        inflightRef.current = null;
      }
      return undefined;
    }

    // Cache miss → cancel previous, start a new cycle.
    if (inflightRef.current) {
      inflightRef.current.abort();
    }
    const controller = new AbortController();
    inflightRef.current = controller;
    setLoading(true);

    let cancelled = false;
    void (async () => {
      try {
        const settled = await Promise.all(
          sourceRegistry.map(async (source) => {
            try {
              const items = await source.search(
                token,
                trimmed,
                controller.signal,
              );
              return [source.key, items] as const;
            } catch (error) {
              // Swallow per-source failures so one broken source doesn't
              // tank the whole palette. AbortError bubbles to the outer
              // catch — but since we wrapped each source, abort here just
              // produces an empty list for that source while the outer
              // orchestrator stays alive. That's OK; on the next cycle the
              // controller is brand new so a fresh fetch will happen.
              if ((error as { name?: string } | null)?.name === "AbortError") {
                return [source.key, [] as SourceItem[]] as const;
              }
              // Defensive: log + return empty.
              if (typeof console !== "undefined") {
                // eslint-disable-next-line no-console
                console.warn(
                  `[cmdk] source "${source.key}" failed`,
                  error,
                );
              }
              return [source.key, [] as SourceItem[]] as const;
            }
          }),
        );

        if (cancelled || controller.signal.aborted) return;

        const next: SourceResults = {};
        for (const [key, items] of settled) {
          next[key] = items;
        }
        writeCache(trimmed, next);
        setResults(next);
      } finally {
        if (!cancelled && inflightRef.current === controller) {
          setLoading(false);
          inflightRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [deferredQuery, open, token]);

  const handleSelect = useCallback(
    (sourceKey: CmdkSourceKey, item: SourceItem) => {
      cmdkSelected(sourceKey);
      const recentEntry: RecentSearchItem = {
        source: sourceKey,
        id: item.id,
        label: item.label,
        subtitle: item.subtitle ?? null,
        routedTo: item.routedTo,
      };
      pushRecent(recentEntry);
      onOpenChange(false);
      router.push(item.routedTo);
    },
    [onOpenChange, pushRecent, router],
  );

  const showRecents = query.trim().length === 0 && recents.length > 0;
  const totalResults = useMemo(
    () =>
      sourceRegistry.reduce(
        (sum, source) => sum + (results[source.key]?.length ?? 0),
        0,
      ),
    [results],
  );
  const showSkeleton = loading && totalResults === 0;
  const showEmptyMessage =
    !showRecents &&
    !showSkeleton &&
    query.trim().length > 0 &&
    totalResults === 0 &&
    !loading;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Search patients by name or phone…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {/* Recents — only when input is empty. */}
        {showRecents ? (
          <CommandGroup heading="Recent">
            {recents.map((item) => (
              <CommandItem
                key={`recent:${item.source}:${item.id}`}
                value={`recent:${item.source}:${item.id}:${item.label}`}
                onSelect={() =>
                  handleSelect(item.source as CmdkSourceKey, {
                    id: item.id,
                    label: item.label,
                    subtitle: item.subtitle ?? null,
                    routedTo: item.routedTo,
                  })
                }
              >
                <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.subtitle ? (
                  <span className="ml-2 truncate text-xs text-muted-foreground">
                    {item.subtitle}
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {/* Loading skeleton (only when there are no previous results
            visible — stale-while-revalidate keeps prior results up to
            avoid flicker on each keystroke). */}
        {showSkeleton ? (
          <CommandGroup heading="Searching…">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-2 py-2"
                aria-hidden="true"
              >
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-3 w-40" />
                <Skeleton className="ml-auto h-3 w-16" />
              </div>
            ))}
          </CommandGroup>
        ) : null}

        {/* Empty-state message (input non-empty, no results, not loading). */}
        {showEmptyMessage ? (
          <CommandEmpty>No results for &ldquo;{query}&rdquo;.</CommandEmpty>
        ) : null}

        {/* Source-grouped results. */}
        {sourceRegistry.map((source, idx) => {
          const items = results[source.key];
          if (!items || items.length === 0) return null;
          const SourceIcon = source.Icon;
          return (
            <div key={source.key}>
              {idx > 0 ? <CommandSeparator /> : null}
              <CommandGroup heading={source.label}>
                {items.map((item) => (
                  <CommandItem
                    key={`${source.key}:${item.id}`}
                    value={`${source.key}:${item.id}:${item.label}:${item.subtitle ?? ""}`}
                    onSelect={() => handleSelect(source.key, item)}
                  >
                    <SourceIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.subtitle ? (
                      <span className="ml-2 truncate text-xs text-muted-foreground">
                        {item.subtitle}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
