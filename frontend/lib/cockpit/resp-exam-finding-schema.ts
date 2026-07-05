/**
 * Respiratory structured finding registry.
 *
 * IPPA-aligned subsections (Inspection / Palpation / Percussion / Auscultation)
 * with structured cards + chip rows, mirroring `cvs-exam-finding-schema.ts`.
 * Stored as `{ findingId, attributes? }` on `ExamSystemFinding.findings[]`.
 */

import type {
  GeneralExamFieldDef,
  GeneralExamFieldGroupDef,
} from "@/lib/cockpit/general-exam-finding-schema";

import type { ExamRemoteFeasibility } from "@/lib/cockpit/exam-schema";

export type RespExamFieldDef = GeneralExamFieldDef;
export type RespExamFieldGroupDef = GeneralExamFieldGroupDef;

export interface RespExamFindingDef {
  findingId: string;
  label: string;
  subsectionId: string;
  fieldGroups?: readonly RespExamFieldGroupDef[];
  fields: readonly RespExamFieldDef[];
}

export interface RespExamChipGroupDef {
  id: string;
  label: string;
  chips: readonly string[];
}

export interface RespExamSubsectionDef {
  id: string;
  label: string;
  chips: readonly string[];
  chipGroups?: readonly RespExamChipGroupDef[];
  structuredFindingIds: readonly string[];
  remote?: ExamRemoteFeasibility;
}

/** Flat chip list for a subsection (chipGroups or chips). */
export function listRespSubsectionChips(subsection: RespExamSubsectionDef): readonly string[] {
  if (subsection.chipGroups?.length) {
    return subsection.chipGroups.flatMap((group) => group.chips);
  }
  return subsection.chips;
}

/** Lung-zone palette shared by localizable auscultation findings. */
const LUNG_ZONE_CHIPS = [
  "Bilateral",
  "Bibasal",
  "Apical",
  "Right",
  "Left",
  "RUL",
  "RML",
  "RLL",
  "LUL",
  "LLL",
] as const;

