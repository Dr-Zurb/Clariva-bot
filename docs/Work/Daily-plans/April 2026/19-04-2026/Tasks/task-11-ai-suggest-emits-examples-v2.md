# Task 11: AI suggest prompts emit `examples[]` (Routing v2 — close the autofill loop)

## 19 April 2026 — Plan [Service catalog matcher routing v2](../Plans/plan-service-catalog-matcher-routing-v2.md) — Phase 1.6 (post-launch follow-up)

---

## Task overview

Tasks 02–07 migrated the **persistence**, **resolver**, **matcher**, and **editor** to v2 (`matcher_hints.examples[]`). But the **AI generation prompts** in `backend/src/services/service-catalog-ai-suggest.ts` still hardcode the legacy `keywords` + `include_when` shape in `SCHEMA_BLOCK_FOR_CARDS` and `SCHEMA_BLOCK_FOR_REVIEW`. As a result:

- **`single_card`** mode (sparkle button on a fresh card) returns a card with `matcher_hints.keywords` + `include_when` populated and `examples` empty.
- **`starter`** mode returns a whole catalog of legacy-shaped cards.
- **`review`** mode emits `suggestedCard` (for `gap` / `service_suggestion` issues) in legacy shape.

The frontend draft converter (`aiSuggestedCardToDraft`, `applyAiSuggestionToDraft`) and the save-time writer (`draftsToCatalogOrNull`) **already** prefer `examples` and zero out legacy fields when the AI emits `examples`. So the fix is **purely in the prompt + normalizer**: tell the LLM to emit `examples[]`, defensively drop legacy fields when both are present, and update the prompt-pinning tests.

This **closes the v2 loop**: doctor uses AI autofill → card lands in editor with `examples` → save persists `matcher_hints.examples` → matcher reads via resolver → no legacy migration callout ever fires on AI-generated cards.

**Estimated time:** 2–4 hours

**Status:** Done — shipped 19 April 2026

**Depends on:** Task 02 (schema), Task 03 (resolver), Task 06 (frontend examples UI), Task 07 (migration semantics locked)

**Plan:** [plan-service-catalog-matcher-routing-v2.md](../Plans/plan-service-catalog-matcher-routing-v2.md)

---

## Acceptance criteria

- [x] **`single_card` mode** returns a card whose `matcher_hints` has a non-empty `examples: string[]` and **no** `keywords` or `include_when` fields when the LLM is operating per the new prompt. Verified via prompt-pinning assertions on `SCHEMA_BLOCK_FOR_CARDS` (now embedded in `buildSingleCardPrompt` / `buildStarterCatalogPrompt`) **and** an end-to-end `single_card` test that drives `generateAiCatalogSuggestion` with a stub LLM emitting the v2 shape and asserts the persisted card has `matcher_hints.examples` only.
- [x] **`starter` mode** returns every named card with `examples` populated; only `exclude_when` may accompany. Verified by `Task 11 — starter prompt: schema instructs matcher_hints.examples and forbids legacy keys` (asserts `"examples":` present, no `"keywords":"..."` or `"include_when":"..."` JSON KV in the prompt).
- [x] **`review` mode** `suggestedCard` shape uses `examples` (no `keywords` / `include_when`). Verified by `Task 11 — review prompt: suggestedCard.matcher_hints uses examples, not legacy keys`. Note: the prose `overlap` description in the review prompt still references "legacy keywords / include_when text" intentionally — that's contextual guidance for un-migrated rows, not a schema instruction; the assertion is anchored on the JSON KV form (`"keywords": "..."`) so prose is unaffected.
- [x] **Normalizer defense:** when the LLM emits both `examples` AND legacy fields, `normalizeRawLlmCard` keeps only `examples` (+ `exclude_when`) and drops `keywords` / `include_when`. The dual-emit logs `service_catalog_ai_suggest: dropped legacy matcher_hints fields in favour of examples[] (Task 11 defense)` at info level so we can spot model drift in production. Pinned by `Task 11 — normalizer defense: when LLM emits BOTH examples + legacy keywords/include_when, the saved card keeps only examples`. Back-compat path (legacy-only emit) still flows through — pinned by the companion `normalizer back-compat` test.
- [x] **`SCOPE_MODE_RULE_BLOCK`** wording updated: "Strict cards must always carry **a concrete `examples[]` list**" + "if you produce strict, also produce a non-empty `examples[]` array". The matcher service has its own inline copy of the strict-rule wording (`service-catalog-matcher.ts` lines 352–366) and is intentionally **not** touched here — the matcher prompt operates on whatever vocabulary the row actually carries (v2 or legacy), and the matcher tests explicitly pin both cases. Routing v1 wording is gone from the AI-suggest constant.
- [x] **`summarizeExistingCatalogForLlm`** line label flipped from `keywords="…"` to `examples="…"`. The data was already coming from `resolveMatcherRouting.examplePhrases`; only the label changed so the LLM no longer sees a misleading legacy-vocabulary cue when summarizing the doctor's existing catalog.
- [x] **`buildSingleCardPrompt`'s "Doctor's existing hints"** block: legacy-only payloads now render under `"Doctor's existing matching cues (legacy — please convert to \`examples[]\` in the output, do not echo \`keywords\` / \`include_when\`):"` with each line tagged `(legacy)`. Examples-bearing payloads keep the original neutral header. Pinned by `single_card existing-hints block: legacy-only payload renders under a "please convert" header` and the matching examples-bearing test.
- [x] **All existing prompt-pinning tests** updated. Three legacy assertions on `summarizeExistingCatalogForLlm` (`keywords="…"`) flipped to `examples="…"`; the legacy-fallback existing-hints test now asserts `(legacy)` tags + the convert header; new `not.toContain` guards added per builder. 9 new tests in a dedicated `Task 11` describe block.
- [ ] **Manual QA:** _Owner to run after merge._ Click sparkle on an empty card → drawer shows Example phrases populated, no amber "older matching hints" callout. Click "Generate starter catalog" → none of the generated rows show the callout. (Telemetry hook for the dual-emit info log will surface model drift if it happens later.)

