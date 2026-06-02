"use client";

import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import {
  RX_FIELD_INPUT_CLASS,
  RX_FIELD_LABEL_CLASS,
} from "@/components/cockpit/rx/sections/field-styles";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { computeBmi, type BmiResult } from "@/lib/cockpit/bmi";

/** Mirror migration 103 CHECK constraints (client-side advisory ranges). */
const RANGES = {
  bp_systolic: { min: 30, max: 300, step: 1, suffix: "mmHg" },
  bp_diastolic: { min: 20, max: 200, step: 1, suffix: "mmHg" },
  hr: { min: 20, max: 250, step: 1, suffix: "bpm" },
  temp_c: { min: 30, max: 45, step: 0.1, suffix: "°C" },
  spo2: { min: 0, max: 100, step: 1, suffix: "%" },
  wt_kg: { min: 0.5, max: 500, step: 0.1, suffix: "kg" },
  ht_cm: { min: 20, max: 250, step: 0.5, suffix: "cm" },
} as const;

type VitalsNumericKey =
  | "vitalsBpSystolic"
  | "vitalsBpDiastolic"
  | "vitalsHr"
  | "vitalsTempC"
  | "vitalsSpo2"
  | "vitalsWtKg"
  | "vitalsHtCm";

// BMI category colors — intentionally not semantic tokens (cpv-03 / cpv-06).
// See frontend/lib/cockpit/__color-exceptions.md
const categoryClass: Record<BmiResult["category"], string> = {
  underweight: "bg-blue-100 text-blue-800 border-blue-300",
  normal: "bg-green-100 text-green-800 border-green-300",
  overweight: "bg-amber-100 text-amber-800 border-amber-300",
  obese: "bg-red-100 text-red-800 border-red-300",
};

function BmiBadge({ bmi }: { bmi: BmiResult }): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={
            "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium " +
            categoryClass[bmi.category]
          }
          aria-label={`BMI ${bmi.value} — ${bmi.label}`}
        >
          BMI {bmi.value}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{bmi.label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function VitalsGrid() {
  const { state, setField } = useRxForm();

  const heightCm = state.fields.vitalsHtCm ?? null;
  const weightKg = state.fields.vitalsWtKg ?? null;
  const bmi = computeBmi(heightCm, weightKg);

  const onChangeNumeric =
    (key: VitalsNumericKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === "") {
        setField(key, null);
        return;
      }
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      setField(key, n);
    };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="col-span-2 space-y-1.5 sm:col-span-2">
        <span className={RX_FIELD_LABEL_CLASS}>Blood pressure (mmHg)</span>
        <BpInputs state={state} onChangeNumeric={onChangeNumeric} />
      </div>
      <NumericField
        label="HR"
        {...RANGES.hr}
        value={state.fields.vitalsHr ?? ""}
        onChange={onChangeNumeric("vitalsHr")}
      />
      <NumericField
        label="Temp"
        {...RANGES.temp_c}
        value={state.fields.vitalsTempC ?? ""}
        onChange={onChangeNumeric("vitalsTempC")}
      />
      <NumericField
        label="SpO₂"
        {...RANGES.spo2}
        value={state.fields.vitalsSpo2 ?? ""}
        onChange={onChangeNumeric("vitalsSpo2")}
      />
      <NumericField
        label="Weight"
        {...RANGES.wt_kg}
        value={state.fields.vitalsWtKg ?? ""}
        onChange={onChangeNumeric("vitalsWtKg")}
        trailing={bmi ? <BmiBadge bmi={bmi} /> : null}
      />
      <NumericField
        label="Height"
        {...RANGES.ht_cm}
        value={state.fields.vitalsHtCm ?? ""}
        onChange={onChangeNumeric("vitalsHtCm")}
      />
    </div>
  );
}

function BpInputs({
  state,
  onChangeNumeric,
}: {
  state: ReturnType<typeof useRxForm>["state"];
  onChangeNumeric: (key: VitalsNumericKey) => (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        min={RANGES.bp_systolic.min}
        max={RANGES.bp_systolic.max}
        step={RANGES.bp_systolic.step}
        value={state.fields.vitalsBpSystolic ?? ""}
        onChange={onChangeNumeric("vitalsBpSystolic")}
        placeholder="120"
        className={`${RX_FIELD_INPUT_CLASS} mt-0 w-20`}
        aria-label="Systolic blood pressure"
      />
      <span className="text-muted-foreground">/</span>
      <input
        type="number"
        inputMode="numeric"
        min={RANGES.bp_diastolic.min}
        max={RANGES.bp_diastolic.max}
        step={RANGES.bp_diastolic.step}
        value={state.fields.vitalsBpDiastolic ?? ""}
        onChange={onChangeNumeric("vitalsBpDiastolic")}
        placeholder="80"
        className={`${RX_FIELD_INPUT_CLASS} mt-0 w-20`}
        aria-label="Diastolic blood pressure"
      />
    </div>
  );
}

interface NumericFieldProps {
  label: string;
  min: number;
  max: number;
  step: number;
  suffix: string;
  value: number | "";
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  trailing?: React.ReactNode;
}

function NumericField({
  label,
  min,
  max,
  step,
  suffix,
  value,
  onChange,
  trailing,
}: NumericFieldProps) {
  return (
    <div className="space-y-1.5">
      <span className={RX_FIELD_LABEL_CLASS}>{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <input
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={onChange}
            placeholder="—"
            className={`${RX_FIELD_INPUT_CLASS} mt-0 w-full`}
            aria-label={`${label} in ${suffix}`}
          />
          <span className="whitespace-nowrap text-xs text-muted-foreground">{suffix}</span>
        </div>
        {trailing}
      </div>
    </div>
  );
}
