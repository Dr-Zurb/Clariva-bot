/**
 * vit-07 / migration 156: per-doctor hidden vitals — registry vital-key strings
 * only (not PHI). Mirrors the frontend `vitals-visibility.ts` known-key set.
 */

/** Shipped column vitals + json-backed numeric vitals (vit-01 registry). */
export const VITAL_VISIBILITY_REGISTRY_KEYS = [
  'vitalsBpSystolic',
  'vitalsBpDiastolic',
  'vitalsHr',
  'vitalsRr',
  'vitalsTempC',
  'vitalsSpo2',
  'vitalsWtKg',
  'vitalsHtCm',
  'vitalsPainScore',
  'vitalsGlucoseMgDl',
  'vitalsGcsTotal',
  'vitalsHeadCircumferenceCm',
  'vitalsMuacCm',
  'vitalsWaistCm',
  'vitalsO2FlowLMin',
  'vitalsFio2Pct',
  'vitalsPefrLMin',
  'vitalsBloodKetonesMmolL',
  'vitalsHipCm',
  'vitalsGcsE',
  'vitalsGcsV',
  'vitalsGcsM',
  'vitalsPupilSizeLeftMm',
  'vitalsPupilSizeRightMm',
  'vitalsCapillaryRefillS',
  'vitalsFetalHeartRateBpm',
  'vitalsFundalHeightCm',
  'vitalsO2DeliveryMethod',
  'vitalsSpo2Device',
  'vitalsPulseRhythm',
  'vitalsHrSource',
  'vitalsTempSite',
  'vitalsTempDevice',
  'vitalsGlucoseTiming',
  'vitalsGlucoseDevice',
  'vitalsPupilReactivityLeft',
  'vitalsPupilReactivityRight',
  'vitalsAvpu',
] as const;

export type VitalVisibilityRegistryKey = (typeof VITAL_VISIBILITY_REGISTRY_KEYS)[number];

/** Max hidden entries — generous cap so a stale id never bricks a save. */
export const VITALS_HIDDEN_MAX = VITAL_VISIBILITY_REGISTRY_KEYS.length;

const REGISTRY_KEY_SET = new Set<string>(VITAL_VISIBILITY_REGISTRY_KEYS);

export function isVitalVisibilityRegistryKey(key: string): key is VitalVisibilityRegistryKey {
  return REGISTRY_KEY_SET.has(key);
}

/**
 * Sanitize a stored hidden set (vit-07): dedupe + drop anything not recognised
 * by the vitals registry. Preserves relative order. Tolerant — a renamed/removed
 * id is dropped rather than rejected so a stale id never bricks a save.
 */
export function sanitizeVitalsHidden(raw: readonly string[]): VitalVisibilityRegistryKey[] {
  const seen = new Set<VitalVisibilityRegistryKey>();
  const result: VitalVisibilityRegistryKey[] = [];
  for (const id of raw) {
    if (typeof id !== 'string') continue;
    if (!isVitalVisibilityRegistryKey(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}
