"use client";

import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ComplaintMasterRow } from "@/types/complaint-master";
import { searchComplaints } from "@/lib/api/complaint-master";

export type ComplaintCommitPayload =
  /** `rawText` is the doctor's original typed text, so detail typed alongside a
   *  catalog match ("pain in stomach 5 days") can still be parsed into fields. */
  | { source: "master"; complaint: ComplaintMasterRow; rawText: string }
  | { source: "freeText"; name: string };

export interface ComplaintAutocompleteProps {
  value: string;
  onChange: (text: string) => void;
  onSelect?: (complaint: ComplaintMasterRow) => void;
  /** Rapid-capture: Enter commits highlighted match or free text; clears via onChange(""). */
  onCommit?: (payload: ComplaintCommitPayload) => void;
  token: string;
  inputId: string;
  placeholder?: string;
  /** Accessible name for the combobox when no external label is wired. */
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  limit?: number;
  debounceMs?: number;
  inputRef?: (el: HTMLInputElement | null) => void;
}

const MIN_QUERY_LEN = 2;
const DEFAULT_LIMIT = 10;
const DEFAULT_DEBOUNCE_MS = 100;
const CACHE_MAX = 64;

const searchCache = new Map<string, ComplaintMasterRow[]>();

function cacheKey(q: string): string {
  return q.trim().toLowerCase();
}

function cacheGet(q: string): ComplaintMasterRow[] | undefined {
  return searchCache.get(cacheKey(q));
}

function cacheSet(q: string, rows: ComplaintMasterRow[]): void {
  const key = cacheKey(q);
  if (searchCache.size >= CACHE_MAX) {
    const first = searchCache.keys().next().value;
    if (first !== undefined) searchCache.delete(first);
  }
  searchCache.set(key, rows);
}

