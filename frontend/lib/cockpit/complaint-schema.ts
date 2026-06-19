import type { Complaint, ComplaintCategory } from "@/types/prescription";

export type { ComplaintCategory } from "@/types/prescription";

export type ComplaintAttributeFieldType =
  | "text"
  | "severity"
  | "chips"
  | "duration"
  | "painscale"
  | "temperature";

export type ComplaintAttributeKey = Exclude<
  keyof Complaint,
  "id" | "name" | "associated" | "associatedComplaints"
>;

export interface ComplaintAttributeFieldDef {
  key: ComplaintAttributeKey;
  label: string;
  type: ComplaintAttributeFieldType;
  placeholder?: string;
  /** Chip palette for `type: "chips"` (tap-to-fill; free-text escape hatch stays). */
  chips?: string[];
}

/** Fields commonly shared across category schemas — preserved on re-resolve (ST-D4). */
export const COMPLAINT_SHARED_FIELD_KEYS: readonly ComplaintAttributeKey[] = [
  "duration",
  "severity",
  "onset",
  "notes",
];

/**
 * Universal fields shown in the card's "quick row" (top of every card,
 * regardless of category) and therefore excluded from the per-category list.
 */
/** Inline on the collapsed card header — severity lives in row 2 / expanded body. */
export const COMPLAINT_QUICK_FIELD_KEYS: readonly ComplaintAttributeKey[] = ["duration"];

const DURATION_CHIPS = ["Today", "2d", "1wk", ">1mo"] as const;

/** Patient-language onset chips (pain family + GIT + OLDCARTS). */
export const ONSET_CHIPS = ["Sudden", "Gradual"] as const;

/** Patient-language pain / headache pattern chips (stored value = chip label). */
export const PAIN_PATTERN_CHIPS = [
  "Constant",
  "Comes and goes",
  "Morning",
  "Night",
] as const;

export const HEADACHE_PATTERN_CHIPS = [...PAIN_PATTERN_CHIPS, "On waking"] as const;

export const HEADACHE_SIDE_CHIPS = [
  "Left",
  "Right",
  "Both sides",
  "Whole head",
] as const;

export const HEADACHE_LOCATION_CHIPS = [
  "Forehead",
  "Temple",
  "Back of head",
  "Top of head",
  "Behind eye",
] as const;

export const HEADACHE_CHARACTER_CHIPS = [
  "Throbbing",
  "Dull",
  "Sharp",
  "Pressure / tight band",
] as const;

export const HEADACHE_RADIATION_CHIPS = [
  "Neck",
  "Jaw",
  "Behind eye",
  "Shoulder",
  "None",
] as const;

/** Chest pain — where in chest (stored on `laterality`). */
export const CHEST_LOCATION_CHIPS = [
  "Behind breastbone",
  "Left side",
  "Right side",
  "Upper chest",
  "Lower chest",
  "Diffuse",
] as const;

export const CHEST_CHARACTER_CHIPS = [
  "Pressure / heaviness",
  "Tight / squeezing",
  "Sharp / stabbing",
  "Burning",
  "Aching",
] as const;

export const CHEST_WHEN_CHIPS = [
  "On exertion",
  "At rest",
  "When lying down",
  "Comes and goes",
  "Constant",
] as const;

export const CHEST_WORSENED_BY_CHIPS = [
  "Exertion",
  "Deep breath",
  "Movement",
  "Lying flat",
  "Eating",
] as const;

export const CHEST_RELIEVED_BY_CHIPS = [
  "Rest",
  "Sitting up",
  "Antacid",
  "After food",
] as const;

/** Body-part-aware radiation chips for pain cards (stored value = chip label). */
export const CHEST_RADIATION_CHIPS = [
  "Left arm",
  "Jaw",
  "Back",
  "Neck",
  "Both arms",
  "Shoulder",
  "None",
] as const;

export const ABDOMEN_RADIATION_CHIPS = [
  "Back",
  "Groin",
  "Right shoulder",
  "Around the sides",
  "None",
] as const;

export const LOIN_RADIATION_CHIPS = ["Groin", "Genitals", "Front", "None"] as const;

export const BACK_RADIATION_CHIPS = ["Down the leg", "Buttock", "Both legs", "None"] as const;

export const NECK_RADIATION_CHIPS = ["Arm", "Shoulder", "Up to head", "None"] as const;

export const SHOULDER_RADIATION_CHIPS = ["Down the arm", "Neck", "None"] as const;

export const LIMB_RADIATION_CHIPS = ["Up the limb", "Down the limb", "None"] as const;

export const HEADACHE_ASSOCIATED_CHIPS = [
  "nausea",
  "vomiting",
  "light hurts",
  "sound hurts",
  "vision changes",
  "giddiness",
] as const;

const LEGACY_ONSET_TO_PATIENT: Record<string, (typeof ONSET_CHIPS)[number]> = {
  sudden: "Sudden",
  acute: "Sudden",
  gradual: "Gradual",
  insidious: "Gradual",
};

const LEGACY_PAIN_TIMING_TO_PATIENT: Record<string, string> = {
  constant: "Constant",
  intermittent: "Comes and goes",
  morning: "Morning",
  night: "Night",
  "on waking": "On waking",
};

const LEGACY_HEADACHE_SIDE_TO_PATIENT: Record<string, string> = {
  "band-like": "Whole head",
  "shifts sides": "Both sides",
};

const LEGACY_HEADACHE_LOCATION_TO_PATIENT: Record<string, string> = {
  frontal: "Forehead",
  temporal: "Temple",
  occipital: "Back of head",
  vertex: "Top of head",
  "behind eye": "Behind eye",
  neck: "Neck",
};

const LEGACY_HEADACHE_CHARACTER_TO_PATIENT: Record<string, string> = {
  throbbing: "Throbbing",
  pounding: "Throbbing",
  dull: "Dull",
  sharp: "Sharp",
  pressure: "Pressure / tight band",
  "band-like": "Pressure / tight band",
};

const LEGACY_HEADACHE_RADIATION_TO_PATIENT: Record<string, string> = {
  neck: "Neck",
  eye: "Behind eye",
  jaw: "Jaw",
  shoulder: "Shoulder",
  none: "None",
};

const LEGACY_CHEST_LOCATION_TO_PATIENT: Record<string, string> = {
  central: "Behind breastbone",
  centre: "Behind breastbone",
  center: "Behind breastbone",
  middle: "Behind breastbone",
  retrosternal: "Behind breastbone",
  left: "Left side",
  right: "Right side",
  upper: "Upper chest",
  lower: "Lower chest",
  diffuse: "Diffuse",
};

const LEGACY_CHEST_CHARACTER_TO_PATIENT: Record<string, string> = {
  pressure: "Pressure / heaviness",
  heaviness: "Pressure / heaviness",
  heavy: "Pressure / heaviness",
  crushing: "Tight / squeezing",
  squeezing: "Tight / squeezing",
  tight: "Tight / squeezing",
  tightness: "Tight / squeezing",
  sharp: "Sharp / stabbing",
  stabbing: "Sharp / stabbing",
  burning: "Burning",
  dull: "Aching",
  aching: "Aching",
  ache: "Aching",
  throbbing: "Aching",
};

const LEGACY_CHEST_WHEN_TO_PATIENT: Record<string, string> = {
  exertion: "On exertion",
  "on exertion": "On exertion",
  "on walking": "On exertion",
  walking: "On exertion",
  "at rest": "At rest",
  rest: "At rest",
  "lying down": "When lying down",
  "on lying down": "When lying down",
  "when lying down": "When lying down",
  intermittent: "Comes and goes",
  "comes and goes": "Comes and goes",
  constant: "Constant",
  continuous: "Constant",
};

const LEGACY_CHEST_WORSENED_TO_PATIENT: Record<string, string> = {
  exertion: "Exertion",
  walking: "Exertion",
  "deep breath": "Deep breath",
  breathing: "Deep breath",
  movement: "Movement",
  turning: "Movement",
  "lying flat": "Lying flat",
  eating: "Eating",
};

const LEGACY_CHEST_RELIEVED_TO_PATIENT: Record<string, string> = {
  rest: "Rest",
  "sitting up": "Sitting up",
  antacid: "Antacid",
  "after food": "After food",
  food: "After food",
};

/** Free-text / legacy medical tokens → patient-language onset. */
export const ONSET_PARSE_ALIASES: ReadonlyArray<{
  re: RegExp;
  value: (typeof ONSET_CHIPS)[number];
}> = [
  { re: /\bacute\b/, value: "Sudden" },
  { re: /\bsudden\b/, value: "Sudden" },
  { re: /\binsidious\b/, value: "Gradual" },
  { re: /\bgradual\b/, value: "Gradual" },
];

/** Free-text / legacy anatomical tokens → patient-language head region. */
export const HEADACHE_LOCATION_PARSE_ALIASES: ReadonlyArray<{
  re: RegExp;
  value: (typeof HEADACHE_LOCATION_CHIPS)[number];
}> = [
  { re: /\bfrontal\b/, value: "Forehead" },
  { re: /\btemporal\b/, value: "Temple" },
  { re: /\boccipital\b/, value: "Back of head" },
  { re: /\bvertex\b/, value: "Top of head" },
  { re: /\bbehind\s+(?:the\s+)?eye\b/, value: "Behind eye" },
];

