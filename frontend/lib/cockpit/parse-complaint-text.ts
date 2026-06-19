/**
 * Lightweight, deterministic parser for free-typed chief complaints.
 *
 * Doctors often type the whole phrase in one go — "pain in stomach in upper
 * region for 5 days burning also associated with nausea". This splits known
 * detail tokens into their fields (duration, severity, onset, character,
 * radiation, laterality) plus an associated-symptom list, and leaves the residue
 * as the complaint name. It is intentionally rule-based (no network / model) so
 * capture stays instant and predictable; anything it can't classify stays in the
 * name and the doctor can edit fields manually.
 *
 * Laterality is schema-aware: the position word ("upper", "right") is mapped onto
 * the resolved complaint's own laterality chips (Upper/Mid/Lower for axial sites,
 * Left/Right/Both for paired ones), so a value is only set when the card can show
 * it. Leading side words ("Right leg pain") stay in the name and merely pre-select
 * the chip; only connector/region-introduced position phrases ("in upper region")
 * are stripped from the name.
 */

import type { Complaint, ComplaintSeverity } from "@/types/prescription";
import { serializeDuration, type DurationUnit } from "@/lib/cockpit/complaint-duration";
import { formatComplaintDisplayName } from "@/lib/cockpit/complaint-display";
import {
  CHEST_LOCATION_PARSE_ALIASES,
  CHEST_WHEN_PARSE_ALIASES,
  FEVER_TIMING_PARSE_ALIASES,
  HEADACHE_LOCATION_PARSE_ALIASES,
  isChestPainSchema,
  isChestPainWhenField,
  isFeverComplaintTimingField,
  isHeadacheSchema,
  isPainPatternTimingField,
  normalizeParsedComplaintPatch,
  ONSET_PARSE_ALIASES,
  PAIN_TIMING_PARSE_ALIASES,
  resolveComplaintAttributeFields,
} from "@/lib/cockpit/complaint-schema";
import { painScoreToSeverityBand } from "@/lib/cockpit/complaint-card-state";
import {
  temperatureToFeverGrade,
  type TemperatureUnit,
} from "@/lib/cockpit/fever-temperature";

export type ParsedComplaintPatch = Partial<
  Pick<
    Complaint,
    | "duration"
    | "severity"
    | "painScore"
    | "temperature"
    | "temperatureUnit"
    | "feverGrade"
    | "onset"
    | "character"
    | "radiation"
    | "laterality"
    | "timing"
    | "color"
    | "frequency"
    | "location"
    | "aggravating"
    | "relieving"
  >
>;

export interface ParsedComplaint {
  /** Residual complaint name after tokens are stripped. */
  name: string;
  /** Structured fields detected in the text (only non-empty keys present). */
  patch: ParsedComplaintPatch;
  /** Associated-symptom names detected ("associated with nausea, vomiting"). */
  associated: string[];
}

const UNIT_TOKEN_TO_UNIT: Record<string, DurationUnit> = {
  h: "hour",
  hr: "hour",
  hrs: "hour",
  hour: "hour",
  hours: "hour",
  d: "day",
  day: "day",
  days: "day",
  w: "week",
  wk: "week",
  wks: "week",
  week: "week",
  weeks: "week",
  mo: "month",
  mos: "month",
  month: "month",
  months: "month",
  y: "year",
  yr: "year",
  yrs: "year",
  year: "year",
  years: "year",
};

const SEVERITY_TOKEN_TO_VALUE: Record<string, ComplaintSeverity> = {
  // `minimal` is no longer offered in the UI — map the word to the nearest band.
  minimal: "mild",
  slight: "mild",
  mild: "mild",
  moderate: "moderate",
  severe: "severe",
  intense: "severe",
  // The strongest words map to the top band.
  worst: "very_severe",
  excruciating: "very_severe",
  unbearable: "very_severe",
};

const ONSET_TOKEN_TO_VALUE: Record<string, string> = {
  sudden: "Sudden",
  abrupt: "Sudden",
  acute: "Sudden",
  gradual: "Gradual",
  insidious: "Gradual",
};

const CHARACTER_TOKENS = [
  "throbbing",
  "dull",
  "sharp",
  "burning",
  "cramping",
  "stabbing",
  "aching",
  "colicky",
  "shooting",
  "gnawing",
  "squeezing",
  "pricking",
  "tightness",
  "tight",
] as const;