---

## Out of scope

- **Truncation handling for `max_completion_tokens`** → covered separately by **Task 12** (the "AI returned malformed JSON" message you saw on Review my catalog is a token budget bug, not a prompt-shape bug). They're independent fixes; this task ships the prompt flip even if Task 12 is still pending.
- **Staff-feedback learner writing into `examples`** → covered by **Task 13** (`appendMatcherHintsOnDoctorCatalogOffering` is a separate writer with its own deferred-until-now rationale documented in the function header).
- **Embedding-based suggestion** or any model-architecture change. Same OpenAI call, same `response_format: { type: 'json_object' }`, just a different schema in the system prompt.
- **Bulk re-generation** of existing AI-shipped catalogs to v2. Doctors who already accepted legacy-shaped AI cards have the migration callout (Task 07) and the one-tap convert CTA — that's the migration path.

---

## References

- `backend/src/services/service-catalog-ai-suggest.ts`:
  - `SCHEMA_BLOCK_FOR_CARDS` (lines ~240–263) — single source of legacy schema for `single_card` + `starter`.
  - `SCHEMA_BLOCK_FOR_REVIEW` (lines ~273–309) — `suggestedCard` legacy schema.
  - `SCOPE_MODE_RULE_BLOCK` (lines ~209–213) — "Strict cards must always carry concrete keywords / include_when" wording.
  - `summarizeExistingCatalogForLlm` (lines ~424–440) — `keywords="…"` label that needs to flip to `examples="…"`.
  - `buildSingleCardPrompt` (lines ~442–497) — "Doctor's existing hints" rendering.
  - `normalizeRawLlmCard` (lines ~816–871) — already passes through `examples` if emitted; needs defense to also drop legacy when both are present.
- `frontend/lib/service-catalog-drafts.ts`:
  - `aiSuggestedCardToDraft` (lines 676–726) — already examples-first.
  - `applyAiSuggestionToDraft` (lines 736–804) — already examples-first.
  - `draftsToCatalogOrNull` (lines 595–629) — already examples-only on save.
- `frontend/components/practice-setup/ServiceOfferingDetailDrawer.tsx` — the amber legacy callout fires from `hasUnmigratedLegacyHints`. Once the AI stops emitting legacy, the callout will simply not appear on AI-generated cards (no UI change needed here).

---

## Implementation outline

1. **Schema block — cards** (`SCHEMA_BLOCK_FOR_CARDS`):
   ```jsonc
   "matcher_hints": {
     "examples": ["<short patient-style phrase>", "..."],
     "exclude_when": "<short phrases of when NOT to pick this card>"
   }
   ```
   Add inline guidance: `"examples": 4–12 entries, lower-case, patient words not clinical jargon, no PHI, ≤120 chars each, deduped`.