/** Free-text / legacy tokens → chest pain location (laterality field). */
export const CHEST_LOCATION_PARSE_ALIASES: ReadonlyArray<{
  re: RegExp;
  value: (typeof CHEST_LOCATION_CHIPS)[number];
}> = [
  { re: /\bbehind\s+(?:the\s+)?breast\s*bone\b/, value: "Behind breastbone" },
  { re: /\bretrosternal\b/, value: "Behind breastbone" },
  { re: /\bmiddle\s+of\s+(?:the\s+)?chest\b/, value: "Behind breastbone" },
  { re: /\bcentral\s+chest\b/, value: "Behind breastbone" },
  { re: /\bupper\s+chest\b/, value: "Upper chest" },
  { re: /\blower\s+chest\b/, value: "Lower chest" },
  { re: /\bleft\s+(?:side|chest)\b/, value: "Left side" },
  { re: /\bright\s+(?:side|chest)\b/, value: "Right side" },
  { re: /\bdiffuse\b/, value: "Diffuse" },
];

/** Free-text / legacy tokens → chest pain when (timing field). */
export const CHEST_WHEN_PARSE_ALIASES: ReadonlyArray<{
  re: RegExp;
  value: (typeof CHEST_WHEN_CHIPS)[number];
}> = [
  { re: /\bon\s+exertion\b/, value: "On exertion" },
  { re: /\bwith\s+exertion\b/, value: "On exertion" },
  { re: /\bwhile\s+walking\b/, value: "On exertion" },
  { re: /\bat\s+rest\b/, value: "At rest" },
  { re: /\bwhen\s+lying\s+down\b/, value: "When lying down" },
  { re: /\bon\s+lying\s+down\b/, value: "When lying down" },
  { re: /\blying\s+down\b/, value: "When lying down" },
  { re: /\bcomes\s+and\s+goes\b/, value: "Comes and goes" },
  { re: /\bintermittent\b/, value: "Comes and goes" },
  { re: /\bconstant\b/, value: "Constant" },
  { re: /\bcontinuous\b/, value: "Constant" },
];

/** Free-text / legacy tokens → patient-language pain timing (not fever-specific). */
export const PAIN_TIMING_PARSE_ALIASES: ReadonlyArray<{
  re: RegExp;
  value: string;
}> = [
  { re: /\bcomes\s+and\s+goes\b/, value: "Comes and goes" },
  { re: /\bintermittent\b/, value: "Comes and goes" },
  { re: /\bconstant\b/, value: "Constant" },
  { re: /\bcontinuous\b/, value: "Constant" },
  { re: /\bon\s+waking\b/, value: "On waking" },
  { re: /\bmorning\b/, value: "Morning" },
  { re: /\bnight\b/, value: "Night" },
];

function canonicalizeChipValue(
  value: string | null | undefined,
  chips: readonly string[] | undefined,
  legacyMap?: Record<string, string>,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const legacy = legacyMap?.[trimmed.toLowerCase()];
  if (legacy) return legacy;
  const match = chips?.find((chip) => chip.toLowerCase() === trimmed.toLowerCase());
  return match ?? trimmed;
}

export function normalizeOnsetValue(onset: string | null | undefined): string | undefined {
  return canonicalizeChipValue(onset, ONSET_CHIPS, LEGACY_ONSET_TO_PATIENT);
}

export function normalizePainTimingValue(
  timing: string | null | undefined,
): string | undefined {
  return canonicalizeChipValue(timing, PAIN_PATTERN_CHIPS, LEGACY_PAIN_TIMING_TO_PATIENT);
}

export function isHeadacheSchema(
  fields: readonly ComplaintAttributeFieldDef[],
): boolean {
  return fields.some(
    (f) => f.key === "laterality" && f.label === "Side" && f.type === "chips",
  );
}

export function isChestPainSchema(
  fields: readonly ComplaintAttributeFieldDef[],
): boolean {
  return fields.some(
    (f) => f.key === "laterality" && f.label === "Where in chest" && f.type === "chips",
  );
}

export function isChestPainWhenField(
  fields: readonly ComplaintAttributeFieldDef[],
): boolean {
  const timing = fields.find((f) => f.key === "timing" && f.type === "chips");
  return Boolean(timing?.chips?.includes(CHEST_WHEN_CHIPS[0]));
}

export function isPainPatternTimingField(
  fields: readonly ComplaintAttributeFieldDef[],
): boolean {
  const timing = fields.find((f) => f.key === "timing" && f.type === "chips");
  if (!timing?.chips?.length) return false;
  if (isFeverComplaintTimingField(fields)) return false;
  if (isChestPainWhenField(fields)) return false;
  return timing.chips.includes(PAIN_PATTERN_CHIPS[1]);
}

export function normalizeHeadacheLateralityValue(
  value: string | null | undefined,
): string | undefined {
  return canonicalizeChipValue(value, HEADACHE_SIDE_CHIPS, LEGACY_HEADACHE_SIDE_TO_PATIENT);
}

export function normalizeHeadacheLocationValue(
  value: string | null | undefined,
): string | undefined {
  const normalized = canonicalizeChipValue(
    value,
    HEADACHE_LOCATION_CHIPS,
    LEGACY_HEADACHE_LOCATION_TO_PATIENT,
  );
  if (normalized?.toLowerCase() === "neck") return undefined;
  return normalized;
}

export function normalizeHeadacheCharacterValue(
  value: string | null | undefined,
): string | undefined {
  return canonicalizeChipValue(
    value,
    HEADACHE_CHARACTER_CHIPS,
    LEGACY_HEADACHE_CHARACTER_TO_PATIENT,
  );
}

export function normalizeHeadacheRadiationValue(
  value: string | null | undefined,
): string | undefined {
  return canonicalizeChipValue(
    value,
    HEADACHE_RADIATION_CHIPS,
    LEGACY_HEADACHE_RADIATION_TO_PATIENT,
  );
}

export function normalizeChestPainLocationValue(
  value: string | null | undefined,
): string | undefined {
  return canonicalizeChipValue(
    value,
    CHEST_LOCATION_CHIPS,
    LEGACY_CHEST_LOCATION_TO_PATIENT,
  );
}

export function normalizeChestPainCharacterValue(
  value: string | null | undefined,
): string | undefined {
  return canonicalizeChipValue(
    value,
    CHEST_CHARACTER_CHIPS,
    LEGACY_CHEST_CHARACTER_TO_PATIENT,
  );
}

export function normalizeChestPainWhenValue(
  value: string | null | undefined,
): string | undefined {
  return canonicalizeChipValue(value, CHEST_WHEN_CHIPS, LEGACY_CHEST_WHEN_TO_PATIENT);
}

export function normalizeChestPainRadiationValue(
  value: string | null | undefined,
): string | undefined {
  return canonicalizeChipValue(value, CHEST_RADIATION_CHIPS);
}

export function normalizeChestPainWorsenedValue(
  value: string | null | undefined,
): string | undefined {
  return canonicalizeChipValue(
    value,
    CHEST_WORSENED_BY_CHIPS,
    LEGACY_CHEST_WORSENED_TO_PATIENT,
  );
}

export function normalizeChestPainRelievedValue(
  value: string | null | undefined,
): string | undefined {
  return canonicalizeChipValue(
    value,
    CHEST_RELIEVED_BY_CHIPS,
    LEGACY_CHEST_RELIEVED_TO_PATIENT,
  );
}

/** Map legacy / free-text parsed chip values to patient language before commit. */
export function normalizeParsedComplaintPatch(
  patch: Partial<Pick<Complaint, ComplaintAttributeKey>>,
  fields: readonly ComplaintAttributeFieldDef[],
): Partial<Pick<Complaint, ComplaintAttributeKey>> {
  const next = { ...patch };
  if (next.onset) {
    next.onset = normalizeOnsetValue(next.onset);
  }
  if (next.timing) {
    if (isFeverComplaintTimingField(fields)) {
      next.timing = normalizeFeverTimingValue(next.timing);
    } else if (isChestPainWhenField(fields)) {
      next.timing = normalizeChestPainWhenValue(next.timing);
    } else if (isPainPatternTimingField(fields)) {
      const chips = fields.find((f) => f.key === "timing")?.chips;
      next.timing = canonicalizeChipValue(
        next.timing,
        chips,
        LEGACY_PAIN_TIMING_TO_PATIENT,
      );
    }
  }
  if (next.aggravating && isFeverComplaintChillsField(fields)) {
    next.aggravating = normalizeFeverChillsValue(next.aggravating);
  }
  if (isHeadacheSchema(fields)) {
    if (next.laterality) {
      next.laterality = normalizeHeadacheLateralityValue(next.laterality);
    }
    if (next.location) {
      next.location = normalizeHeadacheLocationValue(next.location);
    }
    if (next.character) {
      next.character = normalizeHeadacheCharacterValue(next.character);
    }
    if (next.radiation) {
      next.radiation = normalizeHeadacheRadiationValue(next.radiation);
    }
  } else if (isChestPainSchema(fields)) {
    if (next.laterality) {
      next.laterality = normalizeChestPainLocationValue(next.laterality);
    }
    if (next.character) {
      next.character = normalizeChestPainCharacterValue(next.character);
    }
    if (next.radiation) {
      next.radiation = normalizeChestPainRadiationValue(next.radiation);
    }
    if (next.aggravating) {
      next.aggravating = normalizeChestPainWorsenedValue(next.aggravating);
    }
    if (next.relieving) {
      next.relieving = normalizeChestPainRelievedValue(next.relieving);
    }
  } else if (next.radiation) {
    const radiationField = fields.find((f) => f.key === "radiation");
    if (radiationField?.type === "chips" && radiationField.chips?.length) {
      next.radiation = canonicalizeChipValue(next.radiation, radiationField.chips);
    }
  }
  return next;
}

