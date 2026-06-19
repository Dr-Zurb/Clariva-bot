"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CHART_COMBOBOX_INPUT_CLASS } from "@/components/ehr/chart/chart-chip-styles";
import { cn } from "@/lib/utils";

export interface ChartCatalogOption {
  value: string;
  label: string;
}

export type ChartCatalogCommit =
  | { kind: "catalog"; value: string; label: string }
  | { kind: "custom"; text: string };

type ComboboxRow =
  | { kind: "catalog"; value: string; label: string }
  | { kind: "custom"; text: string };

function buildRows(
  filtered: ChartCatalogOption[],
  query: string,
  resolveCatalog: (query: string) => string | undefined,
  customLabel: (text: string) => string,
): ComboboxRow[] {
  const trimmed = query.trim();
  const catalogMatch = trimmed ? resolveCatalog(trimmed) : undefined;
  const rows: ComboboxRow[] = filtered.map((opt) => ({
    kind: "catalog",
    value: opt.value,
    label: opt.label,
  }));
  if (trimmed && !catalogMatch) {
    rows.push({ kind: "custom", text: trimmed });
  }
  return rows;
}

export interface ChartCatalogComboboxProps {
  inputId: string;
  testId?: string;
  placeholder: string;
  disabled?: boolean;
  /** Catalog entries still available to pick (typically excludes already-added). */
  catalogOptions: ChartCatalogOption[];
  filterCatalog: (options: ChartCatalogOption[], query: string) => ChartCatalogOption[];
  resolveCatalog: (query: string) => string | undefined;
  customLabel?: (text: string) => string;
  onCommit: (payload: ChartCatalogCommit) => void;
  /** When true, focus the input (e.g. parent + Add clicked). */
  focusRequest?: boolean;
  onFocusRequestHandled?: () => void;
}

export function ChartCatalogCombobox({
  inputId,
  testId,
  placeholder,
  disabled,
  catalogOptions,
  filterCatalog,
  resolveCatalog,
  customLabel = (text) => `Add "${text}"`,
  onCommit,
  focusRequest,
  onFocusRequestHandled,
}: ChartCatalogComboboxProps) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const trimmedQuery = query.trim();
  const filteredOptions = useMemo(
    () => filterCatalog(catalogOptions, query),
    [catalogOptions, filterCatalog, query],
  );
  const rows = useMemo(
    () => buildRows(filteredOptions, query, resolveCatalog, customLabel),
    [customLabel, filteredOptions, query, resolveCatalog],
  );

  useEffect(() => {
    if (highlighted >= rows.length) setHighlighted(Math.max(0, rows.length - 1));
  }, [rows.length, highlighted]);

  useEffect(() => {
    if (!focusRequest) return;
    inputRef.current?.focus();
    setOpen(true);
    onFocusRequestHandled?.();
  }, [focusRequest, onFocusRequestHandled]);

  const finishCommit = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlighted(0);
  }, []);

  const commitRow = useCallback(
    (row: ComboboxRow) => {
      if (row.kind === "catalog") {
        onCommit({ kind: "catalog", value: row.value, label: row.label });
      } else {
        onCommit({ kind: "custom", text: row.text });
      }
      finishCommit();
    },
    [finishCommit, onCommit],
  );

  const tryCommitOnEnter = useCallback(
    (shiftKey: boolean) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      if (shiftKey) {
        onCommit({ kind: "custom", text: trimmed });
        finishCommit();
        return;
      }
      if (highlighted >= 0 && highlighted < rows.length) {
        commitRow(rows[highlighted]!);
        return;
      }
      const catalogMatch = resolveCatalog(trimmed);
      if (catalogMatch) {
        const label =
          catalogOptions.find((opt) => opt.value === catalogMatch)?.label ?? catalogMatch;
        onCommit({ kind: "catalog", value: catalogMatch, label });
        finishCommit();
        return;
      }
      onCommit({ kind: "custom", text: trimmed });
      finishCommit();
    },
    [catalogOptions, commitRow, finishCommit, highlighted, onCommit, query, resolveCatalog, rows],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
        setHighlighted(0);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
      setHighlighted(0);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      tryCommitOnEnter(e.shiftKey);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlighted(rows.length > 0 ? 0 : -1);
        return;
      }
      if (rows.length > 0) setHighlighted((i) => Math.min(i + 1, rows.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length > 0) setHighlighted((i) => Math.max(i - 1, 0));
    }
  };

  const showDropdown = open && (rows.length > 0 || trimmedQuery.length > 0);

  return (
    <div ref={containerRef} className="relative min-w-0">
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        data-testid={testId}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          CHART_COMBOBOX_INPUT_CLASS,
          showDropdown && "rounded-b-none border-b-transparent border-primary/30 shadow-sm",
        )}
      />
      {showDropdown && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-50 max-h-52 overflow-auto rounded-b-md border border-t-0 border-border bg-popover py-1 text-xs shadow-lg"
        >
          {rows.map((row, index) => {
            const active = index === highlighted;
            const label = row.kind === "catalog" ? row.label : customLabel(row.text);
            return (
              <li
                key={row.kind === "catalog" ? row.value : `custom-${row.text}`}
                role="option"
                aria-selected={active}
                className={cn(
                  "cursor-pointer px-3 py-2",
                  row.kind === "custom" && "border-t border-border/60 italic",
                  active ? "bg-primary/10 text-foreground" : "text-muted-foreground",
                )}
                onMouseEnter={() => setHighlighted(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitRow(row)}
              >
                {label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
