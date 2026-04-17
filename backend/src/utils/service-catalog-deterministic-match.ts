/**
 * Pure deterministic Stage A for service catalog (ARM-04). Lives in `utils/` so callers like
 * `consultation-fees` avoid importing `service-catalog-matcher` → `ai-service` → `consultation-fees`.
 */

import type { ServiceCatalogMatchConfidence } from '../types/conversation';
import { SERVICE_CATALOG_MATCH_REASON_CODES } from '../types/conversation';
import type { ScopeMode, ServiceCatalogV1, ServiceOfferingV1 } from './service-catalog-schema';
import { CATALOG_CATCH_ALL_SERVICE_KEY, resolveServiceScopeMode } from './service-catalog-schema';

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

function hasAnyMatcherHintContent(offering: ServiceOfferingV1): boolean {
  const h = offering.matcher_hints;
  if (!h) return false;
  return Boolean(
    h.keywords?.trim() ||
      h.include_when?.trim() ||
      h.exclude_when?.trim()
  );
}

function scopeOf(offering: ServiceOfferingV1): ScopeMode {
  return resolveServiceScopeMode(offering.scope_mode);
}

function matcherHintScore(offering: ServiceOfferingV1, reasonLower: string): number {
  const h = offering.matcher_hints;
  if (!h) return 0;
  if (!hasAnyMatcherHintContent(offering)) return 0;
  if (h.exclude_when?.trim() && hasLooseOverlap(reasonLower, h.exclude_when)) {
    return -1;
  }
  if (h.include_when?.trim() && !hasLooseOverlap(reasonLower, h.include_when)) {
    return -1;
  }
  let score = 0;
  const kw = h.keywords?.trim();
  if (kw) {
    for (const part of kw.split(/[,;]+/)) {
      const k = part.trim().toLowerCase();
      if (k.length >= 2 && reasonLower.includes(k)) {
        score += 4;
      }
    }
  }
  /**
   * SFU-18: strict services only earn a positive deterministic score when a keyword
   * hit is present. An `include_when` overlap alone (which otherwise passes the
   * negative-penalty gate above) is not sufficient — the complaint must actually
   * contain one of the doctor's keywords. Flexible / undefined services keep the
   * existing behavior (include_when overlap with 0 keyword hits yields 0 anyway).
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

/** Exported for unit tests — pure Stage A (expects caller-redacted text when used after patient input). */
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
