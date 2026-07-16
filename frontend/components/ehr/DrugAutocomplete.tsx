"use client";

/**
 * <DrugAutocomplete> — EHR Sub-batch B1 / T2.8.
 *
 * Combobox-style input over `drug_master`. Doctor types ≥2 chars →
 * 200ms-debounced fetch → dropdown of up to 10 results. Selecting a
 * result calls onSelect(drug) so the parent can prefill the row's
 * generic name + dosage + route in a single state update.
 *
 * Free-text fallback is intentional: doctors can type "compounded X"
 * and submit without ever picking from the dropdown. The parent stores
 * `drugMasterId = null` in that case (T2.7 / T2.9 acceptance).
 *
 * NOT using Headless UI — the codebase has no UI-primitive dependency
 * today and we don't want to introduce one for a single combobox. The
 * implementation here is a vanilla React focus-trap + arrow-key dropdown
 * that's keyboard-navigable AND mobile touch-friendly (44px+ rows).
 *
 * Caching: results are cached in a module-level Map keyed on the query
 * string (case-insensitive, trimmed). Cache size capped at 64 entries
 * (LRU-ish via insertion-order eviction). Cache TTL is implicit — page
 * reload clears it. Good enough for a per-session lookup; the table is
 * tiny and the network round-trip is sub-100ms.
 *
 * Dropdown is portaled to `document.body` with fixed positioning so sticky
 * SOAP section headers (z ≈ 40) and sibling Plan cards cannot cover it.
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
import type { DrugMasterRow } from "@/types/drug-master";
import { searchDrugs } from "@/lib/api";
import { useDoctorDrugUsage } from "@/hooks/useDoctorDrugUsage";
import { sortDrugResultsByPersonalUsage } from "@/lib/drug-autocomplete-ranking";
import { trackCockpitV2RRxPolishRankingLanded } from "@/lib/patient-profile/telemetry";
import { cn } from "@/lib/utils";

interface DrugAutocompleteProps {
  /** Current text in the input (controlled). */
  value: string;
  /** Free-text typing fires this on every keystroke. */
  onChange: (text: string) => void;
  /**
   * Fired when a dropdown result is picked. Parent decides what to
   * prefill (typical: medicine_name = generic_name; dosage = strength
   * if empty; route = route_default if empty; drug_master_id = drug.id).
   */
  onSelect?: (drug: DrugMasterRow) => void;
  /** Auth token for the search request. */
  token: string;
  /** Required: input id for label association. */
  inputId: string;
  placeholder?: string;
  disabled?: boolean;
  /** Wrapper classes (positioning/sizing only — avoid borders here). */
  className?: string;
  /** Input element classes. Defaults to legacy gray border styling. */
  inputClassName?: string;
  /** Hard cap on result count (server caps at 25). */
  limit?: number;
  /** Debounce window in ms. Defaults to 200. */
  debounceMs?: number;
  /**
   * When true, the combobox stops acting as a drug picker: no dropdown, no
   * fetch, and Enter/arrow keys are NOT captured — they bubble to the parent.
   * Used by the full-line capture bar once the text carries sig details
   * ("amlodipine 10 years"), so a stale dropdown match can't hijack Enter and
   * commit the bare catalog drug instead of parsing the typed line.
   */
  selectionDisabled?: boolean;
}

const MIN_QUERY_LEN = 2;
const DEFAULT_LIMIT = 10;
const DEFAULT_DEBOUNCE_MS = 200;
const CACHE_MAX = 64;
/** Above sticky SOAP section headers (sticky-stack caps at ~40). */
const LISTBOX_Z_INDEX = 50;

const DEFAULT_INPUT_CLASS =
  "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50";

interface DropdownAnchor {
  top: number;
  left: number;
  width: number;
}

function measureDropdownAnchor(input: HTMLInputElement): DropdownAnchor {
  const rect = input.getBoundingClientRect();
  return {
    top: rect.bottom + 4,
    left: rect.left,
    width: rect.width,
  };
}

