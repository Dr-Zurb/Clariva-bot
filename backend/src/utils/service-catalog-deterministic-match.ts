/**
 * Pure deterministic Stage A for service catalog (ARM-04). Lives in `utils/` so callers like
 * `consultation-fees` avoid importing `service-catalog-matcher` → `ai-service` → `consultation-fees`.
 *
 * @see ../../../docs/Development/service-catalog-matching-stages.md — Stage A vs Stage B (LLM runs only if this returns null).
 */

import type { ServiceCatalogMatchConfidence } from '../types/conversation';
import { SERVICE_CATALOG_MATCH_REASON_CODES } from '../types/conversation';
import type { ScopeMode, ServiceCatalogV1, ServiceOfferingV1 } from './service-catalog-schema';
import { CATALOG_CATCH_ALL_SERVICE_KEY, resolveServiceScopeMode } from './service-catalog-schema';
import { resolveMatcherRouting, type ResolvedRoutingHints } from './matcher-routing-resolve';

export const MODALITIES = ['text', 'voice', 'video'] as const;

export function pickSuggestedModality(
  offering: ServiceOfferingV1
): 'text' | 'voice' | 'video' | undefined {
  const enabled = MODALITIES.filter((m) => offering.modalities[m]?.enabled === true);
  return enabled.length === 1 ? enabled[0] : undefined;
}

/**
 * Returns true only when `hint` has meaningful content that overlaps with `reason`.
 * An empty / whitespace-only / sub-3-char-token hint is treated as "no signal" and
 * returns `false` — never match everything. This prevents services with blank
 * `matcher_hints` from inheriting scores from unrelated patient complaints.
 */
function hasLooseOverlap(reason: string, hint: string): boolean {
  const r = reason.toLowerCase();
  const h = hint.toLowerCase().trim();
  if (!h) return false;
  if (h.length <= 48 && r.includes(h)) return true;
  const tokens = h.split(/\W+/).filter((w) => w.length >= 3);
  if (tokens.length === 0) {
    return false;
  }
  return tokens.some((w) => r.includes(w));
}

/**
 * Routing v2: a row "has hint content" iff `resolveMatcherRouting` produced any signal —
 * an example phrase (v2 `examples` or legacy keyword fragments), a legacy `include_when`
 * gate, or an `exclude_when` red-flag. Mirrors the pre-resolver predicate on legacy rows;
 * for v2 rows it cleanly excludes "examples present but normalize to empty" cases.
 */
function hasAnyResolvedHintContent(resolved: ResolvedRoutingHints): boolean {
  return (
    resolved.examplePhrases.length > 0 ||
    Boolean(resolved.legacyIncludeWhen) ||
    Boolean(resolved.excludeWhen)
  );
}

function scopeOf(offering: ServiceOfferingV1): ScopeMode {
  return resolveServiceScopeMode(offering.scope_mode);
}

/**
 * Stage A scoring (routing v2): all routing signal flows through `resolveMatcherRouting`
 * — this function never reads `matcher_hints.keywords` / `include_when` directly.
 *
 * - `excludeWhen` overlap → hard `-1` (red flag).
 * - `legacyIncludeWhen` (legacy rows only) acts as a loose-overlap gate; if patient text
 *   doesn't overlap, return `-1` so the row drops out. v2 rows with `examples` skip the
 *   gate entirely — `examples` are the source of truth.
 * - `examplePhrases` (v2 examples or legacy keyword CSV split) score `+4` per substring hit.
 * - **Strict** (`scope_mode: 'strict'`): require at least one positive `examplePhrases` hit;
 *   a bare `legacyIncludeWhen` overlap is not enough on a strict row.
 */
