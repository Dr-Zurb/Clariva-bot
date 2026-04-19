# Task 12: AI suggest — per-mode token budget + clear truncation error ("AI returned malformed JSON" fix)

## 19 April 2026 — Plan [Service catalog matcher routing v2](../Plans/plan-service-catalog-matcher-routing-v2.md) — Phase 1.6 (operational hardening)

---

## Task overview

Doctors hit **"AI returned malformed JSON. Please try again."** when running **Review my catalog** (and intermittently on `starter`). Root cause is **silent truncation**, not a model malfunction:

- The LLM call uses `max_completion_tokens: 1500` for **all three modes** (`single_card`, `starter`, `review`).
- The `review` schema asks the LLM to emit, per `gap` / `service_suggestion` issue, a **full `suggestedCard`** (matcher_hints + 3 modalities + prices). With even a small (2-row) catalog the LLM wants to suggest 3–5 starter cards, easily exceeding 1500 tokens.
- We use `response_format: { type: 'json_object' }`, which forces JSON syntax but does **not** auto-close JSON when the model hits the token cap. The output is valid up to the cut and then ends mid-string → `JSON.parse` throws → we surface the generic "malformed JSON" error.
- We **never inspect `finish_reason`**, so the doctor (and us) has no signal it was a truncation rather than a model bug.

This task ships:

1. **Per-mode token caps** sized to the schema each mode actually emits.
2. **`finish_reason` inspection** so a `'length'` truncation surfaces a clear, actionable error message — not a generic "malformed JSON".
3. **One-shot retry on `JSON.parse` failure with `len ≈ cap`** as a belt-and-suspenders for borderline cases.

The fix is **operational** — no schema, no prompt, no UX change.

**Estimated time:** 1–2 hours

**Status:** Done (shipped 19 April 2026 — see Shipped section at the bottom).

**Depends on:** None (independent of Task 11). Can ship before, after, or alongside Task 11.

**Plan:** [plan-service-catalog-matcher-routing-v2.md](../Plans/plan-service-catalog-matcher-routing-v2.md)

---

## Acceptance criteria

