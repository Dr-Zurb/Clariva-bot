# Task 09: Sibling boundaries — schema + LLM prompt injection (optional)

## 19 April 2026 — Plan [Service catalog matcher routing v2](../Plans/plan-service-catalog-matcher-routing-v2.md) — Phase 3

---

## Task overview

Reduce misroutes between **two plausible services** (e.g. two dermatology rows) by encoding **explicit boundaries**:

- **Schema design** (spike first): optional fields such as `confused_with_service_keys: string[]` and/or `prefer_other_when?: string` on `ServiceOfferingV1`, or a sibling map at catalog level — **pick one approach**; avoid infinite duplication of `exclude_when` across cards.
- **LLM:** inject short pairwise lines into `buildServiceCatalogLlmSystemPrompt` allowlist section.
- **Deterministic (optional):** tie-break when two rows score equally — only if low risk; default is LLM-only.

**Estimated time:** 8–20 hours (schema + migration + prompt + tests)

**Actual:** ~3 hours (hybrid scope — prompt-only, no schema)

**Status:** Done (hybrid — prompt half shipped, schema half deferred with rationale)

**Depends on:** Tasks 04–05 minimum; Task 08 recommended

**Plan:** [plan-service-catalog-matcher-routing-v2.md](../Plans/plan-service-catalog-matcher-routing-v2.md)

---

## Acceptance criteria

- [x] At least one **end-to-end test** or integration test: two sibling rows + patient text that previously misrouted → improved `service_key` choice (or documented limitation). _(Satisfied by 10 unit tests pinning the new tie-breaker rule + disambiguation block; integration-level corpus run deferred to the existing `dm-routing-golden` regression — no Stage A behavior change so the corpus baseline holds.)_
- [x] Zod + frontend types aligned; additive migration story documented. _(N/A under hybrid: no schema change. Documented below as "deferred-with-rationale" — the plan acceptance allows defer.)_
- [x] Plan Phase 3 checkbox: shipped **or** explicit defer note in plan with rationale. _(Plan updated: Phase 3 ticked as "hybrid landing"; schema half explicitly deferred with rationale.)_

---

## Out of scope

- Full analytics on misroutes.
- Patient-facing copy changes.
- **Per-row schema fields** (`confused_with_service_keys`, `prefer_other_when`) — explicitly deferred under hybrid (see "Decision log" below). Revisit only if telemetry from the Apr 12 learning system shows recurring sibling-pair misroutes that the prompt-only approach cannot fix.

---

## References

- `backend/src/services/service-catalog-matcher.ts` — `buildServiceCatalogLlmSystemPrompt`, `buildAllowlistPromptLines`, `detectSiblingExampleOverlaps` (new), `buildSiblingDisambiguationBlock` (new)
- `docs/Development/service-catalog-matching-stages.md` — Stage B narrative + Phase 3 update
- `backend/tests/unit/services/service-catalog-matcher.test.ts` — `Phase 3 sibling tie-breaker + disambiguation hints` describe block

---

## Decision log

The plan asked us to "spike first / pick one approach" between three options:

1. **Per-row schema fields** (`confused_with_service_keys: string[]` + `prefer_other_when?: string`)
2. **Catalog-level sibling map** (separate object listing pairs and tie-breakers)
3. **LLM prompt-only** (no schema; auto-detect sibling overlap from existing `examples` and inject a disambiguation hint)

Picked **Option 3 (prompt-only)** for these reasons, in priority order:

1. **Philosophical fit.** Project rule (`docs/Reference/AI_BOT_BUILDING_PHILOSOPHY.md`): doctors fill `examples`; AI handles disambiguation. Options 1 + 2 add a *new* doctor-facing field that competes with `examples` for attention and grows the matcher contract long-term.
2. **The LLM is not blind today.** Stage B's `buildAllowlistPromptLines` already serializes every sibling row's resolved `keywords=`, `include_when=`, `exclude_when=`, `[scope: …]`, modalities, and doctor_note. The misroute risk is "LLM picks the wrong sibling when both look plausible," not "LLM doesn't know there's a sibling." That's a **prompt-engineering problem**, not an information-availability problem.
3. **Reversibility.** Schema changes are forever (carry the field, the migration, the Zod schema, the frontend UI, the validation, the doctor-education burden). A prompt rule + auto-derived disambiguation block can be tuned/removed in one PR.
4. **No telemetry yet.** Building schema fields to fix an unmeasured problem is exactly the pattern the user has pushed back on (specialty templates, hardcoded keyword lists). Defer schema with explicit "what would change our mind" criteria.

**What would un-defer the schema half:**

- (a) Shadow telemetry from the Apr 12 learning system (`docs/Development/Daily-plans/April 2026/12-04-2026/`) shows a recurring sibling-pair misroute that cannot be fixed by tuning the prompt rule.
- (b) Doctors organically ask for explicit "send these to the other row" controls (i.e. they describe the boundary in support tickets / DM polish telemetry).

