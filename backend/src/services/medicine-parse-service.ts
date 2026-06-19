/**
 * AI chart-medicine free-text parse (medical-history med redesign).
 *
 * Gated, server-side, **suggestion-only** safety net behind the deterministic
 * frontend medicine-line parser. Takes a doctor's typed medication line and
 * returns one structured medicine per detected drug — keys mirror the
 * deterministic parser so the client merges both through one path.
 *
 * Guarantees (same contract as the subj-14 complaint parse):
 *  - **PHI redacted** before the prompt (`redactPhiForAI`); audit is metadata-only.
 *  - **Schema-bounded output** — every enum field (frequency, units, intake,
 *    source) is validated against a fixed vocabulary; off-vocab values are
 *    dropped, never echoed. "Structured or omitted."
 *  - **Fail soft** — empty / truncated / malformed model output degrades to an
 *    empty suggestion list (never throws at the doctor). Only an unconfigured
 *    client or a hard SDK/network failure throws `ServiceUnavailableError`.
 *  - **Model tiering** — `getOpenAIMedicineParseConfig(tier)`: Tier 1 mini for
 *    auto-gate, Tier 2 flagship on explicit refine / retry.
 *
 * The LLM runner is injectable so the validation/bounding logic is unit-tested
 * without a network call.
 */

import { getOpenAIClient, getOpenAIMedicineParseConfig } from '../config/openai';
import type { MedicineParseModelTier } from '../config/openai';
import { logger } from '../config/logger';
import { logAIClassification } from '../utils/audit-logger';
import { redactPhiForAI } from './ai-service';
import { ServiceUnavailableError } from '../utils/errors';
import { resolveIntakePatternPolicy } from '../utils/intake-pattern-policy';
import type {
  AiParsedMedicine,
  ParseMedicineRequest,
  ParseMedicineResult,
} from '../types/medicine-parse';

// Server-side bounds (defensive — independent of the request).
const MAX_MEDICINES = 8;
const MAX_NAME_LEN = 120;
const MAX_INSTRUCTIONS_LEN = 300;
const MAX_STRENGTH_VALUE = 999999;
const MAX_DOSE_QTY = 999;

// Bounded vocabularies — mirror the patient_medications CHECK constraints +
// frontend medicineCodes. Keep in lockstep with `validation.ts`.
const FREQUENCY_CODES = new Set([
  'OD', 'BID', 'TID', 'QID', 'QHS', 'PRN', 'STAT',
  'Q4H', 'Q6H', 'Q8H', 'Q12H', 'Q24H', 'QW',
]);
const STRENGTH_UNITS = new Set(['mg', 'g', 'mcg', 'iu', 'pct']);
const DOSE_UNITS = new Set([
  'tab', 'cap', 'ml', 'spoon', 'drops', 'puff', 'sachet', 'unit', 'application',
]);
const INTAKE_PATTERNS = new Set(['regular', 'irregular', 'prn']);
const SOURCES = new Set(['prescribed', 'self']);
const STARTED_AGO_UNITS = new Set(['days', 'weeks', 'months', 'years']);
const MED_STATUSES = new Set(['active', 'past']);
const STOP_REASONS = new Set([
  'resolved', 'side_effects', 'cost', 'patient_choice', 'other',
]);
const FOOD_TIMINGS = new Set([
  'before_food', 'after_food', 'with_food', 'empty_stomach', 'bedtime',
]);
const DOSE_SCHEDULE_RE = /^[\d.]+(?:-[\d.]+){1,3}$/;

/**
 * Explicit origin cues the doctor must actually type before we honour an
 * AI-proposed `source`. Mirrors the deterministic frontend parser's
 * SOURCE_TOKENS / SOURCE_PHRASES vocabulary. Without one of these the model is
 * over-inferring (e.g. "taking regularly" or the drug simply being an Rx
 * medicine), so the value is dropped — "stated or omitted", never invented.
 */
const SOURCE_CUE_RE =
  /\b(?:prescri\w*|otc|over[\s-]the[\s-]counter|self\w*)\b/i;

function lineHasSourceCue(text: string | undefined): boolean {
  return typeof text === 'string' && SOURCE_CUE_RE.test(text);
}

/**
 * Explicit adherence cues the doctor must actually type before we honour an
 * AI-proposed `intakePattern`. Without one of these the model is over-inferring
 * (e.g. "regular" just because the drug is chronic / "for 10 years"), so the
 * value is dropped — "stated or omitted", never invented. PRN is recovered
 * separately from a SOS/PRN frequency, so it need not appear here.
 */