- [x] **Per-mode caps replace the single global `1500`.** Shipped: `single_card: 1500`, `starter: 6000`, `review: 4000` via `AI_SUGGEST_MAX_COMPLETION_TOKENS_BY_MODE` in `service-catalog-ai-suggest.ts`.
- [x] **`finish_reason: 'length'` is detected and surfaced.** Instead of "AI returned malformed JSON. Please try again.", the API now returns: `"AI response was cut short — the catalog or request is large for this mode. Please try again."` Logged at `info` (not `warn`) per the rationale in the JSDoc on the truncation branch.
- [ ] ~~**One-shot retry on `JSON.parse` failure when `len` is near the cap**~~ — **deferred**. Cap bump + truncation marker fully addresses the bug we shipped to fix; retry would double latency on borderline cases for marginal value. Filed as a follow-up only if telemetry shows `finish_reason='stop'` + invalid JSON happens in the wild (we'd see it under the existing `'malformed JSON'` warn log).
- [x] **`logAIClassification`** receives `errorMessage: 'service_catalog_ai_suggest_truncated'` when `finish_reason === 'length'`. Distinct from `'service_catalog_ai_suggest_openai_error'` (catastrophic) and `'service_catalog_ai_suggest_empty_completion'` (empty). Pinned by unit test.
- [x] **No prompt-content change** in this task — purely the LLM call wrapper + error mapping. Prompt-pinning snapshots / `toContain('keywords')` assertions untouched. (Prompt cleanup lives in Task 11.)
- [x] **Existing tests still pass** without re-snapshotting. **All 1055 backend tests pass across 82 suites** post-change. 10 new Task 12 cases added.

---

## Out of scope

- **Streaming** the LLM response (not worth the complexity here; `max_completion_tokens` bump is enough).
- **Switching from `chat.completions` to the Responses API** with structured outputs — separate spike if/when we want enforced JSON shape, not a fix for token budget.
- **Per-doctor rate limiting** of AI suggest calls — separate ops task.
- **Cost dashboards / alerting** when truncations spike — separate ops task; we just emit the structured audit-log marker so a future query can build that.
- **Re-prompting with a smaller schema** when truncated (e.g. "drop modalities, just emit matcher_hints") — interesting future idea but adds 2nd-round complexity. The clean fix for v1 is "give the model enough room the first time".

---

## References

- `backend/src/services/service-catalog-ai-suggest.ts`:
  - `AI_SUGGEST_MAX_COMPLETION_TOKENS = 1500` (line ~547) — the single global cap to replace.
  - `defaultRunAiSuggestLlm` (lines ~556–600) — where `chat.completions.create` is called and where `finish_reason` would be inspected.
  - `parseLlmJson` (lines ~616–626) — emits the "malformed JSON" error today; needs to learn the truncation case.
  - `logAIClassification` calls inside `defaultRunAiSuggestLlm` — where the new `service_catalog_ai_suggest_truncated` marker plugs in.
- OpenAI `chat.completions` `finish_reason` values: `'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call'`. We care about `'length'`.
- `backend/src/utils/errors.ts` — `InternalError` is the right shape (operational, retryable, 500). No new error class needed.

---

## Implementation outline

1. **Replace global cap with per-mode lookup**:
   ```ts
   const AI_SUGGEST_MAX_COMPLETION_TOKENS_BY_MODE: Record<AiSuggestMode, number> = {
     single_card: 1500,
     starter: 6000,
     review: 4000,
   };
   ```
   Thread `mode` into `defaultRunAiSuggestLlm` (the function already runs per-mode; just plumb the value).
2. **Inspect `finish_reason`** after the call:
   ```ts
   const choice = completion.choices[0];
   const finishReason = choice?.finish_reason;
   if (finishReason === 'length') {
     await logAIClassification({
       correlationId, model, redactionApplied: false,
       status: 'failure', tokens: usage?.total_tokens,
       errorMessage: 'service_catalog_ai_suggest_truncated',
     });
     throw new InternalError(
       'AI response was cut short — the catalog or request is large for this mode. Please try again.'
     );
   }
   ```
3. **`parseLlmJson`** keeps its existing JSON.parse path. Truncation is now caught earlier (step 2) so this path becomes "the model emitted invalid JSON despite finishing cleanly" — log it at `warn` as today.
4. **(Optional) one-shot retry** in `defaultRunAiSuggestLlm` when `finishReason === 'stop'` but JSON parse downstream throws. Implement as a callback or a retry param so the caller knows the second attempt is happening (audit log must distinguish first vs second).
5. **Tests** (`backend/tests/unit/services/service-catalog-ai-suggest.test.ts` or a new `service-catalog-ai-suggest-llm-call.test.ts`):
   - Mock `chat.completions.create` to return `finish_reason: 'length'` with valid-prefix JSON. Assert: thrown error message matches the new copy, audit-log `errorMessage === 'service_catalog_ai_suggest_truncated'`.
   - Mock `chat.completions.create` to return `finish_reason: 'stop'` with valid JSON. Assert: success path unchanged.
   - Mock `chat.completions.create` to return `finish_reason: 'stop'` with invalid JSON. Assert: existing "malformed JSON" path + `warn` log (no truncation marker).
   - Mock per-mode caps wiring: assert `chat.completions.create` is called with `max_completion_tokens: 6000` for `mode === 'starter'`, `4000` for `'review'`, `1500` for `'single_card'`.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Higher caps spike OpenAI cost on `starter` / `review` | The user has explicitly stated cost is not the constraint ("i dont give a fuck about cost , i want the best fucking product"). Audit log marker still lets us see if `starter` is consistently hitting 6000 — if so, prompt slimming is a separate Phase 4-style optimization. |
| `finish_reason` semantics change with future OpenAI SDK | Keep the check defensive: `finishReason === 'length'`; any other value falls through to the existing path. |
| Retry doubles latency on borderline cases | Make retry opt-in via a constant flag, default off in v1. Truncation message + cap bump alone solves the user-visible problem; retry is belt-and-suspenders. |
| Audit-log dashboard parses old `errorMessage` strings | The new marker is additive; old `'service_catalog_ai_suggest_openai_error'` and `'service_catalog_ai_suggest_empty_completion'` keep their meanings. Document the new marker in `docs/Reference/AI_BOT_BUILDING_PHILOSOPHY.md` if there's an audit-log-markers section. |

---

## Verification checklist

- [x] `npx tsc --noEmit` (backend) clean.
- [x] `npx jest tests/unit/services/service-catalog-ai-suggest.test.ts` passes — 10 new cases added under `describe('Task 12 — per-mode token budget + truncation handling')`, all 58 tests in the suite green.
- [x] `npx jest` (full backend) passes — **1055 / 1055 tests, 82 / 82 suites**, no unrelated regressions.
- [x] `npx eslint src/services/service-catalog-ai-suggest.ts` clean.
- [ ] **Manual repro pending the user.** In dev, click **Review my catalog** on the 2-card catalog that originally triggered the bug. Expected: completes successfully (returns `issues[]`), no "AI returned malformed JSON" error. Cap is now `4000` for review.
- [ ] **Audit-log spot check pending the user.** Trigger a truncation by temporarily lowering `review` cap to e.g. 200 in `AI_SUGGEST_MAX_COMPLETION_TOKENS_BY_MODE`, run review, assert audit-log row has `errorMessage = 'service_catalog_ai_suggest_truncated'` and the doctor sees the new "cut short" copy. Restore cap before merging.

---

## Decision log

- _Final per-mode caps:_ `single_card: 1500`, `starter: 6000`, `review: 4000`. Sized per the schema each mode emits — see the JSDoc on `AI_SUGGEST_MAX_COMPLETION_TOKENS_BY_MODE` in `service-catalog-ai-suggest.ts` for the rationale. If telemetry shows a mode consistently hitting the cap (look for `service_catalog_ai_suggest_truncated` rows in audit logs), bump that specific mode rather than re-raising the global default.
- _Whether one-shot retry shipped in v1:_ **No.** Cap bump + truncation marker fully addresses the user-facing bug; retry doubles latency on borderline cases for marginal value. Will revisit only if telemetry shows `finish_reason='stop'` + invalid JSON in the wild (the existing `'malformed JSON'` `warn` log already pins that case).
- _Sample real `total_tokens` observed for each mode:_ TBD — paste in once we have a few days of audit-log telemetry on the new caps.
- _Why we chose to mock `config/openai` in tests rather than inject a custom `runLlm`:_ the bug lives in `defaultRunAiSuggestLlm` itself (per-mode cap lookup + `finish_reason` inspection). Injecting a custom runner would bypass exactly the code we need to verify. The module mock lets us drive `chat.completions.create` directly while leaving the dispatcher → runner wiring under test.

---

## Files changed

- `backend/src/services/service-catalog-ai-suggest.ts` — added `AI_SUGGEST_MAX_COMPLETION_TOKENS_BY_MODE` exported map, added `mode: AiSuggestMode` to `AiSuggestRunLlmParams`, plumbed `mode` through the three dispatchers (`generateSingleCard`, `generateStarterCatalog`, `runLlmCatalogReview`), added `finish_reason === 'length'` branch in `defaultRunAiSuggestLlm` that emits the `service_catalog_ai_suggest_truncated` audit marker + throws an `InternalError` with the new doctor-facing copy, defended the catch-all rethrow path so the truncation `InternalError` is not remapped to a generic `ServiceUnavailableError`.
- `backend/tests/unit/services/service-catalog-ai-suggest.test.ts` — added module-level mock for `config/openai` (`mockChatCompletionsCreate`), added a new `describe('Task 12 — per-mode token budget + truncation handling')` block with 10 cases covering: per-mode cap pinning, `max_completion_tokens` wiring per mode, `finish_reason='length'` → truncation error + audit marker, `finish_reason='stop'` + valid JSON → success unchanged, `finish_reason='stop'` + invalid JSON → existing `malformed JSON` path preserved, empty completion preserves `*_empty_completion` marker, SDK error preserves `*_openai_error` marker + `ServiceUnavailableError`.

---

## Shipped — 19 April 2026

- **Backend behaviour change** (no UX, no schema, no prompt-content change):
  - **Cap raised** for `starter` (1500 → 6000) and `review` (1500 → 4000); `single_card` unchanged at 1500.
  - **Truncation now surfaces** as `InternalError("AI response was cut short — the catalog or request is large for this mode. Please try again.")` with audit-log marker `service_catalog_ai_suggest_truncated`, instead of the generic `"AI returned malformed JSON. Please try again."`.
- **Telemetry follow-up:** add a SQL query / Datadog board on `errorMessage = 'service_catalog_ai_suggest_truncated'` so we can spot per-mode cap pressure within ~1 week of doctors using `Review my catalog` post-deploy.
- **Independent of Task 11** — Task 11 (prompt schema → `examples[]`) and Task 13 (feedback learner → `examples[]`) remain pending and unblocked by this change.
