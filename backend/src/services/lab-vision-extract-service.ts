/**
 * Lab-report PHOTO extraction via a multimodal model (rpt-05.6).
 *
 * A second READER behind the same contract as the PDF text-layer reader: it
 * returns `RawExtractedRow[]`, so alias matching, the sanity flags, and the
 * verify dialog are shared verbatim with the PDF path. Suggestion-only —
 * nothing is written until the doctor confirms.
 *
 * How this differs from every other AI call in this codebase, and why it is
 * gated:
 *  - **Input cannot be redacted.** The text parses run `redactPhiForAI()`
 *    first; a photograph of a lab report has the patient's name, age, and
 *    UHID printed on it. Audit therefore records `redactionApplied: false`,
 *    which is the honest value — reviewers read that field as a guarantee.
 *  - **Off unless explicitly enabled.** `isLabVisionExtractEnabled()` gates
 *    the call independently of `OPENAI_API_KEY`, so having AI configured for
 *    redacted text does not imply consent to send images.
 *
 * The PDF reader is deterministic and drops any row whose columns are
 * ambiguous rather than guess. A model cannot make that guarantee, so the
 * mitigations here are: transcribe-only prompting, hard output bounding, and
 * the doctor's confirm. Callers MUST keep the verify step.
 *
 * Logs model / token / row counts only — never names, values, or file paths.
 */

import { getOpenAIClient, getOpenAILabVisionConfig, isLabVisionExtractEnabled } from '../config/openai';
import { logger } from '../config/logger';
import { logAIClassification } from '../utils/audit-logger';
import { ServiceUnavailableError } from '../utils/errors';
import type { RawExtractedRow } from './lab-pdf-table';

/** Mirrors the uploader's image allow-list (prescription-attachment-service). */
export const LAB_VISION_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Output bounds — defensive, independent of the model response.
const MAX_ROWS = 200;
const MAX_NAME_LEN = 120;
const MAX_VALUE_LEN = 40;
const MAX_UNIT_LEN = 40;
const MAX_RANGE_LEN = 80;
const MAX_METHOD_LEN = 80;
const MAX_LINE_TEXT_LEN = 240;

// ---------------------------------------------------------------------------
// LLM runner seam
// ---------------------------------------------------------------------------

export interface LabVisionRunLlmArgs {
  systemPrompt: string;
  /** `data:<mime>;base64,<...>` — inlined, never a signed URL (see below). */
  imageDataUrl: string;
  correlationId: string;
}

export interface LabVisionRunLlmResult {
  content: string | null;
  model: string;
  tokens?: number;
  finishReason?: string | null;
}

/** Returns the raw model result, or `null` when the OpenAI client is unconfigured. */
export type LabVisionRunLlm = (
  args: LabVisionRunLlmArgs,
) => Promise<LabVisionRunLlmResult | null>;

export interface ExtractLabVisionDeps {
  /** Injectable for tests; defaults to the real OpenAI call. */
  runLlm?: LabVisionRunLlm;
}

async function defaultRunLlm(args: LabVisionRunLlmArgs): Promise<LabVisionRunLlmResult | null> {
  const client = getOpenAIClient();
  if (!client) {
    logger.warn({ correlationId: args.correlationId }, 'lab_vision_extract: no OpenAI client');
    return null;
  }
  const config = getOpenAILabVisionConfig();
  try {
    const completion = await client.chat.completions.create({
      model: config.model,
      max_completion_tokens: config.maxTokens,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: args.systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'text' as const,
              text: 'Transcribe the result rows in this lab report image. Omit any row you cannot read with certainty.',
            },
            {
              type: 'image_url' as const,
              // `detail: high` is required, not an optimisation: reference
              // ranges and units are the smallest print on a lab report, and
              // the low-detail tile size cannot resolve them.
              image_url: { url: args.imageDataUrl, detail: 'high' as const },
            },
          ],
        },
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
      // Honest: a report photo carries printed identifiers that cannot be
      // stripped before the call. Do not set this to true.
      redactionApplied: false,
      status: ok ? 'success' : 'failure',
      tokens,
      ...(ok
        ? {}
        : {
            errorMessage:
              finishReason === 'length'
                ? 'lab_vision_truncated'
                : 'lab_vision_empty_completion',
          }),
    });

    return { content, model: config.model, tokens, finishReason };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_openai_error';
    logger.warn(
      { correlationId: args.correlationId, err: message },
      'lab_vision_extract: openai call failed',
    );
    await logAIClassification({
      correlationId: args.correlationId,
      model: config.model,
      redactionApplied: false,
      status: 'failure',
      errorMessage: 'lab_vision_openai_error',
    });
    throw new ServiceUnavailableError('Report photo extraction is unavailable. Please try again.');
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * Transcribe-only. The model must not name, convert, or interpret anything —
 * `lab-extract-match.ts` owns canonical names, units, and ranges, and it can
 * only do that job if what arrives is what was printed.
 */
