/**
 * Blood pressure systolic/diastolic pair (vitals-section).
 *
 * Two stored columns; one Manage-vitals row labelled "Blood pressure (BP)".
 */

import type { RxFormFields } from "@/components/cockpit/rx/RxFormContext";
import type { VitalVisibilityKey } from "@/lib/cockpit/vitals-visibility";

export const BP_SYSTOLIC_KEY = "vitalsBpSystolic" as const;
export const BP_DIASTOLIC_KEY = "vitalsBpDiastolic" as const;

export type BpClusterKey = typeof BP_SYSTOLIC_KEY | typeof BP_DIASTOLIC_KEY;

export const BP_CLUSTER_KEYS = [BP_SYSTOLIC_KEY, BP_DIASTOLIC_KEY] as const satisfies readonly VitalVisibilityKey[];

/** Single Manage-vitals row for the paired BP card. */
export const BP_CLUSTER_MENU_KEY = BP_SYSTOLIC_KEY satisfies VitalVisibilityKey;

export const BP_CLUSTER_MENU_LABEL = "Blood pressure (BP)";

const BP_CLUSTER_KEY_SET = new Set<string>(BP_CLUSTER_KEYS);

export function isBpClusterVisibilityKey(key: VitalVisibilityKey): key is BpClusterKey {
  return BP_CLUSTER_KEY_SET.has(key);
}

/** Diastolic is edited inside the BP card — not a standalone menu row. */
export function isBpComponentOnlyKey(key: string): boolean {
  return key === BP_DIASTOLIC_KEY;
}

export function expandBpClusterVisibilityKeys(key: VitalVisibilityKey): VitalVisibilityKey[] {
  if (!isBpClusterVisibilityKey(key)) return [key];
  return [...BP_CLUSTER_KEYS];
}

export function resolveBpClusterMenuLabel(key: VitalVisibilityKey): string | null {
  return key === BP_CLUSTER_MENU_KEY ? BP_CLUSTER_MENU_LABEL : null;
}

export function bpClusterHasData(fields: RxFormFields): boolean {
  if (fields.vitalsBpSystolic != null || fields.vitalsBpDiastolic != null) {
    return true;
  }
  return fields.vitalsBpReadings.some(
    (row) => row.systolic != null || row.diastolic != null,
  );
}

/** Whether every cluster key is in the hidden set (paired hide state). */
export function isBpClusterHidden(hidden: readonly string[]): boolean {
  const hiddenSet = new Set(hidden);
  return BP_CLUSTER_KEYS.every((key) => hiddenSet.has(key));
}