/** Map legacy chip values to patient language on API hydrate. */
export function normalizeComplaintChipFields(
  complaint: Complaint,
  fields: readonly ComplaintAttributeFieldDef[],
): Complaint {
  const next = { ...complaint };
  if (next.onset) {
    next.onset = normalizeOnsetValue(next.onset);
  }
  if (next.timing) {
    if (isFeverComplaintTimingField(fields)) {
      next.timing = normalizeFeverTimingValue(next.timing);
    } else if (isChestPainWhenField(fields)) {
      next.timing = normalizeChestPainWhenValue(next.timing);
    } else if (isPainPatternTimingField(fields)) {
      const chips = fields.find((f) => f.key === "timing")?.chips;
      next.timing = canonicalizeChipValue(
        next.timing,
        chips,
        LEGACY_PAIN_TIMING_TO_PATIENT,
      );
    }
  }
  if (next.aggravating && isFeverComplaintChillsField(fields)) {
    next.aggravating = normalizeFeverChillsValue(next.aggravating);
  }
  if (isHeadacheSchema(fields)) {
    if (next.laterality) {
      next.laterality = normalizeHeadacheLateralityValue(next.laterality);
    }
    if (next.location) {
      next.location = normalizeHeadacheLocationValue(next.location);
    }
    if (next.character) {
      next.character = normalizeHeadacheCharacterValue(next.character);
    }
    if (next.radiation) {
      next.radiation = normalizeHeadacheRadiationValue(next.radiation);
    }
  } else if (isChestPainSchema(fields)) {
    if (next.laterality) {
      next.laterality = normalizeChestPainLocationValue(next.laterality);
    }
    if (next.character) {
      next.character = normalizeChestPainCharacterValue(next.character);
    }
    if (next.radiation) {
      next.radiation = normalizeChestPainRadiationValue(next.radiation);
    }
    if (next.aggravating) {
      next.aggravating = normalizeChestPainWorsenedValue(next.aggravating);
    }
    if (next.relieving) {
      next.relieving = normalizeChestPainRelievedValue(next.relieving);
    }
  } else if (next.radiation) {
    const radiationField = fields.find((f) => f.key === "radiation");
    if (radiationField?.type === "chips" && radiationField.chips?.length) {
      next.radiation = canonicalizeChipValue(next.radiation, radiationField.chips);
    }
  }
  return next;
}

const OLDCARTS_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "onset",
    label: "Onset",
    type: "chips",
    chips: [...ONSET_CHIPS],
    placeholder: "Custom onset",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  { key: "location", label: "Location", type: "text", placeholder: "e.g. frontal" },
  {
    key: "character",
    label: "How it feels",
    type: "chips",
    chips: ["throbbing", "dull", "sharp", "burning", "cramping"],
    placeholder: "Custom character",
  },
  { key: "radiation", label: "Radiates to", type: "text" },
  { key: "severity", label: "Severity", type: "severity" },
  {
    key: "timing",
    label: "Pattern",
    type: "chips",
    chips: [...PAIN_PATTERN_CHIPS],
    placeholder: "Custom",
  },
  { key: "aggravating", label: "Worsened by", type: "text" },
  { key: "relieving", label: "Relieved by", type: "text" },
  { key: "notes", label: "Notes", type: "text" },
];

/** SOCRATES — pain presentations. Maps onto the shared `Complaint` shape. */
const PAIN_FIELDS: ComplaintAttributeFieldDef[] = [
  { key: "location", label: "Site", type: "text", placeholder: "e.g. frontal, both calves" },
  {
    key: "onset",
    label: "Onset",
    type: "chips",
    chips: [...ONSET_CHIPS],
    placeholder: "Custom onset",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "character",
    label: "How it feels",
    type: "chips",
    chips: ["throbbing", "dull", "sharp", "burning", "cramping"],
    placeholder: "Custom character",
  },
  { key: "radiation", label: "Radiates to", type: "text" },
  {
    key: "timing",
    label: "Pattern",
    type: "chips",
    chips: [...PAIN_PATTERN_CHIPS],
    placeholder: "Custom",
  },
  { key: "aggravating", label: "Worsened by", type: "text" },
  { key: "relieving", label: "Relieved by", type: "text" },
  { key: "painScore", label: "Pain score (0–10)", type: "painscale" },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Headache / migraine — side + head region chips (not generic limb laterality). */
const HEADACHE_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "laterality",
    label: "Side",
    type: "chips",
    chips: [...HEADACHE_SIDE_CHIPS],
    placeholder: "Custom side",
  },
  {
    key: "location",
    label: "Where on head",
    type: "chips",
    chips: [...HEADACHE_LOCATION_CHIPS],
    placeholder: "Custom region",
  },
  {
    key: "onset",
    label: "Onset",
    type: "chips",
    chips: [...ONSET_CHIPS],
    placeholder: "Custom onset",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "character",
    label: "How it feels",
    type: "chips",
    chips: [...HEADACHE_CHARACTER_CHIPS],
    placeholder: "Custom character",
  },
  {
    key: "radiation",
    label: "Radiates to",
    type: "chips",
    chips: [...HEADACHE_RADIATION_CHIPS],
    placeholder: "Custom",
  },
  {
    key: "timing",
    label: "Pattern",
    type: "chips",
    chips: [...HEADACHE_PATTERN_CHIPS],
    placeholder: "Custom",
  },
  { key: "aggravating", label: "Worsened by", type: "text" },
  { key: "relieving", label: "Relieved by", type: "text" },
  { key: "painScore", label: "Pain score (0–10)", type: "painscale" },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Chest pain / discomfort — cardiac-aware SOCRATES (not generic limb pain). */
const CHEST_PAIN_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "laterality",
    label: "Where in chest",
    type: "chips",
    chips: [...CHEST_LOCATION_CHIPS],
    placeholder: "Custom",
  },
  {
    key: "location",
    label: "Exact spot (optional)",
    type: "text",
    placeholder: "e.g. under left ribs",
  },
  {
    key: "onset",
    label: "Onset",
    type: "chips",
    chips: [...ONSET_CHIPS],
    placeholder: "Custom onset",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "character",
    label: "How it feels",
    type: "chips",
    chips: [...CHEST_CHARACTER_CHIPS],
    placeholder: "Custom",
  },
  {
    key: "radiation",
    label: "Radiates to",
    type: "chips",
    chips: [...CHEST_RADIATION_CHIPS],
    placeholder: "Custom",
  },
  {
    key: "timing",
    label: "When",
    type: "chips",
    chips: [...CHEST_WHEN_CHIPS],
    placeholder: "Custom",
  },
  {
    key: "aggravating",
    label: "Worsened by",
    type: "chips",
    chips: [...CHEST_WORSENED_BY_CHIPS],
    placeholder: "Custom",
  },
  {
    key: "relieving",
    label: "Relieved by",
    type: "chips",
    chips: [...CHEST_RELIEVED_BY_CHIPS],
    placeholder: "Custom",
  },
  { key: "painScore", label: "Pain score (0–10)", type: "painscale" },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Patient-language fever pattern chips (stored value = chip label). */
export const FEVER_PATTERN_CHIPS = [
  "Comes and goes",
  "Constant",
  "Drops then spikes again",
] as const;

const LEGACY_FEVER_TIMING_TO_PATIENT: Record<string, (typeof FEVER_PATTERN_CHIPS)[number]> = {
  intermittent: "Comes and goes",
  continuous: "Constant",
  remittent: "Drops then spikes again",
};

/** Free-text / legacy medical tokens → patient-language timing value (fever only). */
export const FEVER_TIMING_PARSE_ALIASES: ReadonlyArray<{
  re: RegExp;
  value: (typeof FEVER_PATTERN_CHIPS)[number];
}> = [
  { re: /\bcomes\s+and\s+goes\b/, value: "Comes and goes" },
  { re: /\bintermittent\b/, value: "Comes and goes" },
  { re: /\bcontinuous\b/, value: "Constant" },
  { re: /\bremittent\b/, value: "Drops then spikes again" },
  { re: /\bdrops?\s+then\s+spikes?\s+again\b/, value: "Drops then spikes again" },
];

export function isFeverComplaintTimingField(
  fields: readonly ComplaintAttributeFieldDef[],
): boolean {
  const timing = fields.find((f) => f.key === "timing" && f.type === "chips");
  return Boolean(timing?.chips?.includes(FEVER_PATTERN_CHIPS[0]));
}

/** Map legacy medical timing tokens to patient-language chips (fever cards only). */
export function normalizeFeverTimingValue(
  timing: string | null | undefined,
): string | undefined {
  const trimmed = timing?.trim();
  if (!trimmed) return undefined;
  const legacy = LEGACY_FEVER_TIMING_TO_PATIENT[trimmed.toLowerCase()];
  if (legacy) return legacy;
  const canonical = FEVER_PATTERN_CHIPS.find(
    (chip) => chip.toLowerCase() === trimmed.toLowerCase(),
  );
  return canonical ?? trimmed;
}

/** Patient-language fever chills chips (stored value = chip label). */
export const FEVER_CHILLS_CHIPS = ["none", "yes", "shaking chills"] as const;

const LEGACY_FEVER_CHILLS_TO_PATIENT: Record<string, (typeof FEVER_CHILLS_CHIPS)[number]> = {
  rigors: "shaking chills",
};

export function isFeverComplaintChillsField(
  fields: readonly ComplaintAttributeFieldDef[],
): boolean {
  const chills = fields.find((f) => f.key === "aggravating" && f.label === "Chills");
  return Boolean(chills?.chips?.includes(FEVER_CHILLS_CHIPS[2]));
}

/** Map legacy medical chills tokens to patient-language chips (fever cards only). */
export function normalizeFeverChillsValue(
  chills: string | null | undefined,
): string | undefined {
  const trimmed = chills?.trim();
  if (!trimmed) return undefined;
  const legacy = LEGACY_FEVER_CHILLS_TO_PATIENT[trimmed.toLowerCase()];
  if (legacy) return legacy;
  const canonical = FEVER_CHILLS_CHIPS.find(
    (chip) => chip.toLowerCase() === trimmed.toLowerCase(),
  );
  return canonical ?? trimmed;
}