const INTAKE_CUE_RE =
  /\b(?:regular(?:ly)?|irregular(?:ly)?|off[\s-]and[\s-]on|on[\s-]and[\s-]off|now[\s-]and[\s-]then|skip\w*|miss\w*|complian\w*|non[\s-]?complian\w*|adheren\w*|sos|prn|as\s+needed|as\s+required)\b/i;

function lineHasIntakeCue(text: string | undefined): boolean {
  return typeof text === 'string' && INTAKE_CUE_RE.test(text);
}

/**
 * Explicit discontinuation cues the doctor must actually type before we honour
 * an AI-proposed `past` status. Mirrors the deterministic frontend parser's
 * PAST_STATUS_TOKENS / PAST_STATUS_PHRASES vocabulary. Without one of these the
 * model is over-inferring (e.g. flagging any historical drug as "past"), so the
 * status is forced back to "active" — "stated or omitted", never invented.
 */
const PAST_CUE_RE =
  /\b(?:stop\w*|discontinu\w*|cease\w*|d\/?c|dc'?d|took|used\s+to|previously|no\s+longer|had\s+been|was\s+(?:on|taking)|off\s+(?:the\s+)?(?:med|drug|tablet))\b/i;

function lineHasPastCue(text: string | undefined): boolean {
  return typeof text === 'string' && PAST_CUE_RE.test(text);
}

// Tolerant alias map for strength units the model may emit (e.g. "%").
const STRENGTH_UNIT_ALIASES: Record<string, string> = {
  '%': 'pct', percent: 'pct', pct: 'pct',
  mg: 'mg', milligram: 'mg', milligrams: 'mg',
  g: 'g', gm: 'g', gram: 'g', grams: 'g',
  mcg: 'mcg', ug: 'mcg', 'µg': 'mcg', microgram: 'mcg', micrograms: 'mcg',
  iu: 'iu', u: 'iu',
};

// ---------------------------------------------------------------------------
// LLM runner seam
// ---------------------------------------------------------------------------

export interface MedicineParseRunLlmArgs {
  systemPrompt: string;
  userPrompt: string;
  tier: MedicineParseModelTier;
  correlationId: string;
}

export interface MedicineParseRunLlmResult {
  content: string | null;
  model: string;
  tokens?: number;
  finishReason?: string | null;
}

/** Returns the raw model result, or `null` when the OpenAI client is unconfigured. */
export type MedicineParseRunLlm = (
  args: MedicineParseRunLlmArgs,
) => Promise<MedicineParseRunLlmResult | null>;

export interface ParseMedicineDeps {
  /** Injectable for tests; defaults to the real OpenAI call. */
  runLlm?: MedicineParseRunLlm;
}

async function defaultRunLlm(
  args: MedicineParseRunLlmArgs,
): Promise<MedicineParseRunLlmResult | null> {
  const client = getOpenAIClient();
  if (!client) {
    logger.warn({ correlationId: args.correlationId }, 'medicine_parse: no OpenAI client');
    return null;
  }
  const config = getOpenAIMedicineParseConfig(args.tier);
  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      max_completion_tokens: config.maxTokens,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userPrompt },
      ],
    });
    const choice = completion.choices[0];
    const content = choice?.message?.content ?? null;
    const finishReason = choice?.finish_reason ?? null;
    const tokens = completion.usage?.total_tokens;

    const ok = Boolean(content) && finishReason !== 'length';
    await logAIClassification({
      correlationId: args.correlationId,
      model: config.model,
      redactionApplied: true,
      status: ok ? 'success' : 'failure',
      tokens,
      ...(ok
        ? {}
        : {
            errorMessage:
              finishReason === 'length'
                ? 'medicine_parse_truncated'
                : 'medicine_parse_empty_completion',
          }),
    });

    return { content, model: config.model, tokens, finishReason };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_openai_error';
    logger.warn(
      { correlationId: args.correlationId, err: message },
      'medicine_parse: openai call failed',
    );
    await logAIClassification({
      correlationId: args.correlationId,
      model: config.model,
      redactionApplied: true,
      status: 'failure',
      errorMessage: 'medicine_parse_openai_error',
    });
    throw new ServiceUnavailableError('Medicine parsing is unavailable. Please try again.');
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return [
    "You convert a doctor's shorthand medication line into structured fields.",
    '',
    'Output ONLY a JSON object, no markdown, of shape:',
    '  {"medicines":[{',
    '    "name": string,',
    '    "strengthValue": number|null, "strengthUnit": "mg"|"g"|"mcg"|"iu"|"pct"|null,',
    '    "strengthComponents": [{"value": number, "unit": "mg"|"g"|"mcg"|"iu"|"pct"|null}]|null,',
    '    "doseQty": number|null,',
    '    "doseUnit": "tab"|"cap"|"ml"|"spoon"|"drops"|"puff"|"sachet"|"unit"|"application"|null,',
    '    "frequencyCode": "OD"|"BID"|"TID"|"QID"|"QHS"|"PRN"|"STAT"|"Q4H"|"Q6H"|"Q8H"|"Q12H"|"Q24H"|"QW"|null,',
    '    "doseSchedule": string|null,',
    '    "form": string|null,',
    '    "intakePattern": "regular"|"irregular"|"prn"|null,',
    '    "source": "prescribed"|"self"|null,',
    '    "startedAgoValue": number|null,',
    '    "startedAgoUnit": "days"|"weeks"|"months"|"years"|null,',
    '    "status": "active"|"past"|null,',
    '    "stoppedAgoValue": number|null,',
    '    "stoppedAgoUnit": "days"|"weeks"|"months"|"years"|null,',
    '    "stopReason": "resolved"|"side_effects"|"cost"|"patient_choice"|"other"|null,',
    '    "foodTiming": "before_food"|"after_food"|"with_food"|"empty_stomach"|"bedtime"|null,',
    '    "instructions": string|null',
    '  }]}',
    '',
    'Rules:',
    '- "name" is the drug in plain English (translate vernacular/Hinglish, e.g. "sugar ki goli" -> the medicine name only if clearly named, else keep the literal drug word).',
    '- Split DISTINCT drugs into separate array items (e.g. "metformin 500 bd and amlodipine 5 od" -> 2 items).',
    '- frequencyCode: map "od/once"->OD, "bd/twice"->BID, "tds/tid"->TID, "qid"->QID, "hs/at night"->QHS, "sos/prn/as needed"->PRN, "stat"->STAT, "q8h/8 hourly"->Q8H (similarly Q4H/Q6H/Q12H/Q24H), "weekly"->QW. Use ONLY these codes; otherwise null.',
    '- strengthUnit: one of mg, g, mcg, iu, pct ("%"->pct). doseUnit: one of the listed units. Use null if unsure.',
    '- Fixed-dose combinations (a single brand with 2+ salts, e.g. "rcinex 600/300", "augmentin 625", "telma-h 40/12.5"): set strengthComponents to one entry per ingredient ([{"value":600,"unit":"mg"},{"value":300,"unit":"mg"}]) and leave strengthValue/strengthUnit null. The shared unit applies to every value when written once. Single-ingredient drugs: set strengthValue/strengthUnit and leave strengthComponents null.',
    '- doseSchedule: only a dash pattern like "1-0-1" or "0-0-1"; otherwise null.',
    '- intakePattern: set ONLY from an explicit adherence cue the doctor typed. "regular" when the patient takes it regularly (including "taken regularly but missed occasionally" — occasional missed doses still count as regular). "irregular" only for predominantly erratic use: irregular/irregularly, off-and-on, not regularly, or when ONLY skip/occasional cues appear with no regular phrasing. "prn" only for SOS/as-needed. NEVER infer regular from the drug being chronic / long-term / "for X years". Use null if no adherence cue is stated.',
    '- source: set "prescribed" ONLY if the line explicitly says prescribed / doctor / on prescription, and "self" ONLY if it says self-started / self-medicated / OTC / over-the-counter. The drug being a prescription medicine, "taking regularly", or chronic/long-term use are NOT origin cues. When in doubt, use null. Do NOT guess the source.',
    '- startedAgoValue/startedAgoUnit: how long the patient has been on the drug. This is a medical-history medication, not a new prescription, so ANY duration the doctor mentions is on-drug time: "for 5 years" → 5 years, "since 2 years" → 2 years, "for 30 days" → 30 days, "2 months" → 2 months, "started 3 weeks ago" → 3 weeks. Map the unit to one of days/weeks/months/years.',
    '- status: "past" ONLY when the doctor explicitly says the drug was stopped / discontinued / ceased / "used to take" / "previously on" / "no longer on" / "was on". Otherwise use "active" (or null). A drug being chronic / long-term / "for X years" is STILL active — do NOT mark it past. Never infer "past" just because timing is mentioned.',
    '- stoppedAgoValue/stoppedAgoUnit: ONLY when status is "past" AND a stop time is stated ("stopped 2 months ago" → 2 months, "discontinued last year" → 1 year). Map the unit to days/weeks/months/years. This is the time since stopping, distinct from startedAgo.',
    '- stopReason: ONLY when status is "past" and a reason is stated — side_effects (side/adverse effects), cost (too expensive), patient_choice (patient stopped on own), resolved (condition resolved), else other. Use null if no reason stated.',
    '- foodTiming: before_food (before meals/empty stomach/30 min prior), after_food, with_food, empty_stomach, bedtime. Use null if not stated.',
    '- "instructions" holds any remaining free text (e.g. "avoid milk", "not with dairy"); never repeat structured fields there.',
    '- Omit (null) anything not stated. Never invent doses, strengths, or frequencies.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Output parsing + schema-bounding
// ---------------------------------------------------------------------------

function safeParseJson(content: string, correlationId: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    logger.warn({ correlationId, len: content.length }, 'medicine_parse: malformed JSON');
    return null;
  }
}

