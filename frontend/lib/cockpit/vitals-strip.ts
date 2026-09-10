import {
  createEmptyRxFormFields,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { resolvePrimaryBpForPayload } from "@/lib/cockpit/bp-readings";
import {
  mergeDeskVitalsIntoFields,
  type DeskVitalsSeedPayload,
} from "@/lib/cockpit/desk-vitals-seed";
import { resolvePrimaryGlucoseForPayload } from "@/lib/cockpit/glucose-readings";
import { formatVitalsForOutput } from "@/lib/cockpit/rx-output-format";

export type CockpitVitalsStripFields = Pick<
  RxFormFields,
  | "vitalsBpReadings"
  | "vitalsBpSystolic"
  | "vitalsBpDiastolic"
  | "vitalsBpPosture"
  | "vitalsBpLimb"
  | "vitalsHr"
  | "vitalsTempC"
  | "vitalsSpo2"
  | "vitalsWtKg"
  | "vitalsHtCm"
  | "vitalsRr"
  | "vitalsPainScore"
  | "vitalsGlucoseMgDl"
  | "vitalsGlucoseTiming"
  | "vitalsGlucoseReadings"
  | "vitalsGlucoseContext"
  | "vitalsGcsTotal"
  | "vitalsSectionNote"
>;

/** Compact visit vitals line for the cockpit header strip. */
export function formatCockpitVitalsStrip(
  fields: CockpitVitalsStripFields
): string | null {
  const bp = resolvePrimaryBpForPayload(fields);
  const glucose = resolvePrimaryGlucoseForPayload(fields);
  return formatVitalsForOutput({
    vitalsBpSystolic: bp.systolic,
    vitalsBpDiastolic: bp.diastolic,
    vitalsHr: fields.vitalsHr,
    vitalsTempC: fields.vitalsTempC,
    vitalsSpo2: fields.vitalsSpo2,
    vitalsWtKg: fields.vitalsWtKg,
    vitalsHtCm: fields.vitalsHtCm,
    vitalsRr: fields.vitalsRr,
    vitalsPainScore: fields.vitalsPainScore,
    vitalsGlucoseMgDl: glucose.valueMgDl,
    vitalsGcsTotal: fields.vitalsGcsTotal,
    vitalsBpPosture: bp.posture,
    vitalsBpLimb: bp.limb,
    note: fields.vitalsSectionNote,
  });
}

/** Strip line from a same-visit desk reading before the Rx form is seeded. */
export function formatCockpitVitalsStripFromDesk(
  desk: DeskVitalsSeedPayload
): string | null {
  if (!desk.ghost && !desk.note) return null;
  return formatCockpitVitalsStrip(
    mergeDeskVitalsIntoFields(createEmptyRxFormFields(), desk)
  );
}
