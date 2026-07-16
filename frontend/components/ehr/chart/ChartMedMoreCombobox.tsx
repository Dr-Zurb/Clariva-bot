"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface ChartMedMoreOption {
  value: string;
  label: string;
  hint?: string;
}

export interface ChartMedMoreComboboxProps {
  inputId?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Committed display text shown when the field is idle. */
  value?: string;
  suggestions: readonly ChartMedMoreOption[];
  /**
   * When true (default), Enter/blur commits free-typed text even if it is not
   * a catalog match. Catalog suggestions still appear in the dropdown — there
   * is no separate "Use …" row.
   */
  allowCustom?: boolean;
  /** Map typed/selected text to a catalog value when matched. */
  resolveMatch?: (query: string) => string | undefined;
  onCommit: (query: string) => void;
  onClear?: () => void;
  className?: string;
  inputClassName?: string;
}

type MoreRow = { kind: "catalog"; value: string; label: string };

function defaultFilter(options: readonly ChartMedMoreOption[], query: string): ChartMedMoreOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...options];
  return options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(q) ||
      opt.value.toLowerCase().includes(q) ||
      opt.hint?.toLowerCase().includes(q),
  );
}

export function ChartMedMoreCombobox({
  inputId,
  placeholder = "More…",
  disabled = false,
  value = "",
  suggestions,
  allowCustom = true,
  resolveMatch,
  onCommit,
  onClear,
  className,
  inputClassName,
}: ChartMedMoreComboboxProps) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  /** After a local commit, keep draft if the parent did not mirror it into `value`. */
  const retainDraftAfterCommitRef = useRef(false);

  useEffect(() => {
    if (retainDraftAfterCommitRef.current) {
      retainDraftAfterCommitRef.current = false;
      if (value.trim()) setDraft(value);
      return;
    }
    if (!open) setDraft(value);
  }, [value, open]);

  const filtered = useMemo(() => defaultFilter(suggestions, draft), [draft, suggestions]);

  const rows = useMemo((): MoreRow[] => {
    return filtered.map((opt) => ({
      kind: "catalog" as const,
      value: opt.value,
      label: opt.label,
    }));
  }, [filtered]);

  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    if (highlighted >= rows.length) setHighlighted(Math.max(0, rows.length - 1));
  }, [rows.length, highlighted]);

  const finish = useCallback(() => {
    setOpen(false);
    setHighlighted(0);
  }, []);

  const commitText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        onClear?.();
        setDraft("");
        finish();
        return;
      }
      const catalogHit = resolveMatch?.(trimmed);
      if (!allowCustom && !catalogHit) {
        setDraft(value);
        finish();
        return;
      }
      retainDraftAfterCommitRef.current = true;
      setDraft(trimmed);
      onCommit(trimmed);
      finish();
    },
    [allowCustom, finish, onClear, onCommit, resolveMatch, value],
  );

  const commitRow = useCallback(
    (row: MoreRow) => {
      retainDraftAfterCommitRef.current = true;
      setDraft(row.label);
      onCommit(row.label);
      finish();
    },
    [finish, onCommit],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setDraft(value);
      finish();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = draft.trim();
      const exactCatalog =
        trimmed &&
        rows.find(
          (row) =>
            row.label.toLowerCase() === trimmed.toLowerCase() ||
            row.value.toLowerCase() === trimmed.toLowerCase(),
        );
      if (exactCatalog) {
        commitRow(exactCatalog);
        return;
      }
      // Prefer free-typed text over a merely highlighted suggestion so custom
      // units (e.g. "deaf asdf") are not replaced by the first filtered row.
      if (trimmed && (allowCustom || resolveMatch?.(trimmed))) {
        commitText(draft);
        return;
      }
      if (highlighted >= 0 && highlighted < rows.length) {
        commitRow(rows[highlighted]!);
        return;
      }
      commitText(draft);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      if (rows.length > 0) setHighlighted((i) => Math.min(i + 1, rows.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length > 0) setHighlighted((i) => Math.max(i - 1, 0));
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && containerRef.current?.contains(next)) return;
    window.requestAnimationFrame(() => {
      if (containerRef.current?.contains(document.activeElement)) return;
      commitText(inputRef.current?.value ?? draftRef.current);
    });
  };

  const showDropdown = open && rows.length > 0;

  return (
    <div ref={containerRef} className={cn("relative shrink-0", className)}>
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
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onFocus={() => {
          if (!disabled) {
            setOpen(true);
            setHighlighted(0);
          }
        }}
        onClick={() => {
          if (!disabled) {
            setOpen(true);
            setHighlighted(0);
          }
        }}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
        className={cn(
          "h-8 w-[5.5rem] min-w-[4.5rem] rounded-md border border-border bg-background px-1.5 py-1 text-[10px] text-foreground",
          "placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50",
          value.trim() && !open && "border-primary/40",
          showDropdown && "rounded-b-none border-b-transparent border-primary/30",
          inputClassName,
        )}
      />
      {showDropdown && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 z-50 min-w-[6.5rem] max-h-40 overflow-auto rounded-b-md border border-t-0 border-border bg-popover py-0.5 text-[10px] shadow-lg"
        >
          {rows.map((row, index) => {
            const active = index === highlighted;
            return (
              <li
                key={row.value}
                role="option"
                aria-selected={active}
                className={cn(
                  "cursor-pointer px-2 py-1.5 text-foreground",
                  active && "bg-primary/10 font-medium",
                )}
                onMouseEnter={() => setHighlighted(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitRow(row)}
              >
                {row.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
