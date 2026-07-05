/**
 * Pupils L/R size + reactivity cluster (vitals-section · vit-06).
 *
 * Four stored fields; one menu/picker row labelled "Pupils".
 */

import type { RxFormFields } from "@/components/cockpit/rx/RxFormContext";
import type { CategoricalVitalKey } from "@/lib/cockpit/categorical-vitals-schema";
import type { VitalKey } from "@/lib/cockpit/vitals-schema";
import type { VitalVisibilityKey } from "@/lib/cockpit/vitals-visibility";

export const PUPIL_SIZE_LEFT_KEY = "vitalsPupilSizeLeftMm" as const;
export const PUPIL_SIZE_RIGHT_KEY = "vitalsPupilSizeRightMm" as const;
export const PUPIL_REACTIVITY_LEFT_KEY = "vitalsPupilReactivityLeft" as const;
export const PUPIL_REACTIVITY_RIGHT_KEY = "vitalsPupilReactivityRight" as const;

export type PupilSizeKey = typeof PUPIL_SIZE_LEFT_KEY | typeof PUPIL_SIZE_RIGHT_KEY;
export type PupilReactivityKey =
  | typeof PUPIL_REACTIVITY_LEFT_KEY
  | typeof PUPIL_REACTIVITY_RIGHT_KEY;

export const PUPIL_SIZE_KEYS = [PUPIL_SIZE_LEFT_KEY, PUPIL_SIZE_RIGHT_KEY] as const;
export const PUPIL_REACTIVITY_KEYS = [
  PUPIL_REACTIVITY_LEFT_KEY,
  PUPIL_REACTIVITY_RIGHT_KEY,
] as const;

export const PUPIL_CLUSTER_KEYS = [
  ...PUPIL_SIZE_KEYS,
  ...PUPIL_REACTIVITY_KEYS,
] as const satisfies readonly VitalVisibilityKey[];

/** Single Add-vital / Manage-vitals row for the whole cluster. */
export const PUPIL_CLUSTER_MENU_KEY = PUPIL_SIZE_LEFT_KEY satisfies VitalVisibilityKey;

export const PUPIL_CLUSTER_MENU_LABEL = "Pupils";

const PUPIL_SIZE_KEY_SET = new Set<string>(PUPIL_SIZE_KEYS);
const PUPIL_REACTIVITY_KEY_SET = new Set<string>(PUPIL_REACTIVITY_KEYS);
const PUPIL_CLUSTER_KEY_SET = new Set<string>(PUPIL_CLUSTER_KEYS);

export function isPupilSizeKey(key: string): key is PupilSizeKey {
  return PUPIL_SIZE_KEY_SET.has(key);
}

export function isPupilReactivityKey(key: string): key is PupilReactivityKey {
  return PUPIL_REACTIVITY_KEY_SET.has(key);
}

export function isPupilClusterVisibilityKey(key: VitalVisibilityKey): boolean {
  return PUPIL_CLUSTER_KEY_SET.has(key);
}

/** R size + reactivity keys — not standalone picker/menu rows. */
export function isPupilComponentOnlyKey(key: string): boolean {
  return isPupilClusterVisibilityKey(key as VitalVisibilityKey) && key !== PUPIL_CLUSTER_MENU_KEY;
}

export function expandPupilClusterVisibilityKeys(
  key: VitalVisibilityKey,
): VitalVisibilityKey[] {
  if (!isPupilClusterVisibilityKey(key)) return [key];
  return [...PUPIL_CLUSTER_KEYS];
}

export function resolvePupilClusterMenuLabel(key: VitalVisibilityKey): string | null {
  return key === PUPIL_CLUSTER_MENU_KEY ? PUPIL_CLUSTER_MENU_LABEL : null;
}

export function pupilClusterHasData(fields: RxFormFields): boolean {
  for (const key of PUPIL_CLUSTER_KEYS) {
    const value = fields[key as keyof RxFormFields];
    if (value == null) continue;
    if (typeof value === "string") {
      if (value.trim().length > 0) return true;
    } else {
      return true;
    }
  }
  return false;
}

export interface PupilClusterSide {
  sideLabel: "L" | "R";
  sizeKey: PupilSizeKey;
  reactivityKey: PupilReactivityKey;
}

export const PUPIL_CLUSTER_SIDES: readonly PupilClusterSide[] = [
  {
    sideLabel: "L",
    sizeKey: PUPIL_SIZE_LEFT_KEY,
    reactivityKey: PUPIL_REACTIVITY_LEFT_KEY,
  },
  {
    sideLabel: "R",
    sizeKey: PUPIL_SIZE_RIGHT_KEY,
    reactivityKey: PUPIL_REACTIVITY_RIGHT_KEY,
  },
] as const;