/** Connector words trimmed from the residual name edges (e.g. "fever x 3 days"). */
const EDGE_CONNECTORS = new Set([
  "x",
  "for",
  "since",
  "of",
  "with",
  "and",
  "the",
  "a",
  "from",
  "also",
  "in",
  "on",
]);

/** Position words we map onto a complaint's laterality chips. */
const LATERALITY_WORDS = [
  "left",
  "right",
  "both",
  "bilateral",
  "central",
  "centre",
  "center",
  "upper",
  "lower",
  "mid",
  "middle",
] as const;

/** Spoken/typed variants → the canonical token used to match a chip. */
const LATERALITY_WORD_SYNONYM: Record<string, string> = {
  bilateral: "both",
  centre: "central",
  center: "central",
  middle: "mid",
};

/** Nouns that mark a position *phrase* (and therefore detail to strip). */
const POSITION_NOUN = "(?:regions?|parts?|areas?|sides?|aspects?|zones?|quadrants?)";

/**
 * Abdomen 9-region grid (Part 2). Two tiers:
 *  - STRONG: an unambiguous quadrant phrase ("upper left", "epigastric", "around
 *    the navel", "in upper region") — set the chip AND strip it from the name.
 *  - WEAK: a bare single position word ("upper", "left") — pre-select the most
 *    likely chip but LEAVE it in the name (mirrors the leading-side-word rule).
 * Only used when the resolved schema is the abdomen grid (detected by "Around navel").
 */
const ABDOMEN_GRID_MARKER = "around navel";

const ABDOMEN_STRONG: ReadonlyArray<{ re: RegExp; chip: string }> = [
  { re: /\b(?:upper|top)[\s-]+left\b/, chip: "Upper left" },
  { re: /\bleft[\s-]+(?:upper|top)\b/, chip: "Upper left" },
  { re: /\b(?:upper|top)[\s-]+right\b/, chip: "Upper right" },
  { re: /\bright[\s-]+(?:upper|top)\b/, chip: "Upper right" },
  { re: /\b(?:lower|bottom)[\s-]+left\b/, chip: "Lower left" },
  { re: /\bleft[\s-]+(?:lower|bottom)\b/, chip: "Lower left" },
  { re: /\b(?:lower|bottom)[\s-]+right\b/, chip: "Lower right" },
  { re: /\bright[\s-]+(?:lower|bottom)\b/, chip: "Lower right" },
  { re: /\bepigastr\w*\b/, chip: "Upper middle" },
  { re: /\bpit of (?:the )?stomach\b/, chip: "Upper middle" },
  { re: /\bupper\s+(?:mid|middle|central|centre|center)\b/, chip: "Upper middle" },
  { re: /\bupper\s+(?:region|area|part|quadrant|third)\b/, chip: "Upper middle" },
  { re: /\b(?:hypogastr\w*|suprapubic)\b/, chip: "Lower middle" },
  { re: /\blower\s+(?:mid|middle|central|centre|center)\b/, chip: "Lower middle" },
  { re: /\blower\s+(?:region|area|part|quadrant|third)\b/, chip: "Lower middle" },
  {
    re: /\b(?:around|near)\s+(?:the\s+)?(?:navel|belly[\s-]?button|umbilic\w*)\b/,
    chip: "Around navel",
  },
  { re: /\bperi[\s-]?umbilical\b/, chip: "Around navel" },
  { re: /\b(?:mid|middle)\s+(?:region|area|part|quadrant)\b/, chip: "Around navel" },
  { re: /\bleft\s+(?:side|flank|lumbar|iliac)\b/, chip: "Left side" },
  { re: /\bright\s+(?:side|flank|lumbar|iliac)\b/, chip: "Right side" },
];

const ABDOMEN_WEAK: ReadonlyArray<{ re: RegExp; chip: string }> = [
  { re: /\bupper\b/, chip: "Upper middle" },
  { re: /\blower\b/, chip: "Lower middle" },
  { re: /\b(?:mid|middle|navel|umbilic\w*)\b/, chip: "Around navel" },
  { re: /\bleft\b/, chip: "Left side" },
  { re: /\bright\b/, chip: "Right side" },
];