/** Fever — measured-by first, then linked temp + grade, pattern, chills. */
const FEVER_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "measuredBy",
    label: "Measured",
    type: "chips",
    chips: ["Felt only", "Home", "At clinic"],
    placeholder: "Custom",
  },
  {
    key: "reportedBy",
    label: "Reported by",
    type: "chips",
    chips: ["Patient", "Attendant", "Clinician"],
    placeholder: "Custom",
  },
  {
    key: "temperature",
    label: "Temperature",
    type: "temperature",
  },
  {
    key: "timing",
    label: "Pattern",
    type: "chips",
    chips: [...FEVER_PATTERN_CHIPS],
    placeholder: "Custom",
  },
  {
    key: "aggravating",
    label: "Chills",
    type: "chips",
    chips: [...FEVER_CHILLS_CHIPS],
    placeholder: "Custom",
  },
  {
    key: "notes",
    label: "Notes",
    type: "text",
    placeholder: "Travel, contacts, rash, drowsiness, reduced urine…",
  },
];

/** Cough — type / sputum colour / timing. */
const COUGH_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "character",
    label: "Type",
    type: "chips",
    chips: ["dry", "productive", "barking", "wheezy"],
    placeholder: "Custom type",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "color",
    label: "Sputum",
    type: "chips",
    chips: ["none", "clear", "yellow", "green", "blood-streaked"],
    placeholder: "Custom sputum",
  },
  {
    key: "timing",
    label: "Worse",
    type: "chips",
    chips: ["morning", "night", "on lying down", "with cold"],
    placeholder: "Custom timing",
  },
  { key: "notes", label: "Notes", type: "text" },
];

/** GIT — vomiting / loose stools / constipation / acidity. */
const GIT_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "onset",
    label: "Onset",
    type: "chips",
    chips: [...ONSET_CHIPS],
    placeholder: "Custom onset",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "frequency",
    label: "Episodes / day",
    type: "chips",
    chips: ["1–2", "3–5", ">5"],
    placeholder: "Custom frequency",
  },
  {
    key: "character",
    label: "Consistency / content",
    type: "chips",
    chips: ["watery", "semi-formed", "hard", "undigested"],
    placeholder: "Custom",
  },
  {
    key: "color",
    label: "Blood / mucus",
    type: "chips",
    chips: ["none", "blood", "mucus", "black"],
    placeholder: "Custom",
  },
  {
    key: "timing",
    label: "Relation to food",
    type: "chips",
    chips: ["before meals", "after meals", "empty stomach", "night"],
    placeholder: "Custom timing",
  },
  { key: "aggravating", label: "Triggers", type: "text" },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Urinary — burning / frequency / blood. */
const URINARY_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "frequency",
    label: "Frequency",
    type: "chips",
    chips: ["normal", "increased", "night-time", "urgent"],
    placeholder: "Custom frequency",
  },
  {
    key: "character",
    label: "Symptoms",
    type: "chips",
    chips: ["burning", "urgency", "incomplete emptying", "dribbling"],
    placeholder: "Custom",
  },
  {
    key: "color",
    label: "Urine",
    type: "chips",
    chips: ["normal", "cloudy", "blood", "dark"],
    placeholder: "Custom",
  },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Respiratory — breathlessness / wheeze / chest tightness. */
const RESPIRATORY_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "onset",
    label: "Onset",
    type: "chips",
    chips: [...ONSET_CHIPS],
    placeholder: "Custom onset",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "timing",
    label: "When",
    type: "chips",
    chips: ["at rest", "on exertion", "lying down", "night"],
    placeholder: "Custom",
  },
  {
    key: "character",
    label: "How it feels",
    type: "chips",
    chips: ["wheeze", "tightness", "fast breathing"],
    placeholder: "Custom",
  },
  { key: "aggravating", label: "Worsened by", type: "text" },
  { key: "relieving", label: "Relieved by", type: "text" },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** ENT / cold — nasal discharge / throat / timing. */
const ENT_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "character",
    label: "Discharge",
    type: "chips",
    chips: ["watery", "thick", "blocked", "none"],
    placeholder: "Custom",
  },
  {
    key: "color",
    label: "Discharge colour",
    type: "chips",
    chips: ["clear", "white", "yellow", "green"],
    placeholder: "Custom",
  },
  {
    key: "timing",
    label: "Worse",
    type: "chips",
    chips: ["morning", "night", "outdoors"],
    placeholder: "Custom timing",
  },
  { key: "aggravating", label: "Triggers", type: "text" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Dermatology — rash / itching / hives. */
const DERM_FIELDS: ComplaintAttributeFieldDef[] = [
  { key: "location", label: "Site", type: "text", placeholder: "e.g. forearms, trunk" },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "character",
    label: "Appearance",
    type: "chips",
    chips: ["red", "raised", "scaly", "blisters", "dry"],
    placeholder: "Custom",
  },
  {
    key: "timing",
    label: "Spread",
    type: "chips",
    chips: ["localized", "spreading", "comes and goes"],
    placeholder: "Custom",
  },
  { key: "aggravating", label: "Triggers", type: "text" },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Eye — which eye / discharge / vision affected (not SOCRATES). */
const EYE_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "laterality",
    label: "Which eye",
    type: "chips",
    chips: ["Left", "Right", "Both"],
    placeholder: "Custom",
  },
  {
    key: "onset",
    label: "Onset",
    type: "chips",
    chips: ["sudden", "gradual"],
    placeholder: "Custom onset",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "character",
    label: "Discharge",
    type: "chips",
    chips: ["none", "watery", "sticky", "pus"],
    placeholder: "Custom",
  },
  {
    key: "aggravating",
    label: "Vision affected",
    type: "chips",
    chips: ["no", "blurred", "double", "significant loss"],
    placeholder: "Custom",
  },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Ear — which ear / discharge / hearing. */
const EAR_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "laterality",
    label: "Which ear",
    type: "chips",
    chips: ["Left", "Right", "Both"],
    placeholder: "Custom",
  },
  {
    key: "onset",
    label: "Onset",
    type: "chips",
    chips: ["sudden", "gradual"],
    placeholder: "Custom onset",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "character",
    label: "Discharge",
    type: "chips",
    chips: ["none", "watery", "pus", "blood"],
    placeholder: "Custom",
  },
  {
    key: "aggravating",
    label: "Hearing affected",
    type: "chips",
    chips: ["no", "reduced", "muffled"],
    placeholder: "Custom",
  },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Cardiac — palpitations / chest discomfort. */
const CARDIAC_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "onset",
    label: "Onset",
    type: "chips",
    chips: ["sudden", "gradual"],
    placeholder: "Custom onset",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "timing",
    label: "When",
    type: "chips",
    chips: ["at rest", "on exertion", "lying down", "random"],
    placeholder: "Custom",
  },
  {
    key: "character",
    label: "Rhythm",
    type: "chips",
    chips: ["regular", "irregular", "racing", "skipped beats"],
    placeholder: "Custom",
  },
  { key: "aggravating", label: "Triggers", type: "text" },
  { key: "relieving", label: "Relieved by", type: "text" },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Dizziness / syncope — type / triggers / episode length. */
const DIZZINESS_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "character",
    label: "Type",
    type: "chips",
    chips: ["spinning", "lightheaded", "off-balance", "faint feeling"],
    placeholder: "Custom",
  },
  {
    key: "onset",
    label: "Onset",
    type: "chips",
    chips: ["sudden", "gradual"],
    placeholder: "Custom onset",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "timing",
    label: "Episode length",
    type: "chips",
    chips: ["seconds", "minutes", "hours", "constant"],
    placeholder: "Custom",
  },
  {
    key: "aggravating",
    label: "Triggers",
    type: "chips",
    chips: ["standing up", "head movement", "lying down", "none"],
    placeholder: "Custom",
  },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Gynae — periods / discharge (cycle, flow, not SOCRATES). */
const GYNAE_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "timing",
    label: "Cycle",
    type: "chips",
    chips: ["regular", "irregular", "stopped", "post-menopausal"],
    placeholder: "Custom",
  },
  {
    key: "frequency",
    label: "Flow",
    type: "chips",
    chips: ["light", "normal", "heavy", "clots"],
    placeholder: "Custom",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "character",
    label: "Discharge",
    type: "chips",
    chips: ["none", "white", "yellow", "watery", "foul-smelling"],
    placeholder: "Custom",
  },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes (LMP, cycle length)", type: "text" },
];

/** Mental health / sleep — duration / pattern / triggers / impact. */
const MENTAL_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "timing",
    label: "Pattern",
    type: "chips",
    chips: ["constant", "comes and goes", "worse at night", "worse in morning"],
    placeholder: "Custom",
  },
  { key: "aggravating", label: "Triggers", type: "text" },
  { key: "relieving", label: "Relieved by", type: "text" },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Impact / notes", type: "text" },
];

