/**
 * Deterministic one-line medicine sig parser (medicine card redesign).
 *
 * Turns clinic shorthand like
 *
 *   "amlodipine 5 mg 2 tab od for 30 days after food"
 *   "syp dextromethorphan 2 spoon bd 5 days"
 *   "ointment betamethasone twice at site for 10 days avoid face"
 *   "tab dolo 650 1-0-1 x 5d"
 *
 * into the structured `MedicineRowValue` fields. Mirrors the
 * chief-complaint capture pattern: deterministic token passes first;
 * anything unrecognised lands verbatim in `instructions` so nothing the
 * doctor typed is ever lost.
 */

import type {
  DoseUnit,
  DurationUnit,
  FoodTiming,
  FrequencyCode,
  RouteCode,
} from "@/types/prescription";
import type {
  PatientConditionAgoUnit,
  PatientMedicationIntakePattern,
  PatientMedicationSource,
  PatientMedicationStatus,
  PatientMedicationStopReason,
} from "@/types/patient-chart";
import {
  formatDurationLegacyLabel,
  getFoodTimingLabel,
  getFrequencyLegacyLabel,
  getRouteLegacyLabel,
} from "@/lib/medicineCodes";
import { resolveIntakePatternPolicy } from "@/lib/cockpit/intake-pattern-policy";