function matcherHintScore(offering: ServiceOfferingV1, reasonLower: string): number {
  const resolved = resolveMatcherRouting(offering);
  if (!hasAnyResolvedHintContent(resolved)) return 0;
  if (resolved.excludeWhen && hasLooseOverlap(reasonLower, resolved.excludeWhen)) {
    return -1;
  }
  if (resolved.legacyIncludeWhen && !hasLooseOverlap(reasonLower, resolved.legacyIncludeWhen)) {
    return -1;
  }
  let score = 0;
  for (const phrase of resolved.examplePhrases) {
    const p = phrase.toLowerCase();
    if (p.length >= 2 && reasonLower.includes(p)) {
      score += 4;
    }
  }
  /**
   * SFU-18 (preserved across routing v2): strict services only earn a positive
   * deterministic score when an example-phrase hit is present. An `include_when`
   * overlap alone (which otherwise passes the negative-penalty gate above) is not
   * sufficient — the complaint must actually contain one of the doctor's example
   * phrases (v2 `examples` or, for legacy rows, a comma-token from `keywords`).
   * Flexible / undefined services keep the existing behavior (`include_when`
   * overlap with 0 phrase hits yields 0 anyway).
   */
  if (scopeOf(offering) === 'strict' && score <= 0) {
    return 0;
  }
  return score;
}

/**
 * SFU-18: strict services with no hint corroboration (keyword hit) should not
 * auto-finalize on a bare label / description substring match. Returns `true`
 * only when the fast-path label/desc hit also has a positive `matcherHintScore`.
 */
function hasStrictHintCorroboration(offering: ServiceOfferingV1, reasonLower: string): boolean {
  return matcherHintScore(offering, reasonLower) > 0;
}

function labelOrKeyHits(catalog: ServiceCatalogV1, userText: string): ServiceOfferingV1[] {
  const t = userText.trim().toLowerCase();
  if (t.length < 2) {
    return [];
  }
  return catalog.services.filter((s) => {
    const key = s.service_key.toLowerCase();
    const lab = s.label.toLowerCase();
    return t.includes(key) || (lab.length >= 3 && t.includes(lab));
  });
}

function descriptionSubstringHits(catalog: ServiceCatalogV1, userText: string): ServiceOfferingV1[] {
  const t = userText.trim().toLowerCase();
  if (t.length < 2) {
    return [];
  }
  return catalog.services.filter((s) => {
    const d = typeof s.description === 'string' ? s.description.trim().toLowerCase() : '';
    return d.length >= 4 && t.includes(d);
  });
}

export type DeterministicMatchInner =
  | {
      offering: ServiceOfferingV1;
      confidence: ServiceCatalogMatchConfidence;
      reasonCodes: string[];
      autoFinalize: boolean;
    }
  | null;

/**
 * Stage A — pure deterministic match.
 *
 * Routing v2 / Phase 2 product-intent matrix (Plan 19-04, Task 08). Cell IDs match
 * the test block `runDeterministicServiceCatalogMatchStageA — Phase 2 matrix
 * (Routing v2, Plan 19-04, Task 08)`.
 *
 * | Cell | scope    | resolved hints                                | patient text                         | Stage A result                                  | Path |
 * |------|----------|-----------------------------------------------|--------------------------------------|-------------------------------------------------|------|
 * | A1   | strict   | examples=['htn check']                        | contains "htn check"                 | match `medium` + `autoFinalize=false`           | KEYWORD_HINT_MATCH |
 * | A2   | strict   | examples=['htn check']                        | NO overlap                           | `null` → Stage B                                | no signal |
 * | A3   | strict   | examples=['htn'], exclude_when='pregnancy'    | "htn during pregnancy"               | `null` (excluded)                               | exclude_when red flag |
 * | B1   | flexible | examples=['htn check']                        | contains "htn check"                 | match `medium` + `autoFinalize=false`           | KEYWORD_HINT_MATCH |
 * | B2   | flexible | examples=['htn check']                        | NO overlap                           | `null` → Stage B                                | no signal |
 * | B3   | flexible | (no hints) label='General physician'          | contains "general physician"         | match `high` + `autoFinalize=true`              | label fast path |
 * | C1   | strict   | (no hints) label='General physician'          | contains "general physician"         | match `medium` + `autoFinalize=false`           | label fast path with strict downgrade |
 * | C2   | strict   | legacy include_when='diabetes htn' only       | "htn please"                         | `null` → Stage B                                | strict requires example-phrase corroboration |
 * | C3   | flexible | legacy include_when='diabetes htn' only       | "htn please"                         | `null` → Stage B                                | `legacy_merge` with empty `examplePhrases` → score 0 |
 *
 * Cells already covered by the **SFU-18 scope_mode** block (kept verbatim for regression):
 * A1 ≈ "routing v2 (strict): examples-only hit yields a positive score"; A3 ≈ "routing v2:
 * examples-only row still honors exclude_when"; B3 ≈ "flexible label-only match preserves
 * high"; C1 ≈ "strict label-only match downgrades to medium"; C2 ≈ "strict with
 * include_when-only overlap (no keyword hit) yields no deterministic match".
 *
 * **Out of scope (deferred):** "Prefer assistant matching" product flag (more Stage B even
 * when Stage A would match). When/if added, it lands as a doctor-settings boolean that
 * forces this function to return `null` for non-fast-path cells; the matrix stays the
 * same for the default flag-off behavior.
 *
 * @see ../../../docs/Development/service-catalog-matching-stages.md — full narrative + FAQ
 */
