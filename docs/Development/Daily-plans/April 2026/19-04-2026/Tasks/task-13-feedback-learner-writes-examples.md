# Task 13: Staff feedback learner writes into `matcher_hints.examples` (close the writer half of Routing v2)

## 19 April 2026 — Plan [Service catalog matcher routing v2](../Plans/plan-service-catalog-matcher-routing-v2.md) — Phase 1.7 (deferred-since-Task-04, un-defer trigger met)

---

## Task overview

`appendMatcherHintsOnDoctorCatalogOffering` in `backend/src/services/doctor-settings-service.ts` is the **staff-feedback learning writer**: when staff corrects a misroute on the review inbox, the patient's sanitized fragment is appended to the **destination** service's matcher hints (so future routing learns from the correction) and to the **source** service's `exclude_when` (so it doesn't repeat the mistake). The function header has documented an **explicit deferral** since Task 04:

> **Routing v2 note (Plan 19-04, Task 04):** this learning-feedback writer still targets
> the **legacy** `keywords` / `include_when` / `exclude_when` fields rather than pushing
> the patient fragment into `matcher_hints.examples`. Two reasons we intentionally hold
> off until Task 06 (frontend example-phrases UI) ships:
> 1. Doctors haven't migrated yet — appending to `examples` while the editor still
>    surfaces only the legacy text areas would silently dual-write and bury hint
>    provenance in two places.
> 2. The reader path is now safe via {@link resolveMatcherRouting}: a row with only
>    legacy hints still routes correctly, so deferring the writer doesn't gate Task 04.
> Once the editor emits `examples`, this function should be updated to: if
> `offering.matcher_hints.examples?.length > 0`, push the sanitized fragment as a new
> example (after dedupe / max-cap checks); otherwise keep the current legacy-append
> fallback for not-yet-migrated rows.

**The un-defer trigger has now been met:**

- Task 06 shipped the editor's `Example phrases` UI.
- Task 07 locked the save-time decision: if `examples` is non-empty, `draftsToCatalogOrNull` writes only `examples` + `exclude_when` and drops legacy fields.
- Task 11 (paired) flips the AI suggest prompts to emit `examples`, so AI-generated cards no longer regenerate legacy hints.

So a row that currently has `examples` populated would, on staff correction, get the patient fragment **appended to `keywords` only** — silent dual-write, exactly the problem this plan exists to remove.

This task ships the **examples-aware** branch in the writer:

