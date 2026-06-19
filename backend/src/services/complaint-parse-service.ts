/**
 * AI free-text complaint parse (subjective-tab · subj-14).
 *
 * Gated, server-side, **suggestion-only** safety net behind the deterministic
 * frontend parser. Takes a doctor's typed complaint line + the resolved client
 * schema (`fieldSpec`: keys + chip enums) and returns one `{ name, patch,
 * associated }` per detected complaint — the same shape as the deterministic
 * parser, so the client merges both through one path.
 *
 * Guarantees:
 *  - **PHI redacted** before the prompt (`redactPhiForAI`); audit is metadata-only.
 *  - **Schema-bounded output** — patch keys not in `fieldSpec` are dropped; chip
 *    values not in a field's `chips` enum are dropped (case/space tolerant →
 *    canonical chip). "Schema-displayable or omitted."
 *  - **Fail soft** — empty / truncated / malformed model output degrades to an
 *    empty suggestion list (never throws at the doctor). Only an unconfigured
 *    client or a hard SDK/network failure throws `ServiceUnavailableError`.
 *  - **Model tiering** — `getOpenAIComplaintParseConfig(tier)`: Tier 1 mini for
 *    auto-gate, Tier 2 flagship on explicit refine / retry. Never the global
 *    `OPENAI_MODEL` default directly.
 *
 * The LLM runner is injectable so the validation/bounding logic is unit-tested
 * without a network call (mirrors `service-catalog-ai-suggest`'s runner seam).
 */

import { getOpenAIClient, getOpenAIComplaintParseConfig } from '../config/openai';
import type { ComplaintParseModelTier } from '../config/openai';
import { logger } from '../config/logger';
import { logAIClassification } from '../utils/audit-logger';
import { redactPhiForAI } from './ai-service';
import { ServiceUnavailableError } from '../utils/errors';
import type {
  AiParsedComplaint,
  ComplaintParseFieldSpec,
  ParseComplaintRequest,
  ParseComplaintResult,
} from '../types/complaint-master';

// Server-side bounds (defensive — independent of the request).
const MAX_COMPLAINTS = 6;
const MAX_ASSOCIATED = 8;
const MAX_TEXT_FIELD_LEN = 120;
const MAX_NAME_LEN = 80;
const MAX_ASSOCIATED_ITEM_LEN = 80;
const SEVERITY_WORDS = new Set(['minimal', 'mild', 'moderate', 'severe']);

// ---------------------------------------------------------------------------
// LLM runner seam
// ---------------------------------------------------------------------------

export interface ComplaintParseRunLlmArgs {
  systemPrompt: string;
  userPrompt: string;
  tier: ComplaintParseModelTier;
  correlationId: string;
}

export interface ComplaintParseRunLlmResult {
  content: string | null;
  model: string;
  tokens?: number;
  finishReason?: string | null;
}

/** Returns the raw model result, or `null` when the OpenAI client is unconfigured. */
export type ComplaintParseRunLlm = (
  args: ComplaintParseRunLlmArgs,
) => Promise<ComplaintParseRunLlmResult | null>;

export interface ParseComplaintDeps {
  /** Injectable for tests; defaults to the real OpenAI call. */
  runLlm?: ComplaintParseRunLlm;
}

async function defaultRunLlm(
  args: ComplaintParseRunLlmArgs,
): Promise<ComplaintParseRunLlmResult | null> {
  const client = getOpenAIClient();
  if (!client) {
    logger.warn({ correlationId: args.correlationId }, 'complaint_parse: no OpenAI client');
    return null;
  }
  const config = getOpenAIComplaintParseConfig(args.tier);
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
                ? 'complaint_parse_truncated'
                : 'complaint_parse_empty_completion',
          }),
    });

    return { content, model: config.model, tokens, finishReason };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_openai_error';
    logger.warn({ correlationId: args.correlationId, err: message }, 'complaint_parse: openai call failed');
    await logAIClassification({
      correlationId: args.correlationId,
      model: config.model,
      redactionApplied: true,
      status: 'failure',
      errorMessage: 'complaint_parse_openai_error',
    });
    throw new ServiceUnavailableError('Complaint parsing is unavailable. Please try again.');
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  fieldSpec: ComplaintParseFieldSpec[],
  category: string | undefined,
): string {
  // Only chip/severity enums need spelling out; text/duration are free strings.
  const schemaLines = fieldSpec.map((f) => {
    if (f.type === 'chips' && f.chips?.length) {
      return `- ${f.key} (${f.label}): one of [${f.chips.join(', ')}]`;
    }
    if (f.type === 'severity') {
      return `- ${f.key} (${f.label}): one of [minimal, mild, moderate, severe]`;
    }
    if (f.type === 'duration') {
      return `- ${f.key} (${f.label}): short free text, e.g. "3 days", "2 weeks"`;
    }
    return `- ${f.key} (${f.label}): short free text`;
  });

  return [
    'You convert a doctor\'s shorthand chief-complaint line into structured fields.',
    category ? `Complaint category context: ${category}.` : '',
    '',
    'Allowed fields for the "patch" object (use ONLY these keys, omit any you are unsure of):',
    schemaLines.join('\n'),
    '',
    'Rules:',
    '- Output ONLY a JSON object, no markdown, of shape:',
    '  {"complaints":[{"name":string,"patch":{<fieldKey>:<value>},"associated":[string]}]}',
    '- "name" is the clinical complaint in plain English (translate vernacular/Hinglish, e.g. "pet me jalan" -> "Burning in stomach", "sir dard" -> "Headache").',
    '- For chip fields, the value MUST be exactly one of the listed options; otherwise omit the field.',
    '- Split DISTINCT complaints into separate array items (e.g. "fever cough loose motions 3 days" -> 3 items); apply a shared duration to each only when it clearly applies to all.',
    '- NEGATION: if a symptom is explicitly denied ("no fever", "denies vomiting"), DO NOT include it as a complaint or a field.',
    '- "associated" lists secondary symptoms tied to a complaint (e.g. "...with nausea"); never repeat the complaint name there.',
    '- Co-equal complaints are SEPARATE items, not each other\'s associated symptoms: if a symptom is its own item in "complaints", do NOT also list it in any other item\'s "associated" (e.g. for "fever cough body ache" each is its own item with an EMPTY "associated", never listing the others).',
    '- Omit anything not stated. Never invent values.',
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Output parsing + schema-bounding
// ---------------------------------------------------------------------------

function safeParseJson(content: string, correlationId: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    logger.warn({ correlationId, len: content.length }, 'complaint_parse: malformed JSON');
    return null;
  }
}

function extractRawComplaints(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.complaints)) return obj.complaints;
    // Tolerate a single-object response shaped like one complaint.
    if (typeof obj.name === 'string') return [obj];
  }
  return [];
}