export const RESP_STRUCTURED_FINDINGS: readonly RespExamFindingDef[] = [
  {
    findingId: "wheeze",
    label: "Wheeze",
    subsectionId: "auscultation",
    fields: [
      {
        key: "timing",
        label: "Timing",
        type: "chips",
        chips: ["Inspiratory", "Expiratory", "Biphasic"],
      },
      {
        key: "character",
        label: "Character",
        type: "chips",
        chips: ["Monophonic", "Polyphonic"],
      },
      {
        key: "site",
        label: "Site",
        type: "chips",
        multi: true,
        chips: LUNG_ZONE_CHIPS,
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "crackles",
    label: "Crackles",
    subsectionId: "auscultation",
    fields: [
      {
        key: "type",
        label: "Character",
        type: "chips",
        chips: ["Fine", "Coarse"],
      },
      {
        key: "timing",
        label: "Timing",
        type: "chips",
        chips: ["Early-inspiratory", "Mid-inspiratory", "Late-inspiratory", "Expiratory"],
      },
      {
        key: "site",
        label: "Site",
        type: "chips",
        multi: true,
        chips: LUNG_ZONE_CHIPS,
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "rhonchi",
    label: "Rhonchi",
    subsectionId: "auscultation",
    fields: [
      {
        key: "site",
        label: "Site",
        type: "chips",
        multi: true,
        chips: LUNG_ZONE_CHIPS,
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "pleural_rub",
    label: "Pleural rub",
    subsectionId: "auscultation",
    fields: [
      {
        key: "site",
        label: "Site",
        type: "chips",
        multi: true,
        chips: LUNG_ZONE_CHIPS,
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
] as const;

export const RESP_EXAM_SUBSECTIONS: readonly RespExamSubsectionDef[] = [
  {
    id: "oxygenation",
    label: "Rate & oxygenation",
    chips: [],
    structuredFindingIds: [],
  },
  {
    id: "inspection",
    label: "Inspection",
    chips: [
      "Accessory muscle use",
      "Chest indrawing",
      "Pursed-lip breathing",
      "Tracheal deviation",
      "Asymmetric expansion",
      "Barrel chest",
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
        id: "breath_sounds",
        label: "Breath sounds",
        chips: ["Reduced AE", "Absent breath sounds", "Bronchial breathing", "Stridor"],
      },
    ],
    structuredFindingIds: ["wheeze", "crackles", "rhonchi", "pleural_rub"],
  },
  {
    id: "palpation",
    label: "Palpation",
    remote: "in_person_only",
    chips: [
      "Reduced chest expansion",
      "Increased fremitus",
      "Decreased fremitus",
      "Chest wall tenderness",
      "Subcutaneous emphysema",
    ],
    structuredFindingIds: [],
  },
  {
    id: "percussion",
    label: "Percussion",
    remote: "in_person_only",
    chips: ["Dullness", "Stony dull", "Hyperresonance"],
    structuredFindingIds: [],
  },
] as const;

const RESP_FINDING_BY_ID = new Map(RESP_STRUCTURED_FINDINGS.map((f) => [f.findingId, f]));

export function resolveRespExamFinding(findingId: string): RespExamFindingDef | undefined {
  return RESP_FINDING_BY_ID.get(findingId.trim());
}

export function listRespStructuredFindingsForSubsection(
  subsectionId: string,
): RespExamFindingDef[] {
  return RESP_STRUCTURED_FINDINGS.filter((f) => f.subsectionId === subsectionId);
}

export const RESP_STRUCTURED_FINDING_ORDER = RESP_STRUCTURED_FINDINGS.map((f) => f.findingId);

/** Subsection-level free-text notes rows (stored on `findings[]`). */
export const RESP_SUBSECTION_NOTES_FINDINGS = [
  { findingId: "resp_inspection_notes", label: "Inspection" },
  { findingId: "resp_auscultation_notes", label: "Auscultation" },
  { findingId: "resp_palpation_notes", label: "Palpation" },
  { findingId: "resp_percussion_notes", label: "Percussion" },
] as const;

/** Reserved finding row for the Inspection subsection free-text notes field. */
export const RESP_INSPECTION_NOTES_FINDING_ID = "resp_inspection_notes";

export const RESP_PALPATION_NOTES_FINDING_ID = "resp_palpation_notes";

export const RESP_PERCUSSION_NOTES_FINDING_ID = "resp_percussion_notes";

export const RESP_AUSCULTATION_NOTES_FINDING_ID = "resp_auscultation_notes";

const RESP_SUBSECTION_NOTES_BY_FINDING_ID = new Map(
  RESP_SUBSECTION_NOTES_FINDINGS.map((row) => [row.findingId, row.label]),
);

export function resolveRespSubsectionNotesLabel(findingId: string): string | undefined {
  return RESP_SUBSECTION_NOTES_BY_FINDING_ID.get(
    findingId as (typeof RESP_SUBSECTION_NOTES_FINDINGS)[number]["findingId"],
  );
}

/** Auscultation chip-group cards: reserved notes rows keyed by chip group id. */
export const RESP_AUSCULTATION_CHIP_GROUP_NOTES = [
  {
    groupId: "breath_sounds",
    findingId: "auscultation_breath_sounds_notes",
    label: "Breath sounds",
  },
] as const;

const RESP_AUSCULTATION_CHIP_GROUP_NOTES_BY_GROUP_ID = new Map(
  RESP_AUSCULTATION_CHIP_GROUP_NOTES.map((row) => [row.groupId, row]),
);

const RESP_AUSCULTATION_CHIP_GROUP_NOTES_BY_FINDING_ID = new Map(
  RESP_AUSCULTATION_CHIP_GROUP_NOTES.map((row) => [row.findingId, row]),
);

export function resolveRespAuscultationChipGroupNotesMeta(groupId: string) {
  return RESP_AUSCULTATION_CHIP_GROUP_NOTES_BY_GROUP_ID.get(
    groupId as (typeof RESP_AUSCULTATION_CHIP_GROUP_NOTES)[number]["groupId"],
  );
}

export function resolveRespAuscultationChipGroupNotesByFindingId(findingId: string) {
  return RESP_AUSCULTATION_CHIP_GROUP_NOTES_BY_FINDING_ID.get(
    findingId as (typeof RESP_AUSCULTATION_CHIP_GROUP_NOTES)[number]["findingId"],
  );
}

/** Scroll / expand id for an auscultation chip-group card. */
export function respAuscultationChipGroupCardId(groupId: string): string {
  return `resp-auscultation-${groupId}`;
}

/** Scroll target key for a Respiratory subsection (`resp-<subsectionId>`). */
export function respSubsectionScrollKey(subsectionId: string): string {
  return `resp-${subsectionId}`;
}

/** Scroll target for the Respiratory Auscultation IPPA subsection. */
export const RESP_AUSCULTATION_SUBSECTION_SCROLL_KEY = "resp-auscultation";

/** Whether a collapsible card id belongs to the Respiratory Auscultation subsection. */
export function isRespAuscultationExpandableCardId(cardId: string): boolean {
  if (listRespStructuredFindingsForSubsection("auscultation").some((f) => f.findingId === cardId)) {
    return true;
  }
  return cardId.startsWith("resp-auscultation-");
}

/** Structured Resp findings rendered inline (no collapsible card) within their subsection. */
export const RESP_INLINE_STRUCTURED_FINDING_IDS = new Set<string>([]);

/** Inline findings whose notes field is rendered at subsection level instead. */
export const RESP_SUBSECTION_NOTES_FINDING_IDS = new Set<string>([]);

/** Chip labels for structured findings (catalog / legacy hydrate). */
export const RESP_STRUCTURED_CHIP_LABELS: Record<string, string> = {
  wheeze: "Wheeze",
  crackles: "Crackles",
  rhonchi: "Rhonchi",
  pleural_rub: "Pleural rub",
};
