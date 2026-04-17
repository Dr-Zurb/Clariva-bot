# Task 10: Mode-aware matcher / review / learning / clarification skip
## 16 April 2026 — Plan 03, Task 3 (Single-fee vs multi-service mode)

---

## Task Overview

When `catalog_mode === 'single_fee'`, none of the multi-service plumbing makes sense — the only service is "consultation," and every patient complaint trivially maps to it. This task short-circuits five backend pipelines so single-fee doctors never pay the cost (latency, cost, UX noise) of matcher calls, staff review queueing, learning-loop ingestion/shadow/policy, or patient clarification.

The single-entry catalog from Task 09 is already present; we're not changing the matcher's output for multi-service doctors — only gating who enters the matcher at all.

**Estimated Time:** 5–7 hours  
**Status:** Done  
**Depends on:** [Task 08](./task-08-catalog-mode-database-field.md), [Task 09](./task-09-auto-single-service-catalog.md)  
**Plan:** [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md)

### Implementation Plan (high level)

1. **Matcher entry point (`service-catalog-matcher.ts`).** Short-circuit: when `catalog_mode === 'single_fee'`, return the single entry immediately with a synthetic `matchReason = 'single_fee_mode'` and `confidence = 1.0`. No LLM call, no deterministic ambiguity path, no empty-hints check. This is the highest-value gate — it removes the NCD-incident surface entirely for single-fee doctors.
2. **Staff review queue (`service-staff-review-queue.ts` / `service-staff-review-service.ts`).** Guard the enqueue functions so `catalog_mode === 'single_fee'` never inserts a review request. Single-fee doctors have nothing to review.
3. **Learning pipeline (5 services).** Every learning-loop entry point must early-return when `catalog_mode === 'single_fee'`:
   - `service-match-learning-ingest.ts` (don't persist examples)
   - `service-match-learning-assist.ts` (don't surface suggestions)
   - `service-match-learning-autobook.ts` (don't auto-apply policies)
   - `service-match-learning-shadow.ts` (don't write shadow rows)
   - `service-match-learning-policy-service.ts` (don't evaluate policies)
4. **Mixed-complaint clarification (`complaint-clarification.ts`).** When there's only one service, there's nothing to clarify — skip the detection + question-generation logic entirely.
5. **Teleconsult catalog authority check (`isTeleconsultCatalogAuthoritative` wherever it lives).** Verify it returns `true` for single-entry catalogs (it should, since the function checks catalog presence, not cardinality). Add an explicit test for the one-entry case.
6. **Observability:** every skip path logs a single-line breadcrumb (`matcher.skip.single_fee`, `review.skip.single_fee`, `learning.<stage>.skip.single_fee`, `clarification.skip.single_fee`) with `doctorId` so we can verify the skips are hitting in staging without chasing Git blame.

**Scope trade-offs (deliberately deferred):**
- **Per-modality charge-sheet rendering** (Plan 03 Open Question 4) — out of scope; this task is purely about skipping pipelines.
- **Converting existing learning examples to `catalog_mode`-aware** — learning data from before Task 08 may lack the mode flag on the stored row; a separate data-migration is captured in `docs/capture/inbox.md` if we want to clean that up. This task only affects new rows.
- **Hot-path perf benchmarking** — deferred. Skips are by nature faster than the full path; a measurement task is parked.

**Change Type:**
- [x] **Create new** — one new shared helper utility: `backend/src/utils/catalog-mode-guard.ts`
- [x] **Update existing** — 8 backend services/utilities + 1 worker; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- `backend/src/services/service-catalog-matcher.ts` — EXISTS (hardened in Plan 01 Tasks 01/02/04). Entry point is a single async function — ideal short-circuit location.
- `backend/src/services/service-staff-review-service.ts` + `service-staff-review-queue.ts` — EXIST (Plan 01 Task 03 follow-on).
- `backend/src/services/service-match-learning-*.ts` — all 5 files EXIST (Plan 01 Task 03).
- `backend/src/services/complaint-clarification.ts` — EXISTS (Plan 01 Task 05).
- `backend/src/utils/teleconsult-catalog.ts` (or wherever `isTeleconsultCatalogAuthoritative` lives) — need to `rg` to locate before editing.
- All of the above already receive a `doctor_settings`-shaped object or can easily fetch it — no new plumbing needed.

**What's missing:**
- Guard branches in each of the 8 entry points
- Synthetic match result shape for `single_fee_mode`
- Structured skip logs
- Targeted unit tests per pipeline confirming the skip fires on `'single_fee'` and NOT on `'multi_service'` / `null`

**Scope Guard:**
- Expected files touched: ~10 (8 services + 1 utility + test fixtures shared across)
- Must NOT change matcher/review/learning behavior for `multi_service` or `NULL` modes. The tests need negative assertions for both.
- Every guard checks `catalog_mode === 'single_fee'` strictly — **not** `!= 'multi_service'` — so `NULL` (undecided) behaves identically to multi-service today (no skips, existing path runs).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
- [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md) — Task 03 section
- [Plan 01 Task 02 — Deterministic empty-hints fix](./task-02-deterministic-empty-hints-fix.md) — the bug-class this skip structurally eliminates for single-fee doctors

---

## Task Breakdown

### 1. Matcher short-circuit

- [x] 1.1 In `service-catalog-matcher.ts`, at the top of the primary async entry point (likely `matchServiceForComplaint` or equivalent), branch on `doctorSettings.catalog_mode === 'single_fee'`.
- [x] 1.2 Return `{ match: <single service entry from the catalog>, confidence: 1.0, reason: 'single_fee_mode', ambiguous: false }` (shape must exactly match the existing return type — reuse it, don't invent a new one).
- [x] 1.3 Log `matcher.skip.single_fee { doctorId, serviceKey: 'consultation' }`.
- [x] 1.4 Zero LLM call, zero deterministic loop — this path must be synchronous-fast.

### 2. Staff review queue guard

- [x] 2.1 In `service-staff-review-service.ts` (and any peer `queue` file), find every public enqueue function (`createReviewRequest`, `enqueueForStaffReview`, or similar).
- [x] 2.2 Early-return a neutral shape (`{ enqueued: false, reason: 'single_fee_mode' }`) when `catalog_mode === 'single_fee'`.
- [x] 2.3 Callers already handle the `!enqueued` case (existing behavior for low-confidence matches that go direct-to-match instead of review). Confirm this by reading call sites.
- [x] 2.4 Log `review.skip.single_fee { doctorId }`.

### 3. Learning pipeline guards (5 files)

- [x] 3.1 `service-match-learning-ingest.ts` — guard the public ingest function; skip persisting the example.
- [x] 3.2 `service-match-learning-assist.ts` — guard the "suggest a service" helper; return empty suggestion list.
- [x] 3.3 `service-match-learning-autobook.ts` — guard the auto-book pathway; never apply learned policies.
- [x] 3.4 `service-match-learning-shadow.ts` — guard the shadow-write helper; no shadow rows for single-fee doctors.
- [x] 3.5 `service-match-learning-policy-service.ts` — guard policy evaluation; evaluate as no-op.
- [x] 3.6 Each guard logs `learning.<stage>.skip.single_fee { doctorId }` for observability.
- [x] 3.7 Where multiple functions in the same file need guarding, extract a shared `isLearningActiveForDoctor(settings)` helper to keep the branches DRY.

### 4. Clarification guard

- [x] 4.1 In `complaint-clarification.ts`, at the entry function (detect-mixed + generate-question), return `{ needsClarification: false, reason: 'single_fee_mode' }` when `catalog_mode === 'single_fee'`.
- [x] 4.2 Log `clarification.skip.single_fee { doctorId }`.
- [x] 4.3 Confirm downstream callers (bot flow) already handle `needsClarification === false` — they do (that's the default happy path).

### 5. Teleconsult catalog authority sanity check

- [x] 5.1 Locate `isTeleconsultCatalogAuthoritative` (likely `backend/src/utils/teleconsult-catalog.ts` or `utils/service-catalog-helpers.ts`).
- [x] 5.2 Read the implementation — confirm it already returns `true` for a single-entry catalog (the logic typically just checks `catalog && catalog.services.length >= 1`).
- [x] 5.3 Add an explicit unit test case for the one-entry catalog if one doesn't exist.
- [x] 5.4 If (unlikely) the function happens to require ≥2 entries, fix it — we want one code path regardless of mode.

### 6. Tests

- [x] 6.1 `backend/tests/unit/services/service-catalog-matcher.test.ts` (extend) — matcher returns the single-fee synthetic result when `catalog_mode === 'single_fee'`; no LLM client call (assert via mock that the LLM spy was never invoked).
- [x] 6.2 `backend/tests/unit/services/service-staff-review-service.test.ts` (extend) — enqueue is a no-op in single-fee mode.
- [x] 6.3 For each learning file, extend its test suite with "skips ingest/assist/autobook/shadow/policy in single-fee mode."
- [x] 6.4 `backend/tests/unit/services/complaint-clarification.test.ts` (extend) — returns no-clarification in single-fee mode even with a mixed-complaint input.
- [x] 6.5 Teleconsult helper test extended with the one-entry case.
- [x] 6.6 **Negative regression tests in every extended file** — confirm `catalog_mode === 'multi_service'` and `catalog_mode === null` still exercise the full existing path.

### 7. Verification

- [x] 7.1 `npx tsc --noEmit` clean in `backend/`.
- [x] 7.2 Full backend `tests/unit` suite green (should be ~720 tests + the new ones).
- [x] 7.3 Manual dev smoke: flip a test doctor to single-fee; send a mixed-complaint message through the bot; confirm matcher logs show the skip, review queue stays empty, no learning rows written, no clarification question asked.
- [x] 7.4 Manual dev smoke: a multi-service doctor continues to hit the full path unchanged.

---

## Files to Create/Update

```
backend/src/services/service-catalog-matcher.ts                      — UPDATE (top-of-function short-circuit)
backend/src/services/service-staff-review-service.ts                 — UPDATE (enqueue guard)
backend/src/services/service-staff-review-queue.ts                   — UPDATE (if separate enqueue surface)
backend/src/services/service-match-learning-ingest.ts                — UPDATE (guard)
backend/src/services/service-match-learning-assist.ts                — UPDATE (guard)
backend/src/services/service-match-learning-autobook.ts              — UPDATE (guard)
backend/src/services/service-match-learning-shadow.ts                — UPDATE (guard)
backend/src/services/service-match-learning-policy-service.ts        — UPDATE (guard)
backend/src/services/complaint-clarification.ts                      — UPDATE (guard)
backend/src/utils/teleconsult-catalog.ts (or helpers equivalent)     — UPDATE if needed (single-entry check)
backend/tests/unit/services/service-catalog-matcher.test.ts          — UPDATE (single-fee skip case)
backend/tests/unit/services/service-staff-review-service.test.ts     — UPDATE
backend/tests/unit/services/service-match-learning-*.test.ts         — UPDATE (each file)
backend/tests/unit/services/complaint-clarification.test.ts          — UPDATE
```

**Existing Code Status:**
- All `UPDATE` files exist and were stabilized in Plan 01 (Tasks 02–05).
- No DB migration, no schema change — pure runtime gating.

**When updating existing code:**
- [x] Confirm the matcher's synthetic single-fee return shape exactly matches the existing return type (no new optional fields leaking into callers' union narrowing).
- [x] Confirm every callers of the learning-pipeline services handles `undefined` / empty-return gracefully (they do, since these are fire-and-forget today).
- [x] Confirm the clarification guard returns the same shape multi-service doctors expect for the "no clarification needed" case.
- [x] Run existing Plan 01 / Plan 02 tests to confirm zero regression for `multi_service` and `NULL` modes.

**When creating a migration:**
- [x] No migration needed.

---

## Design Constraints

- **Strict `===` comparison, not negation:** every guard must be `catalog_mode === 'single_fee'`. `NULL` (undecided) keeps today's behavior.
- **Zero new public API:** guards are internal; callers see the same function signatures.
- **Observability first:** every skip emits a structured log line with a predictable name (`<stage>.skip.single_fee`) so we can grep/graph them immediately.
- **No behavior change for multi-service doctors:** negative regression tests are mandatory, not optional.
- **Matcher output stability:** the `single_fee_mode` reason string enters the type surface; add it to whatever enum/literal union the matcher result type uses.
- **Idempotent guards:** each guard should be safe to add/remove in isolation without cascading failures. No cross-file hidden dependencies.

---

## Global Safety Gate

- [x] **Data touched?** No writes from skip paths. Reads of `doctor_settings.catalog_mode` only.
  - [x] **RLS verified?** Same per-service RLS as before; new branches don't expand access.
- [x] **Any PHI in logs?** No — skip breadcrumbs carry `doctorId` and stage name only.
- [x] **External API or AI call?** Removes them (matcher LLM call skipped in single-fee). Never adds.
- [x] **Retention / deletion impact?** Reduces learning-row churn for single-fee doctors.

---

## Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Matcher never calls the LLM for `catalog_mode === 'single_fee'` and returns the single service with `confidence = 1.0` + `reason = 'single_fee_mode'`.
- [x] Review queue, all 5 learning services, and complaint-clarification are no-ops for single-fee doctors.
- [x] `isTeleconsultCatalogAuthoritative` handles single-entry catalogs correctly (explicit test exists).
- [x] Every skip path emits a structured breadcrumb log.
- [x] Regression tests confirm zero behavior change for `catalog_mode === 'multi_service'` and `catalog_mode === null`.
- [x] All new + existing backend tests pass; `tsc --noEmit` clean.
- [x] Manual dev smoke confirms both positive (skip fires) and negative (multi-service unchanged) paths.

---

## Related Tasks

- [Task 08 — `catalog_mode` database field](./task-08-catalog-mode-database-field.md) — prerequisite (reads the flag set here).
- [Task 09 — Auto-generated single-service catalog](./task-09-auto-single-service-catalog.md) — prerequisite (the single entry the matcher short-circuit returns).
- [Plan 01 Task 02 — Deterministic empty-hints fix](./task-02-deterministic-empty-hints-fix.md) — the bug class this task eliminates for single-fee doctors by bypassing the matcher entirely.
- [Plan 01 Task 03 — Hint learning](./task-03-hint-learning.md) — the pipeline this task gates.
- [Plan 01 Task 05 — Patient clarification](./task-05-patient-clarification.md) — the clarification logic this task guards.

---

**Last Updated:** 2026-04-16  
**Pattern:** Top-of-function early-return guards with observability; zero behavior change for non-single-fee doctors  
**Reference:** [Plan 03 — Single-fee vs multi-service mode](../Plans/plan-03-single-fee-vs-multi-service-mode.md)

---

## Completion Summary (2026-04-16)

**Status:** Done. All acceptance criteria met; zero-regression on full backend unit suite (78 suites / 826 tests green, `tsc --noEmit` clean).

### Shared guard helper — `backend/src/utils/catalog-mode-guard.ts` (new)
Centralizes the `catalog_mode` check surface so every pipeline branches the same way and emits consistent breadcrumbs:
- `SINGLE_FEE_CATALOG_MODE = 'single_fee'`
- `isSingleFeeMode(mode)` — strict `===`, `NULL` stays on today's path.
- `logSingleFeeSkip(stage, ctx)` — structured log `<stage>.skip.single_fee { doctorId, correlationId, … }` for 8 stages (`matcher`, `review`, `learning.ingest|assist|autobook|shadow|policy`, `clarification`).
- `fetchDoctorCatalogMode(doctorId, correlationId, clientOverride?)` — fail-open best-effort read of `doctor_settings.catalog_mode` for pipelines that don't already have `doctorSettings` in scope.
- `isLearningActiveForDoctor(doctorId, …)` — convenience wrapper that returns `false` iff `single_fee`; used by the 5 learning services to keep branches DRY (Task Breakdown 3.7).

### Pipeline guards (8 entry points)
| Stage | File | Guard behavior for `catalog_mode === 'single_fee'` |
|---|---|---|
| Matcher | `service-catalog-matcher.ts` | Returns synthetic high-confidence result for the single catalog entry with `reasonCodes: ['single_fee_mode']`, `source: 'deterministic'`, no LLM call. New reason code added to `SERVICE_CATALOG_MATCH_REASON_CODES`. |
| Review queue | `service-staff-review-service.ts` | `upsertPendingStaffServiceReviewRequest` now returns `Promise<{ id: string \| null }>` and no-ops (no DB write) in single-fee mode. Callers already treat `null` as "no review row persisted." |
| Learning — ingest | `service-match-learning-ingest.ts` | Skips insert into `service_match_learning_examples`. |
| Learning — assist | `service-match-learning-assist.ts` | `fetchAssistHintForReviewRow` returns `null` without querying `service_match_learning_examples`. |
| Learning — autobook | `service-match-learning-autobook.ts` | `tryApplyLearningPolicyAutobook` returns `{ applied: false }` before any policy lookup. |
| Learning — shadow | `service-match-learning-shadow.ts` | `recordShadowEvaluationForNewPendingReview` skips all inserts (shadow rows would be orphaned by the review no-op above). |
| Learning — policy | `service-match-learning-policy-service.ts` | `runStablePatternDetectionJob` uses a per-job `Map<doctorId, CatalogMode>` cache, counts single-fee doctors under `skipped`, and never inserts a suggestion. |
| Clarification | `utils/complaint-clarification.ts` | `shouldRequestComplaintClarification` returns `false` immediately in single-fee mode. |

### Call-site threading
- `instagram-dm-webhook-handler.ts` now threads `doctorSettings.catalog_mode` + `doctorSettings.doctor_id` into `matchServiceCatalogOffering`, `upsertPendingStaffServiceReviewRequest`, and `shouldRequestComplaintClarification` so no pipeline relies solely on a back-channel DB lookup.

### `isTeleconsultCatalogAuthoritative` verification
- Read + verified in `backend/src/utils/consultation-fees.ts` — already returns `true` for single-entry catalogs (presence-based check, not cardinality-based). Locked in with an explicit unit test in `tests/unit/utils/consultation-fees.test.ts`.

### Test coverage added (positive skip + negative regression where applicable)
- `tests/unit/utils/complaint-clarification.test.ts` — skip for `single_fee`; existing path unchanged for `multi_service` / `null` / `undefined`.
- `tests/unit/services/service-catalog-matcher.test.ts` — new `describe('Task 10: catalog_mode="single_fee" short-circuit')` with three cases; LLM spy never invoked for `single_fee`; LLM-or-deterministic path unchanged for `multi_service` / `null`.
- `tests/unit/services/service-staff-review-service.test.ts` — no DB interaction in `single_fee`; normal path for `multi_service` / `null`.
- `tests/unit/services/service-match-learning-ingest.test.ts` — no insert when `doctor_settings.catalog_mode === 'single_fee'`.
- `tests/unit/services/service-match-learning-shadow.test.ts` — no insert in single-fee mode.
- `tests/unit/services/service-match-learning-assist.test.ts` (new file) — returns `null` + zero `service_match_learning_examples` queries in single-fee; proceeds to examples query for `multi_service`.
- `tests/unit/services/service-match-learning-autobook.test.ts` (new file) — `{ applied: false }` + zero `service_match_autobook_policies` queries in single-fee mode.
- `tests/unit/services/service-match-learning-policy-service.test.ts` — `runStablePatternDetectionJob` counts single-fee candidate under `skipped`, does not insert a suggestion, and never reaches `service_match_autobook_policies` / pending-suggestion existence checks.
- `tests/unit/utils/consultation-fees.test.ts` — explicit single-entry catalog case for `isTeleconsultCatalogAuthoritative`.

### Observability wiring
- Every skip stage emits one structured log line (`<stage>.skip.single_fee`) carrying `doctorId` + `correlationId` (+ stage-specific fields like `conversationId`, `reviewRequestId`, `patternKey`, or `serviceKey`) — enough to grep/graph skips in staging without code archaeology.

### Follow-ups parked (not in this task's scope)
- Back-filling `catalog_mode` onto pre-Task-08 `service_match_learning_examples` rows — noted in `docs/capture/inbox.md`.
- Per-modality charge-sheet rendering (Plan 03 Open Question 4).
- Hot-path perf benchmarking for the matcher skip path.
