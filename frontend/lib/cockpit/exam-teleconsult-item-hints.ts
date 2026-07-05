/**
 * Per-chip / per-card teleconsult feasibility hints (tc-02 extension).
 *
 * Subsection-level `remote: "in_person_only"` covers IPPA contact sections.
 * This module covers **mixed** subsections: assessable overall, but individual
 * chips or structured cards need in-person examination or patient-assisted workarounds.
 */

export interface ExamTeleconsultChipFlags {
  hint: string;
  inPersonOnly?: boolean;
}

function chipKey(systemId: string, subsectionId: string, chipLabel: string): string {
  return `${systemId}:${subsectionId}:${chipLabel}`;
}

function structuredKey(systemId: string, findingId: string): string {
  return `${systemId}:${findingId}`;
}

function sectionKey(systemId: string, subsectionId: string): string {
  return `${systemId}:${subsectionId}`;
}

// --- Cranial nerves (CNS) ---

export const CNS_CRANIAL_CHIP_TELECONSULT_HINTS: Readonly<Record<string, string>> = {
  "Visual field defect":
    "Formal field testing is unreliable on teleconsult; use patient-reported symptoms or in-clinic perimetry if documented.",
  "Absent gag":
    "Needs pharyngeal stimulation — not feasible remotely; skip unless tested in clinic or clearly documented from an in-person visit.",
  "Hearing loss":
    "Subjective hearing loss can be noted on teleconsult; tuning-fork tests (Rinne/Weber) need in-person examination.",
  "Horner's syndrome":
    "Ptosis and miosis may be visible on teleconsult; anhidrosis and formal testing usually need in-person assessment.",
};

export const CNS_CRANIAL_IN_PERSON_ONLY_CHIPS: Readonly<Set<string>> = new Set([
  "Absent gag",
]);

export const CNS_CRANIAL_STRUCTURED_TELECONSULT_HINTS: Readonly<Record<string, string>> = {
  cn_vision:
    "Fundoscopy and RAPD need in-person examination; acuity and gross fields may be partially assessed on teleconsult.",
  cn_trigeminal:
    "Corneal reflex and jaw jerk need direct stimulation — not feasible remotely; facial sensory mapping is unreliable on teleconsult.",
  cn_vestibulocochlear:
    "Nystagmus and reported vertigo are assessable remotely; tuning-fork tests are in-person only.",
  cn_bulbar:
    "Gag reflex and palate movement often need in-person assessment; tongue and voice changes are observable on teleconsult.",
};

export const CNS_CRANIAL_TELECONSULT_SECTION_NOTE =
  "Many cranial signs are observable on teleconsult; flagged chips and cards below may need in-person examination or patient-assisted workarounds.";

// --- CNS motor ---

const CNS_MOTOR_IN_PERSON_TONE_CHIPS = [
  "Hypertonia",
  "Hypotonia",
  "Spasticity",
  "Cogwheel rigidity",
  "Lead-pipe rigidity",
  "Paratonia",
] as const;

const MOTOR_TONE_HINT =
  "Needs passive movement and tone assessment — not feasible remotely; skip unless examined in clinic.";

export const CNS_MOTOR_STRUCTURED_TELECONSULT_HINTS: Readonly<Record<string, string>> = {
  weakness:
    "Formal MRC grading against resistance is unreliable on teleconsult; gross weakness may be patient-guided if needed.",
  limb_power:
    "Per-limb MRC power needs resistance testing — unreliable on teleconsult; use only with clear patient-assisted grading.",
};

export const CNS_MOTOR_TELECONSULT_SECTION_NOTE =
  "Gross motor signs and movement disorders are observable on teleconsult; tone and formal power grading usually need in-person examination.";

// --- CVS pulse ---

const CVS_PULSE_PALPATION_HINT =
  "Needs direct pulse palpation — not feasible remotely; skip unless examined in clinic or clearly documented.";

export const CVS_PULSE_STRUCTURED_TELECONSULT_HINTS: Readonly<Record<string, string>> = {
  pulse:
    "Pulse rate and rhythm may be noted remotely; character and volume by palpation usually need in-person examination.",
};

export const CVS_PULSE_TELECONSULT_SECTION_NOTE =
  "Pulse rate and rhythm can be noted on teleconsult; palpation findings below usually need in-person examination.";

// --- General volume / peripheral ---

export const GENERAL_STRUCTURED_TELECONSULT_HINTS: Readonly<Record<string, string>> = {
  dehydration:
    "Reduced skin turgor and delayed cap refill need touch; dry mucosa and sunken eyes may be observable on teleconsult.",
  edema:
    "Pitting edema grading needs direct palpation — not feasible remotely; skip unless examined in clinic.",
  lymphadenopathy:
    "Lymph node size and consistency need palpation — not feasible remotely; skip unless examined in clinic.",
};

