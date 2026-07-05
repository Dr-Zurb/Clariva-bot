/**
 * Categorical / context vitals registry (vitals-section · vit-01).
 *
 * Pure data module — sibling to `vitals-schema.ts`. Non-numeric vitals that
 * qualify numeric readings (O₂ method, glucose timing, pupil reactivity, etc.)
 * live here with their allowed value sets. BP posture/limb remain plain column
 * fields outside this registry (obj-07 precedent).
 *
 * Store enum `value` strings canonically — never display labels in payloads.
 */

import type { VitalGroup, VitalStorage } from "./vitals-schema";

/** Canonical keys for categorical vitals (json-backed unless noted). */
export type CategoricalVitalKey =
  | "vitalsO2DeliveryMethod"
  | "vitalsSpo2Device"
  | "vitalsGlucoseTiming"
  | "vitalsGlucoseDevice"
  | "vitalsPupilReactivityLeft"
  | "vitalsPupilReactivityRight"
  | "vitalsAvpu"
  | "vitalsPulseRhythm"
  | "vitalsHrSource"
  | "vitalsTempSite"
  | "vitalsTempDevice";

export type VitalsO2DeliveryMethod =
  | "room_air"
  | "nasal_cannula"
  | "simple_mask"
  | "non_rebreather"
  | "venturi_mask"
  | "high_flow"
  | "cpap"
  | "bipap"
  | "mechanical_ventilation";

export type VitalsGlucoseTiming =
  | "fasting"
  | "random"
  | "post_prandial"
  | "pre_meal"
  | "post_meal"
  | "post_prandial_1h"
  | "post_prandial_2h"
  | "ogtt_0h"
  | "ogtt_1h"
  | "ogtt_2h"
  | "ogtt_3h"
  | "bedtime";

export type VitalsPupilReactivity = "reactive" | "sluggish" | "non_reactive" | "fixed";

export type VitalsAvpu = "alert" | "voice" | "pain" | "unresponsive";

export type VitalsPulseRhythm =
  | "regular"
  | "irregular"
  | "irregularly_irregular"
  | "regularly_irregular";

export type VitalsTempSite = "oral" | "axillary" | "tympanic" | "rectal" | "temporal" | "forehead";

export type VitalsTempDevice = "digital" | "mercury" | "ir_forehead" | "wearable";

export type VitalsSpo2Device = "medical_oximeter" | "smartwatch" | "phone_app";

export type VitalsHrSource = "palpation" | "oximeter" | "wearable" | "bp_cuff" | "ecg";

export type VitalsGlucoseDevice = "glucometer" | "cgm" | "lab_venous";

/** Allowed option for a categorical vital select. */
export interface CategoricalVitalOption<T extends string = string> {
  value: T;
  label: string;
}

/** Full definition of a single categorical vital. */
export interface CategoricalVitalDefinition<T extends string = string> {
  key: CategoricalVitalKey;
  label: string;
  group: VitalGroup;
  storage: VitalStorage;
  options: readonly CategoricalVitalOption<T>[];
}

const O2_DELIVERY_OPTIONS: readonly CategoricalVitalOption<VitalsO2DeliveryMethod>[] = [
  { value: "room_air", label: "Room air" },
  { value: "nasal_cannula", label: "Nasal cannula" },
  { value: "simple_mask", label: "Simple mask" },
  { value: "non_rebreather", label: "Non-rebreather" },
  { value: "venturi_mask", label: "Venturi mask" },
  { value: "high_flow", label: "High-flow" },
  { value: "cpap", label: "CPAP" },
  { value: "bipap", label: "BiPAP" },
  { value: "mechanical_ventilation", label: "Mechanical ventilation" },
];

const GLUCOSE_TIMING_OPTIONS: readonly CategoricalVitalOption<VitalsGlucoseTiming>[] = [
  { value: "fasting", label: "Fasting" },
  { value: "random", label: "Random" },
  { value: "pre_meal", label: "Pre-meal" },
  { value: "post_meal", label: "Post-meal" },
  { value: "post_prandial", label: "Post-prandial" },
  { value: "post_prandial_1h", label: "1h post-prandial" },
  { value: "post_prandial_2h", label: "2h post-prandial" },
  { value: "ogtt_0h", label: "OGTT fasting" },
  { value: "ogtt_1h", label: "OGTT 1h" },
  { value: "ogtt_2h", label: "OGTT 2h" },
  { value: "ogtt_3h", label: "OGTT 3h" },
  { value: "bedtime", label: "Bedtime" },
];

const PUPIL_REACTIVITY_OPTIONS: readonly CategoricalVitalOption<VitalsPupilReactivity>[] = [
  { value: "reactive", label: "Reactive" },
  { value: "sluggish", label: "Sluggish" },
  { value: "non_reactive", label: "Non-reactive" },
  { value: "fixed", label: "Fixed" },
];

const AVPU_OPTIONS: readonly CategoricalVitalOption<VitalsAvpu>[] = [
  { value: "alert", label: "Alert" },
  { value: "voice", label: "Voice" },
  { value: "pain", label: "Pain" },
  { value: "unresponsive", label: "Unresponsive" },
];

const PULSE_RHYTHM_OPTIONS: readonly CategoricalVitalOption<VitalsPulseRhythm>[] = [
  { value: "regular", label: "Regular" },
  { value: "irregular", label: "Irregular" },
  { value: "irregularly_irregular", label: "Irregularly irregular" },
  { value: "regularly_irregular", label: "Regularly irregular" },
];

