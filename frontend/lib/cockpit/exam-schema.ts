/**
 * Exam-system schema registry (objective-tab · obj-02, enriched obj-30).
 *
 * Pure data module — no React, no network, no side effects. Mirrors the
 * subjective `complaint-schema.ts` pattern (ST-D4): each core system carries
 * a label, a within-normal-limits one-liner, and its abnormal chip palette.
 *
 * obj-30 groups each system's abnormal chips into labelled **subsections**
 * (Inspection / Auscultation / …) so the card can render structured groups
 * instead of one flat wall. The grouping is **entry-time only**: chips stay
 * globally-unique strings and a system's selected chips are still stored as a
 * flat `findings: string[]` (OBJ-D1/OBJ-D2 unchanged — derivation joins them).
 * The chip vocabulary is UI guidance only; obj-01 Zod does not enforce it.
 *
 * Canonical systemId order is defined by `EXAM_CORE_SYSTEMS` array order and
 * exported as `EXAM_CORE_SYSTEM_ORDER` for obj-01 derivation + obj-03 render.
 */

/** Remote feasibility for a rendered exam subsection (teleconsult-exam · tc-01). */
export type ExamRemoteFeasibility = "assessable" | "in_person_only";

/** A labelled group of abnormal chips within one exam system (obj-30). */
export interface ExamSubsection {
  /** Stable slug, unique within the system (e.g. 'auscultation'). */
  id: string;
  label: string;
  /** Abnormal finding chips (tap-to-fill; flat `findings[]` on save). */
  chips: readonly string[];
  /**
   * Teleconsult feasibility — UI/derivation guidance only (tc-01).
   * Omitted subsections default to `assessable`.
   */
  remote?: ExamRemoteFeasibility;
}

/** One exam-system entry in the registry (core or resolver fallback). */
export interface ExamSystemDefinition {
  systemId: string;
  label: string;
  /** Within-normal-limits one-liner — filled by "mark normal" / normal toggle. */
  normalLine: string;
  /**
   * Teleconsult-scoped WNL line (tc-01). When absent, `teleconsultNormalLine()`
   * falls back to `normalLine`.
   */
  teleconsultNormalLine?: string;
  /** Abnormal finding chips, grouped into subsections (obj-30). */
  subsections: readonly ExamSubsection[];
}

/**
 * Ordered registry of the 5 core exam systems (P1 v1 scope — exam-catalog §A1).
 * Array order is the canonical derivation + render order contract.
 */
