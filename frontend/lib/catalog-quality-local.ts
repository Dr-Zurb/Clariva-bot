/**
 * Plan 02 / Task 07 — Frontend-only deterministic catalog checks.
 *
 * Runs the same rules as `backend/src/services/service-catalog-ai-suggest.ts#runDeterministicCatalogReview`
 * against the in-memory draft list so the editor can:
 *
 *   - color the per-card health badge without a server round-trip, and
 *   - raise a save-time toast at the page level when error-severity issues exist.
 *
 * We intentionally do NOT mirror the LLM checks here — those still require the
 * `POST /api/v1/catalog/ai-suggest { mode: 'review' }` call. The LLM output is
 * expected to never duplicate deterministic kinds (see `SCHEMA_BLOCK_FOR_REVIEW`
 * in the backend), so the frontend can safely merge local deterministic results
 * with server LLM results later.
 */

import type { ServiceOfferingDraft } from "@/lib/service-catalog-drafts";
import { CATALOG_CATCH_ALL_SERVICE_KEY } from "@/lib/service-catalog-schema";
import {
  type QualityIssue,
  type QualityIssueSuggestion,
  sortQualityIssues,
} from "@/lib/catalog-quality-issues";

const NARROW_CLINICAL_NOUN_RE =
  /\b(acne|diabetes|hypertension|asthma|thyroid|psoriasis|eczema|arthritis|migraine|anxiety|depression|adhd|pcos|fertility|infertility|anemia|kidney|liver|cholesterol|obesity)\b/i;
const BROAD_LABEL_RE =
  /\b(general|consultation|consult|followup|follow-up|initial|visit|review|check-?up|check\s*up|teleconsult)\b/i;
const KEYWORD_SPLIT_RE = /[\s,;]+/;

function keywordTokenCount(keywords: string | undefined | null): number {
  if (!keywords) return 0;
  let c = 0;
  for (const raw of keywords.split(KEYWORD_SPLIT_RE)) {
    if (raw.trim().length >= 3) c += 1;
  }
  return c;
}

/**
 * Routing v2 (Task 06) — resolver-style "phrase" count for the local badge.
 * Mirrors `backend/src/utils/matcher-routing-resolve.ts`: prefer v2 `examples`
 * when present (each phrase counts as one keyword token), otherwise fall back
 * to tokenizing the legacy `keywords` CSV.
 */
function resolvedKeywordCount(d: ServiceOfferingDraft): number {
  if (d.matcherExamples.length > 0) return d.matcherExamples.length;
  return keywordTokenCount(d.matcherKeywords);
}

/**
 * Routing v2 (Task 06): empty-hint check now considers `examples` as routing
 * material. Matches the backend resolver's "no positive routing hints" rule
 * used by `runDeterministicCatalogReview`.
 */
function hasEmptyHints(d: ServiceOfferingDraft): boolean {
  if (d.matcherExamples.length > 0) return false;
  const kw = d.matcherKeywords.trim();
  const iw = d.matcherIncludeWhen.trim();
  return kw.length === 0 && iw.length === 0;
}

