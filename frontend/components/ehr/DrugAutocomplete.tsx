"use client";

/**
 * <DrugAutocomplete> — EHR Sub-batch B1 / T2.8.
 *
 * Combobox-style input over `drug_master`. The catalogue loads once per
 * session and filters in memory as the doctor types (≥2 chars, up to 10
 * rows). Selecting a result calls onSelect(drug) so the parent can prefill
 * the row's generic name + dosage + route in a single state update.
 *
 * The first dropdown row is preselected so Enter commits it without
 * ArrowDown. Escape closes the list first if the doctor wants the typed
 * text instead. The parent stores `drugMasterId = null` for free text
 * (T2.7 / T2.9 acceptance).
 *
 * NOT using Headless UI — the codebase has no UI-primitive dependency
 * today and we don't want to introduce one for a single combobox. The
 * implementation here is a vanilla React focus-trap + arrow-key dropdown
 * that's keyboard-navigable AND mobile touch-friendly (44px+ rows).
 *
 * Caching: the full catalogue is fetched once per auth-token session
 * (`loadDrugMasterCatalog`) and filtered locally. Reload clears it.
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
import { useDoctorDrugUsage } from "@/hooks/useDoctorDrugUsage";
import { sortDrugResultsByPersonalUsage } from "@/lib/drug-autocomplete-ranking";
import {
  filterDrugMasterCatalog,
  formatDrugMasterCaptureLine,
  loadDrugMasterCatalog,
  peekDrugMasterCatalog,
} from "@/lib/drug-master-catalog";
import { trackCockpitV2RRxPolishRankingLanded } from "@/lib/patient-profile/telemetry";
import { cn } from "@/lib/utils";

export interface DrugAutocompleteExtraOption {
  id: string;
  label: string;
  badge?: string;
}

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
  /**
   * Habit / combo rows rendered above catalog names. Selecting one
   * does not change the input — the parent commits the full card.
   */
  extraOptions?: readonly DrugAutocompleteExtraOption[];
  onSelectExtra?: (id: string) => void;
  /** Clears a habit row without committing it. Enter still commits #1. */
  onClearExtra?: (id: string) => void;
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
  /** @deprecated Catalogue is local; kept so existing callers compile. */
  debounceMs?: number;
  /**
   * When true, the combobox stops acting as a drug picker: no dropdown, no
   * fetch, and Enter/arrow keys are NOT captured — they bubble to the parent.
   * Used by the full-line capture bar once the text carries sig details
   * ("amlodipine 10 years"), so a stale dropdown match can't hijack Enter and
   * commit the bare catalog drug instead of parsing the typed line.
   */
  selectionDisabled?: boolean;
  /**
   * When false, never fetch or show the drug_master dropdown. Extra options
   * are also hidden. Capture bar keeps this true and uses selectionDisabled
   * once the line carries sig details.
   */
  catalogEnabled?: boolean;
}

const MIN_QUERY_LEN = 2;
const DEFAULT_LIMIT = 10;
const EMPTY_EXTRA_OPTIONS: readonly DrugAutocompleteExtraOption[] = [];
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