export const EXAM_CORE_SYSTEMS: readonly ExamSystemDefinition[] = [
  {
    systemId: "general",
    label: "General",
    normalLine: "Well appearing, not in distress",
    subsections: [
      { id: "demeanor", label: "Demeanor", chips: ["Distress"] },
      {
        id: "appearance",
        label: "Appearance",
        chips: ["Pallor", "Icterus", "Cyanosis", "Plethora"],
      },
      { id: "volume", label: "Volume", chips: ["Dehydration", "Edema"] },
      {
        id: "peripheral",
        label: "Peripheral",
        chips: ["Clubbing", "Lymphadenopathy"],
      },
      { id: "nutrition", label: "Nutrition", chips: ["Nutrition / habitus"] },
    ],
  },
  {
    systemId: "cvs",
    label: "Cardiovascular",
    normalLine: "S1 S2 normal, no murmur",
    teleconsultNormalLine: "No raised JVP or peripheral edema on inspection",
    subsections: [
      {
        id: "inspection",
        label: "Inspection",
        chips: ["Visible pulsations", "Sternotomy scar", "Thoracotomy scar", "Pacemaker/device"],
      },
      {
        id: "pulse",
        label: "Pulse",
        chips: ["Radio-radial delay", "Radio-femoral delay", "Weak or absent pulses"],
      },
      {
        id: "precordium",
        label: "Precordium",
        remote: "in_person_only",
        chips: ["Parasternal heave", "Thrills", "Palpable P2"],
      },
      {
        id: "auscultation",
        label: "Auscultation",
        remote: "in_person_only",
        chips: [
          "Loud S1",
          "Soft S1",
          "Variable S1",
          "Muffled HS",
          "Pericardial rub",
          "Opening snap",
          "Ejection click",
          "Wide split S2",
          "Fixed split S2",
          "Paradoxical split",
          "Loud P2",
          "Soft/absent S2",
          "Murmur",
          "Gallop",
        ],
      },
      { id: "jvp", label: "JVP", remote: "in_person_only", chips: ["JVP raised"] },
    ],
  },
  {
    systemId: "resp",
    label: "Respiratory",
    normalLine: "Bilateral air entry normal, no added sounds",
    teleconsultNormalLine: "No respiratory distress on inspection",
    subsections: [
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
      },
      {
        id: "auscultation",
        label: "Auscultation",
        remote: "in_person_only",
        chips: [
          "Wheeze",
          "Crackles",
          "Reduced AE",
          "Absent breath sounds",
          "Bronchial breathing",
          "Rhonchi",
          "Pleural rub",
          "Stridor",
        ],
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
      },
      {
        id: "percussion",
        label: "Percussion",
        remote: "in_person_only",
        chips: ["Dullness", "Hyperresonance"],
      },
    ],
  },
  {
    systemId: "abd",
    label: "Abdomen",
    normalLine: "Soft, non-tender, no organomegaly",
    teleconsultNormalLine: "No abdominal distension on inspection",
    subsections: [
      { id: "inspection", label: "Inspection", chips: ["Distension", "Scars"] },
      {
        id: "palpation",
        label: "Palpation",
        remote: "in_person_only",
        chips: ["Tenderness", "Guarding", "Rigidity", "Hepatosplenomegaly"],
      },
      {
        id: "other",
        label: "Other",
        remote: "in_person_only",
        chips: ["Shifting dullness", "Altered bowel sounds"],
      },
    ],
  },
  {
    systemId: "cns",
    label: "CNS / Neuro",
    normalLine: "Alert, oriented, no focal deficit",
    teleconsultNormalLine: "Alert and oriented on remote assessment",
    subsections: [
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
      },
    ],
  },
] as const;

/** Canonical systemId order — single source for derivation (obj-01) and cards (obj-03). */
export const EXAM_CORE_SYSTEM_ORDER: readonly string[] = EXAM_CORE_SYSTEMS.map(
  (s) => s.systemId,
);

/** Shared fallback body for unknown / future specialty systemIds. */
const DEFAULT_EXAM_SYSTEM_BODY = {
  normalLine: "Within normal limits",
  subsections: [
    {
      id: "findings",
      label: "Findings",
      chips: [
        "Tenderness",
        "Swelling",
        "Deformity",
        "Reduced function",
        "Abnormal appearance",
        "Other",
      ],
    },
  ],
} as const satisfies Pick<ExamSystemDefinition, "normalLine" | "subsections">;

const CORE_BY_ID = new Map(EXAM_CORE_SYSTEMS.map((s) => [s.systemId, s]));

/** Title-case a slug-style systemId for fallback labels (`msk` → `Msk`). */
function humanizeExamSystemId(systemId: string): string {
  const words = systemId
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.length > 0 ? words.join(" ") : systemId;
}

/**
 * Resolve a systemId to its registry entry, or an OLDCARTS-style generic
 * fallback for unknown / future custom systems — never throws.
 */
export function resolveExamSystem(systemId: string): ExamSystemDefinition {
  const trimmed = systemId.trim();
  const core = CORE_BY_ID.get(trimmed);
  if (core) return core;

  return {
    systemId: trimmed,
    label: humanizeExamSystemId(trimmed),
    normalLine: DEFAULT_EXAM_SYSTEM_BODY.normalLine,
    subsections: DEFAULT_EXAM_SYSTEM_BODY.subsections.map((s) => ({
      ...s,
      chips: [...s.chips],
    })),
  };
}