- If the destination offering has **`examples.length > 0`** → push the sanitized fragment as a **new entry in `examples[]`** (after trim / dedupe case-insensitive / cap to the schema max of 24 × 120 chars).
- Else (un-migrated row) → keep the current legacy-append behavior **unchanged** (back-compat for catalogs that haven't migrated).
- The **`exclude_when`** branch (source-service "don't pick this again") is unchanged either way — it's already a single string field that exists in both v1 and v2 shapes.

**Estimated time:** 2–3 hours

**Status:** Done — shipped 19 April 2026

**Depends on:** Task 06 (editor emits examples) and Task 11 (AI suggest emits examples) — both must ship before this is safe to flip; otherwise the AI's autofill path still re-creates legacy rows immediately after staff correction.

**Plan:** [plan-service-catalog-matcher-routing-v2.md](../Plans/plan-service-catalog-matcher-routing-v2.md)

---

## Acceptance criteria

- [x] **Examples-first append:** when the destination offering's `matcher_hints.examples?.length > 0`, the sanitized fragment is appended as a new `examples` entry. Dedupe is case-insensitive and trims whitespace before comparison. Schema caps (24 entries, 120 chars per entry) are respected — over-cap fragments are truncated to 120 chars; over-cap arrays drop the **oldest** entry to make room (FIFO is intentional so corrections from this week beat corrections from last quarter). _Implemented in new `appendExamplesEntry` pure helper; defaults pull `MATCHER_HINT_EXAMPLE_MAX_CHARS` (120) and `MATCHER_HINT_EXAMPLES_MAX_COUNT` (24) from `service-catalog-schema.ts` so the writer stays in lock-step with any future schema change._
- [x] **Legacy-only fallback unchanged:** when `examples` is absent or empty, the existing `appendMatcherHintFields` legacy path runs exactly as today. _All 8 pre-existing tests pass without modification; new regression test (`legacy-only offering ... preserves the existing legacy-append behavior`) pins the back-compat branch byte-for-byte._
- [x] **Mixed-shape defense:** if the offering has BOTH `examples` AND legacy `keywords`/`include_when` (a transitional state — a row that the resolver reads as v2 but the legacy fields haven't been cleared by save), append to `examples` only. Do **not** also touch `keywords` / `include_when` — that would re-introduce dual-write. _Spread `...existingHints` preserves legacy strings byte-identical; only `examples` and `exclude_when` are recomputed in the v2 branch. Pinned by the `mixed-shape offering ... legacy keywords byte-identical` test._
- [x] **`exclude_when` unchanged:** source-service exclusion fragments still write to `exclude_when` (single string), which is the same field in v1 and v2 shapes. No branching needed for this side. _v2 branch routes `exc` through `appendMatcherHintFields({ exclude_when }, { exclude_when })`, reusing the legacy single-string semicolon merge. Pinned by the `v2 offering + only exclude_when payload` test._
- [x] **Idempotent:** if the fragment is already in `examples[]` (case-insensitive trimmed match), the function returns `false` and does **not** write to the DB — same idempotency contract as today's legacy path. _`appendExamplesEntry` returns `changed: false`; main writer short-circuits on `!examplesChanged && !excludeChanged`. Pinned by the `already-present fragment (case-insensitive)` test, which also feeds extra whitespace + mixed-case to exercise both normalization steps._
- [x] **PHI hygiene preserved:** the existing redaction guarantees (the caller is responsible for sanitizing) are unchanged. The function continues to assume input has been redacted upstream — same as the legacy path. _No new I/O; only the destination field changed. Caller (`service-staff-review-service.ts`) still funnels through `sanitizeHintAppendPatch` before calling either branch._
- [x] **New tests** in `backend/tests/unit/services/doctor-settings-append-matcher-hints.test.ts` cover:
  - [x] v2 offering (examples present) + new fragment → fragment appears in `examples[]`, legacy fields untouched.
  - [x] v2 offering + already-present fragment (case-insensitive) → no write, returns `false`.
  - [x] v2 offering at 24-entry cap + new fragment → oldest entry dropped, new one added at tail, total stays ≤ 24.
  - [x] Mixed-shape offering (examples + legacy keywords) + new fragment → appended to `examples` only, legacy `keywords` byte-identical to before.
  - [x] Legacy-only offering (no examples) + new fragment → existing legacy-append path unchanged (regression test pinning back-compat).
  - [x] _(bonus)_ `v2 offering + only exclude_when payload` → routes through single-string merge correctly.
  - [x] _(bonus)_ `v2 offering + keywords-only payload` → folds `kw` into a single `examples` entry (verifies the `inc || kw` precedence fallback when caller only sets `kw`).
  - [x] _(bonus)_ 5 pure-helper tests on `appendExamplesEntry` (append + trim, idempotent dedupe, truncate at maxLen, empty/whitespace, FIFO eviction at the cap) — keeps the helper testable in isolation from Supabase.
- [x] **Function header doc updated:** strike the "deferred until Task 06" paragraph; replace with a one-line "v2-aware as of Task 13" + a short summary of the v2-vs-legacy branching rule. _Replaced the deferral block with a `Routing v2 contract (Plan 19-04, Task 13 — un-defers the Task-04 hold)` block that documents the v2-vs-legacy branching rule, the `inc || kw` precedence, the mixed-shape defense, and references back to the resolver._

---

## Out of scope

- **Schema change.** `examples` and the 24 × 120 caps already exist on `serviceMatcherHintsV1Schema` (Task 02). No migration.
- **Bulk back-fill** of past staff corrections that landed in `keywords`. They stay where they are; future corrections land correctly. Doctors can run "Convert to example phrases" (Task 07's per-card CTA) on rows whose legacy text now contains learner-appended fragments.
- **Telemetry on `provenance: 'staff_correction'`** for v2 examples (separate value-add, separate task — would let us show "this phrase was added by your AI receptionist learning from a misroute" badges in the editor).
- **Source-service deeper exclusion semantics.** `exclude_when` stays a single string for both shapes — no shape change here.
- **The `set` (full-replace) variant** `setMatcherHintsOnDoctorCatalogOffering`. That one writes the doctor's manually-typed matcher fields and is already wired through the editor's draft round-trip via `draftsToCatalogOrNull`, which honors the v2 shape. No change needed there.

---

## References

- `backend/src/services/doctor-settings-service.ts`:
  - `appendMatcherHintsOnDoctorCatalogOffering` (lines ~317–410) — the function this task modifies.
  - The deferral comment block (lines ~301–313) — to be replaced with a v2-aware summary.
  - `appendMatcherHintFields` helper — keep as-is, used by the legacy-fallback branch only.
- `backend/src/utils/service-catalog-schema.ts` — `serviceMatcherHintsV1Schema.examples` definition (24 entries × 120 chars, mirrored in `frontend/lib/service-catalog-drafts.ts`'s `normalizeMatcherExamplesDraft`).
- `backend/src/utils/matcher-routing-resolve.ts` — the reader. Verifies v2 (`examples`) precedence so this writer's behavior matches reading semantics.
- Caller(s) of `appendMatcherHintsOnDoctorCatalogOffering` — search for the function name to find the review-inbox correction handler (likely `services/match-review-service.ts` or similar). Add an integration test against the caller if budget permits, otherwise unit-level coverage on the writer is sufficient.

---

## Implementation outline

1. **New helper** `appendExamplesEntry(existing: string[], fragment: string, max: number, maxLen: number): { next: string[]; changed: boolean }`:
   - Trim fragment; truncate to `maxLen` (120).
   - Lower-case existing entries for dedupe comparison; if fragment normalizes to an existing entry, return `{ next: existing, changed: false }`.
   - Append fragment; if `next.length > max` (24), drop **oldest** (`next.shift()`) until size ≤ max.
   - Return `{ next, changed: true }`.
2. **Branch in the main writer:**
   ```ts
   const offering = previousCatalog.services[idx]!;
   const existingExamples = offering.matcher_hints?.examples ?? [];
   const usingV2 = existingExamples.length > 0;
   if (usingV2 && (kw || inc)) {
     const fragment = (inc || kw).trim();
     const { next, changed } = appendExamplesEntry(existingExamples, fragment, 24, 120);
     if (!changed && !exc) return false;
     const nextHints: ServiceMatcherHintsV1 = {
       ...(offering.matcher_hints ?? {}),
       examples: next,
       ...(exc ? { exclude_when: appendExcludeWhen(offering.matcher_hints?.exclude_when, exc) } : {}),
     };
     // (write next catalog as today)
   } else {
     // existing legacy-append path — unchanged
   }
   ```
   Note: `kw` and `inc` from the input payload both get folded into a single `examples` entry in v2 mode. Rationale: the caller currently splits the patient fragment into `keywords` (token-style) vs `include_when` (phrase-style) for the **legacy** asymmetry; in v2 there is no such asymmetry — examples are example phrases, period. Prefer `inc` if both are present (it's the more example-shaped value); fall back to `kw` if only that's set.
3. **Header comment** rewrite — replace the deferral paragraph with the new contract.
4. **Tests** — see Acceptance criteria for the 5 cases. Use `safeParseServiceCatalogV1FromDb` round-trip on the result so we catch any schema-cap miscount.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Existing callers depend on the legacy split (`keywords` vs `include_when`) | The caller passes a sanitized patient fragment; on the v2 branch we collapse to a single `examples` entry. The contract from the caller's perspective ("the fragment lands somewhere on the destination row's matcher hints") is preserved. |
| Doctors expect to see the learner's contributions in the editor | They will see them in `Example phrases`. This is actually **better** UX than today (legacy `keywords` is a single comma-separated text blob — added phrases get lost in the soup; `examples` is one-per-line so the new entry is visible). |
| FIFO eviction at the 24-cap drops a phrase the doctor wrote themselves | Acceptable v1 behavior — alternative is "drop the oldest *learner-added* entry only", which requires per-entry provenance. That's the optional follow-up (telemetry section in Out of scope). For v1, FIFO is documented and predictable. |
| Mixed-shape edge case (rare) | Defensive: when both shapes exist, write only to `examples` (never to legacy). Test pins this. |
| Race with the editor — staff correction hits an offering at the same moment the doctor saves a draft | Same race that already exists today. The writer reads-then-writes the entire `service_offerings_json`; editor save uses the same pattern. Last-writer-wins is the existing contract; this task does not change it. Document if a real collision is observed. |

---

## Verification checklist

- [x] `npx tsc --noEmit` (backend) clean.
- [x] `npx jest tests/unit/services/doctor-settings-append-matcher-hints.test.ts` — **21/21 pass** (8 pre-existing legacy + 5 helper unit tests + 6 v2-branch + 1 legacy-only regression + 1 mixed-shape defense).
- [x] `npx jest` (full backend) — **1076/1076 pass**, no unrelated regressions.
- [x] `npx eslint src/services/doctor-settings-service.ts` clean.
- [ ] **Manual repro** in dev (if review-inbox flow is reachable): trigger a staff correction on a v2-shaped offering; assert the appended phrase appears in the editor's `Example phrases` list (not in legacy `Keywords`). _Deferred to first staging deploy — unit + integration coverage on the writer is sufficient for ship; will be exercised end-to-end on the next staff-correction flow test._
- [x] **Grep** confirms no other writer of `matcher_hints.keywords` / `include_when` was missed: `rg "matcher_hints[\.\?]?\.(keywords|include_when)\s*=" backend/src` → 0 hits (writes go through helper functions, not direct field assignment). The two known writers (`appendMatcherHintFields` legacy fallback and `setMatcherHintsOnDoctorCatalogOffering` full-replace) both build a fresh `ServiceMatcherHintsV1` object instead of mutating in place.

---

## Decision log

- **`inc` vs `kw` precedence when both present in the patch:** `inc || kw` — `inc` (caller's `include_when`) is already example-phrase-shaped, `kw` is keyword-token-shaped. In v2 there is no asymmetry between the two so we collapse to a single `examples[]` entry, but when the caller does provide both we pick the one that's already shaped right. Falls back to `kw` if only that's set (caller's `service-staff-review-service` doesn't emit both today, but the contract handles it).
- **Eviction strategy at the 24-cap:** FIFO oldest (`shift()`). Provenance-aware eviction (drop oldest *learner-added* entry only) deferred — would require a per-entry source field on `serviceMatcherHintsV1Schema.examples` plus a UI badge in the editor to surface it. Listed in "Out of scope" telemetry follow-up.
- **Mixed-shape strategy:** defensive — preserve existing legacy `keywords` / `include_when` byte-identical, only append to `examples`. Doctors graduate mixed-shape rows to pure-v2 via the Task 07 per-card "Convert to example phrases" CTA.
- **Real-traffic sample of v2 vs legacy offerings hit by this writer:** _(paste post-deploy)_ — if no legacy hits in 30 days, file a follow-up to delete the legacy branch + the `appendMatcherHintFields` helper.

---

## Shipped — 19 April 2026

**Backend changes:**
- `backend/src/services/doctor-settings-service.ts`:
  - New `appendExamplesEntry(existing, fragment, maxCount?, maxLen?)` pure helper (defaults pulled from `MATCHER_HINT_EXAMPLE_MAX_CHARS` / `MATCHER_HINT_EXAMPLES_MAX_COUNT` so the helper auto-tracks any future schema-cap change).
  - Branched `appendMatcherHintsOnDoctorCatalogOffering`:
    - **v2 branch** (`existingExamples.length > 0`): collapses `inc || kw` into a single `examples[]` entry via `appendExamplesEntry`; routes `exc` through `appendMatcherHintFields`'s single-string merge; preserves legacy `keywords` / `include_when` byte-identical (mixed-shape defense); short-circuits when neither examples nor exclude_when changed.
    - **Legacy fallback** (`examples` absent or empty): unchanged from before — `appendMatcherHintFields` semicolon-merge path.
  - Header comment block: replaced the Task-04 deferral paragraph with a `Routing v2 contract (Plan 19-04, Task 13 — un-defers the Task-04 hold)` block documenting the v2-vs-legacy branching rule, the `inc || kw` precedence, the mixed-shape defense, and back-references to `resolveMatcherRouting`.

**Tests:**
- `backend/tests/unit/services/doctor-settings-append-matcher-hints.test.ts`:
  - 5 new pure-helper tests on `appendExamplesEntry` (append + trim, idempotent dedupe, truncate at `maxLen`, empty/whitespace, FIFO eviction at the 24-cap).
  - 6 new integration tests on `appendMatcherHintsOnDoctorCatalogOffering` v2 branch (basic append, idempotent dedupe, cap-overflow eviction, mixed-shape defense, `exclude_when`-only payload, `keywords`-only payload).
  - 1 new regression test pinning the legacy-only fallback path byte-for-byte.
  - All 8 pre-existing tests pass without modification.
  - **Total: 21/21 pass.**

**Verification:**
- `npx tsc --noEmit` clean.
- `npx jest tests/unit/services/doctor-settings-append-matcher-hints.test.ts` — 21/21 pass.
- `npx jest` (full backend) — **1076/1076 pass**, no unrelated regressions.
- `npx eslint src/services/doctor-settings-service.ts` clean.
- Grep confirms no other writer assigns to legacy `matcher_hints.keywords` / `include_when` directly.

**Telemetry follow-ups (post-deploy):**
- Count v2-branch vs legacy-branch hits in the first week of staff corrections — if no legacy hits in 30 days, file the legacy-branch deletion follow-up.
- Optional: add `provenance: 'staff_correction'` per-entry tagging on `examples[]` so the editor can show "added by your AI receptionist learning from a misroute" badges (separate task — needs schema + UI work).

**Independence from other tasks:**
- Closes the writer half of Routing v2 (the reader half landed in Task 03 via `resolveMatcherRouting`).
- Un-defers the Task-04 hold; the autofill-modernization slice (Task 06 editor + Task 11 AI suggest + Task 13 staff-feedback learner) is now complete: every code path that **writes** `matcher_hints` on a v2 row writes to `examples[]` exclusively, and every legacy-shaped row continues to round-trip unchanged through the back-compat fallback.

---

## Files changed

- `backend/src/services/doctor-settings-service.ts` — new `appendExamplesEntry` helper, v2 branch in `appendMatcherHintsOnDoctorCatalogOffering`, rewritten header comment.
- `backend/tests/unit/services/doctor-settings-append-matcher-hints.test.ts` — 12 new test cases (5 helper + 6 v2-branch integration + 1 legacy regression).
- `docs/Development/service-catalog-matching-stages.md` — code-map note: staff-feedback learner now writes `examples[]` on migrated rows.
- `docs/capture/inbox.md` — Task 13 ledger entry, un-defer noted.