/** Trauma — site / mechanism / time since injury / cover status. */
const TRAUMA_FIELDS: ComplaintAttributeFieldDef[] = [
  { key: "location", label: "Site of injury", type: "text", placeholder: "e.g. right forearm" },
  {
    key: "character",
    label: "Mechanism",
    type: "chips",
    chips: ["fall", "road accident", "animal bite", "insect bite", "burn", "cut", "sports injury"],
    placeholder: "Custom",
  },
  {
    key: "duration",
    label: "Time since injury",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom",
  },
  { key: "aggravating", label: "Tetanus / rabies cover", type: "text" },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/**
 * Neutral catch-all (de-pained). The pain-flavoured OLDCARTS set
 * (radiation / SOCRATES character) lives on as DEFAULT_COMPLAINT_ATTRIBUTE_FIELDS
 * for the deprecated subj-02 export only.
 */
const DEFAULT_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "onset",
    label: "Onset",
    type: "chips",
    chips: ["sudden", "gradual"],
    placeholder: "Custom onset",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  { key: "location", label: "Site / area", type: "text", placeholder: "e.g. where on the body" },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

export const COMPLAINT_SCHEMAS: Record<ComplaintCategory, ComplaintAttributeFieldDef[]> = {
  pain: PAIN_FIELDS,
  fever: FEVER_FIELDS,
  cough: COUGH_FIELDS,
  git: GIT_FIELDS,
  urinary: URINARY_FIELDS,
  respiratory: RESPIRATORY_FIELDS,
  ent: ENT_FIELDS,
  derm: DERM_FIELDS,
  eye: EYE_FIELDS,
  ear: EAR_FIELDS,
  cardiac: CARDIAC_FIELDS,
  dizziness: DIZZINESS_FIELDS,
  gynae: GYNAE_FIELDS,
  mental: MENTAL_FIELDS,
  trauma: TRAUMA_FIELDS,
  default: DEFAULT_FIELDS,
};

/** @deprecated Use `COMPLAINT_SCHEMAS.default` — kept for subj-02 import compat. */
export const DEFAULT_COMPLAINT_ATTRIBUTE_FIELDS = OLDCARTS_FIELDS;

const PAIN_KEYWORDS = [
  "pain",
  "ache",
  "headache",
  "migraine",
  "cephalgia",
  "backache",
  "toothache",
  "earache",
  "myalgia",
  "arthralgia",
  "abdominal pain",
  "chest pain",
  "leg pain",
  "joint pain",
];

const FEVER_KEYWORDS = ["fever", "pyrexia", "febrile", "temperature", "hyperthermia"];

const COUGH_KEYWORDS = ["cough", "coughing", "hemoptysis"];

const GIT_KEYWORDS = [
  "vomit",
  "loose stool",
  "loose motion",
  "diarrhea",
  "diarrhoea",
  "constipation",
  "acidity",
  "nausea",
  "bloating",
  "indigestion",
  "stool",
  "heartburn",
  "reflux",
];

const URINARY_KEYWORDS = ["urination", "urine", "dysuria", "urinary"];

const RESPIRATORY_KEYWORDS = [
  "breath",
  "breathless",
  "wheez",
  "shortness of breath",
];

const ENT_KEYWORDS = ["cold", "nose", "nasal", "sneez", "runny", "sore throat", "hoarse"];

const DERM_KEYWORDS = ["rash", "itch", "hives", "urticaria", "skin"];

// Conservative phrases (no bare "eye"/"ear" — would catch "heart", etc.). The DB
// `category` from migration 122 handles catalog complaints exactly; inference is
// only the free-text fallback.
const EYE_KEYWORDS = ["eye", "vision", "visual"];

const EAR_KEYWORDS = ["earache", "ear pain", "hearing", "tinnitus", "ear discharge", "ringing in"];

const CARDIAC_KEYWORDS = ["palpitation", "heart racing", "heart pounding", "chest discomfort"];

const DIZZINESS_KEYWORDS = [
  "dizz",
  "vertigo",
  "spinning",
  "faint",
  "lightheaded",
  "giddiness",
  "consciousness",
  "syncope",
];

// "periods" (plural) catches Irregular/Heavy/Missed periods but NOT "Period pain".
const GYNAE_KEYWORDS = [
  "periods",
  "menstrual",
  "menses",
  "vaginal discharge",
  "white discharge",
  "leucorrhea",
  "menorrhagia",
  "amenorrhea",
];

const MENTAL_KEYWORDS = [
  "anxiety",
  "anxious",
  "depress",
  "low mood",
  "feeling low",
  "sleep",
  "insomnia",
  "stress",
];

// Last group — "burn"/"bite" would otherwise shadow heartburn / burning urination.
const TRAUMA_KEYWORDS = [
  "wound",
  "burn",
  "bite",
  "injury",
  "accident",
  "fracture",
  "sprain",
  "road traffic",
];

const CATEGORY_KEYWORD_GROUPS: ReadonlyArray<{
  category: ComplaintCategory;
  keywords: readonly string[];
}> = [
  // Specific non-pain symptom buckets first…
  { category: "cardiac", keywords: CARDIAC_KEYWORDS },
  { category: "dizziness", keywords: DIZZINESS_KEYWORDS },
  { category: "gynae", keywords: GYNAE_KEYWORDS },
  { category: "mental", keywords: MENTAL_KEYWORDS },
  // …then pain, so "eye pain" / "ear pain" / "earache" stay pain (with
  // laterality) and match the catalog category, rather than the eye/ear schema.
  { category: "pain", keywords: PAIN_KEYWORDS },
  { category: "fever", keywords: FEVER_KEYWORDS },
  { category: "cough", keywords: COUGH_KEYWORDS },
  { category: "git", keywords: GIT_KEYWORDS },
  { category: "urinary", keywords: URINARY_KEYWORDS },
  { category: "respiratory", keywords: RESPIRATORY_KEYWORDS },
  { category: "ent", keywords: ENT_KEYWORDS },
  { category: "derm", keywords: DERM_KEYWORDS },
  // eye/ear catch the non-pain function complaints (vision, hearing, discharge).
  { category: "eye", keywords: EYE_KEYWORDS },
  { category: "ear", keywords: EAR_KEYWORDS },
  { category: "trauma", keywords: TRAUMA_KEYWORDS },
];

const COMPLAINT_CATEGORY_VALUES: readonly ComplaintCategory[] = [
  "pain",
  "fever",
  "cough",
  "git",
  "urinary",
  "respiratory",
  "ent",
  "derm",
  "eye",
  "ear",
  "cardiac",
  "dizziness",
  "gynae",
  "mental",
  "trauma",
  "default",
];

export function isComplaintCategory(value: string): value is ComplaintCategory {
  return (COMPLAINT_CATEGORY_VALUES as readonly string[]).includes(value);
}

/**
 * v1 keyword→category matcher (name-based). Phase 2 passes `complaint_master.category`
 * directly via `resolveComplaintCategory({ category })`; this is the free-text fallback.
 */
export function inferComplaintCategoryFromName(name: string): ComplaintCategory | null {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;

  for (const group of CATEGORY_KEYWORD_GROUPS) {
    if (group.keywords.some((keyword) => normalized.includes(keyword))) {
      return group.category;
    }
  }
  return null;
}

export interface ResolveComplaintFieldsInput {
  complaintName?: string;
  /** Explicit category from `complaint_master` (Phase 2) — wins over name inference. */
  category?: ComplaintCategory | string | null;
}

export function resolveComplaintCategory(input: ResolveComplaintFieldsInput): ComplaintCategory {
  if (input.category && isComplaintCategory(input.category)) {
    return input.category;
  }
  return inferComplaintCategoryFromName(input.complaintName ?? "") ?? "default";
}

// ---------------------------------------------------------------------------
// Laterality / position (subj-14) — body-part aware, resolved from the name.
// ---------------------------------------------------------------------------

const LATERALITY_PAIRED = ["Left", "Right", "Both"];
const LATERALITY_CHEST = ["Left", "Right", "Central"];
const LATERALITY_AXIAL = ["Upper", "Mid", "Lower"];
/**
 * Abdomen 9-region grid in lay language (maps onto the clinical quadrants:
 * hypochondrium/epigastric, lumbar/umbilical, iliac/hypogastric). Ordered as a
 * 3×3 so the card can lay it out top→bottom, left→right.
 */
const LATERALITY_ABDOMEN = [
  "Upper right",
  "Upper middle",
  "Upper left",
  "Right side",
  "Around navel",
  "Left side",
  "Lower right",
  "Lower middle",
  "Lower left",
];

/** Paired structures where Left/Right/Both applies. */
const PAIRED_BODY_KEYWORDS = [
  "shoulder",
  "knee",
  "hip",
  "ankle",
  "foot",
  "heel",
  "arm",
  "elbow",
  "wrist",
  "hand",
  "finger",
  "leg",
  "calf",
  "ear",
  "eye",
  "breast",
  "testic",
];

/** Abdomen / belly — gets the 9-region quadrant grid. */
const ABDOMEN_BODY_KEYWORDS = ["abdomen", "abdominal", "stomach", "tummy", "belly"];
/** Loin / flank / renal — paired side + ureteric radiation pattern. */
const LOIN_BODY_KEYWORDS = ["loin", "flank", "kidney", "renal"];
/** Other axial regions (back) — simple Upper/Mid/Lower band. */
const AXIAL_BODY_KEYWORDS = ["back", "spine"];

/** True when the complaint is an abdominal site (drives the quadrant grid + de-overlap). */
export function isAbdomenComplaint(complaintName: string | undefined): boolean {
  const normalized = (complaintName ?? "").trim().toLowerCase();
  return normalized.length > 0 && ABDOMEN_BODY_KEYWORDS.some((k) => normalized.includes(k));
}

/**
 * True when a laterality field's chips are the abdomen 9-region set, so the card
 * can render them as an anatomically-laid-out 3×3 grid rather than a flat wrap.
 */
export function isAbdomenLateralityChips(chips: readonly string[] | undefined): boolean {
  if (!chips || chips.length !== LATERALITY_ABDOMEN.length) return false;
  return chips.every((chip, i) => chip === LATERALITY_ABDOMEN[i]);
}

/**
 * Body-part-aware laterality chips for a complaint, or `[]` when laterality is
 * not meaningful. Only surfaced on pain-category cards (see resolveComplaintAttributeFields).
 */
export function resolveLateralityChips(input: ResolveComplaintFieldsInput): string[] {
  const normalized = (input.complaintName ?? "").trim().toLowerCase();
  if (!normalized) return [];

  if (normalized.includes("chest")) return [...LATERALITY_CHEST];
  if (LOIN_BODY_KEYWORDS.some((k) => normalized.includes(k))) return [...LATERALITY_PAIRED];
  if (ABDOMEN_BODY_KEYWORDS.some((k) => normalized.includes(k))) return [...LATERALITY_ABDOMEN];
  if (AXIAL_BODY_KEYWORDS.some((k) => normalized.includes(k))) return [...LATERALITY_AXIAL];
  if (PAIRED_BODY_KEYWORDS.some((k) => normalized.includes(k))) return [...LATERALITY_PAIRED];
  return [];
}

/**
 * Body-part-aware radiation chips for pain cards, or `[]` when free-text is
 * more appropriate. Only surfaced when resolveComplaintAttributeFields attaches
 * chips to the `radiation` field.
 */
export function resolveRadiationChips(input: ResolveComplaintFieldsInput): string[] {
  const normalized = (input.complaintName ?? "").trim().toLowerCase();
  if (!normalized) return [];

  if (normalized.includes("chest")) return [...CHEST_RADIATION_CHIPS];
  if (LOIN_BODY_KEYWORDS.some((k) => normalized.includes(k))) return [...LOIN_RADIATION_CHIPS];
  if (ABDOMEN_BODY_KEYWORDS.some((k) => normalized.includes(k))) return [...ABDOMEN_RADIATION_CHIPS];
  if (AXIAL_BODY_KEYWORDS.some((k) => normalized.includes(k))) return [...BACK_RADIATION_CHIPS];
  if (normalized.includes("neck")) return [...NECK_RADIATION_CHIPS];
  if (normalized.includes("shoulder")) return [...SHOULDER_RADIATION_CHIPS];

  const pairedWithoutShoulder = PAIRED_BODY_KEYWORDS.filter((keyword) => keyword !== "shoulder");
  if (pairedWithoutShoulder.some((k) => normalized.includes(k))) return [...LIMB_RADIATION_CHIPS];
  return [];
}

function withPainRadiationChips(
  fields: readonly ComplaintAttributeFieldDef[],
  input: ResolveComplaintFieldsInput,
): ComplaintAttributeFieldDef[] {
  const radiationChips = resolveRadiationChips(input);
  if (radiationChips.length === 0) return [...fields];
  return fields.map((field) =>
    field.key === "radiation"
      ? {
          ...field,
          type: "chips",
          chips: radiationChips,
          placeholder: "Custom",
        }
      : field,
  );
}

// ---------------------------------------------------------------------------
// Name-specific schema overrides (subj-14 review).
// For complaints where the category schema RESTATES the name (e.g. "Hearing
// loss → Hearing affected?") or offers CONTRADICTING chips (e.g. "Dog bite →
// Mechanism: fall/road accident…"), a bespoke field list replaces the category
// schema. Overrides win over category (incl. an explicit `complaint_master`
// category) because the name is the most specific signal.
// ---------------------------------------------------------------------------

/** Animal / insect bites — name already states the mechanism. */
const BITE_FIELDS: ComplaintAttributeFieldDef[] = [
  { key: "location", label: "Site", type: "text", placeholder: "e.g. right calf" },
  {
    key: "character",
    label: "Local reaction",
    type: "chips",
    chips: ["redness", "swelling", "pain", "pus", "numbness", "spreading"],
    placeholder: "Custom",
  },
  {
    key: "color",
    label: "Bleeding",
    type: "chips",
    chips: ["none", "oozing", "active"],
    placeholder: "Custom",
  },
  {
    key: "duration",
    label: "Time since bite",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom",
  },
  { key: "aggravating", label: "Tetanus / anti-rabies / anti-venom", type: "text" },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Burns — ask the cause, not a generic mechanism. */
const BURN_FIELDS: ComplaintAttributeFieldDef[] = [
  { key: "location", label: "Site", type: "text", placeholder: "e.g. right hand" },
  {
    key: "character",
    label: "Cause",
    type: "chips",
    chips: ["hot liquid", "flame", "chemical", "electrical", "sun", "friction"],
    placeholder: "Custom",
  },
  {
    key: "timing",
    label: "Skin",
    type: "chips",
    chips: ["redness", "blisters", "broken skin", "large area"],
    placeholder: "Custom",
  },
  {
    key: "duration",
    label: "Time since burn",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom",
  },
  { key: "aggravating", label: "First aid / tetanus", type: "text" },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Wounds / cuts / fall / accident — describe the injury, not the (named) mechanism. */
const INJURY_FIELDS: ComplaintAttributeFieldDef[] = [
  { key: "location", label: "Site of injury", type: "text", placeholder: "e.g. right forearm" },
  {
    key: "character",
    label: "Visible injury",
    type: "chips",
    chips: ["cut", "graze", "bruise", "swelling", "bleeding", "deformity"],
    placeholder: "Custom",
  },
  {
    key: "duration",
    label: "Time since injury",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom",
  },
  { key: "aggravating", label: "Tetanus cover", type: "text" },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Vomiting — content / episodes / relation to food (not stool descriptors). */
const VOMITING_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "frequency",
    label: "Episodes / day",
    type: "chips",
    chips: ["1–2", "3–5", ">5"],
    placeholder: "Custom",
  },
  {
    key: "character",
    label: "Content",
    type: "chips",
    chips: ["food", "water", "bile (yellow-green)", "blood", "mucus"],
    placeholder: "Custom",
  },
  {
    key: "timing",
    label: "Relation to food",
    type: "chips",
    chips: ["after meals", "empty stomach", "after water", "random"],
    placeholder: "Custom",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom",
  },
  { key: "aggravating", label: "Triggers", type: "text" },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Dyspepsia (heartburn / acidity / burping) — food relation, not bowel fields. */
const DYSPEPSIA_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom",
  },
  {
    key: "timing",
    label: "When",
    type: "chips",
    chips: ["after meals", "empty stomach", "night", "on lying down"],
    placeholder: "Custom",
  },
  {
    key: "aggravating",
    label: "Triggers",
    type: "chips",
    chips: ["spicy food", "fatty food", "coffee/tea", "skipping meals", "alcohol"],
    placeholder: "Custom",
  },
  { key: "relieving", label: "Relieved by (antacid / food)", type: "text" },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Constipation — infrequency, not "episodes/day". */
const CONSTIPATION_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom",
  },
  {
    key: "frequency",
    label: "Bowel frequency",
    type: "chips",
    chips: ["once in 2 days", "once in 3+ days", "varies"],
    placeholder: "Custom",
  },
  {
    key: "character",
    label: "Stool",
    type: "chips",
    chips: ["hard", "pellets", "straining", "incomplete"],
    placeholder: "Custom",
  },
  {
    key: "color",
    label: "Blood / mucus",
    type: "chips",
    chips: ["none", "blood", "mucus"],
    placeholder: "Custom",
  },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Throat / voice — swallowing + voice change, not nasal discharge. */
const THROAT_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom",
  },
  {
    key: "character",
    label: "Throat",
    type: "chips",
    chips: ["pain on swallowing", "dryness", "scratchy", "lump sensation"],
    placeholder: "Custom",
  },
  {
    key: "aggravating",
    label: "Voice",
    type: "chips",
    chips: ["normal", "hoarse", "lost"],
    placeholder: "Custom",
  },
  {
    key: "timing",
    label: "Worse",
    type: "chips",
    chips: ["morning", "on talking", "cold drinks"],
    placeholder: "Custom",
  },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Fainting / loss of consciousness — an event, not a sensation. */
