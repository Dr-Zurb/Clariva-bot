/**
 * Registry-driven vitals grid layout (vitals-section · vit-05).
 *
 * Pure layout module — partitions numeric vitals by clinical group and
 * preserves the shipped core grid order (BP pair, then HR/Temp/SpO₂/Wt/RR/Ht).
 */

import {
  isVitalExcludedFromObjectiveUi,
} from "./vitals-visibility";
import {
  listVitalsByGroup,
  resolveVital,
  VITAL_ORDER,
  type VitalGroup,
  type VitalKey,
} from "./vitals-schema";
import {
  listCategoricalVitalsByGroup,
  type CategoricalVitalKey,
} from "./categorical-vitals-schema";
import { GCS_SCORE_KEYS, isGcsScoreKey } from "./gcs-subscore";
import { isPupilReactivityKey, isPupilSizeKey } from "./pupil-cluster";

/** Bordered card wrapper for a clinical vitals group. */
export const VITALS_GROUP_CARD_CLASS =
  "rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 space-y-2";

export const VITALS_GROUP_HEADING_CLASS =
  "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

/**
 * Named container for vitals layout. Pane width (not viewport) must drive 1↔2
 * column stacking — SOAP 2×2 leaves Objective ~280–350px while the window is
 * still `sm`+, so viewport `sm:grid-cols-2` jammed BP/glucose until they overflow.
 */
export const VITALS_CONTAINER_CLASS = "@container/vitals min-w-0";

/**
 * Two-column vitals grid — numeric core vitals (HR, Temp, etc.).
 * Stacks below ~26rem of *this* vitals container; side-by-side when wider.
 */
export const VITALS_GRID_CLASS =
  "grid grid-cols-1 items-start gap-3 @[26rem]/vitals:grid-cols-2";

/**
 * Isolated row for paired BP / glucose cluster cards — never interleaves with numeric vitals.
 * Multi-reading cards span full width within this grid; single-reading cards share a row.
 * `items-start` so expanding “Measured differently” on one card does not stretch its neighbor.
 * Same container query as {@link VITALS_GRID_CLASS} (pane-aware, not viewport).
 */
export const VITAL_CLUSTER_GRID_CLASS =
  "grid grid-cols-1 items-start gap-3 @[26rem]/vitals:grid-cols-2";

/** @deprecated Use VITALS_GRID_CLASS — kept for tests referencing auto-fill. */
export const VITALS_AUTO_GRID_CLASS = VITALS_GRID_CLASS;

/** Uniform inner card for every vital cell (including BP, Height, RR). */
export const VITAL_CELL_CLASS =
  "rounded-md border border-border/40 bg-background px-2 py-1.5 space-y-1.5 min-w-0";

/** Outer wrapper for paired BP / glucose cluster cards. */
export const VITAL_CLUSTER_GRID_OUTER_CLASS = "min-w-0";

/** Inner shell for paired BP / glucose cluster cards. */
export const VITAL_CLUSTER_CELL_CLASS =
  "flex flex-col gap-1.5 rounded-md border border-border/40 bg-background px-2 py-1.5 min-w-0";

/** Reading rows inside a cluster card (natural height — no flex grow). */
export const VITAL_CLUSTER_BODY_CLASS = "flex flex-col space-y-2";

/** Footer slot for cluster-card stats badges (BP inter-arm / orthostatic). */
export const VITAL_CLUSTER_STATS_FOOTER_CLASS =
  "flex min-h-[1.375rem] shrink-0 flex-wrap gap-2 text-xs";

/** Full-width row in the 2-column grid (multi-reading BP, GCS cluster). */
export const VITAL_GRID_FULL_SPAN_CLASS = "col-span-full min-w-0";

/** Single column in the 2-column grid. */
export const VITAL_GRID_UNIT_SPAN_CLASS = "min-w-0";

/** BP block spans full width when multiple readings exist; otherwise one grid column. */
export function bpReadingsGridSpanClass(readingCount: number): string {
  return readingCount > 1 ? VITAL_GRID_FULL_SPAN_CLASS : VITAL_GRID_UNIT_SPAN_CLASS;
}

