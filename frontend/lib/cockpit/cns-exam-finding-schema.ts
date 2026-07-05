/**
 * CNS / Neuro structured finding registry.
 *
 * Conventional documented neuro-exam order: Mental status → Speech & language →
 * Cranial nerves → Motor → Reflexes → Sensory → Coordination → Gait & stance →
 * Meningeal / nerve-root signs → Autonomic. Common findings surface as quick
 * chips; depth lives in structured cards (function-grouped cranial-nerve cards,
 * per-limb power, deep-tendon-reflex grid, etc.). Stored as
 * `{ findingId, attributes? }` on `ExamSystemFinding.findings[]`.
 *
 * GCS and pupil size are NOT modelled here — they are surfaced in the card but
 * bound to the canonical vitals fields (`vitalsGcs*`, `vitalsPupilSize*Mm`).
 */

import type {
  GeneralExamFieldDef,
  GeneralExamFieldGroupDef,
} from "@/lib/cockpit/general-exam-finding-schema";

import type { ExamRemoteFeasibility } from "@/lib/cockpit/exam-schema";

export type CnsExamFieldDef = GeneralExamFieldDef;
export type CnsExamFieldGroupDef = GeneralExamFieldGroupDef;

export interface CnsExamFindingDef {
  findingId: string;
  label: string;
  subsectionId: string;
  fieldGroups?: readonly CnsExamFieldGroupDef[];
  fields: readonly CnsExamFieldDef[];
}

export interface CnsExamSubsectionDef {
  id: string;
  label: string;
  chips: readonly string[];
  structuredFindingIds: readonly string[];
  remote?: ExamRemoteFeasibility;
}

/** Flat chip list for a subsection. */
export function listCnsSubsectionChips(subsection: CnsExamSubsectionDef): readonly string[] {
  return subsection.chips;
}

export {
  CNS_CRANIAL_CHIP_TELECONSULT_HINTS,
  CNS_CRANIAL_IN_PERSON_ONLY_CHIPS,
  CNS_CRANIAL_STRUCTURED_TELECONSULT_HINTS,
  CNS_CRANIAL_TELECONSULT_SECTION_NOTE,
  isCnsCranialChipInPersonOnly,
  resolveCnsCranialChipTeleconsultHint,
  resolveCnsCranialStructuredTeleconsultHint,
} from "@/lib/cockpit/exam-teleconsult-item-hints";

/** Laterality palette shared by localizable neuro findings. */
const SIDE_CHIPS = ["Left", "Right", "Bilateral"] as const;

/** MRC power grades 0–5. */
const MRC_POWER_CHIPS = ["0/5", "1/5", "2/5", "3/5", "4/5", "5/5"] as const;

/** Deep-tendon reflex grades. */
const DTR_GRADE_CHIPS = ["0", "1+", "2+", "3+", "4+"] as const;

