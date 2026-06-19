/**
 * Gate for the chart-medicine AI parse fallback (medical-history med redesign).
 *
 * Philosophy: the deterministic line parser ([`medicine-line-parse.ts`]) handles
 * only the *simple, common* clinical shorthand ("amlodipine 5 mg od"). The moment
 * a line looks even slightly complex, we hand it to AI — which is language-
 * agnostic — instead of maintaining per-language word lists (there are too many
 * local languages to enumerate).
 *
 * The triggers are therefore purely STRUCTURAL: we never try to detect *which*
 * language the extra words are in, only that the rules didn't fully recognise
 * the line:
 *   - non-Latin script (one regex, every script),
 *   - multiple drugs joined by a conjunction,
 *   - a drug "name" longer than a real name (rules absorbed words they couldn't
 *     classify — e.g. "telmisartan daily kha raha hai"),
 *   - any unclassified residue left in `instructions` (free-text / vernacular
 *     tail — e.g. "amlodipine 5 mg od subah le raha hai").
 *
 * An explicit "✨" tap bypasses this gate entirely (the caller forces the call).
 *
 * Pure + synchronous so it never sits on the capture critical path; unit-tested
 * in isolation.
 */

import type { ParsedMedicineLine } from "@/lib/cockpit/medicine-line-parse";

/** Non-Latin script (Devanagari, Tamil, Arabic, CJK, …) — one regex, every script. */
const NON_LATIN_RE = /[^\u0000-\u024F]/;
/** Conjunctions that join distinct drugs the single-line parser can't split. */
const MULTI_DRUG_SPLIT_RE = /\s+and\s+|\s*&\s*|\s*\+\s*|\s+plus\s+/i;
/**
 * A real drug name — including brand + salt ("telma h", "augmentin duo") — is
 * short. Beyond this, the parser absorbed words it couldn't classify, which
 * means loose / vernacular phrasing rather than a clean line.
 */
const MAX_CLEAN_NAME_WORDS = 2;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * True when the AI fallback is worth calling for `rawText` given what the
 * deterministic parser already extracted. Never throws.
 */
export function shouldRequestAiMedParse(
  rawText: string,
  parsed: ParsedMedicineLine | null,
): boolean {
  const text = rawText.trim();
  if (!text) return false;

  // Non-Latin script the deterministic rules don't model.
  if (NON_LATIN_RE.test(text)) return true;

  // Multiple distinct drugs joined by "and"/"&"/"+"/"plus" — the single-line
  // parser keeps only the first and lumps the rest into the name/instructions.
  const segments = text
    .split(MULTI_DRUG_SPLIT_RE)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length >= 2 && wordCount(text) >= 4) return true;

  // No recognised sig at all: a bare 1–2 word name is an autocomplete / quick-add
  // search; anything longer is loose phrasing the rules couldn't structure → AI.
  if (!parsed) return wordCount(text) > MAX_CLEAN_NAME_WORDS;

  // The parser absorbed too many unclassified words into the drug "name".
  if (wordCount(parsed.medicineName) > MAX_CLEAN_NAME_WORDS) return true;

  // Trailing tokens the rules couldn't classify (free-text / vernacular tail).
  if (parsed.instructions.trim()) return true;

  return false;
}