/** Glucose block spans full width when multiple readings exist; otherwise one grid column. */
export function glucoseReadingsGridSpanClass(readingCount: number): string {
  return readingCount > 1 ? VITAL_GRID_FULL_SPAN_CLASS : VITAL_GRID_UNIT_SPAN_CLASS;
}

export function hasVisibleGlucose(visibleKeys?: ReadonlySet<VitalKey>): boolean {
  return isVitalVisible("vitalsGlucoseMgDl", visibleKeys);
}

/** @deprecated Rich vitals use the same unit span in the 2-column grid. */
export function vitalGridSpan(_key: VitalKey): 1 | 2 {
  return 1;
}

/** @deprecated Use VITAL_GRID_UNIT_SPAN_CLASS or VITAL_GRID_FULL_SPAN_CLASS. */
export function vitalGridSpanClass(span: 1 | 2): string {
  return span === 2 ? VITAL_GRID_FULL_SPAN_CLASS : VITAL_GRID_UNIT_SPAN_CLASS;
}

export const VITAL_GROUP_ORDER: readonly VitalGroup[] = [
  "core",
  "respiratory",
  "metabolic",
  "neuro",
  "paediatric",
  "obstetric",
] as const;

export const VITAL_GROUP_LABELS: Record<VitalGroup, string> = {
  core: "Core",
  respiratory: "Respiratory",
  metabolic: "Metabolic",
  neuro: "Neuro",
  paediatric: "Paediatric",
  obstetric: "Obstetric",
};

/** Non-core groups rendered below the main core grid (VitalsExtended). */
export const EXTENDED_VITAL_GROUPS: readonly VitalGroup[] = [
  "respiratory",
  "metabolic",
  "neuro",
  "obstetric",
] as const;

/** Main core row — today's shipped look (BP pair rendered separately). */
export const CORE_MAIN_GRID_KEYS: readonly VitalKey[] = [
  "vitalsHr",
  "vitalsTempC",
  "vitalsSpo2",
  "vitalsWtKg",
  "vitalsRr",
  "vitalsHtCm",
];

/** Remaining core-group vitals after the main row. */
export const CORE_SECONDARY_GRID_KEYS: readonly VitalKey[] = [];

/** Display-label overrides for the objective grid (defaults to registry `label`). */
export const VITAL_FIELD_SHORT_LABELS: Partial<Record<VitalKey, string>> = {};

export function vitalFieldShortLabel(key: VitalKey): string {
  return VITAL_FIELD_SHORT_LABELS[key] ?? resolveVital(key).label;
}

export function isVitalVisible(
  key: VitalKey,
  visibleKeys?: ReadonlySet<VitalKey>,
): boolean {
  return visibleKeys == null || visibleKeys.has(key);
}

export function visibleVitalsInGroup(
  group: VitalGroup,
  visibleKeys?: ReadonlySet<VitalKey>,
): VitalKey[] {
  return listVitalsByGroup(group)
    .map((v) => v.key)
    .filter((key) => isVitalVisible(key, visibleKeys));
}

export function isCategoricalVitalVisible(
  key: CategoricalVitalKey,
  visibleKeys?: ReadonlySet<CategoricalVitalKey>,
): boolean {
  return visibleKeys == null || visibleKeys.has(key);
}

export function visibleCategoricalVitalsInGroup(
  group: VitalGroup,
  visibleKeys?: ReadonlySet<CategoricalVitalKey>,
): CategoricalVitalKey[] {
  return listCategoricalVitalsByGroup(group)
    .map((v) => v.key)
    .filter((key) => isCategoricalVitalVisible(key, visibleKeys));
}

/**
 * Categorical vitals rendered inline under a parent numeric reading (SpO₂/O₂,
 * HR/rhythm, Temp/site). Shown when the parent is visible — not standalone.
 */
export const VITAL_CONTEXT_MAP: Partial<Record<VitalKey, readonly CategoricalVitalKey[]>> = {
  vitalsSpo2: ["vitalsO2DeliveryMethod", "vitalsSpo2Device"],
  vitalsHr: ["vitalsPulseRhythm", "vitalsHrSource"],
  vitalsTempC: ["vitalsTempSite", "vitalsTempDevice"],
};

