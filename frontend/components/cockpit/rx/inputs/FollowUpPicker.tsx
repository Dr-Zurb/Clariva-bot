"use client";

import { useRxForm, type FollowUpUnit } from "@/components/cockpit/rx/RxFormContext";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const UNITS: { value: FollowUpUnit; label: string }[] = [
  { value: "days", label: "days" },
  { value: "weeks", label: "weeks" },
  { value: "months", label: "months" },
  { value: "as_needed", label: "as needed" },
];

export function FollowUpPicker() {
  const { state, setField } = useRxForm();
  const isAsNeeded = state.fields.followUpUnit === "as_needed";

  return (
    <div className="space-y-1.5">
      <span className={RX_FIELD_LABEL_CLASS}>Follow-up (structured)</span>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-sm text-muted-foreground">in</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={3650}
          step={1}
          value={isAsNeeded ? "" : (state.fields.followUpValue ?? "")}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              setField("followUpValue", null);
              return;
            }
            const n = Number(raw);
            if (Number.isFinite(n)) setField("followUpValue", Math.round(n));
          }}
          disabled={isAsNeeded}
          placeholder="0"
          className={`${RX_FIELD_INPUT_CLASS} mt-0 w-20`}
          aria-label="Follow-up value"
        />
        <Select
          value={state.fields.followUpUnit ?? ""}
          onValueChange={(v) => {
            const next = (v || null) as FollowUpUnit | null;
            setField("followUpUnit", next);
            if (next === "as_needed") setField("followUpValue", null);
          }}
        >
          <SelectTrigger className="w-36" aria-label="Follow-up unit">
            <SelectValue placeholder="unit…" />
          </SelectTrigger>
          <SelectContent>
            {UNITS.map((u) => (
              <SelectItem key={u.value} value={u.value}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        Leave blank if no follow-up needed, or use the free-text below for special
        instructions.
      </p>
    </div>
  );
}
