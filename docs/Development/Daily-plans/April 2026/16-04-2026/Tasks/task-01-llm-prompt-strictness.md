# Task 01: LLM Prompt Strictness
## 16 April 2026 — Plan 01, Phase A (Emergency)

---

## Task Overview

Rewrite the LLM system prompt in the service catalog matcher to stop over-matching. The current prompt says *"Prefer the best-fitting row other than 'other' whenever it reasonably applies"* — this biases the model to force-fit complaints into named services even when they don't belong. Replace with balanced instructions that respect `matcher_hints` when present and default to conservative matching when hints are absent.

**Estimated Time:** 2–3 hours  
**Status:** COMPLETED  
**Completed:** 2026-04-16

**Change Type:**
- [x] **Update existing** — Change existing LLM system prompt; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- `backend/src/services/service-catalog-matcher.ts` — EXISTS (complete)
  - `buildServiceCatalogLlmSystemPrompt()` at line 148 builds the full system prompt
  - Line 170: the over-generous rule *"Prefer the best-fitting row other than 'other' whenever it reasonably applies. Use service_key 'other' only when no non-other row plausibly fits"*
  - Line 171–172: specialty-aware rules for GP vs narrow specialties
- `backend/tests/` — existing matcher tests exist (check for prompt-dependent assertions)
- `appendMatcherHintFields` exists in schema but is not used by the matcher itself

**What's missing:**
- Instructions that differentiate between services with filled hints vs empty hints
- Instructions about mixed/multiple complaints
- Confidence calibration rule: label alone should not produce "high" confidence

**Scope Guard:**
- Expected files touched: 1–2 (matcher + tests)
- Any expansion requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
- [Plan 01](../Plans/plan-01-service-matching-accuracy.md) — Phase A

---

## Task Breakdown

### 1. Audit current prompt

- [x] 1.1 Read `buildServiceCatalogLlmSystemPrompt()` (line 148–178 in `service-catalog-matcher.ts`)
- [x] 1.2 Identify all rules in the current prompt that influence matching behavior
- [x] 1.3 List the exact lines that need to change vs stay
- [x] 1.4 Check existing tests that assert on prompt content or matching behavior — confirmed no tests pin the old "Prefer the best-fitting row other than other" wording

### 2. Rewrite prompt rules

- [x] 2.1 Replaced the "prefer non-other" rule with two conditional rules (hinted vs unhinted) at `service-catalog-matcher.ts` in `buildServiceCatalogLlmSystemPrompt`
- [x] 2.2 Hint presence is already communicated per-row via `matcherHintsSnippetForLlm` (no `doctor_matcher_hints:` segment is emitted when all hint fields are blank) — prompt explicitly refers to "rows WITH" vs "rows with NO doctor_matcher_hints"
- [x] 2.3 Added mixed-complaint instruction (rule 4): primary/first-mentioned complaint only; never stretch one row across unrelated complaints
- [x] 2.4 Added confidence-calibration block: "high" requires hint corroboration; label-only matches capped at "medium"; weak/stretchy fits → "low"
- [x] 2.5 Kept the existing specialty-aware rules (now rule 5)

### 3. Verification & Testing

- [x] 3.1 `npx tsc --noEmit` — clean
- [x] 3.2 `npx jest service-catalog-matcher` — 22/22 pass (16 pre-existing + 6 new)
- [x] 3.3 Added prompt-content tests that lock in the new policy:
  - `encodes strict hint-aware matching policy`
  - `includes mixed-complaint guidance`
  - `caps high confidence on hint corroboration`
  - `forbids force-fitting to avoid "other"`
  - `keeps specialty-aware rules for GP and narrow`
  - `omits doctor_matcher_hints segment when all hints blank`
  - Note: end-to-end matcher behavior (NCD empty-hints routing to "other") is validated at the deterministic layer in Task 02 and behaviorally via the mock `runLlm` seam — no live LLM is invoked in unit tests
- [x] 3.4 Manual review of the rendered prompt string against the NCD incident scenario: empty-hints NCD row no longer carries a `doctor_matcher_hints` suffix, and rule 3 + rule 6 + confidence cap together block a "high" label-only match

---

## Files to Create/Update

```
backend/src/services/service-catalog-matcher.ts   — UPDATE (prompt rewrite)
backend/tests/unit/services/service-catalog-matcher.test.ts  — UPDATE (new/modified test cases)
```

**Existing Code Status:**
- `backend/src/services/service-catalog-matcher.ts` — EXISTS (complete, needs prompt changes)
- `backend/tests/unit/services/service-catalog-matcher.test.ts` — EXISTS (verify, may need updates)

**When updating existing code:**
- [ ] Audit current prompt text and all callers of `buildServiceCatalogLlmSystemPrompt`
- [ ] Map desired change to concrete prompt string edits
- [ ] Ensure no other code depends on the exact wording of the old prompt
- [ ] Update tests

---

## Design Constraints

- Prompt changes only — no schema changes, no new fields, no DB migration
- The prompt must remain model-agnostic (works with GPT-4o, GPT-4o-mini, etc.)
- Do not change the JSON output schema (`service_key`, `modality`, `match_confidence`)
- The specialty-aware rules (GP vs narrow) should stay — they are independently correct
- `buildAllowlistPromptLines` formatting should not change (it already includes `[matcher: ...]` hints)
- No PHI in prompt text — patient messages are already redacted by the time they reach the LLM

---

## Global Safety Gate

- [x] **Data touched?** No — prompt text only, no DB reads/writes
- [x] **Any PHI in logs?** No — prompt text contains no PHI
- [x] **External API or AI call?** Yes — OpenAI API call (existing, no change to how it's called)
  - [x] **Consent + redaction confirmed?** Yes — already handled by existing redaction pipeline
- [x] **Retention / deletion impact?** No

---

## Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] The NCD incident scenario (empty hints + mixed complaints) routes to `"other"` instead of NCD — enforced by rules 3, 4, 6 and confidence-cap in the new prompt; deterministic empty-hints leakage is addressed in Task 02
- [x] Services with filled `matcher_hints` still match correctly (no regression) — existing Stage A `KEYWORD_HINT_MATCH` test and prompt-content tests pass
- [x] Confidence is capped at "medium" for services with empty hints — encoded in the "Confidence calibration" block and locked by the `caps high confidence on hint corroboration` test
- [x] Mixed complaints are matched based on primary complaint, not the full list — encoded as rule 4 and locked by the `includes mixed-complaint guidance` test
- [x] All existing tests pass (no regressions) — 16/16 pre-existing matcher tests pass; unrelated pre-existing failure in `webhook-worker-characterization.test.ts` is captured in `docs/capture/inbox.md`
- [x] New test cases cover the scenarios in section 3.3 — 6 new prompt-content tests added

---

## Related Tasks

- [Task 02: Deterministic empty-hints fix](./task-02-deterministic-empty-hints-fix.md) — parallel, complements this fix at the deterministic stage
- [Task 04: Service scope mode](./task-04-service-scope-mode.md) — future, adds per-service `scope_mode` that further refines prompt behavior

---

**Last Updated:** 2026-04-16  
**Pattern:** LLM prompt engineering — system prompt rewrite  
**Reference:** [Plan 01](../Plans/plan-01-service-matching-accuracy.md)