const SYNCOPE_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "timing",
    label: "Episode length",
    type: "chips",
    chips: ["seconds", "1–2 min", "longer"],
    placeholder: "Custom",
  },
  {
    key: "aggravating",
    label: "Trigger",
    type: "chips",
    chips: ["standing up", "prolonged standing", "emotional", "none"],
    placeholder: "Custom",
  },
  {
    key: "character",
    label: "Before it",
    type: "chips",
    chips: ["dizziness", "sweating", "blackout", "palpitations"],
    placeholder: "Custom",
  },
  {
    key: "relieving",
    label: "Recovery",
    type: "chips",
    chips: ["quick", "gradual", "confused after"],
    placeholder: "Custom",
  },
  {
    key: "duration",
    label: "Since when",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom",
  },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Ringing in ears (tinnitus) — sound character, not discharge. */
const TINNITUS_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "laterality",
    label: "Which ear",
    type: "chips",
    chips: ["Left", "Right", "Both"],
    placeholder: "Custom",
  },
  {
    key: "character",
    label: "Sound",
    type: "chips",
    chips: ["ringing", "buzzing", "hissing", "pulsatile"],
    placeholder: "Custom",
  },
  {
    key: "timing",
    label: "Pattern",
    type: "chips",
    chips: ["constant", "comes and goes", "worse at night"],
    placeholder: "Custom",
  },
  {
    key: "aggravating",
    label: "Hearing affected",
    type: "chips",
    chips: ["no", "reduced"],
    placeholder: "Custom",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom",
  },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Foreign body (something in eye / ear). */
const FOREIGN_BODY_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "laterality",
    label: "Which side",
    type: "chips",
    chips: ["Left", "Right", "Both"],
    placeholder: "Custom",
  },
  { key: "character", label: "What got in", type: "text", placeholder: "e.g. insect, dust, metal" },
  {
    key: "duration",
    label: "Time since",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom",
  },
  {
    key: "aggravating",
    label: "Symptoms",
    type: "chips",
    chips: ["pain", "watering", "redness", "reduced vision/hearing", "none"],
    placeholder: "Custom",
  },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/** Missed periods — LMP / cycles missed / pregnancy possibility. */
