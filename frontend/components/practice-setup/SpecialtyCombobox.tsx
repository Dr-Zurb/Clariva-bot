"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { MEDICAL_SPECIALTIES } from "@/lib/medical-specialties";

const OTHER_LABEL = "Other / not listed";
const CLEAR_LABEL = "— Clear specialty —";

function isInList(s: string): boolean {
  const t = s.trim();
  return t !== "" && MEDICAL_SPECIALTIES.includes(t);
}

type Row =
  | { kind: "clear" }
  | { kind: "item"; label: string }
  | { kind: "other" };

export function SpecialtyCombobox({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  /** Filter text while the list is open; separate from committed `value`. */
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  /** User chose "Other / not listed" (including empty custom text). */
  const [explicitOther, setExplicitOther] = useState(
    () => value.trim() !== "" && !isInList(value)
  );

  useEffect(() => {
    const v = value.trim();
    if (v !== "" && isInList(value)) setExplicitOther(false);
    if (v !== "" && !isInList(value)) setExplicitOther(true);
  }, [value]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return [...MEDICAL_SPECIALTIES];
    return MEDICAL_SPECIALTIES.filter((s) => s.toLowerCase().includes(q));
  }, [query]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    const hasSelection = value.trim() !== "" || explicitOther;
    if (hasSelection) out.push({ kind: "clear" });
    for (const label of filteredItems) out.push({ kind: "item", label });
    out.push({ kind: "other" });
    return out;
  }, [filteredItems, value, explicitOther]);

  useEffect(() => {
    if (highlighted >= rows.length) setHighlighted(Math.max(0, rows.length - 1));
  }, [rows.length, highlighted]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    if (!explicitOther && value.trim() !== "") setQuery(value.trim());
    else setQuery("");
    setHighlighted(0);
  }, [disabled, explicitOther, value]);

  const chooseRow = useCallback(
    (row: Row) => {
      if (row.kind === "clear") {
        onChange("");
        setExplicitOther(false);
        close();
        return;
      }
      if (row.kind === "item") {
        onChange(row.label);
        setExplicitOther(false);
        close();
        return;
      }
      setExplicitOther(true);
      onChange("");
      close();
    },
    [onChange, close]
  );

  /** Visible text in the main field when the menu is closed. */
  const closedDisplay = explicitOther
    ? OTHER_LABEL
    : value.trim() !== ""
      ? value.trim()
      : "";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close]);

  const onMainKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      e.preventDefault();
      openMenu();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => (i + 1) % rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => (i - 1 + rows.length) % rows.length);
    } else if (e.key === "Enter" && rows.length > 0) {
      e.preventDefault();
      chooseRow(rows[highlighted]);
    }
  };

  const customInputId = `${id}-custom`;

  return (
    <div ref={containerRef} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
      <div className="relative min-w-0 flex-1">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          readOnly={!open && !disabled}
          value={open ? query : closedDisplay}
          placeholder={explicitOther || value.trim() ? undefined : "Search or select specialty…"}
          onChange={(e) => {
            if (!open) return;
            setQuery(e.target.value);
            setHighlighted(0);
          }}
          onFocus={() => {
            if (!disabled && !open) openMenu();
          }}
          onKeyDown={onMainKeyDown}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 read-only:text-gray-900"
        />
        {open && rows.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-50 mt-0.5 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg"
          >
            {rows.map((row, index) => {
              const active = index === highlighted;
              if (row.kind === "clear") {
                return (
                  <li
                    key="clear"
                    role="option"
                    aria-selected={active}
                    className={`cursor-pointer px-3 py-2 ${active ? "bg-blue-50 text-blue-900" : "text-gray-700"}`}
                    onMouseEnter={() => setHighlighted(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => chooseRow(row)}
                  >
                    {CLEAR_LABEL}
                  </li>
                );
              }
              if (row.kind === "other") {
                return (
                  <li
                    key="other"
                    role="option"
                    aria-selected={active}
                    className={`cursor-pointer px-3 py-2 ${active ? "bg-blue-50 text-blue-900" : "text-gray-700"}`}
                    onMouseEnter={() => setHighlighted(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => chooseRow(row)}
                  >
                    {OTHER_LABEL}
                  </li>
                );
              }
              return (
                <li
                  key={row.label}
                  role="option"
                  aria-selected={active}
                  className={`cursor-pointer px-3 py-2 ${active ? "bg-blue-50 text-blue-900" : "text-gray-600"}`}
                  onMouseEnter={() => setHighlighted(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => chooseRow(row)}
                >
                  {row.label}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {explicitOther && (
        <div className="min-w-0 w-full shrink-0 sm:mt-1 sm:w-[min(24rem,48%)]">
          <label htmlFor={customInputId} className="mb-1 block text-xs font-medium text-gray-700 sm:sr-only">
            Custom specialty
          </label>
          <input
            id={customInputId}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={200}
            disabled={disabled}
            placeholder="Type your specialty"
            aria-describedby={`${customInputId}-hint`}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
          />
          <p id={`${customInputId}-hint`} className="mt-1 text-xs text-gray-500">
            Only this field accepts free text when &ldquo;{OTHER_LABEL}&rdquo; is selected.
          </p>
        </div>
      )}
    </div>
  );
}
