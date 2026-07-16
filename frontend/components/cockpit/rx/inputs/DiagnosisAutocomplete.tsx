"use client";

/**
 * DiagnosisAutocomplete (assessment-tab · asmt-06)
 *
 * ICD-11 (MMS) catalog typeahead for the diagnosis capture input, modelled on
 * `ComplaintAutocomplete`: debounced search, body-portal dropdown, keyboard nav
 * (↑↓ / Enter / Shift+Enter / Esc / Tab), and a per-session result cache.
 *
 * Selecting a catalog entry commits the canonical ICD title + code. Free-text
 * Enter (no match) still commits an UNCODED diagnosis (ASMT-D3) — coding is
 * additive and optional. Shift+Enter forces the typed text as free text.
 */

import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { DiagnosisCatalogRow } from "@/types/diagnosis-catalog";
import { searchDiagnoses } from "@/lib/api/diagnosis-catalog";

export type DiagnosisCommitPayload =
  /** `rawText` is the doctor's original typed text (kept for provenance). */
  | { source: "catalog"; entry: DiagnosisCatalogRow; rawText: string }
  /**
   * No catalog match. `forced` marks an explicit Shift+Enter "keep as free text"
   * — the parent commits it uncoded immediately and never runs the AI resolver
   * (asmt-07). When absent this is the genuine no-match path the resolver gates on.
   */
  | { source: "freeText"; label: string; forced?: boolean };

export interface DiagnosisAutocompleteProps {
  value: string;
  onChange: (text: string) => void;
  onSelect?: (entry: DiagnosisCatalogRow) => void;
  /** Rapid-capture: Enter commits highlighted match or free text; clears via onChange(""). */
  onCommit?: (payload: DiagnosisCommitPayload) => void;
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
  /** data-testid on the input (capture flow). */
  testId?: string;
}

const MIN_QUERY_LEN = 2;
const DEFAULT_LIMIT = 10;
const DEFAULT_DEBOUNCE_MS = 100;
const CACHE_MAX = 64;
/** Above sticky SOAP section headers (sticky-stack caps at ~40). */
const LISTBOX_Z_INDEX = 50;

interface DropdownAnchor {
  top: number;
  left: number;
  width: number;
}

function measureDropdownAnchor(input: HTMLInputElement): DropdownAnchor {
  const rect = input.getBoundingClientRect();
  return {
    top: rect.bottom + 2,
    left: rect.left,
    width: rect.width,
  };
}

const searchCache = new Map<string, DiagnosisCatalogRow[]>();

function cacheKey(q: string): string {
  return q.trim().toLowerCase();
}

function cacheGet(q: string): DiagnosisCatalogRow[] | undefined {
  return searchCache.get(cacheKey(q));
}

function cacheSet(q: string, rows: DiagnosisCatalogRow[]): void {
  const key = cacheKey(q);
  if (searchCache.size >= CACHE_MAX) {
    const first = searchCache.keys().next().value;
    if (first !== undefined) searchCache.delete(first);
  }
  searchCache.set(key, rows);
}

async function fetchDiagnosisResults(
  token: string,
  query: string,
  limit: number,
): Promise<DiagnosisCatalogRow[]> {
  const cached = cacheGet(query);
  if (cached) return cached;

  const res = await searchDiagnoses(token, query, { limit });
  const rows = res.data.results;
  cacheSet(query, rows);
  return rows;
}

