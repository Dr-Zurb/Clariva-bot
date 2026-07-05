/**
 * GCS E/V/M → total auto-sum (vitals-section · vit-06).
 *
 * Pure helpers — the canonical neuro score remains `vitalsGcsTotal`.
 * Sub-scores sum only when all three components are present and in range.
 */

import { resolveVital } from "./vitals-schema";

export const GCS_COMPONENT_KEYS = ["vitalsGcsE", "vitalsGcsV", "vitalsGcsM"] as const;
export type GcsComponentKey = (typeof GCS_COMPONENT_KEYS)[number];

export const GCS_TOTAL_KEY = "vitalsGcsTotal" as const;

export const GCS_SCORE_KEYS = [...GCS_COMPONENT_KEYS, GCS_TOTAL_KEY] as const;

const GCS_COMPONENT_KEY_SET = new Set<string>(GCS_COMPONENT_KEYS);
const GCS_SCORE_KEY_SET = new Set<string>(GCS_SCORE_KEYS);

export function isGcsComponentKey(key: string): key is GcsComponentKey {
  return GCS_COMPONENT_KEY_SET.has(key);
}

export function isGcsScoreKey(key: string): boolean {
  return GCS_SCORE_KEY_SET.has(key);
}

/** E/V/M are edited inside the GCS card — not standalone picker/menu rows. */
export function isGcsClusterMenuKey(key: string): boolean {
  return key === GCS_TOTAL_KEY || isGcsComponentKey(key);
}

export function isGcsComponentOnlyKey(key: string): boolean {
  return isGcsComponentKey(key);
}

/** Sum E+V+M when all three are in registry bounds; otherwise null (no auto-total). */
export function computeGcsTotalFromComponents(
  eye: number | null | undefined,
  verbal: number | null | undefined,
  motor: number | null | undefined,
): number | null {
  if (eye == null || verbal == null || motor == null) return null;
  if (!Number.isFinite(eye) || !Number.isFinite(verbal) || !Number.isFinite(motor)) {
    return null;
  }

  for (const [key, value] of [
    ["vitalsGcsE", eye],
    ["vitalsGcsV", verbal],
    ["vitalsGcsM", motor],
  ] as const) {
    const def = resolveVital(key);
    if (value < def.hardMin || value > def.hardMax) return null;
  }

  const sum = eye + verbal + motor;
  const totalDef = resolveVital(GCS_TOTAL_KEY);
  if (sum < totalDef.hardMin || sum > totalDef.hardMax) return null;
  return sum;
}
