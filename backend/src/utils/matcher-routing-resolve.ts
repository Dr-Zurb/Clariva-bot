/**
 * Routing v2 — single resolution layer for service catalog matcher hints.
 *
 * All Stage A + LLM consumers should use {@link resolveMatcherRouting} instead of reading
 * `matcher_hints.keywords` / `include_when` directly. Legacy rows store comma-separated
 * keywords and free-text “book when”; v2 rows store `matcher_hints.examples[]`.
 *
 * @see ../../../docs/Development/service-catalog-matching-stages.md
 * Plan: docs/Development/Daily-plans/April 2026/19-04-2026/Plans/plan-service-catalog-matcher-routing-v2.md
 */

import type { ServiceOfferingV1 } from './service-catalog-schema';
import {
  MATCHER_HINT_EXAMPLE_MAX_CHARS,
  MATCHER_HINT_EXAMPLES_MAX_COUNT,
} from './service-catalog-schema';

/** How {@link resolveMatcherRouting} built {@link ResolvedRoutingHints.examplePhrases}. */
export type ResolvedRoutingLegacySource = 'examples' | 'legacy_merge';

/**
 * Normalized view of matcher hints for Stage A (token overlap) and Stage B (LLM allowlist).
 *
 * **Legacy merge algorithm** (when `matcher_hints.examples` is absent or normalizes to empty):
 *
 * 1. **`examplePhrases`** — Split `keywords` on commas, semicolons, and newlines; trim each
 *    piece; drop empties; enforce per-phrase max length and max count (same caps as v2
 *    `examples`); dedupe case-insensitively while preserving first-seen order. These strings
 *    feed the same Stage A scoring path that previously iterated raw `keywords` CSV.
 * 2. **`legacyIncludeWhen`** — The full trimmed `include_when` string, passed only for legacy
 *    rows. Stage A historically used `include_when` as a *loose overlap gate* (negative-match
 *    penalty when the patient text doesn't overlap), and the LLM prompt surfaces it as one
 *    `include_when=…` blob; both consumers keep that asymmetry by reading this field instead
 *    of stuffing prose into the token list.
 * 3. **`excludeWhen`** — Trimmed `exclude_when` unchanged.
 *
 * When **`examples`** is present and non-empty after normalization, we set `legacySource:
 * 'examples'` and do **not** set `legacyIncludeWhen` (even if legacy strings remain on disk):
 * `examples` is the v2 source of truth, so we don't bleed legacy `include_when` into v2 routing.
 */
export interface ResolvedRoutingHints {
  /** Phrases/tokens for deterministic overlap + primary LLM routing material. */
  examplePhrases: string[];
  excludeWhen?: string;
  legacySource: ResolvedRoutingLegacySource;
  /**
   * Legacy `include_when` prose — set only in `legacy_merge` when non-empty. Stage A uses it
   * as a loose-overlap gate; the LLM prompt surfaces it as `include_when=…`. v2 rows omit it.
   */
  legacyIncludeWhen?: string;
}

const KEYWORD_SPLIT_RE = /[,;\n\r]+/;

function dedupePhrasesPreserveOrder(phrases: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of phrases) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= MATCHER_HINT_EXAMPLES_MAX_COUNT) break;
  }
  return out;
}

/**
 * Trim, clip to max length, dedupe (case-insensitive), cap count — for both `examples` and
 * legacy keyword fragments before they become `examplePhrases`.
 */
export function normalizeMatcherExamplePhrases(raw: string[]): string[] {
  const clipped: string[] = [];
  for (const s of raw) {
    const t = s.trim();
    if (!t) continue;
    const one =
      t.length > MATCHER_HINT_EXAMPLE_MAX_CHARS ? t.slice(0, MATCHER_HINT_EXAMPLE_MAX_CHARS) : t;
    clipped.push(one);
  }
  return dedupePhrasesPreserveOrder(clipped);
}

/** Split legacy `keywords` CSV into candidate phrases (same delimiters as Stage A keyword loop). */
export function legacyKeywordsToPhraseParts(keywords: string | undefined): string[] {
  if (!keywords?.trim()) return [];
  return keywords
    .split(KEYWORD_SPLIT_RE)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Project `matcher_hints` into a single structure for the matcher and LLM prompt builders.
 */
export function resolveMatcherRouting(offering: ServiceOfferingV1): ResolvedRoutingHints {
  const h = offering.matcher_hints;
  const excludeWhen = h?.exclude_when?.trim() || undefined;

  if (h?.examples && h.examples.length > 0) {
    const examplePhrases = normalizeMatcherExamplePhrases(h.examples);
    if (examplePhrases.length > 0) {
      return {
        examplePhrases,
        ...(excludeWhen ? { excludeWhen } : {}),
        legacySource: 'examples',
      };
    }
  }

  const fromKeywords = legacyKeywordsToPhraseParts(h?.keywords);
  const examplePhrases = normalizeMatcherExamplePhrases(fromKeywords);
  const includeTrimmed = h?.include_when?.trim();

  return {
    examplePhrases,
    ...(excludeWhen ? { excludeWhen } : {}),
    legacySource: 'legacy_merge',
    ...(includeTrimmed ? { legacyIncludeWhen: includeTrimmed } : {}),
  };
}
