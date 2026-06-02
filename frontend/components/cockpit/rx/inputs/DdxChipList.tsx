"use client";

import { useCallback, useState } from "react";
import { X } from "lucide-react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { Badge } from "@/components/ui/badge";
import { RX_FIELD_LABEL_CLASS } from "@/components/cockpit/rx/sections/field-styles";

const MAX_ENTRIES = 20;
const MAX_ENTRY_LENGTH = 200;

export function DdxChipList() {
  const { state, dispatch } = useRxForm();
  const [input, setInput] = useState("");

  const addDdx = useCallback(
    (raw: string) => {
      const entry = raw.trim();
      if (!entry) return;
      if (entry.length > MAX_ENTRY_LENGTH) return;
      if (state.fields.differentialDiagnosis.includes(entry)) return;
      if (state.fields.differentialDiagnosis.length >= MAX_ENTRIES) return;
      dispatch({ type: "ADD_DDX", entry });
      setInput("");
    },
    [state.fields.differentialDiagnosis, dispatch],
  );

  const removeDdx = useCallback(
    (index: number) => dispatch({ type: "REMOVE_DDX", index }),
    [dispatch],
  );

  return (
    <div className="space-y-2">
      <label htmlFor="rx-ddx-input" className={RX_FIELD_LABEL_CLASS}>
        Differential diagnosis
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
        {state.fields.differentialDiagnosis.map((entry, index) => (
          <Badge key={`${entry}-${index}`} variant="secondary" className="gap-1">
            {entry}
            <button
              type="button"
              onClick={() => removeDdx(index)}
              aria-label={`Remove ${entry}`}
              className="rounded-sm opacity-60 hover:opacity-100"
            >
              <X size={12} />
            </button>
          </Badge>
        ))}
        <input
          id="rx-ddx-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addDdx(input);
            } else if (
              e.key === "Backspace" &&
              input === "" &&
              state.fields.differentialDiagnosis.length > 0
            ) {
              removeDdx(state.fields.differentialDiagnosis.length - 1);
            }
          }}
          onBlur={() => {
            if (input.trim()) addDdx(input);
          }}
          placeholder={
            state.fields.differentialDiagnosis.length === 0
              ? "Type a differential then press Enter…"
              : "Add another…"
          }
          className="min-w-[10rem] flex-1 border-0 bg-transparent p-1 text-sm focus:outline-none focus:ring-0"
          maxLength={MAX_ENTRY_LENGTH}
          disabled={state.fields.differentialDiagnosis.length >= MAX_ENTRIES}
        />
      </div>
      {state.fields.differentialDiagnosis.length >= MAX_ENTRIES && (
        <p className="text-xs text-muted-foreground">
          Max {MAX_ENTRIES} differentials. Remove some to add more.
        </p>
      )}
    </div>
  );
}
