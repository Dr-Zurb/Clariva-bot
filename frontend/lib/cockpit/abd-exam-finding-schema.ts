/**
 * Abdomen structured finding registry.
 *
 * IPPA-aligned subsections (Inspection / Auscultation / Palpation / Percussion —
 * the abdominal order, auscultation before palpation) with structured cards +
 * chip rows, mirroring `resp-exam-finding-schema.ts`.
 * Stored as `{ findingId, attributes? }` on `ExamSystemFinding.findings[]`.
 */

import type {
  GeneralExamFieldDef,
  GeneralExamFieldGroupDef,
} from "@/lib/cockpit/general-exam-finding-schema";

import type { ExamRemoteFeasibility } from "@/lib/cockpit/exam-schema";

export type AbdExamFieldDef = GeneralExamFieldDef;
export type AbdExamFieldGroupDef = GeneralExamFieldGroupDef;

export interface AbdExamFindingDef {
  findingId: string;
  label: string;
  subsectionId: string;
  fieldGroups?: readonly AbdExamFieldGroupDef[];
  fields: readonly AbdExamFieldDef[];
}

export interface AbdExamChipGroupDef {
  id: string;
  label: string;
  chips: readonly string[];
}

export interface AbdExamSubsectionDef {
  id: string;
  label: string;
  chips: readonly string[];
  chipGroups?: readonly AbdExamChipGroupDef[];
  structuredFindingIds: readonly string[];
  remote?: ExamRemoteFeasibility;
}

/** Flat chip list for a subsection (chipGroups or chips). */
export function listAbdSubsectionChips(subsection: AbdExamSubsectionDef): readonly string[] {
  if (subsection.chipGroups?.length) {
    return subsection.chipGroups.flatMap((group) => group.chips);
  }
  return subsection.chips;
}

/** Nine-region abdominal map shared by localizable findings (tenderness, mass). */
const ABD_REGION_CHIPS = [
  "Right hypochondrium",
  "Epigastric",
  "Left hypochondrium",
  "Right lumbar",
  "Umbilical",
  "Left lumbar",
  "Right iliac",
  "Hypogastric",
  "Left iliac",
  "Generalized",
] as const;

