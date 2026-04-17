# Task 02: Deterministic Empty-Hints Fix
## 16 April 2026 — Plan 01, Phase A (Emergency)

---

## Task Overview

Fix the deterministic Stage A matcher so that services with empty `matcher_hints` no longer get inflated scores. Currently `hasLooseOverlap` returns `true` when `hint` is empty (line 23: `if (!h) return true;`), which treats "no hint" as "matches everything." This contributes to over-matching — the NCD service with zero hints gets a false-positive overlap score. Fix this so empty hints return `false` (no match), and ensure `matcherHintScore` returns `0` for services where all hint fields are blank.

**Estimated Time:** 1–2 hours  
**Status:** COMPLETED  
**Completed:** 2026-04-16

**Change Type:**
- [x] **Update existing** — Change logic in existing functions; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- `backend/src/utils/service-catalog-deterministic-match.ts` — EXISTS (complete)
  - `hasLooseOverlap(reason, hint)` at line 20–30
    - Line 23: `if (!h) return true;` — **BUG**: empty hint treated as "matches everything"
    - Line 26: `tokens.length === 0` falls through to `r.includes(h)` which is `r.includes('')` → always `true`
  - `matcherHintScore(offering, reasonLower)` at line 32–52
    - Line 34: `if (!h) return 0;` — correctly returns 0 when `matcher_hints` object is null/undefined
    - But: when `h` exists with all-empty fields (`{ keywords: '', include_when: '', exclude_when: '' }`), lines 35–39 call `hasLooseOverlap` with empty strings → returns `true` → doesn't return `-1` → score stays at `0` which is neutral, but the bug in `hasLooseOverlap` means the `include_when` check on line 38 doesn't filter it out either
  - `runDeterministicServiceCatalogMatchStageA()` at line 87–162 — uses `matcherHintScore` for final scoring pass (lines 141–161)

**What's missing:**
- `hasLooseOverlap` should return `false` for empty hints
- `matcherHintScore` should handle the case where `matcher_hints` exists but all fields are empty/blank → return `0`
- Tie-breaking should not favor empty-hint services over the catch-all `"other"`

**Scope Guard:**
- Expected files touched: 1–2 (deterministic match + tests)
- Any expansion requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
- [Plan 01](../Plans/plan-01-service-matching-accuracy.md) — Phase A

---

## Task Breakdown

### 1. Fix `hasLooseOverlap`

- [x] 1.1 Changed `if (!h) return true;` to `if (!h) return false;`
- [x] 1.2 Fallback branch `tokens.length === 0 → return r.includes(h)` changed to `return false` — prevents `r.includes('')` from ever evaluating to `true`
- [x] 1.3 Whitespace-only hints → `h.toLowerCase().trim()` already collapses them to empty and hits the new `return false` guard (verified by whitespace test)

### 2. Harden `matcherHintScore`

- [x] 2.1 Added new `hasAnyMatcherHintContent(offering)` helper and called it immediately after the `if (!h) return 0;` check. When `matcher_hints` exists but every field is blank/whitespace, we short-circuit to `0` before touching `hasLooseOverlap`. Intent-expressive and defense-in-depth.
- [x] 2.2 Verified: `h.exclude_when?.trim() && …` and `h.include_when?.trim() && …` already guard against blank fields — after the `hasLooseOverlap` fix, no branch calls it with an empty string. The new all-blank early-return makes this doubly safe.

### 3. Verify tie-breaking behavior

- [x] 3.1 `scored.filter((x) => x.sc > 0)` already excludes score-0 rows. After the fix, every all-blank-hints service scores `0` and is filtered out, so it cannot win the scoring round or out-rank the catch-all.
- [x] 3.2 `labelOrKeyHits` and `descriptionSubstringHits` do not call `matcherHintScore` / `hasLooseOverlap` — confirmed unchanged.

### 4. Verification & Testing