export const CNS_STRUCTURED_FINDINGS: readonly CnsExamFindingDef[] = [
  // --- Mental status ---
  {
    findingId: "cognitive_screen",
    label: "Cognitive screen",
    subsectionId: "mental",
    fields: [
      { key: "tool", label: "Tool", type: "chips", chips: ["MMSE", "MoCA", "AMT", "MMSE/MoCA"] },
      { key: "score", label: "Score", type: "text", placeholder: "e.g. 24/30" },
      {
        key: "domains",
        label: "Domains affected",
        type: "chips",
        multi: true,
        chips: ["Orientation", "Attention", "Memory", "Language", "Visuospatial", "Executive"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  // --- Cranial nerves (function-grouped) ---
  {
    findingId: "cn_vision",
    label: "Vision (CN II)",
    subsectionId: "cranial",
    fields: [
      {
        key: "acuity",
        label: "Acuity",
        type: "chips",
        chips: ["Reduced", "Counting fingers", "Perception of light", "Blind"],
      },
      {
        key: "field",
        label: "Field defect",
        type: "chips",
        chips: ["Hemianopia", "Quadrantanopia", "Central scotoma", "Tunnel"],
      },
      { key: "rapd", label: "RAPD", type: "chips", chips: ["Present"] },
      {
        key: "fundus",
        label: "Fundus",
        type: "chips",
        chips: ["Papilledema", "Optic atrophy", "Pale disc"],
      },
      { key: "side", label: "Side", type: "chips", chips: SIDE_CHIPS },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "cn_eom_pupils",
    label: "Eye movements & pupils (CN III/IV/VI)",
    subsectionId: "cranial",
    fields: [
      {
        key: "ophthalmoplegia",
        label: "Restricted gaze",
        type: "chips",
        multi: true,
        chips: ["Up", "Down", "Lateral", "Medial", "Complete"],
      },
      { key: "diplopia", label: "Diplopia", type: "chips", chips: ["Present"] },
      { key: "ptosis", label: "Ptosis", type: "chips", chips: ["Present"] },
      {
        key: "pupil",
        label: "Pupil",
        type: "chips",
        chips: ["Dilated", "Constricted", "Sluggish", "Fixed", "Irregular"],
      },
      { key: "side", label: "Side", type: "chips", chips: SIDE_CHIPS },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "cn_trigeminal",
    label: "Trigeminal (CN V)",
    subsectionId: "cranial",
    fields: [
      {
        key: "sensory",
        label: "Sensory loss",
        type: "chips",
        multi: true,
        chips: ["V1", "V2", "V3"],
      },
      { key: "corneal", label: "Corneal reflex", type: "chips", chips: ["Reduced", "Absent"] },
      {
        key: "motor",
        label: "Motor",
        type: "chips",
        chips: ["Jaw deviation", "Masseter weakness"],
      },
      { key: "jaw_jerk", label: "Jaw jerk", type: "chips", chips: ["Brisk"] },
      { key: "side", label: "Side", type: "chips", chips: SIDE_CHIPS },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "cn_facial",
    label: "Facial (CN VII)",
    subsectionId: "cranial",
    fields: [
      {
        key: "pattern",
        label: "Pattern",
        type: "chips",
        chips: ["UMN (forehead spared)", "LMN (whole side)"],
      },
      { key: "taste", label: "Taste", type: "chips", chips: ["Reduced (anterior 2/3)"] },
      { key: "other", label: "Other", type: "chips", chips: ["Hyperacusis"] },
      { key: "side", label: "Side", type: "chips", chips: SIDE_CHIPS },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "cn_vestibulocochlear",
    label: "Hearing & balance (CN VIII)",
    subsectionId: "cranial",
    fields: [
      {
        key: "hearing",
        label: "Hearing loss",
        type: "chips",
        chips: ["Conductive", "Sensorineural"],
      },
      { key: "rinne_weber", label: "Rinne / Weber", type: "text", placeholder: "e.g. Weber → left" },
      {
        key: "vestibular",
        label: "Vestibular",
        type: "chips",
        multi: true,
        chips: ["Vertigo", "Nystagmus", "Tinnitus"],
      },
      { key: "side", label: "Side", type: "chips", chips: SIDE_CHIPS },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "cn_bulbar",
    label: "Bulbar (CN IX/X/XII)",
    subsectionId: "cranial",
    fields: [
      {
        key: "palate",
        label: "Palate / gag",
        type: "chips",
        multi: true,
        chips: ["Palatal deviation", "Absent gag"],
      },
      {
        key: "swallow_voice",
        label: "Swallow / voice",
        type: "chips",
        multi: true,
        chips: ["Dysphagia", "Dysphonia", "Nasal regurgitation"],
      },
      {
        key: "tongue",
        label: "Tongue",
        type: "chips",
        multi: true,
        chips: ["Deviation", "Wasting", "Fasciculation"],
      },
      { key: "side", label: "Side", type: "chips", chips: SIDE_CHIPS },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "cn_accessory",
    label: "Accessory (CN XI)",
    subsectionId: "cranial",
    fields: [
      {
        key: "muscles",
        label: "Weakness",
        type: "chips",
        multi: true,
        chips: ["SCM", "Trapezius"],
      },
      { key: "side", label: "Side", type: "chips", chips: SIDE_CHIPS },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  // --- Motor ---
  {
    findingId: "weakness",
    label: "Weakness / plegia",
    subsectionId: "motor",
    fields: [
      {
        key: "distribution",
        label: "Distribution",
        type: "chips",
        chips: [
          "Monoparesis",
          "Hemiparesis",
          "Paraparesis",
          "Quadriparesis",
          "Monoplegia",
          "Hemiplegia",
          "Paraplegia",
          "Quadriplegia",
          "Proximal",
          "Distal",
        ],
      },
      { key: "side", label: "Side", type: "chips", chips: SIDE_CHIPS },
      { key: "power", label: "Power (MRC)", type: "chips", chips: MRC_POWER_CHIPS },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  {
    findingId: "limb_power",
    label: "Power by limb (MRC)",
    subsectionId: "motor",
    fields: [
      { key: "rul", label: "Right upper limb", type: "chips", chips: MRC_POWER_CHIPS },
      { key: "lul", label: "Left upper limb", type: "chips", chips: MRC_POWER_CHIPS },
      { key: "rll", label: "Right lower limb", type: "chips", chips: MRC_POWER_CHIPS },
      { key: "lll", label: "Left lower limb", type: "chips", chips: MRC_POWER_CHIPS },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  // --- Reflexes ---
  {
    findingId: "deep_tendon_reflexes",
    label: "Deep tendon reflexes",
    subsectionId: "reflexes",
    fields: [
      { key: "biceps", label: "Biceps", type: "chips", chips: DTR_GRADE_CHIPS },
      { key: "triceps", label: "Triceps", type: "chips", chips: DTR_GRADE_CHIPS },
      { key: "supinator", label: "Supinator", type: "chips", chips: DTR_GRADE_CHIPS },
      { key: "knee", label: "Knee", type: "chips", chips: DTR_GRADE_CHIPS },
      { key: "ankle", label: "Ankle", type: "chips", chips: DTR_GRADE_CHIPS },
      {
        key: "plantar",
        label: "Plantar",
        type: "chips",
        chips: ["Flexor", "Extensor", "Equivocal", "Absent"],
      },
      { key: "side", label: "Side", type: "chips", chips: SIDE_CHIPS },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  // --- Sensory ---
  {
    findingId: "sensory_deficit",
    label: "Sensory deficit",
    subsectionId: "sensory",
    fields: [
      {
        key: "modality",
        label: "Modality",
        type: "chips",
        multi: true,
        chips: ["Light touch", "Pinprick", "Temperature", "Vibration", "Joint position sense"],
      },
      {
        key: "distribution",
        label: "Distribution",
        type: "chips",
        chips: ["Glove-and-stocking", "Dermatomal", "Hemisensory", "Below level", "Saddle"],
      },
      { key: "level", label: "Sensory level", type: "text", placeholder: "e.g. T4" },
      {
        key: "cortical",
        label: "Cortical",
        type: "chips",
        multi: true,
        chips: ["Stereognosis lost", "Graphesthesia lost", "Two-point ↑", "Inattention"],
      },
      { key: "side", label: "Side", type: "chips", chips: SIDE_CHIPS },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
  // --- Gait & stance ---
  {
    findingId: "gait",
    label: "Gait pattern",
    subsectionId: "gait",
    fields: [
      {
        key: "type",
        label: "Type",
        type: "chips",
        chips: [
          "Hemiplegic",
          "Spastic / scissoring",
          "Parkinsonian",
          "Steppage",
          "Waddling",
          "Antalgic",
          "Sensory ataxic",
          "Cerebellar ataxic",
          "Apraxic",
        ],
      },
      {
        key: "features",
        label: "Features",
        type: "chips",
        multi: true,
        chips: ["Wide-based", "Reduced arm swing", "Freezing", "Retropulsion", "Festination"],
      },
      {
        key: "aids",
        label: "Aids",
        type: "chips",
        chips: ["Uses stick", "Uses frame", "Unable to walk"],
      },
      { key: "notes", label: "Notes", type: "text", placeholder: "Optional detail" },
    ],
  },
] as const;

export const CNS_EXAM_SUBSECTIONS: readonly CnsExamSubsectionDef[] = [
  {
    id: "mental",
    label: "Mental status",
    chips: [
      "Drowsy",
      "Lethargic",
      "Stuporous",
      "Comatose",
      "Disoriented",
      "Confusion",
      "Memory impairment",
      "Inattention",
      "Poor insight / judgment",
      "Apraxia",
      "Agnosia",
      "Neglect",
      "Depressed affect",
      "Labile affect",
      "Agitation",
      "Apathy",
    ],
    structuredFindingIds: ["cognitive_screen"],
  },
  {
    id: "speech",
    label: "Speech & language",
    chips: [
      "Expressive aphasia",
      "Receptive aphasia",
      "Global aphasia",
      "Dysarthria",
      "Dysphonia",
      "Mutism",
      "Scanning speech",
      "Perseveration",
      "Anomia",
    ],
    structuredFindingIds: [],
  },
  {
    id: "cranial",
    label: "Cranial nerves",
    chips: [
      "Facial droop",
      "Ptosis",
      "Anisocoria",
      "Visual field defect",
      "Tongue deviation",
      "Anosmia",
      "Absent gag",
      "Hearing loss",
      "Horner's syndrome",
    ],
    structuredFindingIds: [
      "cn_vision",
      "cn_eom_pupils",
      "cn_trigeminal",
      "cn_facial",
      "cn_vestibulocochlear",
      "cn_bulbar",
      "cn_accessory",
    ],
  },
  {
    id: "motor",
    label: "Motor",
    chips: [
      "Hypertonia",
      "Hypotonia",
      "Spasticity",
      "Cogwheel rigidity",
      "Lead-pipe rigidity",
      "Paratonia",
      "Muscle wasting",
      "Pseudohypertrophy",
      "Fasciculations",
      "Pronator drift",
      "Resting tremor",
      "Intention tremor",
      "Chorea",
      "Athetosis",
      "Dystonia",
      "Myoclonus",
      "Tics",
      "Hemiballismus",
    ],
    structuredFindingIds: ["weakness", "limb_power"],
  },
  {
    id: "reflexes",
    label: "Reflexes",
    remote: "in_person_only",
    chips: [
      "Hyperreflexia",
      "Hyporeflexia",
      "Areflexia",
      "Clonus",
      "Extensor plantar (Babinski)",
      "Hoffmann's sign",
      "Grasp reflex",
      "Palmomental",
      "Glabellar (Myerson)",
      "Snout reflex",
      "Absent abdominal reflexes",
      "Absent anal wink",
    ],
    structuredFindingIds: ["deep_tendon_reflexes"],
  },
  {
    id: "sensory",
    label: "Sensory",
    remote: "in_person_only",
    chips: [
      "Paresthesia",
      "Numbness",
      "Saddle anesthesia",
      "Sensory inattention",
      "Stereognosis lost",
      "Graphesthesia lost",
    ],
    structuredFindingIds: ["sensory_deficit"],
  },
  {
    id: "coordination",
    label: "Coordination",
    chips: [
      "Finger-nose dysmetria",
      "Heel-shin ataxia",
      "Dysdiadochokinesia",
      "Past-pointing",
      "Rebound phenomenon",
      "Truncal ataxia",
      "Titubation",
    ],
    structuredFindingIds: [],
  },
  {
    id: "gait",
    label: "Gait & stance",
    chips: [
      "Romberg positive",
      "Tandem gait impaired",
      "Heel-walking impaired",
      "Toe-walking impaired",
      "Trendelenburg sign",
      "Wide-based gait",
    ],
    structuredFindingIds: ["gait"],
  },
  {
    id: "meningeal",
    label: "Meningeal & nerve-root signs",
    remote: "in_person_only",
    chips: [
      "Neck stiffness",
      "Kernig's sign",
      "Brudzinski's sign",
      "Jolt accentuation",
      "Photophobia",
      "SLR positive",
      "Femoral stretch positive",
      "Spurling's positive",
      "Lax anal tone",
    ],
    structuredFindingIds: [],
  },
  {
    id: "autonomic",
    label: "Autonomic",
    chips: [
      "Bladder dysfunction",
      "Bowel dysfunction",
      "Sphincter disturbance",
      "Postural symptoms",
      "Sweating abnormality",
      "Erectile dysfunction",
    ],
    structuredFindingIds: [],
  },
] as const;

const CNS_FINDING_BY_ID = new Map(CNS_STRUCTURED_FINDINGS.map((f) => [f.findingId, f]));

export function resolveCnsExamFinding(findingId: string): CnsExamFindingDef | undefined {
  return CNS_FINDING_BY_ID.get(findingId.trim());
}

export function listCnsStructuredFindingsForSubsection(
  subsectionId: string,
): CnsExamFindingDef[] {
  return CNS_STRUCTURED_FINDINGS.filter((f) => f.subsectionId === subsectionId);
}

export const CNS_STRUCTURED_FINDING_ORDER = CNS_STRUCTURED_FINDINGS.map((f) => f.findingId);

/** Subsection-level free-text notes rows (stored on `findings[]`). */
export const CNS_SUBSECTION_NOTES_FINDINGS = [
  { findingId: "cns_mental_notes", label: "Mental status" },
  { findingId: "cns_speech_notes", label: "Speech & language" },
  { findingId: "cns_cranial_notes", label: "Cranial nerves" },
  { findingId: "cns_motor_notes", label: "Motor" },
  { findingId: "cns_reflexes_notes", label: "Reflexes" },
  { findingId: "cns_sensory_notes", label: "Sensory" },
  { findingId: "cns_coordination_notes", label: "Coordination" },
  { findingId: "cns_gait_notes", label: "Gait & stance" },
  { findingId: "cns_meningeal_notes", label: "Meningeal & nerve-root signs" },
  { findingId: "cns_autonomic_notes", label: "Autonomic" },
] as const;

const CNS_SUBSECTION_NOTES_BY_SUBSECTION_ID: Record<string, string> = {
  mental: "cns_mental_notes",
  speech: "cns_speech_notes",
  cranial: "cns_cranial_notes",
  motor: "cns_motor_notes",
  reflexes: "cns_reflexes_notes",
  sensory: "cns_sensory_notes",
  coordination: "cns_coordination_notes",
  gait: "cns_gait_notes",
  meningeal: "cns_meningeal_notes",
  autonomic: "cns_autonomic_notes",
};

export function cnsSubsectionNotesFindingId(subsectionId: string): string | undefined {
  return CNS_SUBSECTION_NOTES_BY_SUBSECTION_ID[subsectionId];
}

const CNS_SUBSECTION_NOTES_BY_FINDING_ID = new Map(
  CNS_SUBSECTION_NOTES_FINDINGS.map((row) => [row.findingId, row.label]),
);

export function resolveCnsSubsectionNotesLabel(findingId: string): string | undefined {
  return CNS_SUBSECTION_NOTES_BY_FINDING_ID.get(
    findingId as (typeof CNS_SUBSECTION_NOTES_FINDINGS)[number]["findingId"],
  );
}

/** Scroll target key for a CNS subsection (`cns-<subsectionId>`). */
export function cnsSubsectionScrollKey(subsectionId: string): string {
  return `cns-${subsectionId}`;
}

/** Whether a subsection renders collapsible structured-finding cards. */
export function cnsSubsectionHasCards(subsection: CnsExamSubsectionDef): boolean {
  return subsection.structuredFindingIds.length > 0;
}

/**
 * The subsection scroll key a collapsible card belongs to, or null when the id is
 * not a structured-finding card (used to scroll the whole subsection on collapse).
 */
export function resolveCnsCardSubsectionScrollKey(cardId: string): string | null {
  const structured = resolveCnsExamFinding(cardId);
  if (structured) return cnsSubsectionScrollKey(structured.subsectionId);
  return null;
}

/** Chip labels for structured findings (catalog / legacy hydrate). */
export const CNS_STRUCTURED_CHIP_LABELS: Record<string, string> = Object.fromEntries(
  CNS_STRUCTURED_FINDINGS.map((f) => [f.findingId, f.label]),
);
