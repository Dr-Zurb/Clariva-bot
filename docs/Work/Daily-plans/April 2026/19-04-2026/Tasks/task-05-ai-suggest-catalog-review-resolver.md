# Task 05: AI suggest + catalog review — use resolver for LLM catalog context

## 19 April 2026 — Plan [Service catalog matcher routing v2](../Plans/plan-service-catalog-matcher-routing-v2.md) — Phase 1.3

---

## Task overview

**`service-catalog-ai-suggest.ts`** (and any helper that summarizes the catalog for the LLM — e.g. `summarizeExistingCatalogForLlm`, review prompts) must **not** duplicate raw `keywords` / `include_when` strings per offering.

- Use **`resolveMatcherRouting(offering)`** (or a thin **`formatResolvedHintsForLlm(resolved)`**) so AI suggest / review sees the **same** routing view as Stage B matcher prompts.
- Keep PHI / doctor-settings constraints unchanged — still doctor-owned catalog only.

**Estimated time:** 3–6 hours

**Status:** Done (2026-04-19)

**Depends on:** Task 03 (Task 04 can parallel if files don’t conflict — prefer sequential after 04 for one merge of matcher behavior)

**Plan:** [plan-service-catalog-matcher-routing-v2.md](../Plans/plan-service-catalog-matcher-routing-v2.md)

---

## Acceptance criteria

- [x] Catalog summary lines in AI suggest prompts use resolver output for matcher hints.
- [x] Unit tests: spot-check prompt contains resolved phrases, not bypassing resolver.
- [x] No regression in `service-catalog-ai-suggest.test.ts` (update snapshots/strings if prompts change).

---

## Shipped

| Surface | File / function | Change |
| --- | --- | --- |
| AI suggest catalog summary | `backend/src/services/service-catalog-ai-suggest.ts#summarizeExistingCatalogForLlm` | `keywords="..."` line now sources from `resolveMatcherRouting(s).examplePhrases.join(', ')` so v2 `examples[]` rows surface in `single_card`, `starter`, and `review` prompts. |
| Sibling-overlap warning | `backend/src/services/service-catalog-ai-suggest.ts#tokenizeOfferingKeywords` (renamed from `tokenizeKeywords`) | Tokenization now flows through the resolver, so a v2 examples-only sibling can still trip `keyword_overlap_with_sibling`. |
| Deterministic review counters | `backend/src/services/service-catalog-ai-suggest.ts#runDeterministicCatalogReview` + `hasEmptyMatcherHints` | `kwCount` and `includeWhen` now come from `resolved.examplePhrases.length` and `resolved.legacyIncludeWhen`, so `strict_thin_keywords` / `strict_empty_hints` honor v2 hints. `exclude_when`-only cards are still treated as empty (preserves pre-v2 asymmetry). |
| LLM-output passthrough | `backend/src/services/service-catalog-ai-suggest.ts#normalizeAndValidateCard` | `matcher_hints.examples[]` returned by the LLM is now preserved through Zod validation (Task 06 will switch the LLM contract to emit `examples`-first). |
| Doctor-context AI prompt | `backend/src/utils/consultation-fees.ts#formatMatcherHintsForAiContext` | Signature changed from `(hints)` to `(offering)`. Internally uses `resolveMatcherRouting`. LLM-facing vocabulary (`keywords=…; include_when=…; exclude_when=…`) intentionally preserved to avoid prompt drift; v2 rows fill `keywords=` from `resolved.examplePhrases` and omit `include_when=`. |
| Tests | `backend/tests/unit/services/service-catalog-ai-suggest.test.ts` (+7 routing-v2 tests), `backend/tests/unit/utils/consultation-fees.test.ts` (+3 routing-v2 tests) | Spot-check prompt contents, sibling-overlap on v2 rows, and review-flag behavior under examples-only catalogs. |

**Verification (2026-04-19):**

- `npx tsc --noEmit` clean.
- ESLint clean on all touched source files.
- Targeted suite: 80/80 passing (`service-catalog-ai-suggest.test.ts` + `consultation-fees.test.ts`).
- Full backend unit suite: **1006/1006** passing across 81 suites (+10 vs Task 04's 996/996 baseline).
- Grep across `backend/src/`: no routing/LLM consumer reads `matcher_hints.keywords` / `include_when` directly outside `matcher-routing-resolve.ts`. Allow-listed remainders are all writer-side (`service-catalog-schema.ts#appendMatcherHintFields`, `service-match-hint-sanitize.ts`, `doctor-settings-service.ts#appendMatcherHints*` — Task 06 owns the v2 push), payload validation (`routes/api/v1/catalog.ts`), and LLM input/output schema-shaping in AI suggest.

---

## Out of scope

- Changing LLM temperature or schema for card generation.
- Frontend AI buttons (they call same API — behavior follows backend).

---

## References

- `backend/src/services/service-catalog-ai-suggest.ts` — `summarizeExistingCatalogForLlm`, `buildReviewPrompt`, etc.
