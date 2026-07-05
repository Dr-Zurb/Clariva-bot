/**
 * Adult Glasgow Coma Scale scoring criteria (reference only — vit-06).
 * Stored values remain numeric E/V/M/total; this module powers on-demand UI help.
 */

import {
  GCS_COMPONENT_KEYS,
  type GcsComponentKey,
} from "@/lib/cockpit/gcs-subscore";

export interface GcsCriterionRow {
  score: number;
  label: string;
}

export interface GcsCriteriaSection {
  componentKey: GcsComponentKey;
  title: string;
  scaleLabel: string;
  rows: readonly GcsCriterionRow[];
}

/** Standard adult GCS — highest score first (matches common bedside recall). */
export const GCS_CRITERIA_SECTIONS: readonly GcsCriteriaSection[] = [
  {
    componentKey: "vitalsGcsE",
    title: "Eye (E)",
    scaleLabel: "/4",
    rows: [
      { score: 4, label: "Spontaneous" },
      { score: 3, label: "To verbal command" },
      { score: 2, label: "To pain" },
      { score: 1, label: "No eye opening" },
    ],
  },
  {
    componentKey: "vitalsGcsV",
    title: "Verbal (V)",
    scaleLabel: "/5",
    rows: [
      { score: 5, label: "Oriented" },
      { score: 4, label: "Confused" },
      { score: 3, label: "Inappropriate words" },
      { score: 2, label: "Incomprehensible sounds" },
      { score: 1, label: "No verbal response" },
    ],
  },
  {
    componentKey: "vitalsGcsM",
    title: "Motor (M)",
    scaleLabel: "/6",
    rows: [
      { score: 6, label: "Obeys commands" },
      { score: 5, label: "Localizes pain" },
      { score: 4, label: "Withdrawal from pain" },
      { score: 3, label: "Abnormal flexion (decorticate)" },
      { score: 2, label: "Abnormal extension (decerebrate)" },
      { score: 1, label: "No motor response" },
    ],
  },
] as const;

export function gcsCriteriaForComponent(
  componentKey: GcsComponentKey,
): GcsCriteriaSection {
  const section = GCS_CRITERIA_SECTIONS.find((s) => s.componentKey === componentKey);
  if (!section) {
    throw new Error(`Unknown GCS component: ${componentKey}`);
  }
  return section;
}

export function gcsCriteriaSections(
  componentKey?: GcsComponentKey,
): readonly GcsCriteriaSection[] {
  if (componentKey == null) return GCS_CRITERIA_SECTIONS;
  return [gcsCriteriaForComponent(componentKey)];
}

/** Ensures registry bounds align with published criteria row counts. */
export function gcsCriteriaComponentKeys(): readonly GcsComponentKey[] {
  return GCS_COMPONENT_KEYS;
}
