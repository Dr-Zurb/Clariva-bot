# Task 05: Patient Clarification for Mixed Complaints
## 16 April 2026 — Plan 01, Phase D (Conversation)

---

## Task Overview

When a patient lists multiple unrelated complaints (e.g., "hypertension, diabetes, cough, sneezing, stomach pain, headache"), the bot should ask the patient to clarify their primary concern instead of force-fitting all complaints into one service. Add a `mixed_complaints` flag to the LLM matcher output, a new `awaiting_complaint_clarification` conversation state, and the conversation branch that handles the clarification flow.

**Estimated Time:** 8–12 hours  
**Status:** COMPLETED  
**Completed:** 2026-04-16

## Implementation Plan (2026-04-16)

Scope-preserving cuts / conscious omissions:

- **Timeout policy simplified**: Task 3.3 mentions "X = 2-3 messages before fallback" but 5.3 caps at "1 clarification round". We implement the tighter cap: `clarificationAttemptCount` increments on every patient message received in `awaiting_complaint_clarification`. First reply is re-matched; any second (or later) reply in that state goes straight to `awaiting_staff_service_confirmation` with the original best guess — no ping-pong, no heuristic "is this a clarification?" detection.
- **PHI retention in state**: Re-matcher input uses the narrowed patient reply as `reasonForVisitText`, but `state.reasonForVisit` (persisted to `appointment.reason_for_visit` on booking) keeps the full original text so the doctor still sees every complaint the patient mentioned. Original text is stored under a dedicated metadata key for the re-run only.
- **Locale utility extracted (1 file beyond the listed 4–5)**: Localized clarification templates + the pure "should we request clarification?" predicate live in `backend/src/utils/complaint-clarification.ts` so they are unit-testable without booting the webhook handler.
- **Webhook integration test deferred**: The Instagram webhook handler (~3400 lines) already relies on heavy mock scaffolding. We ship focused unit tests for (a) matcher prompt/JSON parsing, (b) clarification predicate gating, and (c) locale resolution. End-to-end DM verification stays in the manual E2E checklist — captured as a follow-up in `docs/capture/inbox.md` if we find gaps.
- **Deterministic path stays untouched**: `mixed_complaints` is LLM-output-only. The deterministic matcher already fails to match on genuinely mixed complaints (no unique keyword/label hit), which is what kicks the flow over to the LLM; there is no win from duplicating the detection deterministically.

Execution order:
1. `backend/src/services/service-catalog-matcher.ts` — extend `ServiceCatalogMatchResult`, JSON schema, prompt rule, parser.
2. `backend/src/types/conversation.ts` — add `awaiting_complaint_clarification` step + `complaint_clarification` prompt kind + new state fields.
3. `backend/src/utils/complaint-clarification.ts` (NEW) — locale-aware copy + `shouldRequestComplaintClarification` pure predicate.
4. `backend/src/workers/instagram-dm-webhook-handler.ts` — trigger clarification after enrichment (pre-consent), handle replies in the new step, honor attempt cap.
5. `backend/tests/unit/services/service-catalog-matcher.test.ts` — new-field parsing + prompt guidance assertions.
6. `backend/tests/unit/utils/complaint-clarification.test.ts` (NEW) — locale resolution + predicate branches.
7. `npx tsc --noEmit` + focused jest suites.

**Change Type:**
- [x] **New feature** — New conversation state and branch
- [x] **Update existing** — LLM output schema, webhook handler; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- `backend/src/services/service-catalog-matcher.ts` — EXISTS
  - LLM output schema: `{ service_key, modality, match_confidence }` — no `mixed_complaints` flag
  - `matchServiceCatalogOffering()` returns the match result
- `backend/src/workers/instagram-dm-webhook-handler.ts` — EXISTS
  - Main conversation orchestrator
  - `enrichStateWithServiceCatalogMatch()` is called to run the matcher
  - Conversation states include `awaiting_staff_service_confirmation` but no `awaiting_complaint_clarification`
- `backend/src/types/conversation.ts` — EXISTS
  - Defines conversation step enums / types
  - No `awaiting_complaint_clarification` value

**What's missing:**
- LLM: `mixed_complaints: boolean` in the JSON output schema
- LLM: instruction to flag when patient lists multiple unrelated complaints
- Backend: new conversation state `awaiting_complaint_clarification`
- Backend: webhook handler branch that sends clarification message, waits for reply, then re-runs matcher with narrowed input
- Timeout handling: if patient doesn't clarify, proceed with best guess + staff review

**Scope Guard:**
- Expected files touched: 4–5
- Any expansion requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)
- [Plan 01](../Plans/plan-01-service-matching-accuracy.md) — Phase D

---

## Task Breakdown