function mainToMinor(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function withAutoFix(input: Omit<QualityIssue, "autoFixAvailable">): QualityIssue {
  return { ...input, autoFixAvailable: (input.suggestions?.length ?? 0) > 0 };
}

function pickSuggestions(actions: QualityIssueSuggestion[]): QualityIssueSuggestion[] {
  return actions;
}

/**
 * Mirror of `runDeterministicCatalogReview` for client-side use. Takes drafts
 * instead of server `ServiceCatalogV1` — we operate directly on the editor
 * state so the badge updates live as the doctor types.
 */
export function runLocalCatalogChecks(services: ServiceOfferingDraft[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  const hasCatchAll = services.some(
    (s) => s.service_key.trim().toLowerCase() === CATALOG_CATCH_ALL_SERVICE_KEY
  );
  if (!hasCatchAll) {
    issues.push(
      withAutoFix({
        type: "missing_catchall",
        severity: "error",
        services: [],
        message:
          'Your catalog is missing the "Other / not listed" card — the matcher needs a flexible catch-all to fall back to.',
        suggestion:
          'Add a flexible catch-all so complaints that do not fit a named service still land somewhere.',
        suggestions: pickSuggestions([{ action: "add_card" }]),
      })
    );
  }

  for (const draft of services) {
    const key = draft.service_key.trim().toLowerCase();
    const isCatchAll = key === CATALOG_CATCH_ALL_SERVICE_KEY;
    if (isCatchAll) continue;

    const empty = hasEmptyHints(draft);
    /**
     * Routing v2 (Task 06) — `kwCount` matches the backend resolver: v2 example
     * phrases contribute directly, otherwise we fall back to the legacy CSV
     * tokenizer. `includeWhen` only counts when no `examples` exist (the
     * resolver suppresses legacy `include_when` once `examples` is populated).
     */
    const kwCount = resolvedKeywordCount(draft);
    const includeWhen =
      draft.matcherExamples.length > 0 ? "" : draft.matcherIncludeWhen.trim();
    const label = draft.label.trim() || "(Untitled service)";

    // Empty `service_key` means the doctor hasn't typed a label yet — the
    // catalog can't be saved in this state, so we skip per-card checks instead
    // of attaching issues the editor can't correlate back to a card.
    if (!key) continue;
    const idKey = key;

    if (draft.scopeMode === "strict" && empty) {
      issues.push(
        withAutoFix({
          type: "strict_empty_hints",
          severity: "error",
          services: [idKey],
          message: `"${label}" is set to strict matching but has no routing hints — the bot will not route to this service.`,
          suggestion:
            "Fill in matching hints so the bot has something to anchor on, or switch this card to flexible matching.",
          suggestions: pickSuggestions([
            { action: "fill_with_ai" },
            { action: "switch_to_flexible" },
          ]),
        })
      );
      continue;
    }

    if (draft.scopeMode === "strict" && kwCount < 3 && includeWhen.length < 40) {
      issues.push(
        withAutoFix({
          type: "strict_thin_keywords",
          severity: "warning",
          services: [idKey],
          message: `"${label}" is strict but has very few keywords — the bot will miss obvious synonyms patients actually type.`,
          suggestion:
            "Add more keywords (synonyms patients actually type) so the strict matcher has something to hit on.",
          suggestions: pickSuggestions([{ action: "fill_with_ai" }]),
        })
      );
    }

    if (draft.scopeMode === "flexible" && empty) {
      issues.push(
        withAutoFix({
          type: "empty_hints",
          severity: "suggestion",
          services: [idKey],
          message: `"${label}" has no routing hints — the bot may struggle to match patients correctly.`,
          suggestions: pickSuggestions([{ action: "fill_with_ai" }]),
        })
      );
    }

    if (
      draft.scopeMode === "flexible" &&
      NARROW_CLINICAL_NOUN_RE.test(label) &&
      !BROAD_LABEL_RE.test(label) &&
      kwCount < 5
    ) {
      issues.push(
        withAutoFix({
          type: "flexible_should_be_strict",
          severity: "warning",
          services: [idKey],
          message: `"${label}" reads like a specific condition but is set to flexible — it may absorb complaints that belong elsewhere.`,
          suggestion:
            "Switch this card to strict and let AI fill concrete keywords so it only matches its intended condition.",
          suggestions: pickSuggestions([{ action: "switch_to_strict_and_fill" }]),
        })
      );
    }

    // --- pricing_anomaly (text<=voice<=video) ----------------------------
    const t = draft.textEnabled ? mainToMinor(draft.textPriceMain) : null;
    const v = draft.voiceEnabled ? mainToMinor(draft.voicePriceMain) : null;
    const vid = draft.videoEnabled ? mainToMinor(draft.videoPriceMain) : null;
    const fireAnomaly = (description: string) => {
      issues.push(
        withAutoFix({
          type: "pricing_anomaly",
          severity: "warning",
          services: [idKey],
          message: description,
          suggestions: pickSuggestions([{ action: "reprice" }]),
        })
      );
    };
    if (t != null && v != null && t > v) {
      fireAnomaly(`Text price is higher than voice price on "${label}" — expected text ≤ voice ≤ video.`);
    } else if (t != null && vid != null && t > vid) {
      fireAnomaly(`Text price is higher than video price on "${label}".`);
    } else if (v != null && vid != null && v > vid) {
      fireAnomaly(`Voice price is higher than video price on "${label}".`);
    }
  }

  return sortQualityIssues(issues);
}

/**
 * Counts issues by severity — useful for toolbar badges and the save-anyway
 * confirmation prompt. Includes both catalog-level and per-card issues.
 */
export function countIssuesBySeverity(
  issues: readonly QualityIssue[]
): { errors: number; warnings: number; suggestions: number } {
  let errors = 0;
  let warnings = 0;
  let suggestions = 0;
  for (const i of issues) {
    if (i.severity === "error") errors += 1;
    else if (i.severity === "warning") warnings += 1;
    else suggestions += 1;
  }
  return { errors, warnings, suggestions };
}