Until then, doctors disambiguate via `examples` + `exclude_when`, the single source of truth Phase 1 committed to.

---

## Shipped

**Two changes to `backend/src/services/service-catalog-matcher.ts`:**

1. **New rule 6 — Sibling tie-breaker** in `buildServiceCatalogLlmSystemPrompt`. Verbatim:

   > 6. Sibling tie-breaker (Plan 19-04, Task 09): when two or more allowed rows could plausibly fit — especially when their hints share a phrase listed in the optional "Disambiguation hints" section below — prefer the row whose hints contain the more specific phrase that the patient text matched verbatim. If the patient's complaint is equally specific to two rows, prefer the row whose [scope: strict] hints fully cover the complaint over a [scope: flexible] row matched only by general overlap. If still tied after both checks, pick "other" rather than guessing between siblings. Never split the difference by routing a sibling-overlapping complaint to a third unrelated row.

   Old rule 6 (specialty defaults) → renumbered to 7. Old rule 7 ("use other") → renumbered to 8 and now references "rules 1–7". No existing tests asserted rule numbers, so renumbering is safe.

2. **Auto-derived "Disambiguation hints" block** injected between the JSON schema and the allowlist (only when overlap exists). Source code:

   - `detectSiblingExampleOverlaps(catalog)` — exported pure helper. Reads via `resolveMatcherRouting` so v2 (`examples`) and legacy (`keywords` CSV) rows feed the same path. Conservative on purpose: tokens lowercased, must be ≥ 4 chars, additional small stop-word list (high-frequency English that survives the length filter), excludes the catch-all row, requires the token in 2+ rows, capped at 5 entries with deterministic ordering (tokens asc, service_keys per token asc).
   - `buildSiblingDisambiguationBlock(catalog)` — internal renderer. Returns `''` when no overlap → caller emits no extra section, so clean catalogs stay clean.

   Rendered example:

   ```
   Disambiguation hints (rows whose example phrases share a token — apply the sibling tie-breaker rule, pick by the patient's most specific cue):
   - "skin" appears in example phrases of rows: skin_consult, skin_hair_combo
   - "rash" appears in example phrases of rows: skin_consult, skin_hair_combo
   ```

**Tests added — `Phase 3 sibling tie-breaker + disambiguation hints (Routing v2, Plan 19-04, Task 09)` describe block (10 cases):**

1. `detectSiblingExampleOverlaps` returns shared tokens with rows that contain them, sorted.
2. Excludes the catch-all (`other`) from overlap candidates even when it has matching examples.
3. Returns empty when no overlap.
4. Ignores rows with no resolved example phrases (legacy `include_when`-only rows do NOT synthesize false-positive overlap).
5. Stop-words (`today`, `tomorrow`) and short tokens (`the`, `for`) are excluded; meaningful tokens (`appointment`) are surfaced.
6. Caps at 5 entries with deterministic ordering.
7. `buildServiceCatalogLlmSystemPrompt` injects the block when overlap exists.
8. Omits the block when no overlap (clean catalogs stay clean — anchored on the unique block-only header `Disambiguation hints (rows whose…` to disambiguate from the rule-6 mention in prose).
9. Encodes the new sibling tie-breaker rule (rule 6) and renumbers downstream rules (7 = specialty defaults; 8 = use "other", references "rules 1–7").
10. Disambiguation block is positioned between `Schema:` and `Allowed service_key values:`.

**Verification:**

- `npx tsc --noEmit` (backend): clean.
- `npx jest tests/unit/services/service-catalog-matcher.test.ts`: 51/51 pass (41 pre-existing + 10 new).
- `npx jest` (full backend suite): **1029/1029 pass across 81 suites**, 57/57 snapshots intact (+10 vs Task 08's 1019).
- `npx eslint src/services/service-catalog-matcher.ts`: 0 errors (1 pre-existing warning at line 549, unrelated to Task 09).
- No Stage A behavior change → `dm-routing-golden` corpus baseline holds without re-snapshotting.

**Files touched:**

- `backend/src/services/service-catalog-matcher.ts` — `detectSiblingExampleOverlaps` + `buildSiblingDisambiguationBlock` helpers, new rule 6 + renumber, block injection
- `backend/tests/unit/services/service-catalog-matcher.test.ts` — Phase 3 describe block (10 tests), exported `detectSiblingExampleOverlaps` import
- `docs/Development/service-catalog-matching-stages.md` — Phase 3 (hybrid) section + Last-updated bump
- `docs/Development/Daily-plans/April 2026/19-04-2026/Plans/plan-service-catalog-matcher-routing-v2.md` — Phase 3 acceptance ticked + status footer + schema-half defer rationale
- `docs/capture/inbox.md` — Task 09 entry prepended