2. **Schema block — review** (`SCHEMA_BLOCK_FOR_REVIEW`'s `suggestedCard`): same shape.
3. **`SCOPE_MODE_RULE_BLOCK`**: replace "concrete keywords / include_when" → "concrete `examples[]`". Replace bug-line accordingly.
4. **`summarizeExistingCatalogForLlm`**: change the prompt-rendered label from `keywords="…"` to `examples="…"` (the data already comes from `resolveMatcherRouting.examplePhrases`).
5. **`buildSingleCardPrompt` existing-hints block**: when the editor sends only `keywords` / `include_when` (un-migrated row), render them under a **legacy** header: `"Doctor's existing matching cues (legacy — please convert to examples in the output):"`. When the editor sends `examples`, render them as today.
6. **`normalizeRawLlmCard`** defense: change the merge so `examples.length > 0` ⇒ output `matcher_hints` includes **only** `{ examples, exclude_when? }` — drop `keywords` / `include_when` even if the LLM emitted them. This makes the contract robust to model drift.
7. **Tests** — `backend/tests/unit/services/service-catalog-ai-suggest.test.ts`:
   - Flip every `toContain('keywords')` / `toContain('include_when')` in prompt assertions to `toContain('examples')`.
   - Add `expect(systemPrompt).not.toMatch(/"keywords"\s*:/)` and same for `include_when` on `single_card` + `starter` + `review` builders.
   - Add **normalizer-defense** test: feed `normalizeRawLlmCard` a synthetic LLM output with both `examples: ["x", "y"]` AND `keywords: "x, y"` — assert the returned card has `matcher_hints.examples` and **no** `matcher_hints.keywords`.
   - Add an **end-to-end** test for `single_card` mode using a fixture run-LLM that returns the new shape — assert the returned `card.matcher_hints` has `examples` and no `keywords`.
   - Update any prompt **snapshot** files (`.snap`) by running `jest -u` on the affected suite **only after** verifying the diff is the intentional schema flip.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Older OpenAI model snapshots ignore the new schema and still emit `keywords` | Normalizer-defense step (#6) drops legacy fields when `examples` is present, so the worst case is a card with **no** matcher_hints (which the editor still allows the doctor to fill manually) — never a stealth dual-write. |
| Prompt snapshot churn balloons the diff | Re-snapshot only after eyeballing the diff once; commit snapshot changes in the same PR with a one-line note in the PR description. |
| Doctors with un-migrated catalogs see "convert legacy" guidance in the prompt and assume the AI changed something on existing rows | The legacy-labeling change is in the **prompt the LLM sees**, not in the doctor-facing UI. UI behavior is unchanged. |
| Stage A regresses because deterministic matcher relies on tokens | Stage A reads via `resolveMatcherRouting`, which already prefers `examples` and falls back to legacy — no Stage A code change. The `dm-routing-golden` corpus must still pass; if it doesn't, the suggested-card-content changed too aggressively (revisit the prompt's example-quality guidance). |

---

## Verification checklist

- [ ] `npx tsc --noEmit` (backend) clean.
- [ ] `npx jest tests/unit/services/service-catalog-ai-suggest.test.ts` passes.
- [ ] `npx jest` (full backend) passes — no unrelated regressions.
- [ ] `npx eslint src/services/service-catalog-ai-suggest.ts` clean.
- [ ] Manual QA per Acceptance criteria last bullet (sparkle + starter catalog).
- [ ] Inspect one real `single_card` response in dev: `matcher_hints.examples` present, `keywords` / `include_when` absent.

---

## Decision log

- _Why we kept `exclude_when` as a string instead of an array:_ orthogonal to the routing-vocabulary unification this plan is about; converting `exclude_when` to an array is a separate schema discussion.
- _Why we did not bump `service_offerings_json` `version`:_ the additive `examples` field already exists on v1 (Task 02); no breaking change here.
- _Why the normalizer drops legacy fields with an `info` log instead of `warn`:_ a model that obeys the new schema never emits both shapes, so dual-emit is a non-fatal model-drift signal, not a code bug. We don't want to spam `warn` if a model snapshot is slow to update; the `info` line is enough to dashboard the rate of dual-emits and decide whether to escalate.
- _Why the matcher prompt was left alone:_ Task 11 scope was the **AI-suggest** prompts (autofill loop). The matcher service has its own copy of the strict-rule wording inline (`service-catalog-matcher.ts` line 355) and reads via `resolveMatcherRouting`, which already prefers `examples[]`. Touching matcher copy in this task would have churned the matcher snapshot tests for no behavior change. Tracked separately as a future cleanup if it ever causes drift.
- _Why no prompt snapshot files needed re-snapping:_ this suite uses inline `toContain` / `not.toContain` assertions on the prompt strings, not Jest `.toMatchSnapshot()`. The 9 new tests + the 3 flipped assertions cover every behavior change without the cost of a snapshot artifact.
- _Why we kept the legacy-only normalizer back-compat path:_ Task 13 (staff-feedback writer) still appends to legacy fields today. Dropping legacy entirely from the normalizer here would race ahead of Task 13 and lose data on rows produced by older models. The companion back-compat test pins this contract.

---

## Shipped — 19 April 2026

**Backend changes** (single source file: `backend/src/services/service-catalog-ai-suggest.ts`):

1. **`SCHEMA_BLOCK_FOR_CARDS`** — `matcher_hints` schema now lists `examples: string[]` + `exclude_when: string`. Added explicit guidance: "4–12 entries, lower-case, patient words not clinical jargon, no PHI, ≤120 chars each, deduped" plus a hard "Do NOT emit \"keywords\" or \"include_when\"" line.
2. **`SCHEMA_BLOCK_FOR_REVIEW`** — `suggestedCard.matcher_hints` schema flipped to the same `examples` + `exclude_when` shape. The `overlap` issue-type description was updated to `share too many \`examples[]\` phrases (or, on un-migrated rows, legacy keywords / include_when text)` so the LLM still understands legacy rows when reviewing existing catalogs.
3. **`SCOPE_MODE_RULE_BLOCK`** — both the strict-card rule and the bug-line now reference `examples[]` instead of `keywords / include_when`. Header JSDoc explains the v1→v2 wording flip and pins this constant as the single source of truth.
4. **`summarizeExistingCatalogForLlm`** — line label flipped from `keywords="…"` to `examples="…"`. Data source unchanged (still `resolveMatcherRouting.examplePhrases`).
5. **`buildSingleCardPrompt`** existing-hints block — three rendering branches: examples-bearing (neutral header), legacy-only (legacy "please convert to `examples[]`" header + `(legacy)` tags on each line), and empty (no-hints copy unchanged).
6. **`normalizeRawLlmCard`** — when `examples.length > 0`, the saved `matcher_hints` includes only `{ examples, exclude_when? }`. Any leaked `keywords` / `include_when` is dropped with an `info` audit-log line. Legacy-only emits flow through unchanged for back-compat with older models and the staff-feedback writer (until Task 13 ships).

**Tests** (`backend/tests/unit/services/service-catalog-ai-suggest.test.ts`):

- 3 existing assertions flipped to the new label (`keywords="…"` → `examples="…"`).
- 1 existing legacy-fallback assertion updated to expect the `(legacy)` tags + convert header.
- New `Task 11` describe block with 9 cases covering: scope-rule wording flip, single_card schema, starter schema, review schema, legacy-header rendering, examples-header rendering, normalizer defense (dual-emit), normalizer back-compat (legacy-only), and end-to-end single_card with v2 stub LLM.

**Verification:**

- `npx tsc --noEmit` ✅
- `npx jest tests/unit/services/service-catalog-ai-suggest.test.ts` ✅ (67 tests, 9 new)
- `npx jest` ✅ (1064 tests across 82 suites — was 1055; no unrelated regressions)
- `npx eslint src/services/service-catalog-ai-suggest.ts` ✅
- Matcher prompt snapshot (`tests/unit/services/service-catalog-matcher.test.ts`) unaffected — matcher uses its own inline copy of the strict-rule wording and was intentionally out of scope.

**Telemetry follow-ups** (no code changes required):

- Dashboard the rate of `service_catalog_ai_suggest: dropped legacy matcher_hints fields…` info logs. If a specific model snapshot accounts for >5% of suggestions, file a ticket to either pin a newer snapshot or tighten the prompt.

**Independence:**

- Task 12 (per-mode token budget) was a prerequisite **only for the review/starter modes' reliability** (truncation → malformed JSON), not for Task 11. The two are fully independent.
- Task 13 (staff-feedback writer → `examples[]`) is the next logical task: once it ships, the back-compat branch in `normalizeRawLlmCard` can be tightened further.

---

## Files changed

- `backend/src/services/service-catalog-ai-suggest.ts` — prompt blocks + normalizer defense.
- `backend/tests/unit/services/service-catalog-ai-suggest.test.ts` — flipped assertions + new `Task 11` describe block (9 cases).
- _(No snapshot files in this suite — assertions are inline `toContain`.)_
