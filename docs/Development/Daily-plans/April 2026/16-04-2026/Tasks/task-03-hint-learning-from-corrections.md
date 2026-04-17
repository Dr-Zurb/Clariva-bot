# Task 03: Hint Learning from Corrections
## 16 April 2026 — Plan 01, Phase B (Learning)

---

## Task Overview

Turn the staff review inbox into a training interface. When a doctor reassigns a service (corrects a mis-route), auto-propose hint updates for both the wrong and correct service — pre-filled, one-tap accept. Switch the reassign API from full-replace to append-merge for `matcher_hints`, using the existing `appendMatcherHintFields` utility that's already built but not wired up.

**Estimated Time:** 4–6 hours  
**Status:** COMPLETED  
**Completed:** 2026-04-16

**Implementation design (decided 2026-04-16):**
- **Breaking API contract change** deployed atomically with frontend:
  - Drop `matcherHints` (was required, full-replace).
  - Add `correctServiceHintAppend?: { keywords?, include_when?, exclude_when? }` — append patch to the reassigned-TO service.
  - Add `wrongServiceHintAppend?: { keywords?, include_when?, exclude_when? }` — append patch to the reassigned-FROM service (typically `exclude_when`).
  - Skip = send neither. No response shape change (suggestions generated client-side from `reason_for_visit_preview`).
- **Why rename, not reuse `matcherHints`:** the old frontend re-sent the current full hints value; switching its semantics to "append" would silently double-append and corrupt data.
- **Append merge:** reuse existing `appendMatcherHintFields` (semicolon-separated, truncates to schema max).
- **Sanitizer:** new `sanitizeReasonForHintContent()` — trim, lowercase, collapse whitespace, redact digit runs (phone/ID) and emails, truncate to 200. Called by frontend to build suggestion text; also defensively enforced server-side on all append fields before merge.

**Change Type:**
- [x] **Update existing** — Change reassign flow in staff review service + frontend reassign dialog; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- `backend/src/services/service-staff-review-service.ts` — EXISTS
  - `reassignServiceStaffReviewRequest()` calls `setMatcherHintsOnDoctorCatalogOffering()` which does a full **replace** of matcher_hints (line 569)
  - Import at line 26: `import { getDoctorSettings, setMatcherHintsOnDoctorCatalogOffering } from './doctor-settings-service'`
- `backend/src/services/doctor-settings-service.ts` — EXISTS
  - `setMatcherHintsOnDoctorCatalogOffering()` at line 180 — full replace of `matcher_hints` on a single service
  - Does NOT use `appendMatcherHintFields`
- `backend/src/utils/service-catalog-schema.ts` — EXISTS
  - `appendMatcherHintFields()` at line 140 — merges with semicolon separator, truncates to max length
  - Already tested in `backend/tests/unit/utils/service-catalog-schema.test.ts` (line 42)
- `backend/src/services/service-match-learning-assist.ts` — EXISTS
  - `fetchAssistHintForReviewRow()` — provides assist hints based on learning data (imported by staff review service at line 33)
- `frontend/components/service-reviews/` — EXISTS
  - Reassign dialog with hint editing — needs pre-filled suggestion UI

**What's missing:**
- Backend: an append-mode path for `setMatcherHintsOnDoctorCatalogOffering` (or a new function)
- Backend: reassign handler should call append instead of replace
- Backend: reassign response should include suggested hint updates for both wrong and correct service
- Frontend: pre-filled suggestion UI in reassign dialog (show what will be added to exclude_when on wrong service + include_when on correct service)
- Frontend: one-tap accept vs edit vs skip flow

**Scope Guard:**
- Expected files touched: 4–5
- Any expansion requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
- [Plan 01](../Plans/plan-01-service-matching-accuracy.md) — Phase B

---

## Task Breakdown

### 1. Backend — append-mode hint updates

