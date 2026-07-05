import {
  CATEGORICAL_VITAL_ORDER,
  type CategoricalVitalKey,
} from "@/lib/cockpit/categorical-vitals-schema";
import { VITAL_ORDER, type VitalKey } from "@/lib/cockpit/vitals-schema";

/** Numeric + categorical keys that participate in hide/unhide (vit-08 menu). */
export type VitalVisibilityKey = VitalKey | CategoricalVitalKey;

/**
 * Classic core vitals visible at factory default (V3-D3): BP, HR, RR, Temp,
 * SpO₂, Weight, Height, Blood Glucose — everything else hidden-but-addable.
 */
export const CORE_CLASSIC_VITAL_KEYS: readonly VitalKey[] = [
  "vitalsBpSystolic",
  "vitalsBpDiastolic",
  "vitalsHr",
  "vitalsRr",
  "vitalsTempC",
  "vitalsSpo2",
  "vitalsWtKg",
  "vitalsHtCm",
  "vitalsGlucoseMgDl",
];

/** Per-doctor hidden vital keys (delta override — empty ⇒ factory default). */
export type VitalsHiddenSet = VitalVisibilityKey[];

/**
 * Numeric vitals excluded from the objective vitals UI — captured elsewhere
 * (e.g. pain score on subjective complaint cards). Column/API remain for legacy
 * rows and templates.
 */
export const VITALS_EXCLUDED_FROM_OBJECTIVE_UI: readonly VitalKey[] = [
  "vitalsPainScore",
] as const;

const EXCLUDED_OBJECTIVE_UI_SET = new Set<string>(VITALS_EXCLUDED_FROM_OBJECTIVE_UI);

export function isVitalExcludedFromObjectiveUi(key: VitalVisibilityKey): boolean {
  return EXCLUDED_OBJECTIVE_UI_SET.has(key);
}

const CORE_CLASSIC_SET = new Set<string>(CORE_CLASSIC_VITAL_KEYS);
const KNOWN_VISIBILITY_KEY_SET = new Set<string>([
  ...VITAL_ORDER,
  ...CATEGORICAL_VITAL_ORDER,
]);

function isKnownVisibilityKey(key: string): key is VitalVisibilityKey {
  return KNOWN_VISIBILITY_KEY_SET.has(key);
}

function isCoreClassicVital(key: string): boolean {
  return CORE_CLASSIC_SET.has(key);
}

function toHiddenSet(hiddenIds: readonly string[]): ReadonlySet<string> {
  return new Set(hiddenIds);
}

export interface DefaultVitalsLayout {
  /** Factory-default hidden set (non-classic-core vitals). */
  defaultHidden: VitalVisibilityKey[];
}

/** Factory default: classic core on; all else hidden (V3-D3). Pure + deterministic. */
export function resolveDefaultVitalsLayout(): DefaultVitalsLayout {
  const numericHidden = VITAL_ORDER.filter((key) => !isCoreClassicVital(key));
  const categoricalHidden = CATEGORICAL_VITAL_ORDER.filter(
    (key) => !isCoreClassicVital(key),
  );
  return { defaultHidden: [...numericHidden, ...categoricalHidden] };
}

export interface ResolveEffectiveVitalsHiddenArgs {
  /** Doctor's stored override (obj-12 analogue). Empty ⇒ factory default applies. */
  storedHidden: readonly string[];
  /** Reserved for specialty auto-select seed (V3-D3 — unused in vit-07). */
  specialty?: string | null;
}

/**
 * Layer the doctor override over the factory default. Stored set wins wholesale
 * when present; otherwise the classic-core default applies (P3-D5 analogue).
 */
export function resolveEffectiveVitalsHidden({
  storedHidden,
}: ResolveEffectiveVitalsHiddenArgs): { hidden: VitalVisibilityKey[] } {
  const seed = resolveDefaultVitalsLayout();
  const source = storedHidden.length > 0 ? storedHidden : seed.defaultHidden;
  const seen = new Set<VitalVisibilityKey>();
  const hidden: VitalVisibilityKey[] = [];

  for (const id of source) {
    if (!isKnownVisibilityKey(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    hidden.push(id);
  }

  return { hidden };
}

export interface ResolveVisibleVitalsArgs {
  /** Effective hidden set (factory default or doctor override). */
  hidden: readonly string[];
  /** Reserved for specialty auto-select seed (V3-D3 — unused in vit-07). */
  specialty?: string | null;
}

/**
 * Resolve the visible vitals render plan by filtering `hidden` out of
 * `VITAL_ORDER` (vit-07 / V3-D3).
 */
export function resolveVisibleVitals({ hidden }: ResolveVisibleVitalsArgs): VitalKey[] {
  const hiddenSet = toHiddenSet(hidden);
  return VITAL_ORDER.filter(
    (key) => !hiddenSet.has(key) && !isVitalExcludedFromObjectiveUi(key),
  );
}

/** Categorical vitals render plan — same hidden set as numeric (vit-08). */
export function resolveVisibleCategoricalVitals({
  hidden,
}: ResolveVisibleVitalsArgs): CategoricalVitalKey[] {
  const hiddenSet = toHiddenSet(hidden);
  return CATEGORICAL_VITAL_ORDER.filter((key) => !hiddenSet.has(key));
}

/** Whether a vital should show as hidden in the manage-vitals menu (vit-08). */
export function isVitalHidden(key: VitalVisibilityKey, hidden: readonly string[]): boolean {
  return toHiddenSet(hidden).has(key);
}

/**
 * Whether a vital is hidden at factory default (not in the classic core set).
 * Distinct from an explicit doctor hide of a core vital (vit-07 / V3-D3).
 */
export function isVitalDefaultHidden(key: VitalVisibilityKey): boolean {
  return !isCoreClassicVital(key);
}

/**
 * Whether a vital is in the doctor's persisted hidden override set.
 * Empty stored set ⇒ no explicit overrides (factory default applies).
 */
export function isVitalExplicitlyHidden(
  key: VitalVisibilityKey,
  storedHidden: readonly string[],
): boolean {
  return storedHidden.length > 0 && toHiddenSet(storedHidden).has(key);
}

/**
 * Compute the minimal hidden set to persist (vit-07 / V3-D2).
 *
 * Keeps only known registry vital keys. Dedupes while preserving first-occurrence
 * order. Unknown / stale keys are dropped.
 */
export function vitalsHiddenOverridesToPersist(hiddenIds: readonly string[]): VitalsHiddenSet {
  const seen = new Set<VitalVisibilityKey>();
  const result: VitalsHiddenSet = [];

  for (const id of hiddenIds) {
    if (typeof id !== "string") continue;
    if (!isKnownVisibilityKey(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}

/** Stable JSON key for debounce guards (sorted keys). */
export function serializeVitalsHidden(ids: readonly string[]): string {
  return JSON.stringify([...ids].sort());
}

/** Load the doctor's stored hidden vital set (empty = factory default). */
export async function fetchVitalsHidden(token: string): Promise<VitalsHiddenSet> {
  const { getDoctorSettings } = await import("@/lib/api");
  const res = await getDoctorSettings(token);
  return (res.data.settings.vitals_hidden ?? []) as VitalsHiddenSet;
}

/** Persist the doctor's hidden vital set (vit-07 transport). */
export async function saveVitalsHidden(
  token: string,
  ids: VitalsHiddenSet,
): Promise<VitalsHiddenSet> {
  const { patchDoctorSettings } = await import("@/lib/api");
  const res = await patchDoctorSettings(token, { vitals_hidden: ids });
  return (res.data.settings.vitals_hidden ?? []) as VitalsHiddenSet;
}