export default function DrugAutocomplete({
  value,
  onChange,
  onSelect,
  extraOptions = EMPTY_EXTRA_OPTIONS,
  onSelectExtra,
  onClearExtra,
  token,
  inputId,
  placeholder = "Medicine name",
  disabled,
  className,
  inputClassName,
  limit = DEFAULT_LIMIT,
  selectionDisabled = false,
  catalogEnabled = true,
}: DrugAutocompleteProps) {
  const pickerDisabled = selectionDisabled || !catalogEnabled;
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [catalog, setCatalog] = useState<DrugMasterRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  // After ArrowUp/Down the pointer is often still sitting on a row.
  // Ignore mouseenter until the mouse actually moves, or the highlight
  // snaps back and Up looks dead.
  const hoverLockedRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const listboxId = `${useId()}-listbox`;
  const [dropdownAnchor, setDropdownAnchor] = useState<DropdownAnchor | null>(
    null
  );
  const { scores: usageScores } = useDoctorDrugUsage(token);

  // Effective query — trimmed; below MIN_QUERY_LEN we hide the dropdown
  // and don't fetch.
  const query = value.trim();
  const shouldFetch = useMemo(() => query.length >= MIN_QUERY_LEN, [query]);

  useEffect(() => {
    if (pickerDisabled || !token) return;
    const peeked = peekDrugMasterCatalog(token);
    if (peeked) {
      setCatalog(peeked);
      setCatalogLoading(false);
      return;
    }
    let cancelled = false;
    setCatalogLoading(true);
    void loadDrugMasterCatalog(token)
      .then((rows) => {
        if (cancelled) return;
        setCatalog(rows);
      })
      .catch(() => {
        // Silent — doctor can still free-text the medicine name.
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, pickerDisabled]);

  const rawResults = useMemo(
    () => (shouldFetch ? filterDrugMasterCatalog(catalog, query, limit) : []),
    [catalog, query, shouldFetch, limit]
  );
  const rankedResults = useMemo(
    () => sortDrugResultsByPersonalUsage(rawResults, usageScores),
    [rawResults, usageScores]
  );

  useEffect(() => {
    if (rankedResults.length === 0) return;
    const topScore = usageScores[rankedResults[0].id] ?? 0;
    if (topScore > 0) {
      trackCockpitV2RRxPolishRankingLanded({
        topResultPersonalScore: topScore,
      });
    }
  }, [rankedResults, usageScores]);

  useEffect(() => {
    if (!shouldFetch || pickerDisabled) {
      setOpen(false);
      setActiveIdx(-1);
    }
  }, [shouldFetch, pickerDisabled]);

  useEffect(() => {
    setActiveIdx(0);
    hoverLockedRef.current = false;
    lastPointerRef.current = null;
  }, [query]);

  useLayoutEffect(() => {
    const list = listboxRef.current;
    if (activeIdx < 0 || !list) return;
    const active = list.querySelector<HTMLElement>(
      '[role="option"][aria-selected="true"]'
    );
    if (!active) return;
    const listRect = list.getBoundingClientRect();
    const rowRect = active.getBoundingClientRect();
    if (rowRect.top < listRect.top) {
      list.scrollTop -= listRect.top - rowRect.top;
    } else if (rowRect.bottom > listRect.bottom) {
      list.scrollTop += rowRect.bottom - listRect.bottom;
    }
  }, [activeIdx]);

  const extraItems = useMemo(
    () => (pickerDisabled ? EMPTY_EXTRA_OPTIONS : extraOptions),
    [pickerDisabled, extraOptions]
  );
  const itemCount = extraItems.length + rankedResults.length;
  const loading = catalogLoading && shouldFetch && itemCount === 0;
  const showDropdown =
    !pickerDisabled && open && shouldFetch && (itemCount > 0 || loading);

  const syncDropdownAnchor = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const next = measureDropdownAnchor(input);
    setDropdownAnchor((prev) =>
      prev &&
      prev.top === next.top &&
      prev.left === next.left &&
      prev.width === next.width
        ? prev
        : next
    );
  }, []);

  useLayoutEffect(() => {
    if (!showDropdown) {
      setDropdownAnchor(null);
      return;
    }
    syncDropdownAnchor();
  }, [
    showDropdown,
    syncDropdownAnchor,
    value,
    rankedResults.length,
    extraItems.length,
    loading,
  ]);

  useEffect(() => {
    if (!showDropdown) return;
    const handleReposition = (e?: Event) => {
      if (e && listboxRef.current?.contains(e.target as Node)) return;
      syncDropdownAnchor();
    };
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
      onChange(formatDrugMasterCaptureLine(drug));
      onSelect?.(drug);
      setOpen(false);
      setActiveIdx(-1);
      // Return focus to the input so the doctor can keep typing into
      // dosage / frequency / etc. (Tab order takes them there next.)
      inputRef.current?.focus();
    },
    [onChange, onSelect]
  );

  const commitExtra = useCallback(
    (id: string) => {
      onSelectExtra?.(id);
      setOpen(false);
      setActiveIdx(-1);
      inputRef.current?.focus();
    },
    [onSelectExtra]
  );

  const commitActiveItem = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= itemCount) return false;
      if (idx < extraItems.length) {
        commitExtra(extraItems[idx]!.id);
        return true;
      }
      const drug = rankedResults[idx - extraItems.length];
      if (!drug) return false;
      commitSelection(drug);
      return true;
    },
    [itemCount, extraItems, rankedResults, commitExtra, commitSelection]
  );

  const lockHoverFromKeyboard = () => {
    hoverLockedRef.current = true;
    // Next pointer event only records position — scroll/synthetic
    // mousemove after a key must not unlock hover.
    lastPointerRef.current = null;
  };

  const highlightFromPointer = (idx: number) => {
    if (hoverLockedRef.current) return;
    setActiveIdx(idx);
  };

  const onListPointerMove = (e: {
    clientX: number;
    clientY: number;
    movementX?: number;
    movementY?: number;
  }) => {
    const prev = lastPointerRef.current;
    const moved =
      (e.movementX ?? 0) !== 0 ||
      (e.movementY ?? 0) !== 0 ||
      (prev != null && (prev.x !== e.clientX || prev.y !== e.clientY));
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    if (!moved) return;
    hoverLockedRef.current = false;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Parse-mode (full sig line): never capture keys — let Enter bubble to the
    // capture bar so the typed line is parsed instead of a stale dropdown match.
    if (pickerDisabled) return;
    if (!open && e.key === "ArrowDown" && itemCount > 0) {
      lockHoverFromKeyboard();
      setOpen(true);
      setActiveIdx(0);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!open && e.key === "ArrowUp" && itemCount > 0) {
      lockHoverFromKeyboard();
      setOpen(true);
      setActiveIdx(itemCount - 1);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!open) return;
    switch (e.key) {
      case "ArrowDown":
        lockHoverFromKeyboard();
        setActiveIdx((i) => {
          if (itemCount === 0) return -1;
          if (i < 0) return 0;
          return Math.min(i + 1, itemCount - 1);
        });
        e.preventDefault();
        e.stopPropagation();
        break;
      case "ArrowUp":
        lockHoverFromKeyboard();
        setActiveIdx((i) => {
          if (itemCount === 0) return -1;
          if (i < 0) return itemCount - 1;
          return Math.max(i - 1, 0);
        });
        e.preventDefault();
        e.stopPropagation();
        break;
      case "Enter":
        if (commitActiveItem(activeIdx)) {
          e.preventDefault();
          e.stopPropagation();
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
        data-testid={extraItems.length > 0 ? "medicine-combo-list" : undefined}
        onMouseMove={onListPointerMove}
      >
        {loading && itemCount === 0 && (
          <li className="px-3 py-2 text-xs text-muted-foreground">
            Searching…
          </li>
        )}
        {extraItems.map((extra, idx) => {
          const active = idx === activeIdx;
          return (
            <li
              key={extra.id}
              id={`${listboxId}-option-${idx}`}
              role="option"
              aria-selected={active}
              data-testid="medicine-combo-option"
              onMouseEnter={() => highlightFromPointer(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                commitExtra(extra.id);
              }}
              className={cn(
                "flex items-center gap-2 cursor-pointer px-3 py-1.5 text-[11px] leading-tight",
                active ? "bg-primary/10" : "hover:bg-muted/50"
              )}
            >
              <span className="min-w-0 flex-1 truncate">{extra.label}</span>
              {extra.badge ? (
                <span
                  data-testid="medicine-combo-most-frequent"
                  className="shrink-0 rounded-full border border-border px-1.5 py-0 text-[10px] text-muted-foreground"
                >
                  {extra.badge}
                </span>
              ) : null}
              {onClearExtra ? (
                <button
                  type="button"
                  aria-label="Clear this suggestion"
                  data-testid="medicine-combo-clear"
                  className="shrink-0 rounded px-1 text-[12px] leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClearExtra(extra.id);
                  }}
                >
                  ×
                </button>
              ) : null}
            </li>
          );
        })}
        {extraItems.length > 0 && rankedResults.length > 0 ? (
          <li role="presentation" className="my-0.5 border-t border-border" />
        ) : null}
        {rankedResults.map((drug, catalogIdx) => {
          const idx = extraItems.length + catalogIdx;
          const active = idx === activeIdx;
          return (
            <li
              key={drug.id}
              id={`${listboxId}-option-${idx}`}
              role="option"
              aria-selected={active}
              data-testid="medicine-catalog-option"
              onMouseEnter={() => highlightFromPointer(idx)}
              // onMouseDown (not onClick) so the input doesn't blur
              // before the click registers — onClick after blur would
              // close the dropdown via the outside-click handler.
              onMouseDown={(e) => {
                e.preventDefault();
                commitSelection(drug);
              }}
              className={cn(
                "flex items-center gap-2 cursor-pointer px-3 py-1.5 text-[11px] leading-tight",
                active ? "bg-primary/10" : "hover:bg-muted/50"
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                {formatDrugMasterCaptureLine(drug)}
              </span>
            </li>
          );
        })}
        {itemCount === 0 && !loading && (
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
          showDropdown && activeIdx >= 0 && activeIdx < itemCount
            ? `${listboxId}-option-${activeIdx}`
            : undefined
        }
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (!pickerDisabled) setOpen(true);
        }}
        onFocus={() => {
          if (shouldFetch && !pickerDisabled) setOpen(true);
        }}
        onClick={() => {
          if (shouldFetch && !pickerDisabled && !disabled) setOpen(true);
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