export function buildLabVisionSystemPrompt(): string {
  return [
    'You transcribe a photograph of a laboratory report into JSON. You are an OCR step, not an interpreter.',
    '',
    'Output ONLY a JSON object of this exact shape, no markdown:',
    '{"rows":[{"rawName":string,"rawValue":string|null,"rawUnit":string|null,"rawRange":string|null,"rawMethod":string|null}]}',
    '',
    'Rules:',
    '- Copy every field EXACTLY as printed, character for character. Do not fix spelling, expand abbreviations, or translate.',
    '- "rawName" is the test name as printed (e.g. "HAEMOGLOBIN", "S. Creatinine").',
    '- "rawValue" is the printed result. Keep the printed decimals; never round or recompute.',
    '- Do NOT convert units. Copy the unit as printed, or null if no unit is printed.',
    '- "rawRange" is the printed reference/normal range cell verbatim (e.g. "13.0-17.0", "< 200"), or null.',
    '- "rawMethod" is the printed method/technique cell, or null.',
    '- OMIT any row where you cannot read the value confidently, and omit any row where you are not certain which value belongs to which test. A missing row is correct; a wrong number is not.',
    '- Omit section headers, page headers/footers, patient details, doctor names, signatures, and comment paragraphs. Only actual test result rows.',
    '- Never invent a test that is not printed, and never carry a value across from a neighbouring row.',
    '- If the image is not a lab report, or no result rows are legible, return {"rows":[]}.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Output parsing + bounding
// ---------------------------------------------------------------------------

function safeParseJson(content: string, correlationId: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    logger.warn({ correlationId, len: content.length }, 'lab_vision_extract: malformed JSON');
    return null;
  }
}

function extractRawRows(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.rows)) return obj.rows;
  }
  return [];
}

/** Model cells arrive as unknown: accept strings/numbers, reject everything else. */
function coerceCell(value: unknown, maxLen: number): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value).slice(0, maxLen);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

/**
 * `lineText` is verbatim page text on the PDF path — real provenance a doctor
 * can check a row against. There is no equivalent here: it is reassembled from
 * the model's own cells, so it can only ever confirm the model's reading. The
 * source image is the actual check, which is why the verify dialog shows it.
 */
function composeLineText(cells: readonly (string | null)[]): string {
  return cells
    .filter((cell): cell is string => Boolean(cell))
    .join(' ')
    .slice(0, MAX_LINE_TEXT_LEN);
}

/** Drop the model response to bounded, capped rows in the shared row shape. */
export function boundLabVisionRows(raw: unknown): RawExtractedRow[] {
  const out: RawExtractedRow[] = [];
  for (const item of extractRawRows(raw).slice(0, MAX_ROWS)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const rawName = coerceCell(obj.rawName, MAX_NAME_LEN);
    if (!rawName) continue; // a row without a test name is unusable
    const rawValue = coerceCell(obj.rawValue, MAX_VALUE_LEN);
    const rawUnit = coerceCell(obj.rawUnit, MAX_UNIT_LEN);
    const rawRange = coerceCell(obj.rawRange, MAX_RANGE_LEN);
    const rawMethod = coerceCell(obj.rawMethod, MAX_METHOD_LEN);
    out.push({
      rawName,
      rawValue,
      rawUnit,
      rawRange,
      rawMethod,
      // A photo is a single page. Keeps the row shape uniform with the PDF path.
      pageIndex: 0,
      lineText: composeLineText([rawName, rawValue, rawUnit, rawRange, rawMethod]),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface LabVisionExtractResult {
  rows: RawExtractedRow[];
}

/**
 * Read lab rows off a report photo. Suggestion-only.
 *
 * Throws `ServiceUnavailableError` when the egress gate is off or the client is
 * unconfigured — the caller degrades to manual entry. Unreadable images fail
 * soft with zero rows; the visit is never blocked.
 *
 * The image is inlined as a base64 data URL rather than passed as a signed
 * URL: a signed URL would have OpenAI's fetcher pull the object straight out
 * of our storage bucket, and would put a live credential for patient media
 * into a third-party request log.
 */
export async function extractLabRowsFromImage(
  bytes: Buffer,
  mime: string,
  args: { correlationId: string },
  deps: ExtractLabVisionDeps = {},
): Promise<LabVisionExtractResult> {
  if (!isLabVisionExtractEnabled()) {
    throw new ServiceUnavailableError('Report photo extraction is not enabled.');
  }

  const run = deps.runLlm ?? defaultRunLlm;
  const imageDataUrl = `data:${mime};base64,${bytes.toString('base64')}`;

  const result = await run({
    systemPrompt: buildLabVisionSystemPrompt(),
    imageDataUrl,
    correlationId: args.correlationId,
  });
  if (!result) {
    throw new ServiceUnavailableError('Report photo extraction is unavailable.');
  }

  // Empty or truncated output → no rows (already audited in the runner).
  if (!result.content || result.finishReason === 'length') {
    return { rows: [] };
  }

  const raw = safeParseJson(result.content, args.correlationId);
  if (raw === null) return { rows: [] };

  const rows = boundLabVisionRows(raw);
  logger.info(
    { correlationId: args.correlationId, rowCount: rows.length },
    'lab_vision_extract: completed',
  );
  return { rows };
}