export interface ParsedMedicineLine {
  medicineName: string;
  /** Strength text, e.g. "5 mg", "5/80 mg", "0.05%". */
  dosage: string;
  form: string | null;
  doseQty: number | null;
  doseUnit: DoseUnit | null;
  frequencyCode: FrequencyCode | null;
  /** Legacy mirror of frequencyCode. */
  frequency: string;
  durationValue: number | null;
  durationUnit: DurationUnit | null;
  /** Legacy mirror of duration value+unit. */
  duration: string;
  foodTiming: FoodTiming | null;
  routeCode: RouteCode | null;
  /** Legacy mirror of routeCode. */
  route: string;
  /** Unconsumed trailing free text ("avoid face"). */
  instructions: string;
  /** Dose timing pattern when typed inline (e.g. "1-0-1"). */
  doseSchedule: string | null;
  /**
   * How the patient takes it ("regularly" / "irregular" / SOS). Chart-med only;
   * the Rx capture path ignores it. `prn` is implied by a PRN frequency.
   */
  intakePattern: PatientMedicationIntakePattern | null;
  /** Where it came from ("self-started" / "prescribed" / OTC). Chart-med only. */
  source: PatientMedicationSource | null;
  /**
   * How long the patient has been on the drug ("for 5 years", "since 2 years").
   * Chart-med only — distinct from Rx treatment-course `durationValue`.
   */
  startedAgoValue: number | null;
  startedAgoUnit: PatientConditionAgoUnit | null;
  /**
   * Medication status when the line explicitly says so. `past` for stop/past
   * cues ("stopped", "was on", "used to take"); otherwise `null` so the caller
   * decides the default (active, or inherited from a resolved condition).
   */
  status: PatientMedicationStatus | null;
  /** Time since the drug was stopped ("stopped 2 months ago"). Chart-med only. */
  stoppedAgoValue: number | null;
  stoppedAgoUnit: PatientConditionAgoUnit | null;
  /** Why it was stopped, when stated ("stopped due to side effects"). */
  stopReason: PatientMedicationStopReason | null;
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const FORM_ALIASES: Record<string, string> = {
  tab: "tablet", tabs: "tablet", tablet: "tablet", tablets: "tablet",
  cap: "capsule", caps: "capsule", capsule: "capsule", capsules: "capsule",
  syp: "syrup", syr: "syrup", syrup: "syrup",
  susp: "suspension", suspension: "suspension",
  oint: "ointment", ointment: "ointment",
  cream: "cream", gel: "gel", lotion: "lotion",
  drop: "drops", drops: "drops",
  inj: "injection", injection: "injection",
  spray: "spray", inhaler: "inhaler", mdi: "inhaler", neb: "nebuliser",
  sachet: "sachet", powder: "powder",
  sol: "solution", solution: "solution",
  patch: "patch", supp: "suppository", suppository: "suppository",
};

/**
 * Single-letter form prefixes doctors write before a drug ("t amlo", "c omez",
 * "s ondem"). Ambiguous on their own (a lone "t" is a search), so these only
 * apply as the FIRST token when more tokens follow — never the whole input.
 */
const SHORT_FORM_PREFIX_ALIASES: Record<string, string> = {
  t: "tablet",
  c: "capsule",
  s: "syrup",
};

/** Default per-dose unit for a canonical form. */
const FORM_DOSE_UNIT: Record<string, DoseUnit> = {
  tablet: "tab",
  capsule: "cap",
  syrup: "spoon",
  suspension: "spoon",
  solution: "ml",
  drops: "drops",
  inhaler: "puff",
  spray: "puff",
  sachet: "sachet",
  powder: "sachet",
  injection: "unit",
  ointment: "application",
  cream: "application",
  gel: "application",
  lotion: "application",
};

/** Default route for a canonical form. */
const FORM_ROUTE: Record<string, RouteCode> = {
  tablet: "oral",
  capsule: "oral",
  syrup: "oral",
  suspension: "oral",
  sachet: "oral",
  powder: "oral",
  ointment: "topical",
  cream: "topical",
  gel: "topical",
  lotion: "topical",
  patch: "topical",
  inhaler: "inhaled",
  nebuliser: "inhaled",
  suppository: "rectal",
};

const FREQUENCY_ALIASES: Record<string, FrequencyCode> = {
  od: "OD", "1x": "OD", qd: "OD", om: "OD",
  bd: "BID", bid: "BID", "2x": "BID",
  tds: "TID", tid: "TID", "3x": "TID",
  qid: "QID", qds: "QID", "4x": "QID",
  hs: "QHS", qhs: "QHS",
  sos: "PRN", prn: "PRN",
  stat: "STAT",
  once: "OD", twice: "BID", thrice: "TID",
  daily: "OD", mane: "OD",
  nightly: "QHS", nocte: "QHS", noct: "QHS",
  q4h: "Q4H", "4h": "Q4H",
  q6h: "Q6H", "6h": "Q6H",
  q8h: "Q8H", "8h": "Q8H",
  q12h: "Q12H", "12h": "Q12H",
  q24h: "Q24H", "24h": "Q24H",
  qw: "QW", weekly: "QW",
};

/** Multi-word frequency phrases (longest first). All lowercase. */
const FREQUENCY_PHRASES: ReadonlyArray<[string[], FrequencyCode]> = [
  [["four", "times", "a", "day"], "QID"],
  [["four", "times", "daily"], "QID"],
  [["three", "times", "a", "day"], "TID"],
  [["three", "times", "daily"], "TID"],
  [["two", "times", "a", "day"], "BID"],
  [["two", "times", "daily"], "BID"],
  [["twice", "a", "day"], "BID"],
  [["twice", "daily"], "BID"],
  [["once", "a", "day"], "OD"],
  [["once", "daily"], "OD"],
  [["every", "night"], "QHS"],
  [["at", "night"], "QHS"],
  [["as", "needed"], "PRN"],
  [["if", "needed"], "PRN"],
  [["once", "weekly"], "QW"],
  [["every", "week"], "QW"],
  [["every", "4", "hours"], "Q4H"],
  [["every", "6", "hours"], "Q6H"],
  [["every", "8", "hours"], "Q8H"],
  [["every", "12", "hours"], "Q12H"],
  [["every", "24", "hours"], "Q24H"],
  [["4", "hourly"], "Q4H"],
  [["6", "hourly"], "Q6H"],
  [["8", "hourly"], "Q8H"],
  [["12", "hourly"], "Q12H"],
  [["24", "hourly"], "Q24H"],
];

const DOSE_UNIT_ALIASES: Record<string, DoseUnit> = {
  tab: "tab", tabs: "tab", tablet: "tab", tablets: "tab",
  cap: "cap", caps: "cap", capsule: "cap", capsules: "cap",
  ml: "ml", cc: "ml",
  spoon: "spoon", spoons: "spoon", spoonful: "spoon", tsf: "spoon",
  tsp: "spoon", tbsp: "spoon",
  drop: "drops", drops: "drops", gtt: "drops",
  puff: "puff", puffs: "puff",
  sachet: "sachet", sachets: "sachet",
  unit: "unit", units: "unit", iu: "unit", u: "unit",
  application: "application", applications: "application",
};

const DURATION_UNIT_ALIASES: Record<string, DurationUnit> = {
  d: "days", day: "days", days: "days",
  w: "weeks", wk: "weeks", wks: "weeks", week: "weeks", weeks: "weeks",
  mo: "months", month: "months", months: "months",
};

/** Relative on-drug duration units (chart med — includes years). */
const STARTED_AGO_UNIT_ALIASES: Record<string, PatientConditionAgoUnit> = {
  d: "days", day: "days", days: "days",
  w: "weeks", wk: "weeks", wks: "weeks", week: "weeks", weeks: "weeks",
  mo: "months", mos: "months", month: "months", months: "months",
  y: "years", yr: "years", yrs: "years", year: "years", years: "years",
};

/** Infer pharmaceutical form from a per-dose unit when no explicit form prefix. */
const DOSE_UNIT_TO_FORM: Record<DoseUnit, string> = {
  tab: "tablet",
  cap: "capsule",
  spoon: "syrup",
  ml: "solution",
  drops: "drops",
  puff: "inhaler",
  sachet: "sachet",
  unit: "injection",
  application: "ointment",
};

/** Lead tokens before a relative on-drug duration ("for 5 years", "since 2 years"). */
/** Leaders that mark relative past timing for ANY unit ("since/from 2 months"). */
const SINCE_LIKE_LEADERS = new Set(["since", "past", "last", "from"]);

/** Fuzzy qualifiers that may sit before the number ("approx 2 years", "~2 yrs"). */
const STARTED_AGO_QUALIFIERS = new Set([
  "approx",
  "approximately",
  "around",
  "about",
  "roughly",
  "~",
]);

/** Multi-word food/timing phrases (longest first). All lowercase. */
const FOOD_TIMING_PHRASES: ReadonlyArray<[string[], FoodTiming]> = [
  [["30", "min", "before"], "before_food"],
  [["30", "minutes", "before"], "before_food"],
  [["half", "hour", "before"], "before_food"],
  [["on", "empty", "stomach"], "empty_stomach"],
  [["empty", "stomach"], "empty_stomach"],
  [["before", "food"], "before_food"],
  [["before", "meals"], "before_food"],
  [["before", "meal"], "before_food"],
  [["before", "breakfast"], "before_food"],
  [["after", "food"], "after_food"],
  [["after", "meals"], "after_food"],
  [["after", "meal"], "after_food"],
  [["after", "breakfast"], "after_food"],
  [["after", "dinner"], "after_food"],
  [["with", "food"], "with_food"],
  [["with", "meals"], "with_food"],
  [["with", "meal"], "with_food"],
  [["at", "bedtime"], "bedtime"],
  [["before", "sleep"], "bedtime"],
  [["bedtime"], "bedtime"],
];

const FOOD_TIMING_TOKENS: Record<string, FoodTiming> = {
  ac: "before_food", // ante cibum
  pc: "after_food", // post cibum
};

/** Multi-word route hints → topical "at site" style. */
const ROUTE_PHRASES: ReadonlyArray<[string[], RouteCode]> = [
  [["at", "site"], "topical"],
  [["local", "application"], "topical"],
  [["apply", "locally"], "topical"],
  [["external", "use"], "topical"],
  [["locally"], "topical"],
];

const STRENGTH_UNITS = new Set(["mg", "mcg", "ug", "µg", "g", "gm", "iu", "%", "mg/ml", "mg/5ml"]);

/**
 * Where the medication came from. Single-token cues; hyphenated forms survive
 * tokenisation intact ("self-started"). `SOURCE_PHRASES` (below) run first so
 * "self prescribed" reads as self-started, not prescribed.
 */
const SOURCE_TOKENS: Record<string, PatientMedicationSource> = {
  otc: "self",
  self: "self",
  "self-started": "self",
  "self-medicated": "self",
  "self-medication": "self",
  "self-prescribed": "self",
  prescribed: "prescribed",
};

const SOURCE_PHRASES: ReadonlyArray<[string[], PatientMedicationSource]> = [
  [["self", "started"], "self"],
  [["self", "medication"], "self"],
  [["self", "medicated"], "self"],
  [["self", "prescribed"], "self"],
  [["over", "the", "counter"], "self"],
  [["doctor", "prescribed"], "prescribed"],
  [["prescribed", "by", "doctor"], "prescribed"],
  [["dr", "prescribed"], "prescribed"],
  [["on", "prescription"], "prescribed"],
];

/**
 * Intake adherence cues. Only the adverb form of "regular" ("regularly") is a
 * token here — the bare adjective is left alone so "regular insulin" keeps its
 * name. "irregular" has no such drug collision, so it stays.
 */
const INTAKE_PATTERN_TOKENS: Record<string, PatientMedicationIntakePattern> = {
  regularly: "regular",
  irregular: "irregular",
  irregularly: "irregular",
  occasionally: "irregular",
  intermittently: "irregular",
};

const INTAKE_PATTERN_PHRASES: ReadonlyArray<[string[], PatientMedicationIntakePattern]> = [
  [["not", "regularly"], "irregular"],
  [["was", "taken", "regularly"], "regular"],
  [["taken", "regularly"], "regular"],
  [["takes", "regularly"], "regular"],
  [["taking", "regularly"], "regular"],
  [["take", "regularly"], "regular"],
  [["off", "and", "on"], "irregular"],
  [["on", "and", "off"], "irregular"],
  [["now", "and", "then"], "irregular"],
];

/** Verb fillers around intake cues ("taking regularly") — never a name or sig. */
const INTAKE_FILLER_TOKENS = new Set(["taking", "takes", "take", "taken"]);

/**
 * Single-token cues that mark a medication as discontinued / past. Bare "off"
 * is intentionally excluded so "off and on" stays an irregular-intake phrase.
 * Past-tense "took" counts too ("took amlodipine 6 months ago" → past).
 */
const PAST_STATUS_TOKENS = new Set([
  "stopped",
  "stop",
  "stopt",
  "discontinued",
  "discontinue",
  "dc",
  "d/c",
  "dcd",
  "ceased",
  "stoppd",
  "took",
]);

/** Multi-word cues for past / discontinued meds (longest first). All lowercase. */
const PAST_STATUS_PHRASES: ReadonlyArray<string[]> = [
  ["no", "longer", "taking"],
  ["no", "longer", "on"],
  ["used", "to", "take"],
  ["used", "to"],
  ["previously", "on"],
  ["previously", "taking"],
  ["had", "been", "taking"],
  ["had", "been", "on"],
  ["was", "taking"],
  ["was", "on"],
  ["now", "stopped"],
];

/** Stop-reason cues (longest first). */
const STOP_REASON_PHRASES: ReadonlyArray<[string[], PatientMedicationStopReason]> = [
  [["adverse", "effects"], "side_effects"],
  [["adverse", "effect"], "side_effects"],
  [["side", "effects"], "side_effects"],
  [["side", "effect"], "side_effects"],
  [["too", "expensive"], "cost"],
  [["patient", "choice"], "patient_choice"],
  [["cost"], "cost"],
];

/** Connectors that introduce a stop reason ("stopped due to …"). */
const STOP_REASON_CONNECTORS = new Set(["due", "to", "because", "of"]);

/** Timing connectors before a stop-timing run ("for 5 yrs", "for the past 2 mo"). */
const STOP_TIMING_LEADERS = new Set(["for", "since", "from", "past", "last", "the"]);

// ---------------------------------------------------------------------------
// Tokeniser helpers
// ---------------------------------------------------------------------------

interface Token {
  /** Original text (punctuation-trimmed). */
  raw: string;
  /** Lowercased match key (trailing '.'/','/';' stripped). */
  key: string;
  consumed: boolean;
}

function tokenize(line: string): Token[] {
  return line
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^[,;]+|[,;.]+$/g, ""))
    .filter((t) => t.length > 0)
    .map((raw) => ({ raw, key: raw.toLowerCase(), consumed: false }));
}

