/**
 * Teleconsult reliability cues — patient-measured consumer devices and
 * vitals that are rarely self-measured at home.
 */

import type { CategoricalVitalKey } from "./categorical-vitals-schema";
import {
  CLINICIAN_ONLY_VITAL_KEYS,
  DEFAULT_MEASUREMENT_CONTEXT,
} from "./measurement-context";
import type { VitalKey } from "./vitals-schema";
import type { BpMeasuredBy } from "@/types/prescription";

export { CLINICIAN_ONLY_VITAL_KEYS };

export type LowConfidenceReason =
  | "consumer_device"
  | "self_palpation"
  | "clinician_only"
  | "source_unknown";

const LOW_CONFIDENCE_DEVICE_VALUES: Partial<Record<CategoricalVitalKey, readonly string[]>> = {
  vitalsTempDevice: ["ir_forehead", "wearable"],
  vitalsSpo2Device: ["smartwatch", "phone_app"],
  vitalsHrSource: ["wearable"],
  vitalsGlucoseDevice: [],
};

/** Device/source selects where a blank value under patient default should nudge recording. */
const SOURCE_CONTEXT_KEYS = new Set<CategoricalVitalKey>([
  "vitalsHrSource",
  "vitalsTempDevice",
  "vitalsSpo2Device",
  "vitalsGlucoseDevice",
]);

const CLINICIAN_ONLY_VITAL_SET = new Set<string>(CLINICIAN_ONLY_VITAL_KEYS);

function effectiveMeasuredBy(measuredBy: BpMeasuredBy | null | undefined): BpMeasuredBy {
  return measuredBy ?? DEFAULT_MEASUREMENT_CONTEXT.measuredBy;
}

export function isClinicianOnlyVital(key: VitalKey): boolean {
  return CLINICIAN_ONLY_VITAL_SET.has(key);
}

/** True when visit default implies a patient-reported clinician-only vital. */
export function isLowConfidenceClinicianOnlyVital(args: {
  measuredBy: BpMeasuredBy | null | undefined;
  vitalKey: VitalKey;
}): boolean {
  return (
    effectiveMeasuredBy(args.measuredBy) === "patient" &&
    isClinicianOnlyVital(args.vitalKey)
  );
}

/** Resolve low-confidence reason for a paired device/source context field. */
export function resolveContextLowConfidence(args: {
  measuredBy: BpMeasuredBy | null | undefined;
  contextKey: CategoricalVitalKey;
  deviceValue: string | null | undefined;
}): LowConfidenceReason | null {
  const measuredBy = effectiveMeasuredBy(args.measuredBy);
  if (measuredBy !== "patient") return null;

  if (!args.deviceValue) {
    return SOURCE_CONTEXT_KEYS.has(args.contextKey) ? "source_unknown" : null;
  }

  if (args.contextKey === "vitalsHrSource" && args.deviceValue === "palpation") {
    return "self_palpation";
  }

  const lowValues = LOW_CONFIDENCE_DEVICE_VALUES[args.contextKey];
  if (lowValues != null && lowValues.includes(args.deviceValue)) {
    return "consumer_device";
  }

  return null;
}

/** Resolve any low-confidence reason for a numeric vital row. */
export function resolveVitalLowConfidence(args: {
  measuredBy: BpMeasuredBy | null | undefined;
  vitalKey: VitalKey;
  deviceContextKey?: CategoricalVitalKey;
  deviceValue?: string | null;
}): LowConfidenceReason | null {
  if (
    isLowConfidenceClinicianOnlyVital({
      measuredBy: args.measuredBy,
      vitalKey: args.vitalKey,
    })
  ) {
    return "clinician_only";
  }

  if (args.deviceContextKey != null) {
    return resolveContextLowConfidence({
      measuredBy: args.measuredBy,
      contextKey: args.deviceContextKey,
      deviceValue: args.deviceValue,
    });
  }

  return null;
}

/** @deprecated Prefer `resolveContextLowConfidence`. */
export function isLowConfidenceVitalReading(args: {
  measuredBy: BpMeasuredBy | null | undefined;
  contextKey: CategoricalVitalKey;
  deviceValue: string | null | undefined;
}): boolean {
  return resolveContextLowConfidence(args) != null;
}

/** Device/source context key for a parent vital (second entry in VITAL_CONTEXT_MAP). */
export function deviceContextKeyForParent(
  contextKeys: readonly CategoricalVitalKey[],
): CategoricalVitalKey | undefined {
  return contextKeys.find((key) => key.endsWith("Device") || key.endsWith("Source"));
}

export function lowConfidenceBadgeCopy(reason: LowConfidenceReason): {
  label: string;
  tooltip: string;
} {
  switch (reason) {
    case "self_palpation":
      return {
        label: "Self-reported",
        tooltip: "Self-counted pulse — less reliable in teleconsult.",
      };
    case "clinician_only":
      return {
        label: "Self-reported",
        tooltip: "Rarely self-measured at home — verify who obtained this.",
      };
    case "source_unknown":
      return {
        label: "Self-reported",
        tooltip: "Source not recorded — confirm how this was measured.",
      };
    case "consumer_device":
    default:
      return {
        label: "Self-reported",
        tooltip: "Patient-reported on a consumer device — interpret with caution.",
      };
  }
}