export const GENERAL_VOLUME_TELECONSULT_SECTION_NOTE =
  "Some dehydration and volume signs are observable on teleconsult; touch-dependent findings are flagged below.";
export const GENERAL_PERIPHERAL_TELECONSULT_SECTION_NOTE =
  "Clubbing may be visible on teleconsult; lymph node examination needs in-person palpation.";

// --- Lookup maps (built once) ---

const CHIP_FLAGS: Readonly<Record<string, ExamTeleconsultChipFlags>> = (() => {
  const out: Record<string, ExamTeleconsultChipFlags> = {};

  for (const [chip, hint] of Object.entries(CNS_CRANIAL_CHIP_TELECONSULT_HINTS)) {
    out[chipKey("cns", "cranial", chip)] = {
      hint,
      inPersonOnly: CNS_CRANIAL_IN_PERSON_ONLY_CHIPS.has(chip),
    };
  }

  for (const chip of CNS_MOTOR_IN_PERSON_TONE_CHIPS) {
    out[chipKey("cns", "motor", chip)] = { hint: MOTOR_TONE_HINT, inPersonOnly: true };
  }

  for (const chip of [
    "Radio-radial delay",
    "Radio-femoral delay",
    "Weak or absent pulses",
  ] as const) {
    out[chipKey("cvs", "pulse", chip)] = { hint: CVS_PULSE_PALPATION_HINT, inPersonOnly: true };
  }

  return out;
})();

const STRUCTURED_HINTS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    Object.entries(CNS_CRANIAL_STRUCTURED_TELECONSULT_HINTS).map(([id, hint]) => [
      structuredKey("cns", id),
      hint,
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(CNS_MOTOR_STRUCTURED_TELECONSULT_HINTS).map(([id, hint]) => [
      structuredKey("cns", id),
      hint,
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(CVS_PULSE_STRUCTURED_TELECONSULT_HINTS).map(([id, hint]) => [
      structuredKey("cvs", id),
      hint,
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(GENERAL_STRUCTURED_TELECONSULT_HINTS).map(([id, hint]) => [
      structuredKey("general", id),
      hint,
    ]),
  ),
};

const SECTION_NOTES: Readonly<Record<string, string>> = {
  [sectionKey("cns", "cranial")]: CNS_CRANIAL_TELECONSULT_SECTION_NOTE,
  [sectionKey("cns", "motor")]: CNS_MOTOR_TELECONSULT_SECTION_NOTE,
  [sectionKey("cvs", "pulse")]: CVS_PULSE_TELECONSULT_SECTION_NOTE,
  [sectionKey("general", "volume")]: GENERAL_VOLUME_TELECONSULT_SECTION_NOTE,
  [sectionKey("general", "peripheral")]: GENERAL_PERIPHERAL_TELECONSULT_SECTION_NOTE,
};

/** Resolve teleconsult chip flags for a quick chip in a mixed subsection. */
export function resolveExamChipTeleconsultFlags(
  systemId: string,
  subsectionId: string,
  chipLabel: string,
): ExamTeleconsultChipFlags | undefined {
  return CHIP_FLAGS[chipKey(systemId, subsectionId, chipLabel)];
}

/** Resolve teleconsult hint for a structured finding card (or inline block). */
export function resolveExamStructuredTeleconsultHint(
  systemId: string,
  findingId: string,
): string | undefined {
  return STRUCTURED_HINTS[structuredKey(systemId, findingId)];
}

/** Optional subsection banner when the subsection mixes remote and contact findings. */
export function resolveExamSubsectionTeleconsultNote(
  systemId: string,
  subsectionId: string,
): string | undefined {
  return SECTION_NOTES[sectionKey(systemId, subsectionId)];
}

// --- CNS cranial re-exports (backward compat for existing imports/tests) ---

export function resolveCnsCranialChipTeleconsultHint(chipLabel: string): string | undefined {
  return resolveExamChipTeleconsultFlags("cns", "cranial", chipLabel)?.hint;
}

export function isCnsCranialChipInPersonOnly(chipLabel: string): boolean {
  return Boolean(resolveExamChipTeleconsultFlags("cns", "cranial", chipLabel)?.inPersonOnly);
}

export function resolveCnsCranialStructuredTeleconsultHint(
  findingId: string,
): string | undefined {
  return resolveExamStructuredTeleconsultHint("cns", findingId);
}