function extractRawMedicines(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.medicines)) return obj.medicines;
    if (Array.isArray(obj.medications)) return obj.medications;
    if (typeof obj.name === 'string') return [obj];
  }
  return [];
}

function boundNumber(value: unknown, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  if (value > max) return null;
  return value;
}

function boundEnum(value: unknown, allowed: Set<string>): string | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  return allowed.has(key) ? key : null;
}

function boundStrengthUnit(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  const mapped = STRENGTH_UNIT_ALIASES[key] ?? key;
  return STRENGTH_UNITS.has(mapped) ? mapped : null;
}

function boundFrequencyCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toUpperCase();
  return FREQUENCY_CODES.has(key) ? key : null;
}

function boundShortText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

const MAX_STRENGTH_COMPONENTS = 6;

/**
 * Bound a model-proposed fixed-dose-combination strength to a clean array.
 * Returns null unless at least two valid ingredient strengths survive (a
 * single component is just a normal scalar strength, handled separately).
 * The shared unit (written once on any entry) is back-filled to entries that
 * omitted it, mirroring the deterministic frontend parser.
 */
function boundStrengthComponents(
  value: unknown,
): { value: number; unit: string | null }[] | null {
  if (!Array.isArray(value)) return null;
  const out: { value: number; unit: string | null }[] = [];
  let sharedUnit: string | null = null;
  for (const item of value.slice(0, MAX_STRENGTH_COMPONENTS)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const v = boundNumber(obj.value, MAX_STRENGTH_VALUE);
    if (v == null) continue;
    const unit = boundStrengthUnit(obj.unit);
    if (unit) sharedUnit = unit;
    out.push({ value: v, unit });
  }
  if (out.length < 2) return null;
  return out.map((c) => ({ value: c.value, unit: c.unit ?? sharedUnit }));
}

