/**
 * General-exam finding registry (obj-31 / obj-32).
 *
 * Schema-driven finding cards for the `general` system only. Each finding
 * carries a stable `findingId` and detail fields. Stored on
 * `ExamSystemFinding.findings[]` as `{ findingId, attributes? }` entries.
 */

import type { ExamRemoteFeasibility } from "@/lib/cockpit/exam-schema";

export type GeneralExamFieldType = "chips" | "text";

export interface GeneralExamFieldDef {
  key: string;
  label: string;
  type: GeneralExamFieldType;
  chips?: readonly string[];
  /** When true, multiple chips may be selected (comma-joined in attributes). */
  multi?: boolean;
  placeholder?: string;
}

/** Grouped chip rows (e.g. cyanosis central vs peripheral sites). */
export interface GeneralExamFieldGroupDef {
  id: string;
  label: string;
  attributeKey: string;
  chips: readonly string[];
}

export interface GeneralExamFindingDef {
  findingId: string;
  label: string;
  subsectionId: string;
  fieldGroups?: readonly GeneralExamFieldGroupDef[];
  fields: readonly GeneralExamFieldDef[];
}

export interface GeneralExamSubsectionDef {
  id: string;
  label: string;
  remote?: ExamRemoteFeasibility;
}

export const GENERAL_EXAM_SUBSECTIONS: readonly GeneralExamSubsectionDef[] = [
  { id: "demeanor", label: "Demeanor" },
  { id: "appearance", label: "Appearance" },
  { id: "volume", label: "Volume" },
  { id: "peripheral", label: "Peripheral" },
  { id: "nutrition", label: "Nutrition" },
] as const;