export function DiagnosisAutocomplete({
  value,
  onChange,
  onSelect,
  onCommit,
  token,
  inputId,
  placeholder = "e.g. Hypertension",
  ariaLabel,
  disabled,
  className,
  limit = DEFAULT_LIMIT,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  inputRef,
  testId,
}: DiagnosisAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const fetchIdRef = useRef(0);
  const resolvingRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const inputRefInternal = useRef<HTMLInputElement | null>(null);
  const listboxId = `${useId()}-listbox`;
  const [dropdownAnchor, setDropdownAnchor] = useState<DropdownAnchor | null>(null);

  // Keep the keyboard-highlighted option visible inside the scrollable listbox.
  useEffect(() => {
    if (activeIdx < 0) return;
    optionRefs.current[activeIdx]?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const query = value.trim();
  const shouldFetch = useMemo(() => query.length >= MIN_QUERY_LEN, [query]);
  const [results, setResults] = useState<DiagnosisCatalogRow[]>([]);

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
        const rows = await fetchDiagnosisResults(token, query, limit);
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

  const showDropdown =
    open && shouldFetch && (results.length > 0 || loading || resolving);

  const syncDropdownAnchor = useCallback(() => {
    const input = inputRefInternal.current;
    if (!input) return;
    setDropdownAnchor(measureDropdownAnchor(input));
  }, []);

  useLayoutEffect(() => {
    if (!showDropdown) {
      setDropdownAnchor(null);
      return;
    }
    syncDropdownAnchor();
  }, [showDropdown, syncDropdownAnchor, value, results.length, loading, resolving]);

  useEffect(() => {
    if (!showDropdown) return;
    const handleReposition = () => syncDropdownAnchor();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [showDropdown, syncDropdownAnchor]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (listboxRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const finishCommit = useCallback(() => {
    onChange("");
    setActiveIdx(-1);
    setOpen(false);
    inputRefInternal.current?.focus();
  }, [onChange]);

  const commitSelection = useCallback(
    (entry: DiagnosisCatalogRow) => {
      if (onCommit) {
        onCommit({ source: "catalog", entry, rawText: value.trim() });
        finishCommit();
        return;
      }
      onChange(entry.title);
      onSelect?.(entry);
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

      // Shift+Enter: always keep the typed text as an uncoded diagnosis; `forced`
      // tells the parent to skip the AI resolver (asmt-07).
      if (shiftKey) {
        onCommit({ source: "freeText", label: trimmed, forced: true });
        finishCommit();
        return true;
      }

      if (activeIdx >= 0 && activeIdx < results.length) {
        onCommit({ source: "catalog", entry: results[activeIdx]!, rawText: trimmed });
        finishCommit();
        return true;
      }

      // Fast-typist path: resolve against the catalog before falling back to
      // uncoded free text. A network failure falls through to free text so the
      // card is never lost (ASMT-D3).
      if (trimmed.length >= MIN_QUERY_LEN) {
        resolvingRef.current = true;
        setResolving(true);
        try {
          const rows = await fetchDiagnosisResults(token, trimmed, limit);
          if (rows.length > 0) {
            onCommit({ source: "catalog", entry: rows[0]!, rawText: trimmed });
            finishCommit();
            return true;
          }
        } catch {
          // Swallow — fall through to the free-text commit below.
        } finally {
          resolvingRef.current = false;
          setResolving(false);
        }
      }

      onCommit({ source: "freeText", label: trimmed });
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

  const listbox = showDropdown && dropdownAnchor ? (
    <ul
      ref={listboxRef}
      id={listboxId}
      role="listbox"
      style={{
        position: "fixed",
        top: dropdownAnchor.top,
        left: dropdownAnchor.left,
        width: dropdownAnchor.width,
        zIndex: LISTBOX_Z_INDEX,
      }}
      className="max-h-52 overflow-auto rounded-lg border border-border/80 bg-card py-1 shadow-md"
    >
      {resolving ? (
        <li className="px-2.5 py-1.5 text-xs text-muted-foreground">Matching…</li>
      ) : null}
      {!resolving && loading && results.length === 0 ? (
        <li className="px-2.5 py-1.5 text-xs text-muted-foreground">Searching…</li>
      ) : null}
      {!resolving &&
        results.map((entry, idx) => {
          const active = idx === activeIdx;
          return (
            <li
              key={entry.id}
              id={`${listboxId}-option-${idx}`}
              ref={(el) => {
                optionRefs.current[idx] = el;
              }}
              role="option"
              aria-selected={active}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                commitSelection(entry);
              }}
              className={`cursor-pointer border-l-2 px-2 py-1.5 text-sm transition-colors ${
                active
                  ? "border-l-primary bg-primary/15 font-medium text-foreground"
                  : "border-l-transparent text-foreground/90 hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium leading-tight">
                  {entry.title}
                </span>
                <span className="shrink-0 rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {entry.code}
                </span>
              </div>
            </li>
          );
        })}
      {!resolving && results.length === 0 && !loading ? (
        <li className="px-2.5 py-1.5 text-xs leading-snug text-muted-foreground">
          No ICD match — press Enter to add as free text.
        </li>
      ) : null}
      {results.length > 0 && onCommit && !resolving ? (
        <li
          className="border-t border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground"
          aria-hidden
        >
          ↑↓ navigate · Enter to select · Shift+Enter for free text
        </li>
      ) : null}
    </ul>
  ) : null;

  return (
    <div ref={wrapperRef} className={className ?? ""}>
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
        onClick={() => {
          if (!disabled && !resolving && shouldFetch) setOpen(true);
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
        data-testid={testId}
      />
      {typeof document !== "undefined" && listbox
        ? createPortal(listbox, document.body)
        : null}
    </div>
  );
}