function boundOne(
  item: unknown,
  opts: {
    allowSource: boolean;
    allowIntake?: boolean;
    allowPast?: boolean;
    rawText?: string;
  } = {
    allowSource: true,
  },
): AiParsedMedicine | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, MAX_NAME_LEN) : '';
  if (!name) return null;

  const scheduleRaw = typeof obj.doseSchedule === 'string' ? obj.doseSchedule.trim() : '';
  const doseSchedule = DOSE_SCHEDULE_RE.test(scheduleRaw) ? scheduleRaw : null;

  // Combo strength wins over the scalar: a fixed-dose combination cannot be
  // represented by a single strengthValue, so null the scalar when present.
  const strengthComponents = boundStrengthComponents(obj.strengthComponents);

  const boundedIntake = boundEnum(obj.intakePattern, INTAKE_PATTERNS) as
    | 'regular'
    | 'irregular'
    | 'prn'
    | null;
  // Adherence is only honoured when the line carries an explicit intake cue;
  // otherwise the model is guessing (e.g. "regular" for any chronic drug). PRN
  // always survives — it comes from SOS/as-needed dosing, not adherence.
  const allowIntake = opts.allowIntake ?? true;
  const intakePattern =
    opts.rawText !== undefined
      ? allowIntake || boundedIntake === 'prn'
        ? resolveIntakePatternPolicy(opts.rawText, boundedIntake)
        : null
      : boundedIntake;

  // Status is only honoured as "past" when the line carries an explicit
  // discontinuation cue; otherwise the model is guessing, so force "active".
  // Stop-timing / stop-reason only ride along on a real "past".
  const allowPast = opts.allowPast ?? true;
  const boundedStatus = boundEnum(obj.status, MED_STATUSES) as 'active' | 'past' | null;
  const status: 'active' | 'past' | null =
    boundedStatus === 'past' ? (allowPast ? 'past' : 'active') : boundedStatus;
  const isPast = status === 'past';

  return {
    name,
    strengthValue: strengthComponents ? null : boundNumber(obj.strengthValue, MAX_STRENGTH_VALUE),
    strengthUnit: strengthComponents ? null : boundStrengthUnit(obj.strengthUnit),
    strengthComponents,
    doseQty: boundNumber(obj.doseQty, MAX_DOSE_QTY),
    doseUnit: boundEnum(obj.doseUnit, DOSE_UNITS),
    frequencyCode: boundFrequencyCode(obj.frequencyCode),
    doseSchedule,
    form: boundShortText(obj.form, 40),
    intakePattern,
    // Origin is only honoured when the doctor actually typed an origin cue;
    // otherwise the model is guessing (e.g. "prescribed" for any Rx drug).
    source: opts.allowSource ? boundEnum(obj.source, SOURCES) : null,
    startedAgoValue: boundNumber(obj.startedAgoValue, MAX_STRENGTH_VALUE),
    startedAgoUnit: boundEnum(obj.startedAgoUnit, STARTED_AGO_UNITS),
    status,
    stoppedAgoValue: isPast ? boundNumber(obj.stoppedAgoValue, MAX_STRENGTH_VALUE) : null,
    stoppedAgoUnit: isPast ? boundEnum(obj.stoppedAgoUnit, STARTED_AGO_UNITS) : null,
    stopReason: isPast ? boundEnum(obj.stopReason, STOP_REASONS) : null,
    foodTiming: boundEnum(obj.foodTiming, FOOD_TIMINGS),
    instructions: boundShortText(obj.instructions, MAX_INSTRUCTIONS_LEN),
  };
}

