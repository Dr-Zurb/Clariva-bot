"use client";

/**
 * Investigations chip-row — extracted from PlanSection (cmi-01, 2026-05-21).
 * Controlled via `value` / `onChange` so PlanSection and InvestigationsPane share UI.
 * Persists to `fields.investigationsOrders` (semicolon-separated free-text; DL-2).
 */
import { useCallback, useId, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RX_FIELD_LABEL_CLASS } from "@/components/cockpit/rx/sections/field-styles";
import {
  parseInvestigationsOrders,
  serializeInvestigationsOrders,
} from "@/components/cockpit/rx/inputs/investigations-orders-format";

const MAX_CHIPS = 30;
const MAX_CHIP_LENGTH = 200;
const MAX_TOTAL_LENGTH = 1000;

export interface InvestigationsChipRowProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** When true, omits the field label (pane shell supplies PaneHeader). */
  hideLabel?: boolean;
}

export function InvestigationsChipRow({
  value,
  onChange,
  disabled = false,
  hideLabel = false,
}: InvestigationsChipRowProps): JSX.Element {
  const inputId = useId();
  const [input, setInput] = useState("");
  const chips = useMemo(() => parseInvestigationsOrders(value), [value]);

  const commitChips = useCallback(
    (nextChips: string[]) => {
      onChange(serializeInvestigationsOrders(nextChips));
    },
    [onChange],
  );

  const addChip = useCallback(
    (raw: string) => {
      const entry = raw.trim();
      if (!entry || disabled) return;
      if (entry.length > MAX_CHIP_LENGTH) return;
      if (chips.includes(entry)) return;
      if (chips.length >= MAX_CHIPS) return;
      const next = [...chips, entry];
      const serialized = serializeInvestigationsOrders(next);
      if (serialized.length > MAX_TOTAL_LENGTH) return;
      commitChips(next);
      setInput("");
    },
    [chips, commitChips, disabled],
  );

  const removeChip = useCallback(
    (index: number) => {
      if (disabled) return;
      commitChips(chips.filter((_, i) => i !== index));
    },
    [chips, commitChips, disabled],
  );

  const atCapacity = chips.length >= MAX_CHIPS;

  return (
    <section id="rx-investigations" aria-label="Investigations">
      <div className="space-y-2">
        {!hideLabel && (
          <label htmlFor={inputId} className={RX_FIELD_LABEL_CLASS}>
            Investigations / orders
          </label>
        )}

        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
          {chips.map((entry, index) => (
            <Badge key={`${entry}-${index}`} variant="secondary" className="gap-1">
              {entry}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeChip(index)}
                  aria-label={`Remove ${entry}`}
                  className="rounded-sm opacity-60 hover:opacity-100"
                >
                  <X size={12} />
                </button>
              )}
            </Badge>
          ))}

          {!disabled && (
            <input
              id={inputId}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addChip(input);
                } else if (e.key === "Backspace" && input === "" && chips.length > 0) {
                  removeChip(chips.length - 1);
                }
              }}
              onBlur={() => {
                if (input.trim()) addChip(input);
              }}
              placeholder={
                chips.length === 0
                  ? "Type an investigation then press Enter…"
                  : "Add another…"
              }
              className="min-w-[10rem] flex-1 border-0 bg-transparent p-1 text-sm focus:outline-none focus:ring-0"
              maxLength={MAX_CHIP_LENGTH}
              disabled={atCapacity}
              aria-label="Investigation name"
            />
          )}
        </div>

        {!disabled && (
          <button
            type="button"
            onClick={() => document.getElementById(inputId)?.focus()}
            disabled={atCapacity}
            className="text-sm font-medium text-primary hover:text-primary/80 disabled:opacity-50"
          >
            + Add investigation
          </button>
        )}

        {atCapacity && !disabled && (
          <p className="text-xs text-muted-foreground">
            Max {MAX_CHIPS} investigations. Remove some to add more.
          </p>
        )}
      </div>
    </section>
  );
}