const MISSED_PERIODS_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "frequency",
    label: "Cycles missed",
    type: "chips",
    chips: ["1", "2", "3+"],
    placeholder: "Custom",
  },
  { key: "timing", label: "Last period (LMP)", type: "text", placeholder: "e.g. ~6 weeks ago" },
  {
    key: "aggravating",
    label: "Pregnancy possible",
    type: "chips",
    chips: ["yes", "no", "unsure"],
    placeholder: "Custom",
  },
  {
    key: "character",
    label: "Associated",
    type: "chips",
    chips: ["nausea", "weight change", "stress", "none"],
    placeholder: "Custom",
  },
  { key: "notes", label: "Notes", type: "text" },
];

/**
 * Vision change (blurred / double vision). The name already states vision is
 * affected, so we ask the clinically useful axes — sudden vs gradual onset
 * (sudden = red flag), one/both eyes, pattern — not a redundant "Vision affected?".
 */
const VISION_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "laterality",
    label: "Which eye",
    type: "chips",
    chips: ["Left", "Right", "Both"],
    placeholder: "Custom",
  },
  {
    key: "onset",
    label: "Onset",
    type: "chips",
    chips: ["sudden", "gradual"],
    placeholder: "Custom onset",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "timing",
    label: "Pattern",
    type: "chips",
    chips: ["constant", "comes and goes", "for near", "for distance"],
    placeholder: "Custom",
  },
  { key: "aggravating", label: "Triggers / associated", type: "text" },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/**
 * Hearing loss. Name states hearing is reduced — ask onset (sudden = red flag),
 * side, and discharge (infection), not a redundant "Hearing affected?".
 */
const HEARING_LOSS_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "laterality",
    label: "Which ear",
    type: "chips",
    chips: ["Left", "Right", "Both"],
    placeholder: "Custom",
  },
  {
    key: "onset",
    label: "Onset",
    type: "chips",
    chips: ["sudden", "gradual"],
    placeholder: "Custom onset",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  {
    key: "color",
    label: "Discharge",
    type: "chips",
    chips: ["none", "watery", "pus", "blood"],
    placeholder: "Custom",
  },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/**
 * Ear discharge (otorrhoea). The name states there IS discharge, so ask its
 * type/colour + the things that change management (pain → otitis, hearing,
 * smell), not a contradictory "Discharge: none?".
 */
const EAR_DISCHARGE_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "laterality",
    label: "Which ear",
    type: "chips",
    chips: ["Left", "Right", "Both"],
    placeholder: "Custom",
  },
  {
    key: "color",
    label: "Discharge type",
    type: "chips",
    chips: ["watery", "pus (yellow)", "blood-stained", "foul-smelling"],
    placeholder: "Custom",
  },
  {
    key: "character",
    label: "Ear pain",
    type: "chips",
    chips: ["no", "yes"],
    placeholder: "Custom",
  },
  {
    key: "aggravating",
    label: "Hearing affected",
    type: "chips",
    chips: ["no", "reduced", "muffled"],
    placeholder: "Custom",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/**
 * Sticky / discharging eye (conjunctivitis). Name states discharge — ask its
 * type, redness + itching (allergic vs bacterial), not "Discharge: none?".
 */
const EYE_DISCHARGE_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "laterality",
    label: "Which eye",
    type: "chips",
    chips: ["Left", "Right", "Both"],
    placeholder: "Custom",
  },
  {
    key: "color",
    label: "Discharge type",
    type: "chips",
    chips: ["watery", "sticky/mucous", "pus (yellow-green)", "crusty in the morning"],
    placeholder: "Custom",
  },
  {
    key: "character",
    label: "Redness",
    type: "chips",
    chips: ["no", "yes"],
    placeholder: "Custom",
  },
  {
    key: "aggravating",
    label: "Itching",
    type: "chips",
    chips: ["no", "yes"],
    placeholder: "Custom",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes", type: "text" },
];

/**
 * Vaginal / white discharge (leucorrhoea). Name states discharge — ask its
 * colour, consistency, smell + itching (the things that separate physiological
 * from infective), not the generic gynae "Bleeding?" chips.
 */
const VAGINAL_DISCHARGE_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "color",
    label: "Colour",
    type: "chips",
    chips: ["white", "yellow", "green", "grey", "brown / blood-stained"],
    placeholder: "Custom",
  },
  {
    key: "character",
    label: "Consistency",
    type: "chips",
    chips: ["thick / curdy", "thin / watery", "frothy", "sticky"],
    placeholder: "Custom",
  },
  {
    key: "timing",
    label: "Smell",
    type: "chips",
    chips: ["none", "mild", "foul / fishy"],
    placeholder: "Custom",
  },
  {
    key: "aggravating",
    label: "Itching / irritation",
    type: "chips",
    chips: ["no", "yes"],
    placeholder: "Custom",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes (LMP, pregnancy, burning urine)", type: "text" },
];

/**
 * Nosebleed (epistaxis). Bleeding-specific: nostril, amount, frequency, triggers
 * + a notes line for the things that change management (BP, blood thinners).
 */
const NOSEBLEED_FIELDS: ComplaintAttributeFieldDef[] = [
  {
    key: "laterality",
    label: "Which nostril",
    type: "chips",
    chips: ["Left", "Right", "Both"],
    placeholder: "Custom",
  },
  {
    key: "frequency",
    label: "How often",
    type: "chips",
    chips: ["one-off", "occasional", "recurrent"],
    placeholder: "Custom",
  },
  {
    key: "character",
    label: "Amount",
    type: "chips",
    chips: ["spotting", "moderate", "heavy / dripping"],
    placeholder: "Custom",
  },
  {
    key: "aggravating",
    label: "Triggers",
    type: "chips",
    chips: ["none", "nose-picking", "trauma", "dry weather", "blood thinners"],
    placeholder: "Custom",
  },
  {
    key: "duration",
    label: "Duration",
    type: "duration",
    chips: [...DURATION_CHIPS],
    placeholder: "Custom duration",
  },
  { key: "severity", label: "Severity", type: "severity" },
  { key: "notes", label: "Notes (BP, bleeding disorder, medicines)", type: "text" },
];

/**
 * Name-keyed full schema overrides. Order matters — first match wins, so the
 * riskier substrings (e.g. dyspepsia before any bare token) come earlier.
 * Matching is whole-word/phrase so "heartburn" ≠ "burn" and "hair fall" ≠ "fall".
 */
