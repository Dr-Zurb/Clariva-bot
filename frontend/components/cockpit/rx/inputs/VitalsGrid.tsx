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
import {
  DerivedBadge,
  RangeFlagIcon,
  VitalField,
  VitalsExtended,
  type GhostVitals,
} from "@/components/cockpit/rx/inputs/VitalsExtended";
import { useLastVisitVitals } from "@/components/cockpit/rx/inputs/useLastVisitVitals";
import { computeBmi, type BmiResult } from "@/lib/cockpit/bmi";
import { computeBsa, computeMap, evaluateRange } from "@/lib/cockpit/vitals-derive";
import { resolveVital } from "@/lib/cockpit/vitals-schema";

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
  const { state } = useRxForm();
  const ghost = useLastVisitVitals();

  const heightCm = state.fields.vitalsHtCm ?? null;
  const weightKg = state.fields.vitalsWtKg ?? null;
  const bmi = computeBmi(heightCm, weightKg);
  const bsa = computeBsa(heightCm, weightKg);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 space-y-1.5 sm:col-span-2">
          <span className={RX_FIELD_LABEL_CLASS}>Blood pressure (mmHg)</span>
          <BpInputs ghost={ghost} />
        </div>
        <VitalField vitalKey="vitalsHr" label="HR" ghost={ghost?.vitalsHr} />
        <VitalField vitalKey="vitalsTempC" label="Temp" ghost={ghost?.vitalsTempC} />
        <VitalField vitalKey="vitalsSpo2" label="SpO₂" ghost={ghost?.vitalsSpo2} />
        <VitalField
          vitalKey="vitalsWtKg"
          label="Weight"
          ghost={ghost?.vitalsWtKg}
          trailing={
            <>
              {bmi ? <BmiBadge bmi={bmi} /> : null}
              {bsa != null ? (
                <DerivedBadge
                  text={`BSA ${bsa}`}
                  ariaLabel={`Body surface area ${bsa} square metres`}
                  title={`BSA ${bsa} m² (Mosteller)`}
                />
              ) : null}
            </>
          }
        />
        <VitalField vitalKey="vitalsHtCm" label="Height" ghost={ghost?.vitalsHtCm} />
      </div>

      <VitalsExtended ghost={ghost} />
    </div>
  );
}

function BpInputs({ ghost }: { ghost: GhostVitals | null }) {
  const { state, setField } = useRxForm();

  const sys = state.fields.vitalsBpSystolic ?? null;
  const dia = state.fields.vitalsBpDiastolic ?? null;
  const map = computeMap(sys, dia);
  const sysFlag = evaluateRange("vitalsBpSystolic", sys);
  const diaFlag = evaluateRange("vitalsBpDiastolic", dia);

  const sysDef = resolveVital("vitalsBpSystolic");
  const diaDef = resolveVital("vitalsBpDiastolic");

  const onChange =
    (key: "vitalsBpSystolic" | "vitalsBpDiastolic") =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
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
    <div className="mt-1 flex items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        min={sysDef.hardMin}
        max={sysDef.hardMax}
        step={1}
        value={state.fields.vitalsBpSystolic ?? ""}
        onChange={onChange("vitalsBpSystolic")}
        placeholder={ghost?.vitalsBpSystolic != null ? String(ghost.vitalsBpSystolic) : "120"}
        className={`${RX_FIELD_INPUT_CLASS} mt-0 w-20`}
        aria-label="Systolic blood pressure"
      />
      <RangeFlagIcon label="Systolic blood pressure" flag={sysFlag} />
      <span className="text-muted-foreground">/</span>
      <input
        type="number"
        inputMode="numeric"
        min={diaDef.hardMin}
        max={diaDef.hardMax}
        step={1}
        value={state.fields.vitalsBpDiastolic ?? ""}
        onChange={onChange("vitalsBpDiastolic")}
        placeholder={ghost?.vitalsBpDiastolic != null ? String(ghost.vitalsBpDiastolic) : "80"}
        className={`${RX_FIELD_INPUT_CLASS} mt-0 w-20`}
        aria-label="Diastolic blood pressure"
      />
      <RangeFlagIcon label="Diastolic blood pressure" flag={diaFlag} />
      {map != null ? (
        <DerivedBadge
          text={`MAP ${map}`}
          ariaLabel={`Mean arterial pressure ${map} millimetres of mercury`}
          title={`MAP ${map} mmHg`}
        />
      ) : null}
    </div>
  );
}
