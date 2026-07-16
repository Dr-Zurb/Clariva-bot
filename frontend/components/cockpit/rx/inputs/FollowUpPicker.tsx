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

export interface FollowUpPickerProps {
  /** When true, omits the field label (Plan zone shell supplies the heading). */
  hideLabel?: boolean;
  /** When true, omits the helper hint (Plan zone owns copy). */
  hideHint?: boolean;
}

export function FollowUpPicker({
  hideLabel = false,
  hideHint = false,
}: FollowUpPickerProps = {}) {
  const { state, setField } = useRxForm();
  const unit = state.fields.followUpUnit;
  const value = state.fields.followUpValue;
  const isAsNeeded = unit === "as_needed";
  const hasInterval = unit != null || value != null;

  const clearStructured = () => {
    setField("followUpValue", null);
    setField("followUpUnit", null);
  };

  return (
    <div className="space-y-1.5">
      {!hideLabel ? (
        <span className={RX_FIELD_LABEL_CLASS}>Follow-up (structured)</span>
      ) : null}
      <div className={`${hideLabel ? "" : "mt-1 "}flex flex-wrap items-center gap-2`}>
        {!isAsNeeded ? (
          <span className="text-sm text-muted-foreground">in</span>
        ) : null}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={3650}
          step={1}
          value={isAsNeeded ? "" : (value ?? "")}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              setField("followUpValue", null);
              return;
            }
            const n = Number(raw);
            if (!Number.isFinite(n) || n <= 0) {
              setField("followUpValue", null);
              return;
            }
            setField("followUpValue", Math.round(n));
          }}
          disabled={isAsNeeded}
          placeholder={isAsNeeded ? "—" : "e.g. 1"}
          className={`${RX_FIELD_INPUT_CLASS} mt-0 w-20`}
          aria-label="Follow-up value"
        />
        <Select
          value={unit ?? ""}
          onValueChange={(v) => {
            const next = (v || null) as FollowUpUnit | null;
            setField("followUpUnit", next);
            if (next === "as_needed") setField("followUpValue", null);
          }}
        >
          <SelectTrigger className="w-36" aria-label="Follow-up unit">
            <SelectValue placeholder="When…" />
          </SelectTrigger>
          <SelectContent>
            {UNITS.map((u) => (
              <SelectItem key={u.value} value={u.value}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasInterval ? (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={clearStructured}
            aria-label="Clear follow-up interval"
          >
            Clear
          </button>
        ) : null}
      </div>
      {!hideHint ? (
        <p className="text-xs text-muted-foreground">
          Leave blank if no follow-up needed. Use Notes below for extra instructions on the Rx.
        </p>
      ) : null}
    </div>
  );
}