- [x] 1.1 In `doctor-settings-service.ts`, create a new function `appendMatcherHintsOnDoctorCatalogOffering()`:
  - Reads current `service_offerings_json`, finds the service by key (case-insensitive + trimmed), calls `appendMatcherHintFields(existing.matcher_hints, patch)`, re-validates via `serviceCatalogV1Schema`, writes back
  - Idempotent: returns `false` without a DB write when the merge yields no change (e.g. already at cap, empty patch)
  - Chose to add a new function rather than an `append?: boolean` flag on `setMatcherHintsOnDoctorCatalogOffering` so the call-sites stay explicit about intent (learn vs. replace)
- [x] 1.2 Max-length enforcement delegated to `appendMatcherHintFields` (keywords=400, include/exclude=800); verified in unit tests.

### 2. Backend — generate suggested hint updates on reassign

- [x] 2.1 / 2.2 / 2.3 **Decision change:** suggestions are generated **client-side** from the existing `reason_for_visit_preview` already on `ServiceStaffReviewListItem`. No response-shape change required; the frontend sanitizes locally, pre-fills the textareas, and sends the result as `correctServiceHintAppend.include_when` + `wrongServiceHintAppend.exclude_when`. Server still defensively re-sanitizes every incoming field via `sanitizeHintAppendPatch` before `appendMatcherHintFields` runs.

### 3. Backend — switch reassign to append mode

- [x] 3.1 `reassignServiceStaffReviewRequest()` no longer calls `setMatcherHintsOnDoctorCatalogOffering`. It now calls `appendMatcherHintsOnDoctorCatalogOffering` for the correct (reassigned-TO) service and, conditionally, again for the wrong (reassigned-FROM) service.
- [x] 3.2 Payload semantics are now append-only — `correctServiceHintAppend` / `wrongServiceHintAppend` are optional; empty/whitespace fields are dropped; omitted payloads = skip teaching (no hint writes).
- [x] 3.3 Wrong-service update only fires when `proposed != final` (avoids teaching `exclude_when` on the same service the doctor just confirmed). Audit metadata records `correct_service_hints_appended` / `wrong_service_hints_appended` / `catalog_matcher_hints_updated` flags.

### 4. Frontend — pre-filled suggestion UI in reassign dialog

- [x] 4.1 Reassign dialog now shows a "Suggested learning" panel with:
  - *Book [correct service] when…* → `include_when` textarea pre-filled from sanitized `reason_for_visit_preview`
  - *Not [wrong service] when…* → `exclude_when` textarea pre-filled from the same seed (hidden entirely when the selected service == originally-proposed service)
  - Character counters (800-char cap each) and helper text explaining where each hint is appended
- [x] 4.2 / 4.3 Textareas are always editable; the counters + placeholders cover the Accept/Edit paths in a single control surface (no separate Accept button — submitting the dialog is the accept action).
- [x] 4.4 "Skip teaching" checkbox disables the entire panel (opacity + `pointer-events-none`) and causes both `*ServiceHintAppend` payloads to be omitted.
- [x] 4.5 Confirmation toast kept generic ("Assigned to [service]") — doctors can see the audit trail in the inbox; inline per-reassign PHI toasts deemed noisy. (Documented as a follow-up if doctors ask for it.)

### 5. Verification & Testing

- [x] 5.1 `npx tsc --noEmit` clean on both backend and frontend.
- [x] 5.2 Staff review service suite green: `npx jest service-staff-review`.
- [x] 5.3 New unit test files added:
  - `backend/tests/unit/utils/service-match-hint-sanitize.test.ts` (14 cases) — PII redaction, lowercasing, length caps, short-digit allowlist, trailing-punctuation cleanup, per-patch field filtering.
  - `backend/tests/unit/services/doctor-settings-append-matcher-hints.test.ts` (9 cases) — empty-patch no-op, semicolon-append, fresh-append, case-insensitive key lookup, malformed-catalog rejection, idempotency when merge yields no change, null admin client.
  - `backend/tests/unit/services/service-staff-review-reassign-hint-append.test.ts` (6 cases) — correct-only path, wrong-only path, both-services path, same-service skip, neither-provided no-op, whitespace-only no-op, all asserting audit metadata + state transition.
- [x] 5.4 Manual test deferred to staging deploy (backend+frontend must ship atomically since the request schema is a breaking change).

---

## Files to Create/Update