function matchAbdomenQuadrant(
  lower: string,
  removed: boolean[],
): { chip: string; start: number; end: number; strip: boolean } | null {
  for (const { re, chip } of ABDOMEN_STRONG) {
    const m = re.exec(lower);
    if (m && m.index !== undefined && !removed[m.index]) {
      let start = m.index;
      let end = m.index + m[0].length;
      // Absorb a leading connector ("in (the)") so "in upper region" goes whole.
      const pre = lower.slice(0, start).match(/(?:\b(?:in|on|at|over)\b\s*)?(?:\bthe\b\s*)?$/);
      if (pre && pre[0]) start -= pre[0].length;
      // Absorb a trailing region noun not already inside the match.
      const post = lower.slice(end).match(/^\s*(?:regions?|areas?|parts?|quadrants?)\b/);
      if (post) end += post[0].length;
      return { chip, start, end, strip: true };
    }
  }
  for (const { re, chip } of ABDOMEN_WEAK) {
    const m = re.exec(lower);
    if (m && m.index !== undefined && !removed[m.index]) {
      return { chip, start: m.index, end: m.index + m[0].length, strip: false };
    }
  }
  return null;
}

/**
 * Map a detected position word onto one of the complaint's laterality chips.
 * Token-aware so "both" → "Both sides" (headache) and "right" → "Right".
 */
function mapWordToLateralityChip(word: string, chips: string[]): string | null {
  const target = LATERALITY_WORD_SYNONYM[word] ?? word;
  for (const chip of chips) {
    const lower = chip.toLowerCase();
    if (lower === target) return chip;
    if (lower.split(/\s+/).includes(target)) return chip;
  }
  return null;
}

/** Laterality chips for a complaint, or [] when laterality is not modelled. */
function lateralityChipsFor(
  name: string,
  category?: Complaint["category"],
): string[] {
  const fields = resolveComplaintAttributeFields({
    complaintName: name,
    category: category ?? null,
  });
  const field = fields.find((f) => f.key === "laterality");
  return field?.chips ?? [];
}

/**
 * Whether a parsed laterality value is valid for (i.e. shown by) a complaint's
 * schema. Used when a catalog match renames the card: laterality was derived
 * from the typed text's residue name, so re-validate against the final name +
 * category before keeping it (the catalog schema may model laterality
 * differently, or not at all).
 */
export function isLateralityValidForComplaint(
  name: string,
  category: Complaint["category"] | undefined,
  value: string | undefined,
): boolean {
  if (!value) return true;
  return lateralityChipsFor(name, category).includes(value);
}

// ---------------------------------------------------------------------------
// Schema-driven chip-field extraction (timing / colour / frequency / location).
// Each of these fields is filled from its OWN chip vocabulary on the resolved
// schema, so adding a new category schema automatically gets parsing for free.
// ---------------------------------------------------------------------------

/** Field keys we auto-fill from the schema's chip palette. */
const CHIP_AUTOFILL_KEYS = new Set<string>(["timing", "color", "frequency", "location"]);

/**
 * Chip values too generic / answer-style to safely auto-match from free text
 * ("no fever" must not set a "no" chip; "normal urine" must not be claimed).
 */
const UNMATCHABLE_CHIP_VALUES = new Set([
  "none",
  "no",
  "yes",
  "normal",
  "unsure",
  "random",
  "varies",
]);

/** Clause connectors that introduce a detail phrase ("at night", "with blood"). */
const CHIP_CLAUSE_CONNECTOR_RE = /(?:\b(?:with|at|after|before|having|of|and)\b\s*|[,;&]\s*)$/;

