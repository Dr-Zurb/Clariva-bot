/**
 * Cardiovascular structured finding registry.
 *
 * IPPA-aligned subsections with structured cards + chip rows.
 * Stored as `{ findingId, attributes? }` on `ExamSystemFinding.findings[]`.
 */

import type {
  GeneralExamFieldDef,
  GeneralExamFieldGroupDef,
} from "@/lib/cockpit/general-exam-finding-schema";

import type { ExamRemoteFeasibility } from "@/lib/cockpit/exam-schema";

export type CvsExamFieldDef = GeneralExamFieldDef;
export type CvsExamFieldGroupDef = GeneralExamFieldGroupDef;

export interface CvsExamFindingDef {
  findingId: string;
  label: string;
  subsectionId: string;
  fieldGroups?: readonly CvsExamFieldGroupDef[];
  fields: readonly CvsExamFieldDef[];
}

export interface CvsExamChipGroupDef {
  id: string;
  label: string;
  chips: readonly string[];
}

export interface CvsExamSubsectionDef {
  id: string;
  label: string;
  chips: readonly string[];
  chipGroups?: readonly CvsExamChipGroupDef[];
  structuredFindingIds: readonly string[];
  remote?: ExamRemoteFeasibility;
}

/** Flat chip list for a subsection (chipGroups or chips). */
export function listCvsSubsectionChips(subsection: CvsExamSubsectionDef): readonly string[] {
  if (subsection.chipGroups?.length) {
    return subsection.chipGroups.flatMap((group) => group.chips);
  }
  return subsection.chips;
}