- [x] 4.1 `npx tsc --noEmit` — clean
- [x] 4.2 `npx jest service-catalog-deterministic service-catalog-matcher` — 32/32 pass (22 matcher + 10 new deterministic)
- [x] 4.3 New dedicated test file `tests/unit/utils/service-catalog-deterministic-match.test.ts` covers:
  - Blank hints (object exists, all fields empty) → Stage A returns `null`
  - Whitespace-only hint fields → Stage A returns `null`
  - Missing `matcher_hints` entirely + no label/description hit → Stage A returns `null`
  - Keywords-only hints that overlap → deterministic `medium` match
  - Blank `include_when` does not penalize a keyword match
  - Blank `exclude_when` does not trigger `-1` penalty
  - Non-blank `exclude_when` that overlaps the complaint correctly returns `null`
  - Empty-hint service does not out-rank a hinted service for a keyword match
  - Pre-existing fast paths preserved: single non-catch offering → `high`, unique label substring → `high`
- [x] 4.4 Fee-path regression check: `consultation-fees`, `consultation-quote-service`, `consultation-verification-service` — 73/73 pass. No narrowing regressions.

---

## Files to Create/Update

```
backend/src/utils/service-catalog-deterministic-match.ts  — UPDATE (hasLooseOverlap + matcherHintScore)
backend/tests/unit/utils/service-catalog-deterministic-match.test.ts  — UPDATE (new test cases)
```

**Existing Code Status:**
- `backend/src/utils/service-catalog-deterministic-match.ts` — EXISTS (needs logic fix)
- `backend/tests/unit/utils/` — check for existing deterministic match tests

**When updating existing code:**
- [ ] Audit `hasLooseOverlap` callers: `matcherHintScore` (same file), `consultation-fees.ts` (indirectly via Stage A)
- [ ] Map desired change: 2 lines changed in `hasLooseOverlap`, 1 guard added in `matcherHintScore`
- [ ] Verify no downstream breakage in fee-path logic

---

## Design Constraints

- Pure logic fix — no schema changes, no DB migration, no new fields
- `hasLooseOverlap` is a private function (not exported) — safe to modify
- `matcherHintScore` is a private function — safe to modify
- `runDeterministicServiceCatalogMatchStageA` is exported and used by `consultation-fees.ts` — behavior change is intentional but must not break fee display
- The fee-path code in `pickCatalogServicesForFeeDm` calls Stage A for narrowing — after this fix, empty-hint services won't win Stage A scoring, which means the fee path may fall through to showing all services (correct behavior: don't narrow to a wrong service)

---

## Global Safety Gate

- [x] **Data touched?** No — pure logic change, no DB reads/writes in this function
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** No — deterministic logic only
- [x] **Retention / deletion impact?** No

---

## Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] `hasLooseOverlap("anything", "")` returns `false` — confirmed by source change and by behavioral tests that require a deterministic `null` for blank-hint catalogs
- [x] `matcherHintScore` returns `0` for services with empty/null/all-blank hints — new `hasAnyMatcherHintContent` early-return guard + existing `.trim() &&` field guards; verified behaviorally
- [x] Stage A scoring pass never selects an empty-hint service over other candidates — `scored.filter((x) => x.sc > 0)` already filters score-0 rows; locked by the "does not inflate a non-matching service score" test
- [x] All existing tests pass (including fee-path tests) — 32/32 matcher+deterministic, 73/73 consultation fees / quote / verification. Unrelated pre-existing failure in `webhook-worker-characterization.test.ts` remains captured in `docs/capture/inbox.md`.
- [x] New test cases cover the scenarios in section 4.3 — dedicated file `tests/unit/utils/service-catalog-deterministic-match.test.ts` added with 10 cases

---

## Related Tasks

- [Task 01: LLM prompt strictness](./task-01-llm-prompt-strictness.md) — parallel, complements this fix at the LLM stage
- [Task 04: Service scope mode](./task-04-service-scope-mode.md) — future, adds `scope_mode` that further adjusts scoring

---

**Last Updated:** 2026-04-16  
**Pattern:** Bug fix — logic correction in deterministic matching  
**Reference:** [Plan 01](../Plans/plan-01-service-matching-accuracy.md)
