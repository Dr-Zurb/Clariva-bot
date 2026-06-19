/**
 * Gate for the subj-14 AI complaint-parse fallback.
 *
 * The deterministic parser ([`parse-complaint-text.ts`]) runs first and instantly.
 * We only spend an AI call when the rules likely fell short — vernacular / non-Latin
 * script, explicit negation (which the rules can't drop), or a long line the rules
 * barely touched (the multi-complaint / loose-phrasing tail). An explicit "✨ refine"
 * tap bypasses this gate entirely (the caller just forces the call).
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

/**
 * True when the AI fallback is worth calling for `rawText` given what the
 * deterministic parser already extracted. Never throws.
 */
export function shouldRequestAiParse(rawText: string, parsed: ParsedComplaint): boolean {
  const text = rawText.trim();
  if (!text) return false;

  // Vernacular / non-Latin script the rules don't handle.
  if (NON_LATIN_RE.test(text)) return true;

  // Negation — rules keep the negated token in the name; AI can drop it.
  if (NEGATION_RE.test(text)) return true;

  // A long line the rules barely touched → likely multi-complaint / loose phrasing.
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const parsedFieldCount = Object.keys(parsed.patch).length;
  if (
    wordCount >= MIN_WORDS_FOR_RESIDUE &&
    parsedFieldCount <= MAX_FIELDS_FOR_RESIDUE &&
    parsed.associated.length === 0
  ) {
    return true;
  }

  return false;
}