const COMPLAINT_SCHEMA_OVERRIDES_BY_NAME: ReadonlyArray<{
  keywords: readonly string[];
  fields: readonly ComplaintAttributeFieldDef[];
}> = [
  { keywords: ["headache", "migraine", "cephalgia"], fields: HEADACHE_FIELDS },
  {
    keywords: ["chest pain", "pain in chest", "chest discomfort"],
    fields: CHEST_PAIN_FIELDS,
  },
  {
    keywords: [
      "heartburn",
      "acidity",
      "acid reflux",
      "reflux",
      "burping",
      "belching",
      "indigestion",
      "dyspepsia",
      "gas trouble",
    ],
    fields: DYSPEPSIA_FIELDS,
  },
  { keywords: ["bite", "sting"], fields: BITE_FIELDS },
  { keywords: ["burn", "scald"], fields: BURN_FIELDS },
  {
    keywords: [
      "wound",
      "cut",
      "laceration",
      "fall injury",
      "accident injury",
      "accident",
      "sports injury",
      "fracture",
      "sprain",
      "injury",
    ],
    fields: INJURY_FIELDS,
  },
  { keywords: ["vomiting", "vomit", "emesis"], fields: VOMITING_FIELDS },
  { keywords: ["constipation", "constipated"], fields: CONSTIPATION_FIELDS },
  {
    keywords: ["sore throat", "throat pain", "throat irritation", "hoarse", "hoarseness"],
    fields: THROAT_FIELDS,
  },
  {
    keywords: ["fainting", "loss of consciousness", "syncope", "blackout"],
    fields: SYNCOPE_FIELDS,
  },
  { keywords: ["ringing in ear", "ringing in ears", "tinnitus"], fields: TINNITUS_FIELDS },
  {
    keywords: [
      "ear discharge",
      "discharge from ear",
      "pus from ear",
      "fluid from ear",
      "ear leaking",
      "wet ear",
      "otorrhoea",
      "otorrhea",
    ],
    fields: EAR_DISCHARGE_FIELDS,
  },
  {
    keywords: [
      "eye discharge",
      "discharge from eye",
      "discharging eye",
      "sticky eye",
      "sticky eyes",
      "pus in eye",
      "crusty eyes",
      "gummy eye",
      "gluey eye",
    ],
    fields: EYE_DISCHARGE_FIELDS,
  },
  {
    keywords: [
      "vaginal discharge",
      "white discharge",
      "discharge per vagina",
      "leucorrhea",
      "leucorrhoea",
      "leukorrhea",
    ],
    fields: VAGINAL_DISCHARGE_FIELDS,
  },
  {
    keywords: [
      "nosebleed",
      "nose bleed",
      "nose bleeding",
      "bleeding from nose",
      "blood from nose",
      "epistaxis",
    ],
    fields: NOSEBLEED_FIELDS,
  },
  {
    keywords: ["something in eye", "something in ear", "foreign body"],
    fields: FOREIGN_BODY_FIELDS,
  },
  { keywords: ["blurred vision", "double vision", "blurring of vision"], fields: VISION_FIELDS },
  {
    keywords: ["hearing loss", "loss of hearing", "reduced hearing", "deafness"],
    fields: HEARING_LOSS_FIELDS,
  },
  { keywords: ["missed period", "missed periods", "amenorrhea"], fields: MISSED_PERIODS_FIELDS },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word/phrase match so "heartburn" ≠ "burn" and "hair fall" ≠ "fall injury". */
function nameMatchesKeyword(normalizedName: string, keyword: string): boolean {
  return new RegExp(`\\b${escapeRegExp(keyword)}\\b`).test(normalizedName);
}

function resolveSchemaOverrideByName(
  complaintName: string | undefined,
): ComplaintAttributeFieldDef[] | null {
  const normalized = (complaintName ?? "").trim().toLowerCase();
  if (!normalized) return null;

  for (const entry of COMPLAINT_SCHEMA_OVERRIDES_BY_NAME) {
    if (entry.keywords.some((keyword) => nameMatchesKeyword(normalized, keyword))) {
      return [...entry.fields];
    }
  }
  return null;
}

export function resolveComplaintAttributeFields(
  input: ResolveComplaintFieldsInput,
): ComplaintAttributeFieldDef[] {
  // 1. Bespoke name override wins over category — the name is the most specific
  //    signal, and it must beat even an explicit `complaint_master` category
  //    (e.g. "Dog bite" is category=trauma but needs the bite schema, not
  //    trauma's generic "Mechanism").
  const nameOverride = resolveSchemaOverrideByName(input.complaintName);
  if (nameOverride) return nameOverride;

  const category = resolveComplaintCategory(input);

  // 2. Pain gets a name-aware laterality prefix (Left/Right, Upper/Lower, …).
  if (category === "pain") {
    const chips = resolveLateralityChips(input);
    if (chips.length > 0) {
      const abdomen = isAbdomenComplaint(input.complaintName);
      const lateralityField: ComplaintAttributeFieldDef = {
        key: "laterality",
        // The abdomen grid IS the locator, so the generic free-text "Site" below
        // is relabelled to a secondary refinement to remove the overlap.
        label: abdomen ? "Abdomen area" : "Side / position",
        type: "chips",
        chips,
        placeholder: "Custom",
      };
      const painFields = withPainRadiationChips(
        abdomen
          ? COMPLAINT_SCHEMAS.pain.map((f) =>
              f.key === "location"
                ? {
                    ...f,
                    label: "Exact spot (optional)",
                    placeholder: "e.g. more precise area within the quadrant",
                  }
                : f,
            )
          : COMPLAINT_SCHEMAS.pain,
        input,
      );
      return [lateralityField, ...painFields];
    }
  }

  return COMPLAINT_SCHEMAS[category];
}

// ---------------------------------------------------------------------------
// Name-derived field prefill (subj-14 review).
// When a complaint name already states a chip value the schema would otherwise
// ask for blank ("Dry cough" → Type: dry, "Fever with chills" → Chills: yes),
// the card pre-selects that chip as the *real* value (written to the empty
// field on name recognition — not as a "prior charting" suggestion). The value
// is definitionally true from the name; the doctor taps another chip to change
// it. Only empty fields are filled, so a doctor's entry is never overwritten.
// ---------------------------------------------------------------------------

const COMPLAINT_NAME_FIELD_DEFAULTS: ReadonlyArray<{
  keywords: readonly string[];
  values: Partial<Pick<Complaint, ComplaintAttributeKey>>;
}> = [
  // Cough
  { keywords: ["dry cough"], values: { character: "dry" } },
  { keywords: ["cough with phlegm", "productive cough"], values: { character: "productive" } },
  {
    keywords: ["cough with blood"],
    values: { character: "productive", color: "blood-streaked" },
  },
  { keywords: ["barking cough"], values: { character: "barking" } },
  { keywords: ["cough with wheeze"], values: { character: "wheezy" } },
  { keywords: ["night cough"], values: { timing: "night" } },
  { keywords: ["morning cough"], values: { timing: "morning" } },
  // Fever
  { keywords: ["high fever"], values: { feverGrade: "high" } },
  { keywords: ["mild fever"], values: { feverGrade: "mild" } },
  { keywords: ["fever with chills"], values: { aggravating: "yes" } },
  { keywords: ["fever with shivering"], values: { aggravating: "shaking chills" } },
  { keywords: ["continuous fever"], values: { timing: "Constant" } },
  {
    keywords: ["fever that comes and goes", "intermittent fever"],
    values: { timing: "Comes and goes" },
  },
  // Urinary
  { keywords: ["burning urination"], values: { character: "burning" } },
  { keywords: ["frequent urination"], values: { frequency: "increased" } },
  { keywords: ["blood in urine"], values: { color: "blood" } },
  // ENT / nose
  { keywords: ["blocked nose"], values: { character: "blocked" } },
  { keywords: ["runny nose"], values: { character: "watery" } },
  // Eye / ear: vision & hearing handled by reframed schemas (VISION_FIELDS /
  // HEARING_LOSS_FIELDS), so no name-prefill here.
  // Gynae
  { keywords: ["irregular periods"], values: { timing: "irregular" } },
  { keywords: ["heavy periods"], values: { frequency: "heavy" } },
  { keywords: ["white discharge"], values: { color: "white" } },
  // Dizziness
  { keywords: ["spinning sensation"], values: { character: "spinning" } },
];

/**
 * Field values implied by the complaint name (for the suggestion pipeline).
 * Returns `{}` when nothing is implied. Whole-word/phrase matched.
 */
export function resolveComplaintNameFieldDefaults(
  complaintName: string | undefined,
): Partial<Pick<Complaint, ComplaintAttributeKey>> {
  const normalized = (complaintName ?? "").trim().toLowerCase();
  if (!normalized) return {};

  const merged: Partial<Pick<Complaint, ComplaintAttributeKey>> = {};
  for (const entry of COMPLAINT_NAME_FIELD_DEFAULTS) {
    if (entry.keywords.some((keyword) => nameMatchesKeyword(normalized, keyword))) {
      Object.assign(merged, entry.values);
    }
  }
  return merged;
}

/** Keys present in both schemas — values on these keys survive category re-resolve. */
export function sharedComplaintFieldKeys(
  from: ComplaintCategory,
  to: ComplaintCategory,
): ComplaintAttributeKey[] {
  const fromKeys = new Set(COMPLAINT_SCHEMAS[from].map((f) => f.key));
  return COMPLAINT_SCHEMAS[to].map((f) => f.key).filter((key) => fromKeys.has(key));
}

// ---------------------------------------------------------------------------
// Associated-symptom quick chips (subj-13)
// ---------------------------------------------------------------------------
// Common symptoms that travel with a recognised complaint, surfaced as tap-to-add
// chips in the card's associated section. Hand-curated (no backend) — free-text
// + autocomplete stay available for anything off-list.

const ASSOCIATED_SYMPTOM_CHIPS_BY_CATEGORY: Record<ComplaintCategory, string[]> = {
  pain: ["nausea", "vomiting", "sweating", "giddiness", "fever", "swelling"],
  fever: ["cough", "sore throat", "loose stools", "burning urination", "vomiting", "body ache"],
  cough: ["fever", "breathlessness", "wheeze", "chest pain", "sore throat", "cold"],
  git: ["nausea", "vomiting", "fever", "stomach pain", "weakness", "loss of appetite"],
  urinary: ["fever", "back pain", "stomach pain", "nausea", "blood in urine", "chills"],
  respiratory: ["cough", "wheeze", "chest pain", "fever", "palpitations", "leg swelling"],
  ent: ["fever", "headache", "cough", "ear pain", "body ache", "sneezing"],
  derm: ["itching", "fever", "swelling", "skin pain", "burning", "oozing"],
  eye: ["watery eyes", "red eye", "eye discharge", "itching", "blurred vision", "headache"],
  ear: ["ear discharge", "reduced hearing", "fever", "giddiness", "ear pain", "ringing in ear"],
  cardiac: ["breathlessness", "chest pain", "sweating", "giddiness", "fainting", "fatigue"],
  dizziness: ["nausea", "vomiting", "reduced hearing", "ringing in ear", "headache", "weakness"],
  gynae: ["stomach pain", "back pain", "fever", "white discharge", "weakness", "nausea"],
  mental: ["poor sleep", "loss of appetite", "fatigue", "palpitations", "headache", "low mood"],
  trauma: ["bleeding", "swelling", "pain", "bruising", "difficulty moving", "numbness"],
  default: ["fever", "nausea", "vomiting", "fatigue", "loss of appetite", "headache"],
};

/** Name-keyed overrides for the highest-value presentations. */
const ASSOCIATED_SYMPTOM_CHIPS_BY_NAME: ReadonlyArray<{
  keywords: readonly string[];
  chips: readonly string[];
}> = [
  {
    keywords: ["headache", "migraine", "cephalgia"],
    chips: [...HEADACHE_ASSOCIATED_CHIPS],
  },
  {
    keywords: ["chest pain"],
    chips: [
      "breathlessness",
      "sweating",
      "palpitations",
      "nausea",
      "giddiness",
      "fainting",
    ],
  },
];

/** Resolve the suggested associated-symptom chips for a complaint (name override → category). */
export function resolveAssociatedSymptomChips(
  input: ResolveComplaintFieldsInput,
): string[] {
  const normalized = (input.complaintName ?? "").trim().toLowerCase();
  if (normalized) {
    for (const entry of ASSOCIATED_SYMPTOM_CHIPS_BY_NAME) {
      if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
        return [...entry.chips];
      }
    }
  }
  return [...ASSOCIATED_SYMPTOM_CHIPS_BY_CATEGORY[resolveComplaintCategory(input)]];
}