export function runDeterministicServiceCatalogMatchStageA(
  catalog: ServiceCatalogV1,
  reasonForVisitRedacted: string
): DeterministicMatchInner {
  const reasonLower = reasonForVisitRedacted.trim().toLowerCase();
  if (!reasonLower) {
    return null;
  }

  const nonCatch = catalog.services.filter(
    (s) => s.service_key.trim().toLowerCase() !== CATALOG_CATCH_ALL_SERVICE_KEY
  );

  if (nonCatch.length === 1) {
    const offering = nonCatch[0]!;
    return {
      offering,
      confidence: 'high',
      reasonCodes: [SERVICE_CATALOG_MATCH_REASON_CODES.SINGLE_SERVICE_CATALOG],
      autoFinalize: true,
    };
  }

  const labelHits = labelOrKeyHits(catalog, reasonForVisitRedacted);
  if (labelHits.length === 1) {
    const hit = labelHits[0]!;
    /**
     * SFU-18: strict services should not auto-finalize on a label-only match —
     * require hint corroboration (keyword hit) to stay at `high`. Without
     * corroboration, drop to `medium` + `autoFinalize: false` so the staff
     * review inbox sees it. Flexible / undefined preserves the prior behavior.
     */
    const strictWithoutCorroboration =
      scopeOf(hit) === 'strict' && !hasStrictHintCorroboration(hit, reasonLower);
    return {
      offering: hit,
      confidence: strictWithoutCorroboration ? 'medium' : 'high',
      reasonCodes: [SERVICE_CATALOG_MATCH_REASON_CODES.CATALOG_ALLOWLIST_MATCH],
      autoFinalize: !strictWithoutCorroboration,
    };
  }

  const descHits = descriptionSubstringHits(catalog, reasonForVisitRedacted);
  if (labelHits.length > 1 && descHits.length === 1) {
    const narrowed = descHits[0]!;
    if (labelHits.some((h) => h.service_key === narrowed.service_key)) {
      return {
        offering: narrowed,
        confidence: 'medium',
        reasonCodes: [SERVICE_CATALOG_MATCH_REASON_CODES.CATALOG_ALLOWLIST_MATCH],
        autoFinalize: false,
      };
    }
  }
  if (labelHits.length === 0 && descHits.length === 1) {
    return {
      offering: descHits[0]!,
      confidence: 'medium',
      reasonCodes: [SERVICE_CATALOG_MATCH_REASON_CODES.CATALOG_ALLOWLIST_MATCH],
      autoFinalize: false,
    };
  }

  const scored = catalog.services
    .map((s) => ({ s, sc: matcherHintScore(s, reasonLower) }))
    .filter((x) => x.sc > 0);
  if (scored.length === 0) {
    return null;
  }
  const maxSc = Math.max(...scored.map((x) => x.sc));
  const winners = scored.filter((x) => x.sc === maxSc).map((x) => x.s);
  if (winners.length !== 1) {
    return null;
  }

  return {
    offering: winners[0]!,
    confidence: 'medium',
    reasonCodes: [
      SERVICE_CATALOG_MATCH_REASON_CODES.KEYWORD_HINT_MATCH,
      SERVICE_CATALOG_MATCH_REASON_CODES.CATALOG_ALLOWLIST_MATCH,
    ],
    autoFinalize: false,
  };
}
