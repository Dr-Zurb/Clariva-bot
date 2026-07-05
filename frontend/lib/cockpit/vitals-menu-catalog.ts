/**
 * Shared vitals picker / manager catalog (vit-08 + vit-09).
 *
 * Single source for registry rows shown in the unified Manage vitals menu.
 */

import { listCategoricalVitals } from "@/lib/cockpit/categorical-vitals-schema";
import {
  CATEGORICAL_VITAL_ORDER,
  type CategoricalVitalKey,
} from "@/lib/cockpit/categorical-vitals-schema";
import { isGcsComponentOnlyKey } from "@/lib/cockpit/gcs-subscore";
import {
  isBpComponentOnlyKey,
  resolveBpClusterMenuLabel,
} from "@/lib/cockpit/bp-cluster";
import {
  isPupilComponentOnlyKey,
  resolvePupilClusterMenuLabel,
} from "@/lib/cockpit/pupil-cluster";
import { isPairedContextCategorical } from "@/lib/cockpit/vitals-group-layout";
import { listVitals, type VitalGroup } from "@/lib/cockpit/vitals-schema";
import {
  isVitalExcludedFromObjectiveUi,
  type VitalVisibilityKey,
} from "@/lib/cockpit/vitals-visibility";
import {
  normalizeCustomVitalDefs,
  type CustomVitalDef,
} from "@/lib/cockpit/vitals-custom";

export const VITAL_MENU_GROUP_ORDER: VitalGroup[] = [
  "core",
  "respiratory",
  "metabolic",
  "neuro",
  "paediatric",
  "obstetric",
];

export const VITAL_MENU_GROUP_LABELS: Record<VitalGroup, string> = {
  core: "Core",
  respiratory: "Respiratory",
  metabolic: "Metabolic",
  neuro: "Neuro",
  paediatric: "Paediatric",
  obstetric: "Obstetric",
};

export interface VitalsMenuCatalogEntry {
  key: VitalVisibilityKey;
  label: string;
  group: VitalGroup;
  /** vit-14: true for doctor-authored custom vitals (offer a remove action). */
  isCustom?: boolean;
}

export function isVitalsMenuCatalogKey(key: VitalVisibilityKey): boolean {
  if (isVitalExcludedFromObjectiveUi(key)) return false;
  if (isGcsComponentOnlyKey(key)) return false;
  if (isBpComponentOnlyKey(key)) return false;
  if (isPupilComponentOnlyKey(key)) return false;
  if (
    (CATEGORICAL_VITAL_ORDER as readonly string[]).includes(key) &&
    isPairedContextCategorical(key as CategoricalVitalKey)
  ) {
    return false;
  }
  return true;
}

export function buildVitalsMenuCatalog(
  customDefs: CustomVitalDef[] = [],
): VitalsMenuCatalogEntry[] {
  const numeric = listVitals().map((v) => ({
    key: v.key,
    label: v.label,
    group: v.group,
  }));
  const categorical = listCategoricalVitals().map((v) => ({
    key: v.key,
    label: v.label,
    group: v.group,
  }));
  const registry: VitalsMenuCatalogEntry[] = [...numeric, ...categorical]
    .filter((v) => isVitalsMenuCatalogKey(v.key))
    .map((v) => ({
      ...v,
      label:
        resolveBpClusterMenuLabel(v.key) ??
        resolvePupilClusterMenuLabel(v.key) ??
        v.label,
    }));

  const custom: VitalsMenuCatalogEntry[] = normalizeCustomVitalDefs(customDefs).map(
    (def) => ({
      key: def.id as VitalVisibilityKey,
      label: def.label,
      group: def.group,
      isCustom: true,
    }),
  );

  const combined = [...registry, ...custom];
  return sortVitalsMenuCatalogWithinGroups(combined);
}

function compareVitalsMenuLabels(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/** Alphabetical order within each clinical group (vit-08 manage menu). */
export function sortVitalsMenuCatalogWithinGroups(
  entries: VitalsMenuCatalogEntry[],
): VitalsMenuCatalogEntry[] {
  const byGroup = new Map<VitalGroup, VitalsMenuCatalogEntry[]>();
  for (const group of VITAL_MENU_GROUP_ORDER) {
    byGroup.set(group, []);
  }
  for (const entry of entries) {
    byGroup.get(entry.group)?.push(entry);
  }
  const sorted: VitalsMenuCatalogEntry[] = [];
  for (const group of VITAL_MENU_GROUP_ORDER) {
    const groupEntries = byGroup.get(group) ?? [];
    groupEntries.sort((a, b) => compareVitalsMenuLabels(a.label, b.label));
    sorted.push(...groupEntries);
  }
  return sorted;
}

export const VITALS_MENU_CATALOG = buildVitalsMenuCatalog();