export const GENERAL_EXAM_FINDINGS: readonly GeneralExamFindingDef[] = [
  {
    findingId: "distress",
    label: "Distress",
    subsectionId: "demeanor",
    fields: [
      {
        key: "severity",
        label: "Severity",
        type: "chips",
        chips: ["Mild", "Moderate", "Severe"],
      },
      {
        key: "type",
        label: "Type",
        type: "chips",
        chips: ["Respiratory", "Pain", "General", "Psychomotor agitation"],
      },
      {
        key: "context",
        label: "Context",
        type: "chips",
        multi: true,
        chips: ["At rest", "On minimal exertion", "With fever"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "pallor",
    label: "Pallor",
    subsectionId: "appearance",
    fields: [
      {
        key: "site",
        label: "Site",
        type: "chips",
        chips: [
          "Conjunctival",
          "Palmar",
          "Nail bed",
          "Tongue",
          "Mucosal",
          "Facial",
          "Generalized",
        ],
      },
      {
        key: "severity",
        label: "Severity",
        type: "chips",
        chips: ["Mild", "Moderate", "Severe"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "icterus",
    label: "Icterus",
    subsectionId: "appearance",
    fields: [
      {
        key: "site",
        label: "Site",
        type: "chips",
        chips: [
          "Scleral",
          "Facial",
          "Palmar creases",
          "Mucosal",
          "Generalized",
        ],
      },
      {
        key: "severity",
        label: "Severity",
        type: "chips",
        chips: ["Mild", "Moderate", "Severe"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "cyanosis",
    label: "Cyanosis",
    subsectionId: "appearance",
    fieldGroups: [
      {
        id: "central",
        label: "Central",
        attributeKey: "centralSites",
        chips: ["Lips", "Tongue", "Trunk", "Generalized"],
      },
      {
        id: "peripheral",
        label: "Peripheral",
        attributeKey: "peripheralSites",
        chips: ["Fingers/toes", "Earlobes/nose", "Acrocyanosis"],
      },
    ],
    fields: [
      {
        key: "severity",
        label: "Severity",
        type: "chips",
        chips: ["Mild", "Moderate", "Severe"],
      },
      {
        key: "context",
        label: "Context",
        type: "chips",
        multi: true,
        chips: ["At rest", "On exertion", "Improves with warming"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "plethora",
    label: "Plethora",
    subsectionId: "appearance",
    fields: [
      {
        key: "site",
        label: "Site",
        type: "chips",
        chips: ["Facial", "Generalized", "Palms"],
      },
      {
        key: "severity",
        label: "Severity",
        type: "chips",
        chips: ["Mild", "Moderate", "Severe"],
      },
      {
        key: "context",
        label: "Context",
        type: "chips",
        multi: true,
        chips: ["Fever", "Alcohol", "Medication", "Other"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "dehydration",
    label: "Dehydration",
    subsectionId: "volume",
    fields: [
      {
        key: "severity",
        label: "Severity",
        type: "chips",
        chips: ["Mild", "Moderate", "Severe"],
      },
      {
        key: "signs",
        label: "Signs",
        type: "chips",
        multi: true,
        chips: [
          "Dry mucosa",
          "Reduced turgor",
          "Sunken eyes",
          "Delayed cap refill",
          "Reduced urine output",
        ],
      },
      {
        key: "context",
        label: "Context",
        type: "chips",
        multi: true,
        chips: ["Acute", "With vomiting", "With diarrhea", "Poor intake"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "edema",
    label: "Edema",
    subsectionId: "volume",
    /** Per-site detail is rendered by `EdemaSitesPanel` (`sitesJson` attribute). */
    fields: [],
  },
  {
    findingId: "clubbing",
    label: "Clubbing",
    subsectionId: "peripheral",
    fields: [
      {
        key: "grade",
        label: "Grade",
        type: "chips",
        chips: ["Present", "G1", "G2", "G3", "G4"],
      },
      {
        key: "distribution",
        label: "Distribution",
        type: "chips",
        chips: ["Fingers", "Toes", "Both"],
      },
      {
        key: "laterality",
        label: "Laterality",
        type: "chips",
        chips: ["Bilateral", "Left", "Right"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "lymphadenopathy",
    label: "Lymphadenopathy",
    subsectionId: "peripheral",
    /** Per-site detail is rendered by `LymphadenopathySitesPanel` (`sitesJson` attribute). */
    fields: [],
  },
  {
    findingId: "habitus",
    label: "Nutrition / habitus",
    subsectionId: "nutrition",
    fields: [
      {
        key: "pattern",
        label: "Pattern",
        type: "chips",
        chips: ["Thin", "Wasted/cachectic", "Obese", "Muscular"],
      },
      {
        key: "severity",
        label: "Severity",
        type: "chips",
        chips: ["Mild", "Moderate", "Severe"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
] as const;

/** Reserved finding rows for per-subsection free-text notes (General). */
export const GENERAL_SUBSECTION_NOTES_FINDINGS = [
  { findingId: "general_demeanor_notes", label: "Demeanor" },
  { findingId: "general_appearance_notes", label: "Appearance" },
  { findingId: "general_volume_notes", label: "Volume" },
  { findingId: "general_peripheral_notes", label: "Peripheral" },
  { findingId: "general_nutrition_notes", label: "Nutrition" },
] as const;

const GENERAL_SUBSECTION_NOTES_BY_SUBSECTION_ID: Record<string, string> = {
  demeanor: "general_demeanor_notes",
  appearance: "general_appearance_notes",
  volume: "general_volume_notes",
  peripheral: "general_peripheral_notes",
  nutrition: "general_nutrition_notes",
};

export function generalSubsectionNotesFindingId(subsectionId: string): string | undefined {
  return GENERAL_SUBSECTION_NOTES_BY_SUBSECTION_ID[subsectionId];
}

const GENERAL_SUBSECTION_NOTES_BY_FINDING_ID = new Map(
  GENERAL_SUBSECTION_NOTES_FINDINGS.map((row) => [row.findingId, row.label]),
);

export function resolveGeneralSubsectionNotesLabel(findingId: string): string | undefined {
  return GENERAL_SUBSECTION_NOTES_BY_FINDING_ID.get(
    findingId as (typeof GENERAL_SUBSECTION_NOTES_FINDINGS)[number]["findingId"],
  );
}

const GENERAL_FINDING_BY_ID = new Map(
  GENERAL_EXAM_FINDINGS.map((f) => [f.findingId, f]),
);

export function resolveGeneralExamFinding(
  findingId: string,
): GeneralExamFindingDef | undefined {
  return GENERAL_FINDING_BY_ID.get(findingId.trim());
}

export function listGeneralExamFindingsForSubsection(
  subsectionId: string,
): GeneralExamFindingDef[] {
  return GENERAL_EXAM_FINDINGS.filter((f) => f.subsectionId === subsectionId);
}