/** Normalise for chip matching: lowercase, hyphens→space, collapse whitespace. */
function normalizeForChip(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchChip(value: string, chips: string[]): string | null {
  const target = normalizeForChip(value);
  if (!target) return null;
  for (const chip of chips) {
    if (normalizeForChip(chip) === target) return chip; // canonical casing wins
  }
  return null;
}

function boundPatch(
  rawPatch: unknown,
  specByKey: Map<string, ComplaintParseFieldSpec>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!rawPatch || typeof rawPatch !== 'object') return out;

  for (const [key, value] of Object.entries(rawPatch as Record<string, unknown>)) {
    const spec = specByKey.get(key);
    if (!spec) continue; // off-schema key

    if (spec.type === 'severity') {
      if (typeof value === 'number' && Number.isFinite(value)) {
        const clamped = Math.min(10, Math.max(0, Math.round(value)));
        out[key] = clamped;
      } else if (typeof value === 'string' && SEVERITY_WORDS.has(value.trim().toLowerCase())) {
        out[key] = value.trim().toLowerCase();
      }
      continue;
    }

    if (spec.type === 'chips') {
      if (typeof value !== 'string' || !spec.chips?.length) continue;
      const matched = matchChip(value, spec.chips);
      if (matched) out[key] = matched;
      continue;
    }

    // text | duration
    if (typeof value === 'string') {
      const trimmed = value.trim().slice(0, MAX_TEXT_FIELD_LEN);
      if (trimmed) out[key] = trimmed;
    }
  }
  return out;
}

function boundAssociated(rawAssociated: unknown, name: string): string[] {
  if (!Array.isArray(rawAssociated)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const nameKey = name.trim().toLowerCase();
  for (const item of rawAssociated) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().slice(0, MAX_ASSOCIATED_ITEM_LEN);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (key === nameKey || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= MAX_ASSOCIATED) break;
  }
  return out;
}

function boundOne(
  item: unknown,
  specByKey: Map<string, ComplaintParseFieldSpec>,
): AiParsedComplaint | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const name = typeof obj.name === 'string' ? obj.name.trim().slice(0, MAX_NAME_LEN) : '';
  if (!name) return null;
  return {
    name,
    patch: boundPatch(obj.patch, specByKey),
    associated: boundAssociated(obj.associated, name),
  };
}

/** Drop the whole model response to a schema-bounded, capped complaint list. */
export function boundComplaintList(
  raw: unknown,
  fieldSpec: ComplaintParseFieldSpec[],
): AiParsedComplaint[] {
  const specByKey = new Map(fieldSpec.map((f) => [f.key, f]));
  const out: AiParsedComplaint[] = [];
  for (const item of extractRawComplaints(raw).slice(0, MAX_COMPLAINTS)) {
    const bounded = boundOne(item, specByKey);
    if (bounded) out.push(bounded);
  }

  // Cross-complaint dedupe: a symptom promoted to its own top-level complaint is
  // NOT an associated symptom of a sibling. On a flat list ("fever cough loose
  // motions …") the model tends to cross-list every sibling into each other's
  // `associated`, which would spawn the same complaints as both main cards and
  // nested mini-cards. Drop any associated entry that matches another complaint's
  // name; the top-level card wins.
  if (out.length > 1) {
    const topLevelNames = new Set(out.map((c) => c.name.trim().toLowerCase()));
    for (const complaint of out) {
      const ownName = complaint.name.trim().toLowerCase();
      complaint.associated = complaint.associated.filter((a) => {
        const key = a.trim().toLowerCase();
        return key === ownName || !topLevelNames.has(key);
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function parseComplaintWithAI(
  request: ParseComplaintRequest,
  correlationId: string,
  deps: ParseComplaintDeps = {},
): Promise<ParseComplaintResult> {
  const tier: ComplaintParseModelTier = request.tier ?? 'default';
  const run = deps.runLlm ?? defaultRunLlm;

  const systemPrompt = buildSystemPrompt(request.fieldSpec, request.category);
  const userPrompt = redactPhiForAI(request.text);

  const result = await run({ systemPrompt, userPrompt, tier, correlationId });
  if (!result) {
    // Client unconfigured — surface as 503; the frontend degrades silently.
    throw new ServiceUnavailableError('Complaint parsing is unavailable.');
  }

  // Empty or truncated model output → no suggestions (already audited in runner).
  if (!result.content || result.finishReason === 'length') {
    return { complaints: [] };
  }

  const raw = safeParseJson(result.content, correlationId);
  if (raw === null) return { complaints: [] };

  return { complaints: boundComplaintList(raw, request.fieldSpec) };
}