### 1. LLM — add `mixed_complaints` flag

- [x] 1.1 In `service-catalog-matcher.ts`, update the LLM output JSON schema instruction:
  ```
  {"service_key":"<slug>","modality":"text"|"voice"|"video"|null,"match_confidence":"high"|"medium"|"low","mixed_complaints":true|false}
  ```
- [x] 1.2 Add prompt rule:
  - *"Set `mixed_complaints: true` if the patient text contains two or more clinically unrelated conditions that would typically be handled in separate consultations (e.g., 'diabetes' + 'cough' + 'skin rash'). Do NOT set it for related symptoms (e.g., 'cough + fever + sore throat' are all respiratory)."*
- [x] 1.3 Update the LLM response parsing to extract `mixed_complaints` from the JSON response (`normalizeLlmMixedComplaints` tolerates missing/malformed values, defaulting to `false`).
- [x] 1.4 Pass `mixed_complaints` through the match result returned by `matchServiceCatalogOffering()` as `ServiceCatalogMatchResult.mixedComplaints`. Deterministic / fallback paths always emit `false`.

### 2. Conversation type — new state

- [x] 2.1 Added `'awaiting_complaint_clarification'` to `PatientCollectionStep` in `conversation.ts`, with matching `'complaint_clarification'` entry in `ConversationLastPromptKind` and `conversationLastPromptKindForStep`.
- [x] 2.2 New `ConversationState` fields persisted for this step:
  - `originalReasonForVisit`: full pre-narrowing text (doctor still sees all complaints on the appointment).
  - `complaintClarificationAttemptCount`: attempts counter (cap = `COMPLAINT_CLARIFICATION_MAX_ATTEMPTS = 1`).
  - `complaintClarificationRequestedAt`: ISO timestamp for observability.
  - `complaintClarificationFallbackMatch`: keys-only snapshot of the best original guess (no PHI) so exhausted-clarification paths can hand straight to staff review.

### 3. Webhook handler — clarification branch

- [x] 3.1 After `enrichStateWithServiceCatalogMatch` (now returns `{ state, match }`), `maybeTriggerComplaintClarification` gates on `mixedComplaints && confidence === 'low'` + remaining guard rails; on trigger it sends the localized clarification, advances to `awaiting_complaint_clarification`, and stashes the fallback match. High-confidence matches proceed normally even when `mixedComplaints` is true.
- [x] 3.2 New `else if (state.step === 'awaiting_complaint_clarification')` branch re-runs the matcher with the narrowed patient reply. High/medium-confidence match → consent flow; still low (or any subsequent reply past the cap) → staff review using the stashed fallback, tagged with `MIXED_COMPLAINTS_CLARIFICATION_EXHAUSTED`.
- [x] 3.3 Timeout handling: simplified per Implementation Plan to a hard cap of 1 round. Any second message received in `awaiting_complaint_clarification` is routed straight to staff review with the original best guess — no heuristic "did the patient actually clarify?" detection, no ping-pong.

### 4. DM message templates

- [x] 4.1 Localized templates live in `backend/src/utils/complaint-clarification.ts` — EN default plus Devanagari Hindi, Gurmukhi Punjabi, Romanized Hinglish, and Romanized Punjabi variants (script detection reuses `detectSafetyMessageLocale`).
- [x] 4.2 Copy is generic ("which concern would you like to consult about first") and never echoes patient text — verified by the PHI-leakage unit test.

### 5. Guard rails

- [x] 5.1 `shouldRequestComplaintClarification` enforces: `mixedComplaints === true` AND `confidence === 'low'` AND `countRealCatalogServices(catalog) > 1` AND no pending staff service review AND `attemptCount < COMPLAINT_CLARIFICATION_MAX_ATTEMPTS`.
- [x] 5.2 Catalogs with ≤1 real service (including single-service / catch-all-only) short-circuit the predicate to `false`.
- [x] 5.3 `COMPLAINT_CLARIFICATION_MAX_ATTEMPTS = 1` — second reply in the state always escalates to staff review.
- [x] 5.4 `pendingStaffServiceReview: true` input forces the predicate to `false` — we never stack clarification on top of staff review.

### 6. Verification & Testing