// Module-level cache (per page session). Cleared on page reload.
const searchCache = new Map<string, DrugMasterRow[]>();

function cacheKey(q: string): string {
  return q.trim().toLowerCase();
}

function cacheGet(q: string): DrugMasterRow[] | undefined {
  return searchCache.get(cacheKey(q));
}

function cacheSet(q: string, rows: DrugMasterRow[]): void {
  const key = cacheKey(q);
  // Insertion-order eviction: drop oldest if at cap.
  if (searchCache.size >= CACHE_MAX) {
    const first = searchCache.keys().next().value;
    if (first !== undefined) searchCache.delete(first);
  }
  searchCache.set(key, rows);
}

export default function DrugAutocomplete({
  value,
  onChange,
  onSelect,
  token,
  inputId,
  placeholder = "Medicine name",
  disabled,
  className,
  inputClassName,
  limit = DEFAULT_LIMIT,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  selectionDisabled = false,
}: DrugAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  // Track the latest fetch's "fetch id" so a stale completion doesn't
  // overwrite a newer query's results.
  const fetchIdRef = useRef(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const listboxId = `${useId()}-listbox`;
  const [dropdownAnchor, setDropdownAnchor] = useState<DropdownAnchor | null>(null);
  const { scores: usageScores } = useDoctorDrugUsage(token);

  // Effective query — trimmed; below MIN_QUERY_LEN we hide the dropdown
  // and don't fetch.
  const query = value.trim();
  const shouldFetch = useMemo(
    () => query.length >= MIN_QUERY_LEN,
    [query]
  );

  const [rawResults, setRawResults] = useState<DrugMasterRow[]>([]);
  const rankedResults = useMemo(
    () => sortDrugResultsByPersonalUsage(rawResults, usageScores),
    [rawResults, usageScores]
  );

  useEffect(() => {
    if (rankedResults.length === 0) return;
    const topScore = usageScores[rankedResults[0].id] ?? 0;
    if (topScore > 0) {
      trackCockpitV2RRxPolishRankingLanded({ topResultPersonalScore: topScore });
    }
  }, [rankedResults, usageScores]);

  // Debounced fetch. Re-runs whenever the trimmed query changes.
  useEffect(() => {
    if (!shouldFetch || selectionDisabled) {
      setRawResults([]);
      setOpen(false);
      setActiveIdx(-1);
      return;
    }
    // Cache fast-path: hydrate immediately + still revalidate (cache
    // only seeds the dropdown; backend is the source of truth).
    const cached = cacheGet(query);
    if (cached) {
      setRawResults(cached);
      setActiveIdx(cached.length > 0 ? 0 : -1);
    }

    const myId = ++fetchIdRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchDrugs(token, query, { limit });
        if (myId !== fetchIdRef.current) return; // stale
        const rows = res.data.results;
        cacheSet(query, rows);
        setRawResults(rows);
        setActiveIdx(rows.length > 0 ? 0 : -1);
      } catch {
        if (myId !== fetchIdRef.current) return;
        // Silent on transient errors — show whatever cache hydrated;
        // doctors can still free-text enter the medicine name.
      } finally {
        if (myId === fetchIdRef.current) setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, shouldFetch, token, limit, debounceMs, selectionDisabled]);

  const showDropdown =
    !selectionDisabled && open && shouldFetch && (rankedResults.length > 0 || loading);

  const syncDropdownAnchor = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    setDropdownAnchor(measureDropdownAnchor(input));
  }, []);

  useLayoutEffect(() => {
    if (!showDropdown) {
      setDropdownAnchor(null);
      return;
    }
    syncDropdownAnchor();
  }, [showDropdown, syncDropdownAnchor, value, rankedResults.length, loading]);

  useEffect(() => {
    if (!showDropdown) return;
    const handleReposition = () => syncDropdownAnchor();
    window.addEventListener("resize", handleReposition);
    // Capture scroll from nested panes (Plan tab scroll container).
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [showDropdown, syncDropdownAnchor]);

  // Click-outside → close dropdown (input wrapper OR portaled listbox).
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

  const commitSelection = useCallback(
    (drug: DrugMasterRow) => {
      onChange(drug.generic_name);
      onSelect?.(drug);
      setOpen(false);
      setActiveIdx(-1);
      // Return focus to the input so the doctor can keep typing into
      // dosage / frequency / etc. (Tab order takes them there next.)
      inputRef.current?.focus();
    },
    [onChange, onSelect]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Parse-mode (full sig line): never capture keys — let Enter bubble to the
    // capture bar so the typed line is parsed instead of a stale dropdown match.
    if (selectionDisabled) return;
    if (!open && e.key === "ArrowDown" && rankedResults.length > 0) {
      setOpen(true);
      setActiveIdx(0);
      e.preventDefault();
      return;
    }
    if (!open) return;
    switch (e.key) {
      case "ArrowDown":
        setActiveIdx((i) => Math.min(i + 1, rankedResults.length - 1));
        e.preventDefault();
        break;
      case "ArrowUp":
        setActiveIdx((i) => Math.max(i - 1, 0));
        e.preventDefault();
        break;
      case "Enter":
        if (activeIdx >= 0 && activeIdx < rankedResults.length) {
          commitSelection(rankedResults[activeIdx]);
          e.preventDefault();
        }
        break;
      case "Escape":
        setOpen(false);
        setActiveIdx(-1);
        e.preventDefault();
        break;
      case "Tab":
        // Tab away → close, but don't pre-empt the focus move.
        setOpen(false);
        break;
    }
  };

  const listbox =
    showDropdown && dropdownAnchor ? (
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
        className="max-h-72 overflow-auto rounded-md border border-border bg-popover py-0.5 shadow-lg"
      >
        {loading && rankedResults.length === 0 && (
          <li className="px-3 py-2 text-xs text-muted-foreground">Searching…</li>
        )}
        {rankedResults.map((drug, idx) => {
          const active = idx === activeIdx;
          return (
            <li
              key={drug.id}
              id={`${listboxId}-option-${idx}`}
              role="option"
              aria-selected={active}
              onMouseEnter={() => setActiveIdx(idx)}
              // onMouseDown (not onClick) so the input doesn't blur
              // before the click registers — onClick after blur would
              // close the dropdown via the outside-click handler.
              onMouseDown={(e) => {
                e.preventDefault();
                commitSelection(drug);
              }}
              className={cn(
                "cursor-pointer px-3 py-2.5 text-sm leading-tight",
                active ? "bg-primary/10" : "hover:bg-muted/50",
              )}
            >
              <div className="font-medium text-foreground">{drug.generic_name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {[
                  drug.brand_names.slice(0, 3).join(" · "),
                  drug.strength,
                  drug.form,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </li>
          );
        })}
        {rankedResults.length === 0 && !loading && (
          <li className="px-3 py-2 text-xs text-muted-foreground">
            No matches — type the medicine name to add it as free text.
          </li>
        )}
      </ul>
    ) : null;

  return (
    <div ref={wrapperRef} className={cn("relative w-full", className)}>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-activedescendant={
          showDropdown && activeIdx >= 0
            ? `${listboxId}-option-${activeIdx}`
            : undefined
        }
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (!selectionDisabled) setOpen(true);
        }}
        onFocus={() => {
          if (shouldFetch && !selectionDisabled) setOpen(true);
        }}
        onClick={() => {
          if (shouldFetch && !selectionDisabled && !disabled) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={inputClassName ?? DEFAULT_INPUT_CLASS}
        maxLength={200}
        disabled={disabled}
      />
      {typeof document !== "undefined" && listbox
        ? createPortal(listbox, document.body)
        : null}
    </div>
  );
}