const TEMP_SITE_OPTIONS: readonly CategoricalVitalOption<VitalsTempSite>[] = [
  { value: "oral", label: "Oral" },
  { value: "axillary", label: "Axillary" },
  { value: "tympanic", label: "Tympanic" },
  { value: "rectal", label: "Rectal" },
  { value: "temporal", label: "Temporal" },
  { value: "forehead", label: "Forehead" },
];

const TEMP_DEVICE_OPTIONS: readonly CategoricalVitalOption<VitalsTempDevice>[] = [
  { value: "digital", label: "Digital thermometer" },
  { value: "mercury", label: "Mercury / glass" },
  { value: "ir_forehead", label: "IR forehead gun" },
  { value: "wearable", label: "Wearable" },
];

const SPO2_DEVICE_OPTIONS: readonly CategoricalVitalOption<VitalsSpo2Device>[] = [
  { value: "medical_oximeter", label: "Medical oximeter" },
  { value: "smartwatch", label: "Smartwatch" },
  { value: "phone_app", label: "Phone app" },
];

const HR_SOURCE_OPTIONS: readonly CategoricalVitalOption<VitalsHrSource>[] = [
  { value: "palpation", label: "Palpation" },
  { value: "oximeter", label: "Pulse oximeter" },
  { value: "wearable", label: "Wearable" },
  { value: "bp_cuff", label: "BP cuff" },
  { value: "ecg", label: "ECG" },
];

const GLUCOSE_DEVICE_OPTIONS: readonly CategoricalVitalOption<VitalsGlucoseDevice>[] = [
  { value: "glucometer", label: "Glucometer" },
  { value: "cgm", label: "CGM" },
  { value: "lab_venous", label: "Lab (venous)" },
];

export const CATEGORICAL_VITALS_REGISTRY: readonly CategoricalVitalDefinition[] = [
  {
    key: "vitalsO2DeliveryMethod",
    label: "O₂ Delivery",
    group: "core",
    storage: "json",
    options: O2_DELIVERY_OPTIONS,
  },
  {
    key: "vitalsSpo2Device",
    label: "SpO₂ Device",
    group: "core",
    storage: "json",
    options: SPO2_DEVICE_OPTIONS,
  },
  {
    key: "vitalsPulseRhythm",
    label: "Pulse Rhythm",
    group: "core",
    storage: "json",
    options: PULSE_RHYTHM_OPTIONS,
  },
  {
    key: "vitalsHrSource",
    label: "HR Source",
    group: "core",
    storage: "json",
    options: HR_SOURCE_OPTIONS,
  },
  {
    key: "vitalsTempSite",
    label: "Temp Site",
    group: "core",
    storage: "json",
    options: TEMP_SITE_OPTIONS,
  },
  {
    key: "vitalsTempDevice",
    label: "Temp Device",
    group: "core",
    storage: "json",
    options: TEMP_DEVICE_OPTIONS,
  },
  {
    key: "vitalsGlucoseTiming",
    label: "Glucose Timing",
    group: "metabolic",
    storage: "json",
    options: GLUCOSE_TIMING_OPTIONS,
  },
  {
    key: "vitalsGlucoseDevice",
    label: "Glucose Device",
    group: "metabolic",
    storage: "json",
    options: GLUCOSE_DEVICE_OPTIONS,
  },
  {
    key: "vitalsPupilReactivityLeft",
    label: "Pupil Reactivity (L)",
    group: "neuro",
    storage: "json",
    options: PUPIL_REACTIVITY_OPTIONS,
  },
  {
    key: "vitalsPupilReactivityRight",
    label: "Pupil Reactivity (R)",
    group: "neuro",
    storage: "json",
    options: PUPIL_REACTIVITY_OPTIONS,
  },
  {
    key: "vitalsAvpu",
    label: "Alert, Voice, Pain, Unresponsive (AVPU)",
    group: "neuro",
    storage: "json",
    options: AVPU_OPTIONS,
  },
] as const;

export const CATEGORICAL_VITAL_ORDER: readonly CategoricalVitalKey[] =
  CATEGORICAL_VITALS_REGISTRY.map((v) => v.key);

const BY_KEY = new Map<CategoricalVitalKey, CategoricalVitalDefinition>(
  CATEGORICAL_VITALS_REGISTRY.map((v) => [v.key, v]),
);

/** Resolve a categorical vital key to its definition. Throws on unknown key. */
export function resolveCategoricalVital(key: CategoricalVitalKey): CategoricalVitalDefinition {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`Unknown categorical vital key: ${key}`);
  return def;
}

/** Min width (`ch`) for a native select to fit the longest option label. */
export function vitalSelectMinWidthCh(
  options: readonly { label: string }[],
  placeholder = "—",
): number {
  let maxLen = placeholder.length;
  for (const opt of options) {
    if (opt.label.length > maxLen) maxLen = opt.label.length;
  }
  return maxLen + 2;
}

export function categoricalVitalSelectMinWidthCh(def: CategoricalVitalDefinition): number {
  return vitalSelectMinWidthCh(def.options);
}

/** Return the ordered categorical vitals registry. */
export function listCategoricalVitals(): readonly CategoricalVitalDefinition[] {
  return CATEGORICAL_VITALS_REGISTRY;
}

/** Partition categorical vitals by clinical group. */
export function listCategoricalVitalsByGroup(
  group: VitalGroup,
): readonly CategoricalVitalDefinition[] {
  return CATEGORICAL_VITALS_REGISTRY.filter((v) => v.group === group);
}

/** Partition categorical vitals by storage location. */
export function categoricalVitalsByStorage(
  storage: VitalStorage,
): readonly CategoricalVitalDefinition[] {
  return CATEGORICAL_VITALS_REGISTRY.filter((v) => v.storage === storage);
}