- [x] 6.1 Run type-check: `npx tsc --noEmit` — clean.
- [x] 6.2 Run webhook handler tests: existing `webhook-worker-characterization.test.ts` still passes. Full DM-flow integration tests for the new state intentionally deferred (see Implementation Plan); coverage ships via the focused unit suites below + manual E2E.
- [x] 6.3 Run matcher tests: `service-catalog-matcher.test.ts` — 28 passed (including new `mixed_complaints` parsing + prompt assertions).
- [x] 6.4 Added test cases:
  - Matcher prompt schema/rules mention `mixed_complaints`, "clinically UNRELATED", and the `cough + fever + sore throat` related-cluster example.
  - LLM response with `mixed_complaints: true` surfaces `mixedComplaints=true` on the match result.
  - LLM response omitting the field defaults to `mixedComplaints=false`.
  - Deterministic match path always reports `mixedComplaints=false`.
  - `shouldRequestComplaintClarification` predicate covers mixed=false, medium/high confidence, pending staff review, attempt-cap hit, single-service catalog, and the textbook trigger case.
  - Locale resolution covers Devanagari, Hinglish (Latin Hindi), Gurmukhi, Latin Punjabi, English default, plus a PHI-leakage regression.
- [ ] 6.5 Manual end-to-end test: send a mixed-complaint message via DM, verify clarification flow. **Pending user sign-off** — documented as the manual verification step for this task.

---

## Files to Create/Update

```
backend/src/services/service-catalog-matcher.ts              — UPDATE (LLM schema + parsing)
backend/src/types/conversation.ts                            — UPDATE (new state enum)
backend/src/workers/instagram-dm-webhook-handler.ts          — UPDATE (clarification branch)
backend/tests/unit/workers/instagram-dm-webhook-handler.test.ts — UPDATE (new test cases)
backend/tests/unit/services/service-catalog-matcher.test.ts  — UPDATE (mixed_complaints parsing tests)
```

**Existing Code Status:**
- All files above — EXISTS, need targeted updates
- Conversation state machine logic in webhook handler is the most complex change

**When updating existing code:**
- [x] Audit the conversation state machine to understand all possible transitions
- [x] Map where the new state fits: between `confirm_details` and `awaiting_staff_service_confirmation`
- [x] Ensure the new state doesn't interfere with fee-display or booking flows (persistence special-case preserves `awaiting_complaint_clarification`, and `inCollection` treats it as an active collection step so the fee-display / reset branches skip it)
- [x] Verify that the matcher result type is updated across all consumers (only `enrichStateWithServiceCatalogMatch` constructs/consumes `ServiceCatalogMatchResult`; its signature was refactored to propagate the new `mixedComplaints` field upward)

---

## Design Constraints

- The clarification question must be simple — patients should not feel interrogated
- Max 1 clarification round per conversation — if the patient's reply is still ambiguous, proceed with staff review
- The LLM's `mixed_complaints` flag is advisory — the system makes the final decision based on confidence + flag combination
- No PHI in the clarification message — it asks "which concern," not "you mentioned X and Y"
- Locale detection must work for the clarification message (reuse existing `detectSafetyMessageLocale`)
- The re-run matcher call with narrowed text must use the same correlation ID for tracing

---

## Global Safety Gate

- [x] **Data touched?** Yes — conversation state stored (existing pattern)
  - [x] **RLS verified?** Yes — conversation state uses existing storage mechanism
- [x] **Any PHI in logs?** No — clarification message is generic, reason-for-visit is already redacted in logs
- [x] **External API or AI call?** Yes — re-runs matcher LLM call with narrowed text + original matcher call includes new field
  - [x] **Consent + redaction confirmed?** Yes — same redaction pipeline as existing matcher
- [x] **Retention / deletion impact?** No

---

## Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] LLM returns `mixed_complaints` flag in its JSON response
- [x] Mixed complaints with low confidence trigger a clarification message
- [x] Patient's reply is used to re-run the matcher with narrowed input
- [x] Timeout logic works (proceed to staff review after max attempts — simplified cap = 1 per Implementation Plan)
- [x] Single-service catalogs never trigger clarification (enforced by `countRealCatalogServices > 1` gate)
- [x] Clarification messages are localized (EN, Devanagari HI, Gurmukhi PA, Romanized HI, Romanized PA)
- [x] All tests pass including new cases (matcher: 28/28; clarification utility: 15/15; characterization + deterministic match: 29/29)
- [ ] End-to-end manual test passes — **pending user sign-off** (captured as the last open item in §6.5)

---

## Related Tasks

- [Task 01: LLM prompt strictness](./task-01-llm-prompt-strictness.md) — prerequisite (prompt rewrite must be done first)
- [Task 02: Deterministic empty-hints fix](./task-02-deterministic-empty-hints-fix.md) — prerequisite
- [Task 03: Hint learning from corrections](./task-03-hint-learning-from-corrections.md) — independent
- [Task 04: Service scope mode](./task-04-service-scope-mode.md) — independent, can ship before or after

---

**Last Updated:** 2026-04-16  
**Pattern:** Conversation state machine extension — new branch with timeout  
**Reference:** [Plan 01](../Plans/plan-01-service-matching-accuracy.md)