export const ABD_STRUCTURED_FINDINGS: readonly AbdExamFindingDef[] = [
  {
    findingId: "tenderness",
    label: "Tenderness",
    subsectionId: "palpation",
    fields: [
      {
        key: "region",
        label: "Region",
        type: "chips",
        multi: true,
        chips: ABD_REGION_CHIPS,
      },
      {
        key: "severity",
        label: "Severity",
        type: "chips",
        chips: ["Mild", "Moderate", "Severe"],
      },
      {
        key: "signs",
        label: "Peritoneal signs",
        type: "chips",
        multi: true,
        chips: ["Guarding", "Rigidity", "Rebound"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "hepatomegaly",
    label: "Hepatomegaly",
    subsectionId: "palpation",
    fields: [
      {
        key: "span",
        label: "Span below costal margin",
        type: "text",
        placeholder: "e.g. 4 cm",
      },
      {
        key: "surface",
        label: "Surface",
        type: "chips",
        chips: ["Smooth", "Nodular", "Irregular"],
      },
      {
        key: "edge",
        label: "Edge",
        type: "chips",
        chips: ["Sharp", "Rounded", "Firm"],
      },
      {
        key: "tenderness",
        label: "Tenderness",
        type: "chips",
        chips: ["Tender", "Non-tender"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "splenomegaly",
    label: "Splenomegaly",
    subsectionId: "palpation",
    fields: [
      {
        key: "grade",
        label: "Grade",
        type: "chips",
        chips: ["Just palpable", "Moderate", "Massive"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "abdominal_mass",
    label: "Mass",
    subsectionId: "palpation",
    fields: [
      {
        key: "region",
        label: "Region",
        type: "chips",
        multi: true,
        chips: ABD_REGION_CHIPS,
      },
      { key: "size", label: "Size", type: "text", placeholder: "e.g. 5 × 4 cm" },
      {
        key: "consistency",
        label: "Consistency",
        type: "chips",
        chips: ["Soft", "Firm", "Hard"],
      },
      {
        key: "surface",
        label: "Surface",
        type: "chips",
        chips: ["Smooth", "Irregular"],
      },
      {
        key: "mobility",
        label: "Mobility",
        type: "chips",
        chips: ["Mobile", "Fixed"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "ascites",
    label: "Ascites",
    subsectionId: "percussion",
    fields: [
      {
        key: "signs",
        label: "Signs",
        type: "chips",
        multi: true,
        chips: ["Shifting dullness", "Fluid thrill"],
      },
      {
        key: "grade",
        label: "Grade",
        type: "chips",
        chips: ["Mild", "Moderate", "Tense"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
] as const;

export const ABD_EXAM_SUBSECTIONS: readonly AbdExamSubsectionDef[] = [
  {
    id: "inspection",
    label: "Inspection",
    chips: [
      "Distension",
      "Scars",
      "Visible peristalsis",
      "Dilated veins",
      "Stoma",
      "Everted umbilicus",
      "Striae",
    ],
    structuredFindingIds: [],
  },
  {
    id: "auscultation",
    label: "Auscultation",
    remote: "in_person_only",
    chips: [],
    chipGroups: [
      {
        id: "bowel_sounds",
        label: "Bowel sounds",
        chips: [
          "Absent bowel sounds",
          "Hyperactive bowel sounds",
          "Hypoactive bowel sounds",
          "Bruit",
        ],
      },
    ],
    structuredFindingIds: [],
  },
  {
    id: "palpation",
    label: "Palpation",
    remote: "in_person_only",
    chips: ["Murphy's sign positive", "Renal angle tenderness"],
    structuredFindingIds: ["tenderness", "hepatomegaly", "splenomegaly", "abdominal_mass"],
  },
  {
    id: "percussion",
    label: "Percussion",
    remote: "in_person_only",
    chips: ["Tympanic", "Liver dullness obliterated"],
    structuredFindingIds: ["ascites"],
  },
] as const;

const ABD_FINDING_BY_ID = new Map(ABD_STRUCTURED_FINDINGS.map((f) => [f.findingId, f]));

export function resolveAbdExamFinding(findingId: string): AbdExamFindingDef | undefined {
  return ABD_FINDING_BY_ID.get(findingId.trim());
}

export function listAbdStructuredFindingsForSubsection(
  subsectionId: string,
): AbdExamFindingDef[] {
  return ABD_STRUCTURED_FINDINGS.filter((f) => f.subsectionId === subsectionId);
}

export const ABD_STRUCTURED_FINDING_ORDER = ABD_STRUCTURED_FINDINGS.map((f) => f.findingId);

/** Subsection-level free-text notes rows (stored on `findings[]`). */
export const ABD_SUBSECTION_NOTES_FINDINGS = [
  { findingId: "abd_inspection_notes", label: "Inspection" },
  { findingId: "abd_auscultation_notes", label: "Auscultation" },
  { findingId: "abd_palpation_notes", label: "Palpation" },
  { findingId: "abd_percussion_notes", label: "Percussion" },
] as const;

export const ABD_INSPECTION_NOTES_FINDING_ID = "abd_inspection_notes";

export const ABD_AUSCULTATION_NOTES_FINDING_ID = "abd_auscultation_notes";

export const ABD_PALPATION_NOTES_FINDING_ID = "abd_palpation_notes";

export const ABD_PERCUSSION_NOTES_FINDING_ID = "abd_percussion_notes";

const ABD_SUBSECTION_NOTES_BY_FINDING_ID = new Map(
  ABD_SUBSECTION_NOTES_FINDINGS.map((row) => [row.findingId, row.label]),
);

export function resolveAbdSubsectionNotesLabel(findingId: string): string | undefined {
  return ABD_SUBSECTION_NOTES_BY_FINDING_ID.get(
    findingId as (typeof ABD_SUBSECTION_NOTES_FINDINGS)[number]["findingId"],
  );
}

/** Auscultation chip-group cards: reserved notes rows keyed by chip group id. */
export const ABD_CHIP_GROUP_NOTES = [
  {
    groupId: "bowel_sounds",
    findingId: "abd_bowel_sounds_notes",
    label: "Bowel sounds",
  },
] as const;

const ABD_CHIP_GROUP_NOTES_BY_GROUP_ID = new Map(
  ABD_CHIP_GROUP_NOTES.map((row) => [row.groupId, row]),
);

const ABD_CHIP_GROUP_NOTES_BY_FINDING_ID = new Map(
  ABD_CHIP_GROUP_NOTES.map((row) => [row.findingId, row]),
);

export function resolveAbdChipGroupNotesMeta(groupId: string) {
  return ABD_CHIP_GROUP_NOTES_BY_GROUP_ID.get(
    groupId as (typeof ABD_CHIP_GROUP_NOTES)[number]["groupId"],
  );
}

export function resolveAbdChipGroupNotesByFindingId(findingId: string) {
  return ABD_CHIP_GROUP_NOTES_BY_FINDING_ID.get(
    findingId as (typeof ABD_CHIP_GROUP_NOTES)[number]["findingId"],
  );
}

/** Scroll / expand id for an abdomen chip-group card (e.g. `abd-auscultation-bowel_sounds`). */
export function abdChipGroupCardId(groupId: string): string {
  return `abd-auscultation-${groupId}`;
}

/** Scroll target key for an abdomen IPPA subsection (`abd-<subsectionId>`). */
export function abdSubsectionScrollKey(subsectionId: string): string {
  return `abd-${subsectionId}`;
}

/** Whether a subsection renders collapsible cards (chip groups or structured findings). */
export function abdSubsectionHasCards(subsection: AbdExamSubsectionDef): boolean {
  return Boolean(subsection.chipGroups?.length) || subsection.structuredFindingIds.length > 0;
}

/**
 * The subsection scroll key a collapsible card belongs to, or null when the id is
 * not a card (used to scroll the whole subsection to the top on collapse).
 */
export function resolveAbdCardSubsectionScrollKey(cardId: string): string | null {
  const structured = resolveAbdExamFinding(cardId);
  if (structured) return abdSubsectionScrollKey(structured.subsectionId);
  if (cardId.startsWith("abd-auscultation-")) return abdSubsectionScrollKey("auscultation");
  return null;
}

/** Chip labels for structured findings (catalog / legacy hydrate). */
export const ABD_STRUCTURED_CHIP_LABELS: Record<string, string> = {
  tenderness: "Tenderness",
  hepatomegaly: "Hepatomegaly",
  splenomegaly: "Splenomegaly",
  abdominal_mass: "Mass",
  ascites: "Ascites",
};