function formatCategoryLabel(category: string): string {
  const trimmed = category.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

async function fetchComplaintResults(
  token: string,
  query: string,
  limit: number,
): Promise<ComplaintMasterRow[]> {
  const cached = cacheGet(query);
  if (cached) return cached;

  const res = await searchComplaints(token, query, { limit });
  const rows = res.data.results;
  cacheSet(query, rows);
  return rows;
}

export function ComplaintAutocomplete({
  value,
  onChange,
  onSelect,
  onCommit,
  token,
  inputId,
  placeholder = "e.g. Headache",
  ariaLabel,
  disabled,
  className,
  limit = DEFAULT_LIMIT,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  inputRef,
}: ComplaintAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const fetchIdRef = useRef(0);
  const resolvingRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRefInternal = useRef<HTMLInputElement | null>(null);
  const listboxId = `${useId()}-listbox`;

  const query = value.trim();
  const shouldFetch = useMemo(() => query.length >= MIN_QUERY_LEN, [query]);
  const [results, setResults] = useState<ComplaintMasterRow[]>([]);

  useEffect(() => {
    if (!shouldFetch) {
      setResults([]);
      setOpen(false);
      setActiveIdx(-1);
      setLoading(false);
      return;
    }

    const cached = cacheGet(query);
    if (cached) {
      setResults(cached);
      setActiveIdx(cached.length > 0 ? 0 : -1);
    } else {
      // Drop stale hits from a shorter/prior query while the new fetch is pending.
      setResults([]);
      setActiveIdx(-1);
    }

    const myId = ++fetchIdRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await fetchComplaintResults(token, query, limit);
        if (myId !== fetchIdRef.current) return;
        setResults(rows);
        setActiveIdx(rows.length > 0 ? 0 : -1);
      } catch {
        if (myId !== fetchIdRef.current) return;
      } finally {
        if (myId === fetchIdRef.current) setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, shouldFetch, token, limit, debounceMs]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const finishCommit = useCallback(() => {
    onChange("");
    setOpen(false);
    setActiveIdx(-1);
    inputRefInternal.current?.focus();
  }, [onChange]);

  const commitSelection = useCallback(
    (complaint: ComplaintMasterRow) => {
      if (onCommit) {
        onCommit({ source: "master", complaint, rawText: value.trim() });
        finishCommit();
        return;
      }
      onChange(complaint.name);
      onSelect?.(complaint);
      setOpen(false);
      setActiveIdx(-1);
      inputRefInternal.current?.focus();
    },
    [onChange, onSelect, onCommit, finishCommit, value],
  );

  const tryCommitOnEnter = useCallback(
    async (shiftKey: boolean): Promise<boolean> => {
      if (!onCommit || resolvingRef.current) return false;
      const trimmed = value.trim();
      if (!trimmed) return false;

      // Shift+Enter: always keep the typed text as a custom complaint.
      if (shiftKey) {
        onCommit({ source: "freeText", name: trimmed });
        finishCommit();
        return true;
      }

      if (activeIdx >= 0 && activeIdx < results.length) {
        onCommit({ source: "master", complaint: results[activeIdx]!, rawText: trimmed });
        finishCommit();
        return true;
      }

      // Fast-typist path: resolve against the master before falling back to custom text.
      if (trimmed.length >= MIN_QUERY_LEN) {
        resolvingRef.current = true;
        setResolving(true);
        try {
          const rows = await fetchComplaintResults(token, trimmed, limit);
          if (rows.length > 0) {
            onCommit({ source: "master", complaint: rows[0]!, rawText: trimmed });
            finishCommit();
            return true;
          }
        } finally {
          resolvingRef.current = false;
          setResolving(false);
        }
      }

      onCommit({ source: "freeText", name: trimmed });
      finishCommit();
      return true;
    },
    [onCommit, value, activeIdx, results, token, limit, finishCommit],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onCommit) {
      e.preventDefault();
      void tryCommitOnEnter(e.shiftKey);
      return;
    }

    if (!open && e.key === "ArrowDown" && results.length > 0) {
      setOpen(true);
      setActiveIdx(0);
      e.preventDefault();
      return;
    }
    if (!open) return;
    switch (e.key) {
      case "ArrowDown":
        setActiveIdx((i) => Math.min(i + 1, results.length - 1));
        e.preventDefault();
        break;
      case "ArrowUp":
        setActiveIdx((i) => Math.max(i - 1, 0));
        e.preventDefault();
        break;
      case "Enter":
        if (activeIdx >= 0 && activeIdx < results.length) {
          commitSelection(results[activeIdx]);
          e.preventDefault();
        }
        break;
      case "Escape":
        setOpen(false);
        setActiveIdx(-1);
        e.preventDefault();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  const showDropdown =
    open && shouldFetch && (results.length > 0 || loading || resolving);

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ""}`}>
      <input
        ref={(el) => {
          inputRefInternal.current = el;
          inputRef?.(el);
        }}
        id={inputId}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-busy={resolving}
        aria-activedescendant={
          showDropdown && activeIdx >= 0 ? `${listboxId}-option-${activeIdx}` : undefined
        }
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (shouldFetch) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`min-h-9 w-full rounded-md border bg-background px-2.5 py-1.5 text-sm transition-[border-radius,box-shadow] focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 ${
          showDropdown
            ? "border-primary/30 rounded-b-none border-b-transparent shadow-sm"
            : "border-input"
        }`}
        maxLength={200}
        disabled={disabled || resolving}
      />
      {showDropdown && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-0.5 max-h-52 overflow-auto rounded-lg border border-border/80 bg-card py-1 shadow-md"
        >
          {resolving ? (
            <li className="px-2.5 py-1.5 text-xs text-muted-foreground">Matching…</li>
          ) : null}
          {!resolving && loading && results.length === 0 ? (
            <li className="px-2.5 py-1.5 text-xs text-muted-foreground">Searching…</li>
          ) : null}
          {!resolving &&
            results.map((complaint, idx) => {
              const active = idx === activeIdx;
              const categoryLabel = formatCategoryLabel(complaint.category);
              return (
                <li
                  key={complaint.id}
                  id={`${listboxId}-option-${idx}`}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitSelection(complaint);
                  }}
                  className={`cursor-pointer border-l-2 px-2 py-1.5 text-sm transition-colors ${
                    active
                      ? "border-l-primary bg-primary/8 text-foreground"
                      : "border-l-transparent text-foreground/90 hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium leading-tight">
                      {complaint.name}
                    </span>
                    {categoryLabel ? (
                      <span className="shrink-0 rounded bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {categoryLabel}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          {!resolving && results.length === 0 && !loading ? (
            <li className="px-2.5 py-1.5 text-xs leading-snug text-muted-foreground">
              No matches — press Enter to add as custom text.
            </li>
          ) : null}
          {results.length > 0 && onCommit && !resolving ? (
            <li
              className="border-t border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground"
              aria-hidden
            >
              ↑↓ navigate · Enter to select · Shift+Enter for custom text
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
