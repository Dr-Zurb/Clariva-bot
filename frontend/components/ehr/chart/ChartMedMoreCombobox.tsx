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
  allowCustom?: boolean;
  customLabel?: (text: string) => string;
  /** Map typed/selected text to a catalog value when matched. */
  resolveMatch?: (query: string) => string | undefined;
  onCommit: (query: string) => void;
  onClear?: () => void;
  className?: string;
  inputClassName?: string;
}

type MoreRow =
  | { kind: "catalog"; value: string; label: string }
  | { kind: "custom"; text: string };

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
  customLabel = (text) => `Use "${text}"`,
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

  useEffect(() => {
    if (!open) setDraft(value);
  }, [value, open]);

  const filtered = useMemo(() => defaultFilter(suggestions, draft), [draft, suggestions]);

  const rows = useMemo((): MoreRow[] => {
    const trimmed = draft.trim();
    const catalogMatch = trimmed && resolveMatch ? resolveMatch(trimmed) : undefined;
    const list: MoreRow[] = filtered.map((opt) => ({
      kind: "catalog",
      value: opt.value,
      label: opt.label,
    }));
    if (allowCustom && trimmed && !catalogMatch) {
      list.push({ kind: "custom", text: trimmed });
    }
    return list;
  }, [allowCustom, draft, filtered, resolveMatch]);

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
        finish();
        return;
      }
      onCommit(trimmed);
      finish();
    },
    [finish, onClear, onCommit],
  );

  const commitRow = useCallback(
    (row: MoreRow) => {
      commitText(row.kind === "catalog" ? row.label : row.text);
    },
    [commitText],
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
        onBlur={() => commitText(draft)}
        onKeyDown={onKeyDown}
        className={cn(
          "h-8 w-[4.75rem] min-w-[4rem] rounded-md border border-border bg-background px-1.5 py-1 text-[10px] text-foreground",
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
            const label = row.kind === "catalog" ? row.label : customLabel(row.text);
            return (
              <li
                key={row.kind === "catalog" ? row.value : `custom-${row.text}`}
                role="option"
                aria-selected={active}
                className={cn(
                  "cursor-pointer px-2 py-1.5 text-foreground",
                  row.kind === "custom" && "border-t border-border/60 italic text-muted-foreground",
                  active && "bg-primary/10 font-medium",
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