/**
 * Drop the whole model response to a schema-bounded, capped, de-duped list.
 * When `rawText` is supplied, an AI-proposed `source` is only kept if that line
 * contains an origin cue (prescribed / self-started / OTC), an AI-proposed
 * `intakePattern` is only kept if the line contains an adherence cue (regular /
 * irregular / skips / SOS), and an AI-proposed `past` status is only kept if the
 * line contains a discontinuation cue (stopped / discontinued / "used to"); this
 * guards against the model inventing "Prescribed", "Regular", or "Past" from
 * mere chronic-use phrasing.
 */
export function boundMedicineList(raw: unknown, rawText?: string): AiParsedMedicine[] {
  const allowSource = rawText === undefined ? true : lineHasSourceCue(rawText);
  const allowIntake = rawText === undefined ? true : lineHasIntakeCue(rawText);
  const allowPast = rawText === undefined ? true : lineHasPastCue(rawText);
  const out: AiParsedMedicine[] = [];
  const seen = new Set<string>();
  for (const item of extractRawMedicines(raw).slice(0, MAX_MEDICINES)) {
    const bounded = boundOne(item, { allowSource, allowIntake, allowPast, rawText });
    if (!bounded) continue;
    const key = bounded.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(bounded);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function parseMedicineWithAI(
  request: ParseMedicineRequest,
  correlationId: string,
  deps: ParseMedicineDeps = {},
): Promise<ParseMedicineResult> {
  const tier: MedicineParseModelTier = request.tier ?? 'default';
  const run = deps.runLlm ?? defaultRunLlm;

  const systemPrompt = buildSystemPrompt();
  const userPrompt = redactPhiForAI(request.text);

  const result = await run({ systemPrompt, userPrompt, tier, correlationId });
  if (!result) {
    // Client unconfigured — surface as 503; the frontend degrades silently.
    throw new ServiceUnavailableError('Medicine parsing is unavailable.');
  }

  // Empty or truncated model output → no suggestions (already audited in runner).
  if (!result.content || result.finishReason === 'length') {
    return { medicines: [] };
  }

  const raw = safeParseJson(result.content, correlationId);
  if (raw === null) return { medicines: [] };

  return { medicines: boundMedicineList(raw, request.text) };
}
