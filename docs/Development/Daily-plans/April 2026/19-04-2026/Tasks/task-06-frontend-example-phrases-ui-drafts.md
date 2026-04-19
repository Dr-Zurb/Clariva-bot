# Task 06: Frontend — example phrases UI + drafts round-trip

## 19 April 2026 — Plan [Service catalog matcher routing v2](../Plans/plan-service-catalog-matcher-routing-v2.md) — Phase 1.4

---

## Task overview

Replace the overlapping **Keywords** + **Book this service when** UX with a **doctor-friendly** layout:

- **Example phrases** (primary) — list input: newline-separated, chips, or repeated field — **pick one pattern** consistent with the design system; supports EN + Hinglish + local spellings.
- **Not this service when** — optional; maps to `exclude_when`.

**Data flow:**

- **`ServiceOfferingDraft`** (or equivalent) gains **`examples: string[]`** (or storage shape mirroring backend).
- **`draftsToCatalogOrNull` / `offeringToDraft` / `catalogToServiceDrafts`** round-trip **`matcher_hints.examples`** with **`keywords` / `include_when`** handling:
  - **Transition:** loading legacy-only rows may still populate read-only legacy display (see Task 07); saving should prefer writing **`examples`** once the doctor edits.

**Estimated time:** 8–16 hours (largest UI task in Phase 1)

**Status:** Done

**Depends on:** Task 02 (types)

**Plan:** [plan-service-catalog-matcher-routing-v2.md](../Plans/plan-service-catalog-matcher-routing-v2.md)

---

## Acceptance criteria

- [x] Doctors can add/remove/reorder example phrases without touching raw `keywords` CSV in the default UI path.
- [x] Save persists `examples` in `service_offerings_json` for edited cards.
- [x] `safeParseServiceCatalogV1` on saved payload succeeds.
- [x] Accessibility: labels + info tooltips reference Task 01 / Task 07 copy as needed.

---

## Out of scope

- Migration banner (Task 07) — can land in same PR if coordinated.
- Removing legacy fields from JSON on save (deprecation plan — later).

---

## References

- `frontend/components/practice-setup/ServiceCatalogEditor.tsx` (or matcher hint subcomponents)
- `frontend/lib/service-catalog-drafts.ts`
- `frontend/lib/service-catalog-schema.ts`

---

## Shipped

| Concern | Change |
| --- | --- |
| Draft shape | `ServiceOfferingDraft.matcherExamples: string[]` added to `frontend/lib/service-catalog-drafts.ts`; `emptyServiceDraft` / `offeringToDraft` / `aiSuggestedCardToDraft` / `applyAiSuggestionToDraft` round-trip the new field. Legacy `matcherKeywords` / `matcherIncludeWhen` are JSDoc-deprecated on the draft. |
| Save-side contract | `draftsToCatalogOrNull` now writes `matcher_hints.examples` (+ `exclude_when`) and **drops** legacy `keywords` / `include_when` once a row has at least one example phrase — no silent dual-write. Un-migrated rows (no examples) keep the pre-v2 byte-for-byte legacy emit. |
| Helpers | `normalizeMatcherExamplesDraft` (mirrors backend resolver normalizer), `exampleTextToList`, `exampleListToText` exported from `service-catalog-drafts.ts`. |
| Editor UI | `ServiceOfferingDetailDrawer` matcher-hints section: new **Example phrases** primary textarea (newline-separated) backed by `ExamplePhrasesField` (chip preview + remove-chip + count/cap indicator). **Not this service when…** stays as the secondary input. Legacy `keywords` / `include_when` textareas tucked behind a `<details>` disclosure shown **only** for un-migrated rows (`hasUnmigratedLegacyHints`); new rows never see them. |
| AI suggest plumbing | `AiSuggestSingleCardPayload.existingHints.examples?: string[]` and `AiSuggestCardV1.matcher_hints.examples?: string[]` added to `frontend/lib/api.ts`. Drawer sparkle button + page-level `fill_with_ai` action both forward the doctor's current `matcherExamples` to the backend. Diff modal renders an Example-phrases row and prefers v2 examples on apply. |
| Backend route | `backend/src/routes/api/v1/catalog.ts` `existingHints` schema accepts `examples: string[]` (max 24 × 200 chars) and counts it toward the single_card "has input" guard. |
| Backend prompt | `buildSingleCardPrompt` renders `examples: a \| b \| c` and **suppresses** legacy `keywords` / `include_when` lines when `examples` is present so the LLM never sees two competing routing vocabularies. |
| Local quality badge | `frontend/lib/catalog-quality-local.ts` `hasEmptyHints` / token count now resolver-aware: v2 `examples` count as routing material, and `include_when` is suppressed when `examples` is non-empty (matches backend Stage A + Task 05 review semantics). |
| Tests | 4 new backend Jest tests under `buildSingleCardPrompt — existingHints.examples (Routing v2 Task 06)` covering: examples renders + suppresses legacy; legacy fallback when examples absent/empty; route schema accepts `examples`; route schema stays strict. Full backend suite **1010 / 1010 passing (+4 vs Task 05 baseline)**. |
| Verification | Frontend `tsc --noEmit` clean; `next lint` clean on `lib/`, `components/practice-setup/`, `app/dashboard/settings/practice-setup/`. Backend `tsc --noEmit` + ESLint clean on touched files. Grep confirms the only writer of `matcher_hints.keywords` in the frontend is the legacy fallback branch of `draftsToCatalogOrNull`. |