export const CVS_STRUCTURED_FINDINGS: readonly CvsExamFindingDef[] = [
  {
    findingId: "pulse",
    label: "Pulse",
    subsectionId: "pulse",
    fields: [
      {
        key: "character",
        label: "Character",
        type: "chips",
        chips: [
          "Collapsing",
          "Slow-rising",
          "Bisferiens",
          "Thready",
          "Pulsus alternans",
          "Dicrotic",
        ],
      },
      {
        key: "volume",
        label: "Volume",
        type: "chips",
        chips: ["Low", "Normal", "Bounding"],
      },
    ],
  },
  {
    findingId: "apex_beat",
    label: "Apex beat",
    subsectionId: "precordium",
    fields: [
      {
        key: "position",
        label: "Position",
        type: "chips",
        chips: ["Normal", "Displaced"],
      },
      {
        key: "character",
        label: "Character",
        type: "chips",
        chips: ["Tapping", "Heaving", "Thrusting", "Diffuse", "Double impulse"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "gallop",
    label: "Gallop",
    subsectionId: "auscultation",
    fields: [
      {
        key: "type",
        label: "Type",
        type: "chips",
        chips: ["S3", "S4"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "murmur",
    label: "Murmur",
    subsectionId: "auscultation",
    fields: [
      {
        key: "timing",
        label: "Timing",
        type: "chips",
        chips: ["Systolic", "Diastolic", "Continuous"],
      },
      {
        key: "grade",
        label: "Grade",
        type: "chips",
        chips: ["1/6", "2/6", "3/6", "4/6", "5/6", "6/6"],
      },
      {
        key: "area",
        label: "Area",
        type: "chips",
        chips: ["Mitral", "Aortic", "Pulmonary", "Tricuspid", "Erb's point"],
      },
      {
        key: "radiation",
        label: "Radiation",
        type: "chips",
        multi: true,
        chips: ["None", "Axilla", "Carotids", "Back", "Neck"],
      },
      {
        key: "character",
        label: "Character",
        type: "chips",
        chips: ["Ejection", "Pansystolic", "Early diastolic", "Mid-diastolic", "Holosystolic"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "jvp_raised",
    label: "JVP raised",
    subsectionId: "jvp",
    fields: [
      {
        key: "heightCm",
        label: "Height (cm above sternal angle)",
        type: "text",
        placeholder: "e.g. 4",
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
] as const;

export const CVS_EXAM_SUBSECTIONS: readonly CvsExamSubsectionDef[] = [
  {
    id: "inspection",
    label: "Inspection",
    chips: ["Visible pulsations", "Sternotomy scar", "Thoracotomy scar", "Pacemaker/device"],
    structuredFindingIds: [],
  },
  {
    id: "pulse",
    label: "Pulse",
    chips: [],
    chipGroups: [
      {
        id: "peripheral",
        label: "Peripheral / large vessel",
        chips: ["Radio-radial delay", "Radio-femoral delay", "Weak or absent pulses"],
      },
    ],
    structuredFindingIds: ["pulse"],
  },
  {
    id: "precordium",
    label: "Precordium",
    remote: "in_person_only",
    chips: [],
    chipGroups: [
      {
        id: "palpation",
        label: "Palpation",
        chips: ["Parasternal heave", "Thrills", "Palpable P2"],
      },
    ],
    structuredFindingIds: ["apex_beat"],
  },
  {
    id: "auscultation",
    label: "Auscultation",
    remote: "in_person_only",
    chips: [],
    chipGroups: [
      {
        id: "s1_s2",
        label: "S1 / S2",
        chips: [
          "Loud S1",
          "Soft S1",
          "Variable S1",
          "Wide split S2",
          "Fixed split S2",
          "Paradoxical split",
          "Loud P2",
          "Soft/absent S2",
        ],
      },
      {
        id: "added_sounds",
        label: "Added sounds / rubs",
        chips: ["Muffled HS", "Pericardial rub", "Opening snap", "Ejection click"],
      },
    ],
    structuredFindingIds: ["gallop", "murmur"],
  },
  {
    id: "jvp",
    label: "JVP",
    remote: "in_person_only",
    chips: [],
    structuredFindingIds: ["jvp_raised"],
  },
] as const;

const CVS_FINDING_BY_ID = new Map(CVS_STRUCTURED_FINDINGS.map((f) => [f.findingId, f]));

export function resolveCvsExamFinding(findingId: string): CvsExamFindingDef | undefined {
  return CVS_FINDING_BY_ID.get(findingId.trim());
}

export function listCvsStructuredFindingsForSubsection(
  subsectionId: string,
): CvsExamFindingDef[] {
  return CVS_STRUCTURED_FINDINGS.filter((f) => f.subsectionId === subsectionId);
}

export const CVS_STRUCTURED_FINDING_ORDER = CVS_STRUCTURED_FINDINGS.map((f) => f.findingId);

/** Reserved finding row for the Inspection subsection free-text notes field. */
export const CVS_INSPECTION_NOTES_FINDING_ID = "inspection_notes";

/** Auscultation chip-group cards: reserved notes rows keyed by chip group id. */
export const CVS_AUSCULTATION_CHIP_GROUP_NOTES = [
  {
    groupId: "s1_s2",
    findingId: "auscultation_s1_s2_notes",
    label: "S1 / S2",
  },
  {
    groupId: "added_sounds",
    findingId: "auscultation_added_sounds_notes",
    label: "Added sounds / rubs",
  },
] as const;

const CVS_AUSCULTATION_CHIP_GROUP_NOTES_BY_GROUP_ID = new Map(
  CVS_AUSCULTATION_CHIP_GROUP_NOTES.map((row) => [row.groupId, row]),
);

const CVS_AUSCULTATION_CHIP_GROUP_NOTES_BY_FINDING_ID = new Map(
  CVS_AUSCULTATION_CHIP_GROUP_NOTES.map((row) => [row.findingId, row]),
);

export function resolveCvsAuscultationChipGroupNotesMeta(groupId: string) {
  return CVS_AUSCULTATION_CHIP_GROUP_NOTES_BY_GROUP_ID.get(
    groupId as (typeof CVS_AUSCULTATION_CHIP_GROUP_NOTES)[number]["groupId"],
  );
}

export function resolveCvsAuscultationChipGroupNotesByFindingId(findingId: string) {
  return CVS_AUSCULTATION_CHIP_GROUP_NOTES_BY_FINDING_ID.get(
    findingId as (typeof CVS_AUSCULTATION_CHIP_GROUP_NOTES)[number]["findingId"],
  );
}

/** Scroll / expand id for an auscultation chip-group card. */
export function cvsAuscultationChipGroupCardId(groupId: string): string {
  return `auscultation-${groupId}`;
}

/** Scroll target key for a Cardiovascular subsection (`cvs-<subsectionId>`). */
export function cvsSubsectionScrollKey(subsectionId: string): string {
  return `cvs-${subsectionId}`;
}

/** Scroll target for the Cardiovascular Auscultation IPPA subsection. */
export const CVS_AUSCULTATION_SUBSECTION_SCROLL_KEY = "cvs-auscultation";

/** Whether a collapsible card id belongs to the CVS Auscultation subsection. */
export function isCvsAuscultationExpandableCardId(cardId: string): boolean {
  if (listCvsStructuredFindingsForSubsection("auscultation").some((f) => f.findingId === cardId)) {
    return true;
  }
  return cardId.startsWith("auscultation-");
}

/** Structured CVS findings rendered inline (no collapsible card) within their subsection. */
export const CVS_INLINE_STRUCTURED_FINDING_IDS = new Set(["pulse", "apex_beat", "jvp_raised"]);

/** Inline findings whose notes field is rendered at subsection level instead. */
export const CVS_SUBSECTION_NOTES_FINDING_IDS = new Set(["apex_beat", "jvp_raised"]);

/** Chip labels for structured findings (catalog / legacy hydrate). */
export const CVS_STRUCTURED_CHIP_LABELS: Record<string, string> = {
  pulse: "Pulse",
  apex_beat: "Apex beat",
  murmur: "Murmur",
  gallop: "Gallop",
  jvp_raised: "JVP raised",
};