function parseNumeric(key: string): number | null {
  if (key === "half" || key === "1/2" || key === "\u00bd") return 0.5;
  if (key === "1\u00bd") return 1.5;
  if (/^\d+(\.\d+)?$/.test(key)) return Number(key);
  return null;
}

/** "1-0-1" → { slots: 2, qty: 1 } (non-zero slot count + per-dose qty). */
export function parseDosePattern(key: string): { code: FrequencyCode; qty: number | null } | null {
  const m = key.match(/^([\d.]+(?:[-–][\d.]+){1,3})$/);
  if (!m) return null;
  const parts = m[1].split(/[-–]/).map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  const nonZero = parts.filter((n) => n > 0);
  if (nonZero.length === 0) return null;
  const code: FrequencyCode | null =
    nonZero.length === 1 ? "OD"
    : nonZero.length === 2 ? "BID"
    : nonZero.length === 3 ? "TID"
    : nonZero.length === 4 ? "QID"
    : null;
  if (!code) return null;
  const allEqual = nonZero.every((n) => n === nonZero[0]);
  return { code, qty: allEqual ? nonZero[0] : null };
}

/** Scan for a multi-word phrase over unconsumed tokens; consume on match. */
function consumePhrase(tokens: Token[], phrase: string[]): boolean {
  outer: for (let i = 0; i + phrase.length <= tokens.length; i++) {
    for (let j = 0; j < phrase.length; j++) {
      const t = tokens[i + j];
      if (t.consumed || t.key !== phrase[j]) continue outer;
    }
    for (let j = 0; j < phrase.length; j++) tokens[i + j].consumed = true;
    return true;
  }
  return false;
}