function chipIsMatchable(chip: string): boolean {
  const c = chip.trim().toLowerCase();
  if (!c) return false;
  if (UNMATCHABLE_CHIP_VALUES.has(c)) return false;
  // Skip pure numeric / range chips ("1–2", "3–5", ">5", "3+") — doctors don't
  // type those literally.
  return /[a-z]/.test(c);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Hyphen/space-tolerant, word-boundary regex for a (possibly multiword) chip. */
function chipToRegex(chip: string): RegExp {
  const words = chip
    .toLowerCase()
    .replace(/[-–]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(escapeRegExp);
  return new RegExp(`\\b${words.join("[\\s-–]+")}\\b`);
}

/** Earliest non-removed match of any matchable chip (longest phrase preferred). */
function findChipMatch(
  lower: string,
  removed: boolean[],
  chips: string[],
): { chip: string; start: number; end: number } | null {
  const candidates = chips
    .filter(chipIsMatchable)
    .sort((a, b) => b.length - a.length);
  for (const chip of candidates) {
    const m = chipToRegex(chip).exec(lower);
    if (m && m.index !== undefined && !removed[m.index]) {
      return { chip, start: m.index, end: m.index + m[0].length };
    }
  }
  return null;
}

/**
 * Length of a clause connector immediately before `start` (so it can be stripped
 * with the chip), or -1 when the chip is a bare descriptor that should stay in
 * the name (e.g. "night cough" keeps "night"; "cough at night" strips "at night").
 */
function chipConnectorPrefixLength(lower: string, start: number): number {
  const m = CHIP_CLAUSE_CONNECTOR_RE.exec(lower.slice(0, start));
  return m ? m[0].length : -1;
}

// ---------------------------------------------------------------------------
// Aggravating / relieving factors — cue-gated free-text capture.
// Only fired when the resolved schema exposes a *semantically* aggravating /
// relieving text field (label allow-list), so the generic `aggravating` /
// `relieving` keys aren't mis-filled on fields that merely reuse them (e.g.
// trauma's "Tetanus / rabies cover", fever's "Chills"). Each captures the factor
// phrase up to the next clause boundary (the other cue, "and"/"but", punctuation).
// ---------------------------------------------------------------------------

/** Labels that mean the `aggravating` key is actually an aggravating-factor field. */
const AGGRAVATING_LABEL_RE = /aggravat|exacerbat|trigger|worse/i;
/** Labels that mean the `relieving` key is actually a relieving-factor field. */
const RELIEVING_LABEL_RE = /reliev/i;

const AGGRAVATING_CUE_RE =
  /\b(?:worse(?:ns|ned)?\s+(?:on|with|after|when|by)|aggravated\s+(?:by|on|with)|exacerbated\s+by|triggered\s+by|brought\s+on\s+by)\s+(.+?)(?=$|[,;.]|\s+(?:and|but|also|relieved|reliever|better|eases|eased|improves|improved|relief|settles|associated)\b)/i;

const RELIEVING_CUE_RE =
  /\b(?:relieved\s+(?:by|with|on)|better\s+(?:with|on|after)|eases\s+with|eased\s+(?:by|with)|improves\s+with|improved\s+with|relief\s+(?:with|on)|settles\s+with)\s+(.+?)(?=$|[,;.]|\s+(?:and|but|also|worse|worsens|worsened|aggravated|exacerbated|triggered|brought|associated)\b)/i;

/**
 * Capture a cue-introduced factor phrase. Returns the original-case factor plus
 * the [start,end) span (cue + factor) to mask, or null when nothing usable.
 */
function extractCuePhrase(
  original: string,
  lower: string,
  removed: boolean[],
  re: RegExp,
): { text: string; start: number; end: number } | null {
  const m = re.exec(lower);
  if (!m || m.index === undefined || removed[m.index]) return null;
  const group = m[1] ?? "";
  if (!group.trim()) return null;
  const groupStart = m.index + m[0].length - group.length;
  const text = original
    .slice(groupStart, groupStart + group.length)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,;:.\-]+|[,;:.\-]+$/g, "")
    .trim();
  if (!text) return null;
  return { text, start: m.index, end: m.index + m[0].length };
}

function buildFromMask(source: string, removed: boolean[]): string {
  let out = "";
  for (let i = 0; i < source.length; i += 1) {
    out += removed[i] ? " " : source[i];
  }
  return out;
}

function cleanName(masked: string): string {
  const collapsed = masked.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  const tokens = collapsed.split(" ");
  while (tokens.length > 0 && isStrippableEdge(tokens[0]!)) tokens.shift();
  while (tokens.length > 0 && isStrippableEdge(tokens[tokens.length - 1]!)) tokens.pop();
  return tokens.join(" ").replace(/\s+([,;:.-])/g, "$1").trim();
}

function isStrippableEdge(token: string): boolean {
  const bare = token.replace(/[,;:.~=-]/g, "").toLowerCase();
  if (bare === "") return true;
  return EDGE_CONNECTORS.has(bare);
}

/**
 * Parse a raw complaint string into a name + structured patch. Pure + synchronous.
 */
