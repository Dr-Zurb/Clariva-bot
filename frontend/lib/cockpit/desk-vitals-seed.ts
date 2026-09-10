import type { RxFormFields } from "@/components/cockpit/rx/RxFormContext";
import type { GhostVitals } from "@/components/cockpit/rx/inputs/VitalsExtended";
import { createEmptyBpReading } from "@/lib/cockpit/bp-readings";
import { bpPrimaryReadingEmpty } from "@/lib/cockpit/vitals-quick-fill";

const DESK_SCALAR_KEYS = [
  "vitalsHr",
  "vitalsTempC",
  "vitalsSpo2",
  "vitalsWtKg",
  "vitalsHtCm",
] as const;

export type DeskVitalsSeedPayload = {
  ghost: GhostVitals | null;
  note: string | null;
};

/**
 * Fill empty cockpit vitals from the same-visit desk reading.
 * Never overwrites a value the doctor or a saved Rx already has.
 */
export function patchEmptyFieldsFromDeskVitals(
  fields: Pick<
    RxFormFields,
    | (typeof DESK_SCALAR_KEYS)[number]
    | "vitalsBpSystolic"
    | "vitalsBpDiastolic"
    | "vitalsBpReadings"
    | "vitalsSectionNote"
  >,
  desk: DeskVitalsSeedPayload
): Partial<RxFormFields> {
  const patch: Partial<RxFormFields> = {};

  if (desk.note && !fields.vitalsSectionNote.trim()) {
    patch.vitalsSectionNote = desk.note;
  }

  const ghost = desk.ghost;
  if (!ghost) return patch;

  for (const key of DESK_SCALAR_KEYS) {
    if (fields[key] == null && ghost[key] != null) {
      patch[key] = ghost[key];
    }
  }

  const primary = fields.vitalsBpReadings[0];
  const bpEmpty =
    bpPrimaryReadingEmpty(fields.vitalsBpSystolic, fields.vitalsBpDiastolic) &&
    bpPrimaryReadingEmpty(primary?.systolic, primary?.diastolic);
  if (
    bpEmpty &&
    ghost.vitalsBpSystolic != null &&
    ghost.vitalsBpDiastolic != null
  ) {
    patch.vitalsBpSystolic = ghost.vitalsBpSystolic;
    patch.vitalsBpDiastolic = ghost.vitalsBpDiastolic;
    patch.vitalsBpReadings = [
      {
        ...(primary ?? createEmptyBpReading()),
        systolic: ghost.vitalsBpSystolic,
        diastolic: ghost.vitalsBpDiastolic,
      },
      ...fields.vitalsBpReadings.slice(1),
    ];
  }

  return patch;
}

/** Apply an empty-only desk patch onto a full fields object. */
export function mergeDeskVitalsIntoFields(
  fields: RxFormFields,
  desk: DeskVitalsSeedPayload
): RxFormFields {
  const patch = patchEmptyFieldsFromDeskVitals(fields, desk);
  return Object.keys(patch).length === 0 ? fields : { ...fields, ...patch };
}
