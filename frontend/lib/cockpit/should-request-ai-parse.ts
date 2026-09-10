/**
 * Gate for the subj-14 AI complaint-parse fallback.
 *
 * The deterministic parser ([`parse-complaint-text.ts`]) runs first and instantly.
 * We only spend an AI call when the rules likely fell short — vernacular / non-Latin
 * script, explicit negation (which the rules can't drop), or a long line the rules
 * barely touched (the multi-complaint / loose-phrasing tail). An explicit "✨ refine"
 * tap bypasses this gate entirely (the caller just forces the call).
 *
 * Enter on the capture bar stays deterministic. These same triggers drive the
 * typing warning so the doctor sees a miss before commit.
 *
 * Pure + synchronous so it never sits on the capture critical path and is unit-tested
 * in isolation.
 */

import type { ParsedComplaint } from "@/lib/cockpit/parse-complaint-text";

/** Non-Latin script (Devanagari, etc.) the rules don't model. */
const NON_LATIN_RE = /[^\u0000-\u024F]/;
/** Explicit negation cues — deterministic parser can't drop a negated item. */
const NEGATION_RE = /\b(?:no|not|without|denies|denied|negative for)\b/i;
/** Below this word count, a short custom complaint isn't worth an AI call. */
const MIN_WORDS_FOR_RESIDUE = 6;
/** At/under this many parsed fields, a long line looks under-extracted. */
const MAX_FIELDS_FOR_RESIDUE = 1;

export type ComplaintParseWarningReason =
  | "vernacular"
  | "negation"
  | "under_extracted";

/** Doctor-facing copy for the capture-bar hint. */
export const COMPLAINT_PARSE_WARNING_COPY: Record<
  ComplaintParseWarningReason,
  string
> = {
  vernacular: "vernacular text — check fields after adding",
  negation: "negation isn't understood — it will stay in the name",
  under_extracted: "no details recognised — adds as one complaint",
};

/**
 * Why the rules likely fell short, or null when the line is clean / too short
 * to flag. Never throws.
 */
export function complaintParseWarning(
  rawText: string,
  parsed: ParsedComplaint,
): ComplaintParseWarningReason | null {
  const text = rawText.trim();
  if (!text) return null;

  if (NON_LATIN_RE.test(text)) return "vernacular";

  if (NEGATION_RE.test(text)) return "negation";

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const parsedFieldCount = Object.keys(parsed.patch).length;
  if (
    wordCount >= MIN_WORDS_FOR_RESIDUE &&
    parsedFieldCount <= MAX_FIELDS_FOR_RESIDUE &&
    parsed.associated.length === 0
  ) {
    return "under_extracted";
  }

  return null;
}

/**
 * True when the AI fallback is worth calling for `rawText` given what the
 * deterministic parser already extracted. Never throws.
 */
export function shouldRequestAiParse(
  rawText: string,
  parsed: ParsedComplaint,
): boolean {
  return complaintParseWarning(rawText, parsed) != null;
}