export function parseComplaintText(raw: string): ParsedComplaint {
  const original = raw.trim();
  if (!original) return { name: "", patch: {}, associated: [] };

  const lower = original.toLowerCase();
  const removed = new Array<boolean>(original.length).fill(false);
  const patch: ParsedComplaintPatch = {};

  const mark = (start: number, end: number) => {
    for (let i = start; i < end && i < removed.length; i += 1) removed[i] = true;
  };

  // 1) Duration — numeric + unit (also strips a leading connector like "x"/"for"/"since").
  const durationRe = /\b(\d{1,4})\s*(h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years)\b/;
  const durMatch = durationRe.exec(lower);
  if (durMatch && durMatch.index !== undefined) {
    const value = Number.parseInt(durMatch[1]!, 10);
    const unit = UNIT_TOKEN_TO_UNIT[durMatch[2]!];
    if (unit && Number.isFinite(value) && value > 0) {
      patch.duration = serializeDuration(value, unit);
      let start = durMatch.index;
      // Absorb an immediately-preceding connector token (x / for / since / ~ / =).
      const prefix = lower.slice(0, start).match(/(\b(?:x|for|since)\b\s*|[~=]\s*)$/);
      if (prefix) start -= prefix[0].length;
      mark(start, durMatch.index + durMatch[0].length);
    }
  } else {
    const relativeRe = /\b(today|yesterday|overnight)\b/;
    const relMatch = relativeRe.exec(lower);
    if (relMatch && relMatch.index !== undefined) {
      const word = relMatch[1]!;
      patch.duration = word.charAt(0).toUpperCase() + word.slice(1);
      mark(relMatch.index, relMatch.index + word.length);
    }
  }

  // 2) Severity (incl. synonyms). A leading "very" promotes severe/intense to
  //    the top band ("very severe" → very_severe).
  const severityRe =
    /\b(?:(very|really)\s+)?(minimal|slight|mild|moderate|severe|intense|worst|excruciating|unbearable)\b/;
  const sevMatch = severityRe.exec(lower);
  if (sevMatch && sevMatch.index !== undefined && !removed[sevMatch.index]) {
    const intensifier = sevMatch[1];
    const word = sevMatch[2]!;
    patch.severity =
      intensifier && (word === "severe" || word === "intense")
        ? "very_severe"
        : SEVERITY_TOKEN_TO_VALUE[word];
    mark(sevMatch.index, sevMatch.index + sevMatch[0].length);
  }

  // 3) Onset (mode of onset, not duration) — also absorbs a trailing "onset" word.
  const onsetRe = /\b(sudden|abrupt|acute|gradual|insidious)\b(?:\s+onset)?/;
  const onsetMatch = onsetRe.exec(lower);
  if (onsetMatch && onsetMatch.index !== undefined && !removed[onsetMatch.index]) {
    patch.onset = ONSET_TOKEN_TO_VALUE[onsetMatch[1]!];
    mark(onsetMatch.index, onsetMatch.index + onsetMatch[0].length);
  }

  // 4) Character.
  for (const token of CHARACTER_TOKENS) {
    const re = new RegExp(`\\b${token}\\b`);
    const m = re.exec(lower);
    if (m && m.index !== undefined && !removed[m.index]) {
      patch.character = token;
      mark(m.index, m.index + token.length);
      break;
    }
  }

  // 5) Radiation — "radiating to <target>"; target runs to the end of the
  //    remaining (non-removed) text, so any trailing duration already stripped.
  const radiationRe = /\bradiat(?:ing|es|ion|ed)?\b\s*(?:to|towards|into|down to|down)?\s*/;
  const radMatch = radiationRe.exec(lower);
  if (radMatch && radMatch.index !== undefined && !removed[radMatch.index]) {
    const targetStart = radMatch.index + radMatch[0].length;
    let target = "";
    for (let i = targetStart; i < original.length; i += 1) {
      if (!removed[i]) target += original[i];
    }
    target = target.replace(/\s+/g, " ").trim().replace(/^[,;:-]+|[,;:-]+$/g, "").trim();
    if (target) {
      patch.radiation = target;
      mark(radMatch.index, original.length);
    }
  }

  // 6) Associated symptoms — "(also) associated with / along with X, Y and Z".
  //    Runs after the other detail is masked so it captures only the symptom list.
  const associated: string[] = [];
  const associatedRe = /\b(?:also\s+)?(?:associated\s+with|associated\s+by|along\s*with|a\/w)\b\s*/;
  const assocMatch = associatedRe.exec(lower);
  if (assocMatch && assocMatch.index !== undefined && !removed[assocMatch.index]) {
    const listStart = assocMatch.index + assocMatch[0].length;
    let rest = "";
    for (let i = listStart; i < original.length; i += 1) {
      if (!removed[i]) rest += original[i];
    }
    const names = rest
      .split(/,|;|\band\b|&|\+/)
      .map((s) => s.trim().replace(/^[,;:.\-]+|[,;:.\-]+$/g, "").trim())
      .filter((s) => s.length > 0 && s.split(/\s+/).length <= 5);
    const seen = new Set<string>();
    for (const candidate of names) {
      const key = candidate.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      associated.push(candidate);
    }
    if (associated.length > 0) mark(assocMatch.index, original.length);
  }

  // 7) Noise: "burning in nature", "dull in character" — the qualifier word is
  //    already captured; drop the dangling connector phrase.
  const noiseRe = /\b(?:in|of)\s+(?:nature|character)\b/g;
  for (let nm = noiseRe.exec(lower); nm; nm = noiseRe.exec(lower)) {
    mark(nm.index, nm.index + nm[0].length);
  }

  // Resolve the schema once from the tentative (residue) name; reused for
  //  laterality + chip-field auto-fill below.
  const tentativeName = cleanName(buildFromMask(original, removed)) || original;
  const schemaFields = resolveComplaintAttributeFields({ complaintName: tentativeName });

  // 7b) Numeric pain score — "7/10", "pain 8 out of 10". Only applied when the
  //     resolved card actually exposes a 0–10 pain scale (pain / headache).
  if (schemaFields.some((f) => f.key === "painScore")) {
    // Note: no "pain" prefix here — "pain" is part of the complaint name
    // ("knee pain 7/10" must keep "Knee pain"). Only metadata words are absorbed.
    const scoreRe = /\b(?:score\s+|scale\s+of\s+|rated\s+)?(\d{1,2})\s*(?:\/|out\s+of)\s*10\b/;
    const scoreMatch = scoreRe.exec(lower);
    if (scoreMatch && scoreMatch.index !== undefined && !removed[scoreMatch.index]) {
      const n = Number.parseInt(scoreMatch[1]!, 10);
      if (Number.isFinite(n) && n >= 0 && n <= 10) {
        patch.painScore = n;
        if (patch.severity === undefined) {
          const band = painScoreToSeverityBand(n);
          if (band) patch.severity = band;
        }
        mark(scoreMatch.index, scoreMatch.index + scoreMatch[0].length);
      }
    }
  }

  // 7c) Fever temperature — "fever 102", "102°F", "38.5C". Only when the card
  //     exposes the linked temperature control (fever schema).
  if (schemaFields.some((f) => f.type === "temperature")) {
    const feverTempPatterns: Array<{
      re: RegExp;
      unit: TemperatureUnit;
      min: number;
      max: number;
      /** Strip only the numeric token — keep "fever" in the complaint name. */
      markNumericOnly?: boolean;
    }> = [
      {
        re: /\b(\d{2}(?:\.\d)?)\s*(?:°\s*)?(?:c|celsius)\b/i,
        unit: "C",
        min: 35,
        max: 43,
      },
      {
        re: /\b(\d{2,3}(?:\.\d)?)\s*(?:°\s*)?(?:f|fahrenheit)\b/i,
        unit: "F",
        min: 95,
        max: 110,
      },
      {
        re: /\b(?:temp(?:erature)?|fever)\s*(?:of\s+|at\s+|is\s+)?(\d{2,3}(?:\.\d)?)\b/i,
        unit: "F",
        min: 99,
        max: 110,
        markNumericOnly: true,
      },
    ];

    for (const { re, unit, min, max, markNumericOnly } of feverTempPatterns) {
      const tempMatch = re.exec(lower);
      if (!tempMatch || tempMatch.index === undefined || removed[tempMatch.index]) continue;
      const n = Number.parseFloat(tempMatch[1]!);
      if (!Number.isFinite(n) || n < min || n > max) continue;
      const rounded = Math.round(n * 10) / 10;
      patch.temperature = rounded;
      patch.temperatureUnit = unit;
      patch.feverGrade = temperatureToFeverGrade(rounded, unit);
      if (markNumericOnly) {
        const groupStart = tempMatch.index + tempMatch[0].indexOf(tempMatch[1]!);
        let markStart = groupStart;
        if (markStart > tempMatch.index && lower[markStart - 1] === " ") {
          markStart -= 1;
        }
        mark(markStart, tempMatch.index + tempMatch[0].length);
      } else {
        mark(tempMatch.index, tempMatch.index + tempMatch[0].length);
      }
      break;
    }
  }

  // 8) Laterality / position — schema-aware. (a) strip connector/region phrases
  //    like "in upper region", and (b) pre-select from a bare side word
  //    ("Right leg pain") without stripping it from the name.
  const lateralityChipsAll = schemaFields.find((f) => f.key === "laterality")?.chips ?? [];
  const isAbdomenGrid = lateralityChipsAll.some((c) => c.toLowerCase() === ABDOMEN_GRID_MARKER);
  if (isAbdomenGrid) {
    // Abdomen 9-region grid — single-word chips can't be matched generically
    // (a bare "upper" maps to 3 chips), so use the dedicated quadrant matcher.
    const abdo = matchAbdomenQuadrant(lower, removed);
    if (abdo) {
      patch.laterality = abdo.chip;
      if (abdo.strip) mark(abdo.start, abdo.end);
    }
  } else {
    const hasPositionWord = new RegExp(`\\b(${LATERALITY_WORDS.join("|")})\\b`).test(lower);
    const lateralityChips = hasPositionWord ? lateralityChipsAll : [];
    if (lateralityChips.length > 0) {
      const stripRe = new RegExp(
        `\\b(?:in|on|over|at|to)?\\s*(?:the\\s+)?(${LATERALITY_WORDS.join("|")})\\s+${POSITION_NOUN}\\b`,
      );
      const stripMatch = stripRe.exec(lower);
      if (stripMatch && stripMatch.index !== undefined && !removed[stripMatch.index]) {
        const chip = mapWordToLateralityChip(stripMatch[1]!, lateralityChips);
        if (chip) {
          patch.laterality = chip;
          mark(stripMatch.index, stripMatch.index + stripMatch[0].length);
        }
      }

      if (!patch.laterality) {
        const bareRe = new RegExp(`\\b(${LATERALITY_WORDS.join("|")})\\b`);
        const bareMatch = bareRe.exec(lower);
        if (bareMatch && bareMatch.index !== undefined && !removed[bareMatch.index]) {
          const chip = mapWordToLateralityChip(bareMatch[1]!, lateralityChips);
          if (chip) patch.laterality = chip;
        }
      }
    }
  }

  // 8a) Onset — patient-language chips plus legacy medical aliases.
  if (schemaFields.some((f) => f.key === "onset") && !patch.onset) {
    for (const { re, value } of ONSET_PARSE_ALIASES) {
      const m = re.exec(lower);
      if (m && m.index !== undefined && !removed[m.index]) {
        patch.onset = value;
        const connLen = chipConnectorPrefixLength(lower, m.index);
        if (connLen >= 0) {
          mark(m.index - connLen, m.index + m[0].length);
        }
        break;
      }
    }
  }

  // 8b) Headache region — anatomical aliases → patient-language chips.
  if (isHeadacheSchema(schemaFields) && !patch.location) {
    for (const { re, value } of HEADACHE_LOCATION_PARSE_ALIASES) {
      const m = re.exec(lower);
      if (m && m.index !== undefined && !removed[m.index]) {
        patch.location = value;
        const connLen = chipConnectorPrefixLength(lower, m.index);
        if (connLen >= 0) {
          mark(m.index - connLen, m.index + m[0].length);
        }
        break;
      }
    }
  }

  // 8b2) Chest pain location — anatomical aliases → patient-language chips.
  if (isChestPainSchema(schemaFields) && !patch.laterality) {
    for (const { re, value } of CHEST_LOCATION_PARSE_ALIASES) {
      const m = re.exec(lower);
      if (m && m.index !== undefined && !removed[m.index]) {
        patch.laterality = value;
        const connLen = chipConnectorPrefixLength(lower, m.index);
        if (connLen >= 0) {
          mark(m.index - connLen, m.index + m[0].length);
        }
        break;
      }
    }
  }

  // 8c) Pain / headache pattern — patient-language chips plus legacy aliases.
  if (isPainPatternTimingField(schemaFields) && !patch.timing) {
    for (const { re, value } of PAIN_TIMING_PARSE_ALIASES) {
      const m = re.exec(lower);
      if (m && m.index !== undefined && !removed[m.index]) {
        patch.timing = value;
        const connLen = chipConnectorPrefixLength(lower, m.index);
        if (connLen >= 0) {
          mark(m.index - connLen, m.index + m[0].length);
        }
        break;
      }
    }
  }

  // 8c2) Chest pain when — exertional / rest / positional chips.
  if (isChestPainWhenField(schemaFields) && !patch.timing) {
    for (const { re, value } of CHEST_WHEN_PARSE_ALIASES) {
      const m = re.exec(lower);
      if (m && m.index !== undefined && !removed[m.index]) {
        patch.timing = value;
        const connLen = chipConnectorPrefixLength(lower, m.index);
        if (connLen >= 0) {
          mark(m.index - connLen, m.index + m[0].length);
        }
        break;
      }
    }
  }

  // 8d) Fever pattern — patient-language chips plus legacy medical aliases
  //     ("intermittent", "continuous") so free-typed capture still pre-fills.
  if (isFeverComplaintTimingField(schemaFields) && !patch.timing) {
    for (const { re, value } of FEVER_TIMING_PARSE_ALIASES) {
      const m = re.exec(lower);
      if (m && m.index !== undefined && !removed[m.index]) {
        patch.timing = value;
        const connLen = chipConnectorPrefixLength(lower, m.index);
        if (connLen >= 0) {
          mark(m.index - connLen, m.index + m[0].length);
        }
        break;
      }
    }
  }

  // 9) Schema-driven chip fields — timing / colour / frequency / chip-location.
  //    Matched against each field's own chip vocabulary. The value is stripped
  //    from the name only when connector-introduced ("at night", "with blood");
  //    a bare leading descriptor ("night cough") stays in the name + pre-selects.
  for (const field of schemaFields) {
    if (!CHIP_AUTOFILL_KEYS.has(field.key)) continue;
    if (field.type !== "chips") continue;
    if ((patch as Record<string, unknown>)[field.key]) continue;
    const match = findChipMatch(lower, removed, field.chips ?? []);
    if (!match) continue;
    (patch as Record<string, string>)[field.key] = match.chip;
    const connLen = chipConnectorPrefixLength(lower, match.start);
    if (connLen >= 0) mark(match.start - connLen, match.end);
  }

  // 10) Aggravating / relieving — cue-gated, only for schemas whose aggravating /
  //     relieving text field is semantically that (label allow-list).
  const aggravatingField = schemaFields.find(
    (f) =>
      f.key === "aggravating" &&
      (f.type === "text" || f.type === "chips") &&
      AGGRAVATING_LABEL_RE.test(f.label),
  );
  if (aggravatingField && !patch.aggravating) {
    const r = extractCuePhrase(original, lower, removed, AGGRAVATING_CUE_RE);
    if (r) {
      patch.aggravating = r.text;
      mark(r.start, r.end);
    }
  }
  const relievingField = schemaFields.find(
    (f) =>
      f.key === "relieving" &&
      (f.type === "text" || f.type === "chips") &&
      RELIEVING_LABEL_RE.test(f.label),
  );
  if (relievingField && !patch.relieving) {
    const r = extractCuePhrase(original, lower, removed, RELIEVING_CUE_RE);
    if (r) {
      patch.relieving = r.text;
      mark(r.start, r.end);
    }
  }

  // 11) Free-text location — "over <site>" (clearly locational), for schemas with
  //     a text location field. Captured to the end of the remaining text.
  const textLocationField = schemaFields.find(
    (f) => f.key === "location" && f.type === "text",
  );
  if (textLocationField && !patch.location) {
    const overMatch = /\bover\s+(?:the\s+)?/.exec(lower);
    if (overMatch && overMatch.index !== undefined && !removed[overMatch.index]) {
      let site = "";
      for (let i = overMatch.index + overMatch[0].length; i < original.length; i += 1) {
        if (!removed[i]) site += original[i];
      }
      site = site.replace(/\s+/g, " ").trim().replace(/^[,;:.\-]+|[,;:.\-]+$/g, "").trim();
      if (site && site.split(/\s+/).length <= 5) {
        patch.location = site;
        mark(overMatch.index, original.length);
      }
    }
  }

  const name = cleanName(buildFromMask(original, removed)) || original;

  // Drop any keys that ended up empty.
  for (const key of Object.keys(patch) as Array<keyof ParsedComplaintPatch>) {
    const v = patch[key];
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
      delete patch[key];
    }
  }

  Object.assign(patch, normalizeParsedComplaintPatch(patch, schemaFields));

  return { name: formatComplaintDisplayName(name), patch, associated };
}