const GLUCOSE_BLOCK_CATEGORICAL_KEYS = new Set<CategoricalVitalKey>([
  "vitalsGlucoseTiming",
  "vitalsGlucoseDevice",
]);

const PAIRED_CONTEXT_CATEGORICAL_SET = new Set<CategoricalVitalKey>([
  ...Object.values(VITAL_CONTEXT_MAP).flatMap((keys) => keys ?? []),
  ...GLUCOSE_BLOCK_CATEGORICAL_KEYS,
]);

export function contextKeysForNumericVital(vitalKey: VitalKey): readonly CategoricalVitalKey[] {
  return VITAL_CONTEXT_MAP[vitalKey] ?? [];
}

export function isPairedContextCategorical(key: CategoricalVitalKey): boolean {
  return PAIRED_CONTEXT_CATEGORICAL_SET.has(key);
}

export function parentNumericKeyForContext(
  key: CategoricalVitalKey,
): VitalKey | undefined {
  for (const [parent, contexts] of Object.entries(VITAL_CONTEXT_MAP) as [
    VitalKey,
    readonly CategoricalVitalKey[] | undefined,
  ][]) {
    if (contexts?.includes(key)) return parent;
  }
  return undefined;
}

/** Categorical vitals that still render as their own grid cell (not parent-paired). */
export function visibleStandaloneCategoricalVitalsInGroup(
  group: VitalGroup,
  visibleKeys?: ReadonlySet<CategoricalVitalKey>,
): CategoricalVitalKey[] {
  return visibleCategoricalVitalsInGroup(group, visibleKeys).filter(
    (key) => !isPairedContextCategorical(key) && !isPupilReactivityKey(key),
  );
}

/** Numeric vitals in a group, excluding GCS and pupils clusters (vit-06). */
export function visibleNumericVitalsInGroupExcludingGcs(
  group: VitalGroup,
  visibleKeys?: ReadonlySet<VitalKey>,
): VitalKey[] {
  return visibleVitalsInGroup(group, visibleKeys).filter(
    (key) => !isGcsScoreKey(key) && !isPupilSizeKey(key),
  );
}

export function hasVisibleGcsScore(visibleKeys?: ReadonlySet<VitalKey>): boolean {
  return GCS_SCORE_KEYS.some((key) => isVitalVisible(key, visibleKeys));
}

export function hasVisibleBpPair(visibleKeys?: ReadonlySet<VitalKey>): boolean {
  return (
    isVitalVisible("vitalsBpSystolic", visibleKeys) ||
    isVitalVisible("vitalsBpDiastolic", visibleKeys)
  );
}

export function visibleCoreMainGridKeys(
  visibleKeys?: ReadonlySet<VitalKey>,
): VitalKey[] {
  return CORE_MAIN_GRID_KEYS.filter((key) => isVitalVisible(key, visibleKeys));
}

export function visibleCoreSecondaryGridKeys(
  visibleKeys?: ReadonlySet<VitalKey>,
): VitalKey[] {
  return CORE_SECONDARY_GRID_KEYS.filter((key) =>
    isVitalVisible(key, visibleKeys),
  );
}

/** Every numeric vital key appears in exactly one layout bucket. */
export function allLayoutBuckets(): VitalKey[] {
  return [
    "vitalsBpSystolic",
    "vitalsBpDiastolic",
    "vitalsGlucoseMgDl",
    ...CORE_MAIN_GRID_KEYS,
    ...CORE_SECONDARY_GRID_KEYS,
    ...EXTENDED_VITAL_GROUPS.flatMap((group) =>
      listVitalsByGroup(group).map((v) => v.key),
    ),
    ...listVitalsByGroup("paediatric").map((v) => v.key),
  ];
}

/** Sparkline / trend aria label — full registry label. */
export function vitalSparklineLabel(key: VitalKey): string {
  return resolveVital(key).label;
}

/** Assert layout partition covers the full registry (for tests). */
export function layoutCoversRegistry(): boolean {
  const bucketed = new Set(allLayoutBuckets());
  return VITAL_ORDER.filter((key) => !isVitalExcludedFromObjectiveUi(key)).every((key) =>
    bucketed.has(key),
  );
}