/** Return the ordered core exam systems (canonical registry list). */
export function listExamSystems(): readonly ExamSystemDefinition[] {
  return EXAM_CORE_SYSTEMS;
}

/** Flatten a system's subsection chips into a single ordered list (obj-30). */
export function listExamSystemChips(definition: ExamSystemDefinition): string[] {
  return definition.subsections.flatMap((subsection) => [...subsection.chips]);
}

/** Resolve effective remote feasibility for a subsection (default `assessable`). */
export function resolveSubsectionRemoteFeasibility(subsection: {
  remote?: ExamRemoteFeasibility;
}): ExamRemoteFeasibility {
  return subsection.remote ?? "assessable";
}

/** Filter subsections by resolved remote feasibility (tc-02 consumer). */
export function listSubsectionsByFeasibility<T extends { remote?: ExamRemoteFeasibility }>(
  subsections: readonly T[],
  feasibility: ExamRemoteFeasibility,
): T[] {
  return subsections.filter(
    (subsection) => resolveSubsectionRemoteFeasibility(subsection) === feasibility,
  );
}

/**
 * One-line teleconsult hint for an `in_person_only` subsection header (shown on
 * the "In-person only" tag). Keyed by subsection id — not per finding chip.
 */
export const IN_PERSON_SUBSECTION_REMOTE_HINTS: Readonly<Record<string, string>> = {
  auscultation:
    "Needs a stethoscope — not reliable on teleconsult alone; use a digital stethoscope or ask the patient to describe breath sounds.",
  palpation:
    "Needs hands-on palpation — not feasible remotely; you may guide patient-assisted self-palpation if needed.",
  percussion:
    "Needs manual percussion — not feasible remotely; skip unless examined in person today.",
  precordium:
    "Needs chest palpation (apex beat, heave, thrills) — not reliable on teleconsult; skip or note if already examined in clinic.",
  jvp:
    "Needs neck examination at ~45° with proper lighting — hard to assess on teleconsult; skip unless clearly visible.",
  reflexes:
    "Needs a reflex hammer and direct stimulation — not feasible remotely; skip unless tested in clinic.",
  sensory:
    "Needs pinprick/light-touch mapping — unreliable on teleconsult; you may ask the patient to compare sides if needed.",
  meningeal:
    "Often needs assisted positioning (e.g. SLR, neck flexion) — expand only if you guided the patient on teleconsult.",
  other:
    "Includes percussion (e.g. shifting dullness) and detailed auscultation — not feasible remotely; skip unless patient-assisted or in-clinic data applies.",
};

export const IN_PERSON_SUBSECTION_REMOTE_HINT_FALLBACK =
  "Not reliably assessable on teleconsultation; expand only if you used a remote workaround or in-clinic findings.";

/** Resolve the teleconsult hint for an in-person-only subsection id. */
export function resolveInPersonSubsectionRemoteHint(subsectionId: string): string {
  return (
    IN_PERSON_SUBSECTION_REMOTE_HINTS[subsectionId] ?? IN_PERSON_SUBSECTION_REMOTE_HINT_FALLBACK
  );
}

/**
 * Teleconsult-scoped WNL line for a system (tc-01 / tc-03).
 * Falls back to the in-clinic `normalLine` when no teleconsult line is defined.
 */
export function teleconsultNormalLine(systemId: string): string {
  const def = resolveExamSystem(systemId);
  return def.teleconsultNormalLine ?? def.normalLine;
}

/**
 * True when the appointment is a teleconsult (video / voice / text / unknown).
 * Only `in_clinic` is treated as not teleconsult — mirrors
 * `resolveDefaultMeasurementContext` (TC-D6).
 */
export function isTeleconsult(consultationType?: string | null): boolean {
  return consultationType !== "in_clinic";
}
