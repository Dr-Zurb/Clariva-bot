# rcp-16 · Namespace `serviceMatch` (ARM-03 cluster)

> **Phase 4, step 3** · follows the **[state-migration playbook](./EXECUTION-ORDER-p4-receptionist-state.md#state-migration-playbook-shared-recipe--every-rcp-1518-follows-this)**. The largest cluster — catalog matching + staff-review gate. Lower-risk than its size suggests because **mutations are already centralized** in pure helpers; retarget those and most call sites follow.

| **Size** | L | **Model** | **Auto** | **Wave** | 4 | **Depends on** | rcp-14 | **Blocks** | rcp-19 |

---

## Fields in scope → `state.serviceMatch`

`catalogServiceKey`, `catalogServiceId`, `matcherProposedCatalogServiceKey`, `matcherProposedCatalogServiceId`, `matcherProposedConsultationModality`, `serviceCatalogMatchConfidence`, `serviceCatalogMatchReasonCodes`, `matcherCandidateLabels`, `pendingStaffServiceReview`, `staffServiceReviewRequestId`, `staffServiceReviewDeadlineAt`, `serviceSelectionFinalized`, `consultationModality`.

> **Modality vs type:** keep `consultationModality` (quoting modality set during finalize) in `serviceMatch`; `consultationType` (the patient's channel pick) belongs to `booking` (rcp-18). Confirm against the helpers below.

## What to do

Per the playbook. The leverage here is the **pure helpers** in `types/conversation.ts`:
- `applyMatcherProposalToConversationState` (`:364`), `applyFinalCatalogServiceSelection` (`:434`), `applyStaffReviewGateCancellationToConversationState` (`:480`), and the predicate `isSlotBookingBlockedPendingStaffReview` (`:357`). Retarget these to read/write `state.serviceMatch.*`. Because nearly every mutation routes through them, the DM-side churn is small.
- Update **non-DM** callers — `service-staff-review-service.ts` (`:337` reads the cluster; staff confirm/cancel/timeout paths call the helpers) and any `slot-selection`/`booking-controller` reads of `catalogServiceKey`/`catalogServiceId`. Grep all 13 field names.
- Extend `readConversationState`/`writeConversationState` for this cluster (flat ↔ `serviceMatch`); on-disk stays flat.
- Add a `serviceMatch` legacy fixture (mid staff-review, with proposal + deadline) to the corpus.

## Acceptance gate

- [x] All 13 fields under `state.serviceMatch`; the four helpers + `isSlotBookingBlockedPendingStaffReview` operate on the namespace; no flat catalog/matcher/staffReview field read elsewhere (grep-clean).
- [x] **Non-DM coverage:** `service-staff-review-service` staff-confirm / staff-cancel / SLA-timeout paths have targeted tests (golden/characterization don't exercise these) proving the namespaced state persists correctly.
- [x] `serviceMatch` legacy fixture round-trips; DM golden (esp. `staff_service_review_pending`, service-match) + characterization byte-identical; `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't change matcher confidence bands, reason-code semantics, the staff-review SLA, or the proposal-vs-final distinction (`matcherProposed*` vs `catalog*` + `serviceSelectionFinalized`).
- ❌ Don't merge proposal and final fields — that distinction is load-bearing (DL-3 truthful facts; staff gate).
- ❌ Don't add new reason-code PHI; `serviceCatalogMatchReasonCodes` stays enum/string codes only.

## Risks

- **Cross-service state (highest risk in Phase 4).** This cluster is written by the **staff dashboard path** (`service-staff-review-service`) and read by the **booking page** path — neither is covered by the DM golden corpus. A namespacing miss there silently breaks staff confirm → patient booking. The targeted non-DM tests are mandatory, not optional.
- **`serviceSelectionFinalized` gate.** `isSlotBookingBlockedPendingStaffReview` gates whether the patient can reach slot/payment. If the namespaced read misfires, patients either get blocked forever or bypass staff review. Pin both branches.
- **`applyFinalCatalogServiceSelection.clearProposal`** sets several fields to `undefined` so JSON omits them — ensure the nested→flat serializer still omits them (no `serviceMatch: { matcherProposedCatalogServiceKey: undefined }` leaking as a present key on disk).