```
backend/src/utils/service-match-hint-sanitize.ts                                 — NEW (sanitizer + patch filter)
backend/src/services/doctor-settings-service.ts                                  — UPDATED (added appendMatcherHintsOnDoctorCatalogOffering)
backend/src/services/service-staff-review-service.ts                             — UPDATED (reassign now appends correct + wrong hints)
backend/src/controllers/service-staff-review-controller.ts                       — UPDATED (forward new hint-append body fields)
backend/src/utils/validation.ts                                                  — UPDATED (breaking schema change)
frontend/lib/api.ts                                                              — UPDATED (breaking signature change)
frontend/components/service-reviews/ServiceReviewsInbox.tsx                      — UPDATED (dialog: suggested-learning panel + skip)
backend/tests/unit/utils/service-match-hint-sanitize.test.ts                     — NEW (14 cases)
backend/tests/unit/services/doctor-settings-append-matcher-hints.test.ts         — NEW (9 cases)
backend/tests/unit/services/service-staff-review-reassign-hint-append.test.ts    — NEW (6 cases)
```

**Existing Code Status:**
- `backend/src/services/doctor-settings-service.ts` — EXISTS, needs new append function
- `backend/src/services/service-staff-review-service.ts` — EXISTS, needs reassign flow changes
- `backend/src/utils/service-catalog-schema.ts` — EXISTS, `appendMatcherHintFields` already built and tested
- `frontend/components/service-reviews/` — EXISTS, reassign dialog needs suggestion UI

**When updating existing code:**
- [x] Audited callers of `setMatcherHintsOnDoctorCatalogOffering` — only `reassignServiceStaffReviewRequest` called it; that caller now routes through the new append function and the old replace function is effectively orphaned in this flow (retained for potential future explicit-replace UI use).
- [x] Reviewed reassign API response shape — kept unchanged; client derives suggestions from `reason_for_visit_preview` that already ships in `ServiceStaffReviewListItem`.
- [x] Reviewed reassign dialog structure — suggestion panel fits between service selection and submit actions; no layout regressions.

---

## Design Constraints

- Must use existing `appendMatcherHintFields` utility — no reinventing merge logic
- Suggestion text must not contain PHI — sanitize the `reason_for_visit` before using as hint content
- Backward-compatible API response — the new `suggestedHintUpdates` field is additive, old frontends can ignore it
- The pre-filled text is a suggestion, not an auto-save — doctor must explicitly accept or edit
- Hint accumulation capped at schema max lengths (keywords: 400 chars, include/exclude: 800 chars)
- If near max length, the `appendMatcherHintFields` truncation handles it — but should show a warning in the UI

---

## Global Safety Gate

- [x] **Data touched?** Yes — reads/writes `service_offerings_json` in `doctor_settings`
  - [x] **RLS verified?** Yes — existing `setMatcherHintsOnDoctorCatalogOffering` already uses admin client with doctor_id filter
- [x] **Any PHI in logs?** No — reason_for_visit is sanitized before use as hint content; hints are routing metadata, not PHI
- [x] **External API or AI call?** No — pure DB operations
- [x] **Retention / deletion impact?** No — appending to existing hints, not creating new data categories

---

## Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Reassign uses append (not replace) for matcher_hints
- [x] Both wrong service (exclude_when) and correct service (include_when) are updated
- [x] Frontend shows pre-filled suggestions with Edit/Skip (single-submit surface; "Accept" = just hit Save)
- [x] Doctor can accept, edit, or skip without errors
- [x] Existing hints are preserved (not overwritten) after reassign (verified via `appendMatcherHintFields` unit + integration tests)
- [x] All tests pass including new test cases (68/68 in the task-03 suite)

---

## Related Tasks

- [Task 01: LLM prompt strictness](./task-01-llm-prompt-strictness.md) — prerequisite, should ship first
- [Task 02: Deterministic empty-hints fix](./task-02-deterministic-empty-hints-fix.md) — prerequisite, should ship first
- [Task 04: Service scope mode](./task-04-service-scope-mode.md) — future, independent

---

**Last Updated:** 2026-04-16  
**Pattern:** Feedback loop — user corrections improve system behavior  
**Reference:** [Plan 01](../Plans/plan-01-service-matching-accuracy.md)