interface AgoRun {
  value: number;
  unit: PatientConditionAgoUnit;
  firstIdx: number;
  lastIdx: number;
  qualIdx: number | null;
  agoIdx: number | null;
}

/**
 * First unconsumed "N <unit>" run at/after `fromIdx` (combined "2yrs" or split
 * "2 years"), with an optional preceding qualifier ("approx") and trailing
 * "ago"/"back". Used for stop-timing once a stop cue has been seen.
 */
function findAgoRun(tokens: Token[], fromIdx: number): AgoRun | null {
  for (let i = fromIdx; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.consumed) continue;

    let value: number | null = null;
    let unit: PatientConditionAgoUnit | null = null;
    let lastIdx = i;

    const combined = t.key.match(/^(\d+)(y|years?|yrs?|months?|mos?|weeks?|wks?|wk|d|days?)$/);
    if (combined) {
      value = Number(combined[1]);
      unit =
        STARTED_AGO_UNIT_ALIASES[combined[2]] ??
        STARTED_AGO_UNIT_ALIASES[combined[2].replace(/s$/, "")] ??
        null;
    } else {
      const n = parseNumeric(t.key);
      const next = tokens[i + 1];
      if (n != null && Number.isInteger(n) && next && !next.consumed) {
        const u = STARTED_AGO_UNIT_ALIASES[next.key];
        if (u) {
          value = n;
          unit = u;
          lastIdx = i + 1;
        }
      }
    }

    if (value == null || !unit) continue;

    const qualIdx =
      i - 1 >= 0 && !tokens[i - 1].consumed && STARTED_AGO_QUALIFIERS.has(tokens[i - 1].key)
        ? i - 1
        : null;
    const trailer = tokens[lastIdx + 1];
    const agoIdx =
      trailer && !trailer.consumed && (trailer.key === "ago" || trailer.key === "back")
        ? lastIdx + 1
        : null;

    return { value, unit, firstIdx: i, lastIdx, qualIdx, agoIdx };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseMedicineLine(line: string): ParsedMedicineLine | null {
  const tokens = tokenize(line);
  if (tokens.length === 0) return null;

  let form: string | null = null;
  let doseQty: number | null = null;
  let doseUnit: DoseUnit | null = null;
  let frequencyCode: FrequencyCode | null = null;
  let durationValue: number | null = null;
  let durationUnit: DurationUnit | null = null;
  let foodTiming: FoodTiming | null = null;
  let routeCode: RouteCode | null = null;
  let dosage = "";
  let doseSchedule: string | null = null;
  let source: PatientMedicationSource | null = null;
  let intakePattern: PatientMedicationIntakePattern | null = null;
  let startedAgoValue: number | null = null;
  let startedAgoUnit: PatientConditionAgoUnit | null = null;
  let status: PatientMedicationStatus | null = null;
  let stoppedAgoValue: number | null = null;
  let stoppedAgoUnit: PatientConditionAgoUnit | null = null;
  let stopReason: PatientMedicationStopReason | null = null;

  // -- Pass A: pharmaceutical form prefix ("syp …", "tab …", "oint …") ------
  // Single-letter prefixes ("t amlo", "c omez") only count when more tokens
  // follow, so a lone "t" stays a drug-name search rather than "tablet".
  const first = tokens[0];
  if (FORM_ALIASES[first.key]) {
    form = FORM_ALIASES[first.key];
    first.consumed = true;
  } else if (tokens.length > 1 && SHORT_FORM_PREFIX_ALIASES[first.key]) {
    form = SHORT_FORM_PREFIX_ALIASES[first.key];
    first.consumed = true;
  }

  // -- Pass B: frequency ------------------------------------------------------
  for (const [phrase, code] of FREQUENCY_PHRASES) {
    if (frequencyCode) break;
    if (consumePhrase(tokens, phrase)) frequencyCode = code;
  }
  if (!frequencyCode) {
    for (const t of tokens) {
      if (t.consumed) continue;
      const code = FREQUENCY_ALIASES[t.key];
      if (code) {
        frequencyCode = code;
        t.consumed = true;
        break;
      }
      const pattern = parseDosePattern(t.key);
      if (pattern) {
        frequencyCode = pattern.code;
        doseSchedule = t.raw.replace(/[–]/g, "-");
        if (pattern.qty != null) doseQty = pattern.qty;
        t.consumed = true;
        break;
      }
    }
  }

  // -- Pass B2: past / discontinued status + stop-timing (chart-med) ---------
  // Explicit stop/past cues mark the med as past; without one it stays active
  // (so chronic "for X years" never flips). A stop cue ("stopped", "d/c")
  // followed by "N <unit> (ago)" captures stop-timing here so Pass C0 does not
  // mis-read it as on-drug start timing.
  {
    for (const [phrase, reason] of STOP_REASON_PHRASES) {
      if (stopReason) break;
      if (consumePhrase(tokens, phrase)) {
        stopReason = reason;
        status = "past";
      }
    }
    for (const phrase of PAST_STATUS_PHRASES) {
      if (consumePhrase(tokens, phrase)) status = "past";
    }
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.consumed || !PAST_STATUS_TOKENS.has(t.key)) continue;
      status = "past";
      t.consumed = true;
      if (stoppedAgoValue == null) {
        const run = findAgoRun(tokens, i + 1);
        if (run) {
          stoppedAgoValue = run.value;
          stoppedAgoUnit = run.unit;
          tokens[run.firstIdx].consumed = true;
          if (run.lastIdx !== run.firstIdx) tokens[run.lastIdx].consumed = true;
          if (run.qualIdx != null) tokens[run.qualIdx].consumed = true;
          if (run.agoIdx != null) tokens[run.agoIdx].consumed = true;
          // Eat a leading timing connector ("for", "since", "for the past")
          // just before the run so a past-verb line like "took amlo for 5 yrs"
          // keeps the name clean instead of leaking "for" into it.
          let lead = (run.qualIdx ?? run.firstIdx) - 1;
          while (
            lead >= 0 &&
            !tokens[lead].consumed &&
            STOP_TIMING_LEADERS.has(tokens[lead].key)
          ) {
            tokens[lead].consumed = true;
            lead -= 1;
          }
        }
      }
    }
    // Drop dangling "due to" / "because of" connectors left by a stop reason.
    if (status === "past" && stopReason) {
      for (const t of tokens) {
        if (!t.consumed && STOP_REASON_CONNECTORS.has(t.key)) t.consumed = true;
      }
    }
  }

  // -- Pass C0: on-drug start timing (chart-med). Handles "for 5 years",
  // "since 2 years", "from 2 years", "2 years ago/back", "(approx) 2 years",
  // and the no-space "2yrs"/"2mos" forms. A since-like leader
  // ("since/from/past/last") or a trailing "ago"/"back" marks ANY unit as
  // relative timing; "for"/bare phrasing only counts for years (a shorter
  // "for X days/months" stays an Rx course for the Rx-plan parser).
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.consumed) continue;

    let value: number | null = null;
    let unit: PatientConditionAgoUnit | null = null;
    let lastIdx = i; // last token of the value+unit run (for "ago"/"back" lookup)

    const combined = t.key.match(/^(\d+)(y|years?|yrs?|months?|mos?|weeks?|wks?|wk)$/);
    if (combined) {
      value = Number(combined[1]);
      unit =
        STARTED_AGO_UNIT_ALIASES[combined[2]] ??
        STARTED_AGO_UNIT_ALIASES[combined[2].replace(/s$/, "")] ??
        null;
    } else {
      const n = parseNumeric(t.key);
      const next = tokens[i + 1];
      if (n != null && Number.isInteger(n) && next && !next.consumed) {
        const u = STARTED_AGO_UNIT_ALIASES[next.key];
        if (u) {
          value = n;
          unit = u;
          lastIdx = i + 1;
        }
      }
    }

    if (value == null || !unit) continue;

    // An optional fuzzy qualifier ("approx", "~") can sit right before the value.
    const qualIdx = i - 1;
    const hasQualifier =
      qualIdx >= 0 && !tokens[qualIdx].consumed && STARTED_AGO_QUALIFIERS.has(tokens[qualIdx].key);
    const leaderIdx = hasQualifier ? i - 2 : i - 1;
    const leaderTok = leaderIdx >= 0 ? tokens[leaderIdx] : null;
    const leaderOk = !!leaderTok && !leaderTok.consumed;

    const forThePast =
      leaderIdx >= 2 &&
      leaderOk &&
      !tokens[leaderIdx - 1].consumed &&
      !tokens[leaderIdx - 2].consumed &&
      tokens[leaderIdx].key === "past" &&
      tokens[leaderIdx - 1].key === "the" &&
      tokens[leaderIdx - 2].key === "for";
    const sinceLeader = leaderOk && SINCE_LIKE_LEADERS.has(leaderTok!.key);
    const forLeader = leaderOk && leaderTok!.key === "for";

    const trailer = tokens[lastIdx + 1];
    const agoTrailer =
      !!trailer && !trailer.consumed && (trailer.key === "ago" || trailer.key === "back");

    const accept =
      forThePast ||
      sinceLeader ||
      agoTrailer ||
      (forLeader && unit === "years") ||
      (!forThePast && !sinceLeader && !forLeader && unit === "years");

    if (!accept) continue;

    startedAgoValue = value;
    startedAgoUnit = unit;
    t.consumed = true;
    if (lastIdx !== i) tokens[lastIdx].consumed = true;
    if (agoTrailer) trailer!.consumed = true;
    if (hasQualifier) tokens[qualIdx].consumed = true;
    if (forThePast) {
      tokens[leaderIdx].consumed = true;
      tokens[leaderIdx - 1].consumed = true;
      tokens[leaderIdx - 2].consumed = true;
    } else if (sinceLeader || forLeader) {
      leaderTok!.consumed = true;
    }
    break;
  }

  // -- Pass C: Rx treatment-course duration ("for 30 days", "x 5d", "continue") -
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.consumed) continue;

    // "until finished" / "till finished" / "continue" / "ongoing"
    if ((t.key === "until" || t.key === "till") && tokens[i + 1] && !tokens[i + 1].consumed && tokens[i + 1].key === "finished") {
      durationUnit = "until-finished";
      t.consumed = true;
      tokens[i + 1].consumed = true;
      break;
    }
    if (t.key === "continue" || t.key === "ongoing") {
      durationUnit = "continue";
      t.consumed = true;
      break;
    }

    // Combined token: "5d", "30days", "2w", "3mo"
    const combined = t.key.match(/^(\d+)(d|days?|w|wks?|weeks?|mo|months?)$/);
    if (combined) {
      const unit = DURATION_UNIT_ALIASES[combined[2]];
      if (unit) {
        durationValue = Number(combined[1]);
        durationUnit = unit;
        t.consumed = true;
        // Consume a preceding "for"/"x" connector.
        const prev = tokens[i - 1];
        if (prev && !prev.consumed && (prev.key === "for" || prev.key === "x" || prev.key === "\u00d7")) {
          prev.consumed = true;
        }
        break;
      }
    }

    // Two tokens: "<n> days"
    const n = parseNumeric(t.key);
    const next = tokens[i + 1];
    if (n != null && Number.isInteger(n) && next && !next.consumed && DURATION_UNIT_ALIASES[next.key]) {
      durationValue = n;
      durationUnit = DURATION_UNIT_ALIASES[next.key];
      t.consumed = true;
      next.consumed = true;
      const prev = tokens[i - 1];
      if (prev && !prev.consumed && (prev.key === "for" || prev.key === "x" || prev.key === "\u00d7")) {
        prev.consumed = true;
      }
      break;
    }
  }

  // -- Pass D: dose qty + unit ("2 tab", "10 ml", "2tab", "half tab") --------
  // "iu"/"u" with a large number is a strength ("vitamin d3 60000 iu"),
  // not an insulin-style per-dose unit — leave those for Pass E.
  const isStrengthLikeUnitDose = (unitKey: string, qty: number) =>
    (unitKey === "iu" || unitKey === "u") && qty > 100;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.consumed) continue;

    const combined = t.key.match(/^(\d+(?:\.\d+)?|\u00bd)([a-z]+)$/);
    if (combined && DOSE_UNIT_ALIASES[combined[2]]) {
      const qty = combined[1] === "\u00bd" ? 0.5 : Number(combined[1]);
      if (!isStrengthLikeUnitDose(combined[2], qty)) {
        doseQty = qty;
        doseUnit = DOSE_UNIT_ALIASES[combined[2]];
        t.consumed = true;
        break;
      }
    }

    const n = parseNumeric(t.key);
    const next = tokens[i + 1];
    if (
      n != null &&
      next &&
      !next.consumed &&
      DOSE_UNIT_ALIASES[next.key] &&
      !isStrengthLikeUnitDose(next.key, n)
    ) {
      doseQty = n;
      doseUnit = DOSE_UNIT_ALIASES[next.key];
      t.consumed = true;
      next.consumed = true;
      break;
    }
  }

  // -- Pass E: strength ("5 mg", "500mg", "5/80 mg", "0.05%") ----------------
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.consumed) continue;

    const combined = t.key.match(/^(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)(mg|mcg|ug|µg|g|gm|iu|%)$/);
    if (combined) {
      dosage = `${combined[1]}${combined[2] === "%" ? "%" : ` ${combined[2]}`}`;
      t.consumed = true;
      break;
    }

    const isNumberLike = /^\d+(\.\d+)?(\/\d+(\.\d+)?)?$/.test(t.key);
    const next = tokens[i + 1];
    if (isNumberLike && next && !next.consumed && STRENGTH_UNITS.has(next.key)) {
      dosage = next.key === "%" ? `${t.key}%` : `${t.key} ${next.key}`;
      t.consumed = true;
      next.consumed = true;
      break;
    }
  }

  // -- Pass F: food / timing --------------------------------------------------
  for (const [phrase, code] of FOOD_TIMING_PHRASES) {
    if (foodTiming) break;
    if (consumePhrase(tokens, phrase)) foodTiming = code;
  }
  if (!foodTiming) {
    for (const t of tokens) {
      if (t.consumed) continue;
      const code = FOOD_TIMING_TOKENS[t.key];
      if (code) {
        foodTiming = code;
        t.consumed = true;
        break;
      }
    }
  }

  // -- Pass G: route ----------------------------------------------------------
  for (const [phrase, code] of ROUTE_PHRASES) {
    if (routeCode) break;
    if (consumePhrase(tokens, phrase)) routeCode = code;
  }
  if (!routeCode && form && FORM_ROUTE[form]) {
    routeCode = FORM_ROUTE[form];
  }

  // -- Pass G2: medication source ("self-started", "prescribed", "OTC") ------
  for (const [phrase, code] of SOURCE_PHRASES) {
    if (source) break;
    if (consumePhrase(tokens, phrase)) source = code;
  }
  if (!source) {
    for (const t of tokens) {
      if (t.consumed) continue;
      const code = SOURCE_TOKENS[t.key];
      if (code) {
        source = code;
        t.consumed = true;
        break;
      }
    }
  }

  // -- Pass G3: intake pattern ("regularly", "irregular", "off and on") ------
  for (const [phrase, code] of INTAKE_PATTERN_PHRASES) {
    if (intakePattern) break;
    if (consumePhrase(tokens, phrase)) intakePattern = code;
  }
  if (!intakePattern) {
    for (const t of tokens) {
      if (t.consumed) continue;
      const code = INTAKE_PATTERN_TOKENS[t.key];
      if (code) {
        intakePattern = code;
        t.consumed = true;
        break;
      }
    }
  }
  // Drop verb fillers ("taking"/"takes") so they don't leak into the name.
  for (const t of tokens) {
    if (!t.consumed && INTAKE_FILLER_TOKENS.has(t.key)) t.consumed = true;
  }
  // A PRN frequency implies SOS intake unless the doctor stated otherwise.
  if (!intakePattern && frequencyCode === "PRN") intakePattern = "prn";
  intakePattern = resolveIntakePatternPolicy(line, intakePattern);

  // -- Pass H: name = leading unconsumed run; leftovers = instructions -------
  const nameTokens: string[] = [];
  let nameEnded = false;
  const leftoverTokens: string[] = [];
  for (const t of tokens) {
    if (t.consumed) {
      if (nameTokens.length > 0) nameEnded = true;
      continue;
    }
    if (!nameEnded) nameTokens.push(t.raw);
    else leftoverTokens.push(t.raw);
  }

  // Bare trailing strength: "amlodipine 5 od" → dosage "5".
  if (!dosage && nameTokens.length >= 2) {
    const last = nameTokens[nameTokens.length - 1];
    if (/^\d+(\.\d+)?(\/\d+(\.\d+)?)?$/.test(last)) {
      dosage = last;
      nameTokens.pop();
    }
  }

  const medicineName = nameTokens.join(" ").trim();
  if (!medicineName) return null;

  // Default the dose unit from the form when a qty was found without one.
  if (doseQty != null && !doseUnit && form && FORM_DOSE_UNIT[form]) {
    doseUnit = FORM_DOSE_UNIT[form];
  }
  // Infer form from per-dose unit when no explicit form prefix ("2 tab" → tablet).
  if (!form && doseUnit && DOSE_UNIT_TO_FORM[doseUnit]) {
    form = DOSE_UNIT_TO_FORM[doseUnit];
  }

  return {
    medicineName,
    dosage,
    form,
    doseQty,
    doseUnit,
    frequencyCode,
    frequency: frequencyCode ? getFrequencyLegacyLabel(frequencyCode) : "",
    durationValue,
    durationUnit,
    duration: durationUnit ? formatDurationLegacyLabel(durationValue, durationUnit) : "",
    foodTiming,
    routeCode,
    route: routeCode ? getRouteLegacyLabel(routeCode) : "",
    instructions: leftoverTokens.join(" ").trim(),
    doseSchedule,
    intakePattern,
    source,
    startedAgoValue,
    startedAgoUnit,
    status,
    stoppedAgoValue,
    stoppedAgoUnit,
    stopReason,
  };
}

/**
 * Whether the line looks like it carries sig details beyond a plain
 * drug-name search ("amlodipine"). Used by the capture bar to decide
 * between "treat input as autocomplete text" vs "parse the full line".
 */
export function lineHasSigDetails(line: string): boolean {
  const parsed = parseMedicineLine(line);
  if (!parsed) return false;
  return Boolean(
    parsed.dosage ||
      parsed.doseQty != null ||
      parsed.frequencyCode ||
      parsed.doseSchedule ||
      parsed.durationUnit ||
      parsed.foodTiming ||
      parsed.form ||
      parsed.intakePattern ||
      parsed.source ||
      parsed.startedAgoValue != null ||
      parsed.status === "past" ||
      parsed.stoppedAgoValue != null,
  );
}
