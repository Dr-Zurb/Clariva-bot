# Task 04: Wire Stage A + LLM prompt builder to resolver

## 19 April 2026 — Plan [Service catalog matcher routing v2](../Plans/plan-service-catalog-matcher-routing-v2.md) — Phase 1.3 (core)

---

## Task overview

Refactor **all** matcher-side reads of `matcher_hints.keywords` / `include_when` for routing into **`resolveMatcherRouting`** (Task 03).

**Files (primary):**

1. **`backend/src/utils/service-catalog-deterministic-match.ts`**
   - `matcherHintScore` (and related helpers) score using **`ResolvedRoutingHints.examplePhrases`** (token/substring rules as today, but sourced from resolved phrases).
   - `exclude_when` via resolver.
   - **Strict** path: ensure “keyword hit” semantics apply to **resolved** phrases, not raw `keywords` string field (align with Task 08 if split across PRs — same sprint preferred).

2. **`backend/src/services/service-catalog-matcher.ts`**
   - `matcherHintsSnippetForLlm` builds snippets **only** from `ResolvedRoutingHints` (plus label/description as today).
   - No direct `offering.matcher_hints?.keywords` in this file after task.

3. **`appendMatcherHintsOnDoctorCatalogOffering`** (`doctor-settings-service.ts` or equivalent): decide whether learning-append targets **`examples`** push vs legacy — document; prefer appending to **examples** when present.

**Estimated time:** 6–12 hours (regression risk — run full backend suite)

**Status:** Done (2026-04-19)

**Depends on:** Task 03

**Plan:** [plan-service-catalog-matcher-routing-v2.md](../Plans/plan-service-catalog-matcher-routing-v2.md)

---

## Acceptance criteria

- [x] Grep confirms no routing logic reads `matcher_hints.keywords` / `include_when` outside `matcher-routing-resolve.ts` (allowlist: resolver + tests + migration scripts if any). Remaining direct readers are out of scope: `service-catalog-ai-suggest.ts` (Task 05), `consultation-fees.ts#formatMatcherHintsForAiContext` (consultation-fees AI prompt, not routing — Task 05 follow-up), `routes/api/v1/catalog.ts` (request-payload validation, not a routing read), and `appendMatcherHintsOnDoctorCatalogOffering` (writer; v2 plan documented in JSDoc, switch to `examples` push deferred to Task 06).
- [x] Existing `service-catalog-matcher.test.ts` / `service-catalog-deterministic-match.test.ts` updated or extended; **no unexplained behavior drift** — every pre-existing test still passes unmodified. Intentional change documented below: the LLM-facing snippet now sources `keywords=` from `resolved.examplePhrases` (which equals legacy CSV split for legacy rows, so legacy rows produce byte-identical snippets).
- [x] `tsc` + full backend unit suite green (**996/996** across 81 suites; +8 new tests).

---

## Out of scope

- `service-catalog-ai-suggest.ts` (Task 05).
- Frontend editor (Task 06).

---

## References

- `backend/src/services/service-catalog-matcher.ts`
- `backend/src/utils/service-catalog-deterministic-match.ts`

---

## Shipped (2026-04-19)

| Area | Change |
|------|--------|
| Resolver field rename | `ResolvedRoutingHints.llmIncludeWhen` → `legacyIncludeWhen` (more honest: both Stage A loose-overlap gate and Stage B `include_when=` snippet now read this on legacy rows). JSDoc on the type + module both updated. Tests in `matcher-routing-resolve.test.ts` renamed accordingly (still 18 tests). |
| Stage A | `backend/src/utils/service-catalog-deterministic-match.ts` — `matcherHintScore` now calls `resolveMatcherRouting(offering)` and operates on `resolved.examplePhrases` (`+4` per substring hit), `resolved.legacyIncludeWhen` (loose-overlap gate, legacy only), and `resolved.excludeWhen` (`-1` red flag). Old `hasAnyMatcherHintContent` predicate replaced with `hasAnyResolvedHintContent(resolved)`. Strict-mode rule (`SFU-18`) preserved verbatim — strict requires a positive `examplePhrases` hit, an `include_when` overlap alone never auto-routes. No direct `matcher_hints.keywords` / `include_when` reads remain in this file. |
| Stage B prompt | `backend/src/services/service-catalog-matcher.ts` — `matcherHintsSnippetForLlm` now reads via the resolver. **LLM-facing vocabulary unchanged** (`keywords=…; include_when=…; exclude_when=…`) so the existing matching-policy rules in `buildServiceCatalogLlmSystemPrompt` keep binding without prompt-text drift. v2 (`examples`) rows feed `keywords=` from `resolved.examplePhrases.join(', ')` and omit `include_when=`; legacy rows produce byte-identical snippets to pre-routing-v2. |
| Writer (decision) | `appendMatcherHintsOnDoctorCatalogOffering` (`backend/src/services/doctor-settings-service.ts`) — extended JSDoc explains the v2 decision: keep appending to legacy `keywords` / `include_when` / `exclude_when` until Task 06 ships the editor's `examples` UI. Reasons: (1) appending to `examples` while the editor still surfaces only legacy text areas would silently dual-write; (2) the **reader** path is already safe via `resolveMatcherRouting`, so deferring the writer doesn't gate Task 04. Concrete switch plan documented in the JSDoc for the future task. |
| Tests (new) | 8 new tests across two files. `service-catalog-deterministic-match.test.ts` (5 new under `SFU-18 scope_mode` block): v2 strict examples-only routes; v2 examples win over legacy on same row; v2 row ignores legacy `include_when` gate; v2 row still honors `exclude_when`; blank `examples` falls through to legacy_merge. `service-catalog-matcher.test.ts` (3 new): v2 row serializes into `keywords=` snippet; v2 wins over legacy in snippet; legacy-only row keeps `include_when=` snippet (back-compat). |
| Verification | `npx tsc --noEmit` clean; ESLint clean on touched files; full backend suite **996 / 996 / 57 snapshots** across 81 suites (+8 tests vs Task 03's 988). |
| Docs | `service-catalog-matching-stages.md` updated to reflect resolver wiring; this task + plan + inbox entry refreshed. |
