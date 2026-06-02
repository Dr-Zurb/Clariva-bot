# rcp-06 · Extract the service-match / staff-review / clarification stage

> **Phase 2, step 4** of [receptionist-rearchitecture](../plan-p2-receptionist-stage-router-batch.md). Follows the **[stage-extraction playbook](./EXECUTION-ORDER-p2-receptionist-stage-router.md#stage-extraction-playbook-shared-recipe--every-rcp-0508-follows-this)**. The cleanest Phase 2 group: all branches are explicitly **step-gated**, so the predicate is mostly `state.step` checks. Behavior-preserving.

| **Size** | M | **Model** | Auto | **Wave** | 2 | **Depends on** | rcp-03 | **Blocks** | rcp-08 |

---

## Why this group

These handle "which patient / which service / clarify the complaint before we proceed" — the disambiguation turns that gate booking. They are step-driven, so they don't compete with the broad idle predicate and are low-risk to lift.

**Branches in scope:**

| Branch | Anchor | Gating step | Note |
|---|---|---|---|
| `staff_service_review_pending` | `:1067` | `awaiting_staff_service_confirmation` | top of chain (predicate step 2) |
| `complaint_clarification_reply` | `:1074` | `awaiting_complaint_clarification` | top of chain (predicate step 3) |
| `patient_match_confirmation` | `:1794` | `awaiting_match_confirmation` / `effectiveAskedForMatch` + `pendingMatchPatientIds` | mid-chain (in `legacyClaimsBetween…` step 2) |

> **`learning_policy_autobook` (`:3312`) is *not* in scope here.** It is nested inside the convert/finalize path (after a successful service match → autobook), not a top-level decide branch. It travels with **rcp-07**. Confirm against live code; if it turns out to be cleanly separable as a match outcome, note it and leave it for a follow-up rather than splitting the convert path.

## What to do

Follow the playbook. Specifics:

- **Stage:** `dm/stages/service-match.ts` → `serviceMatchStage`.
- **Predicate:** `dm/stages/service-match-predicate.ts` → `isServiceMatchTurn(ctx)`. The conditions already exist verbatim in `cancel-reschedule-status-predicate.ts`:
  - `awaiting_staff_service_confirmation` and `awaiting_complaint_clarification` (the first two checks of `legacyClaimsBeforeStatusIntents`);
  - the `awaiting_match_confirmation || (effectiveAskedForMatch(state, recent) && pendingMatchPatientIds?.length > 0)` check (from `legacyClaimsBetweenStatusIntentsAndPostBookingAck`).
  - Claim only when control gates didn't fire and `isCancelRescheduleStatusTurn` is false (the two step-gates sit *above* status intents, so order is naturally satisfied; the match check sits *after* — guard it the same way rcp-04 does).
- **Register / remove / test / gate:** per playbook. Pin with `staff-service-confirm`, `complaint-clarify`, `multi-patient-match`, `match-confirm-yes/no` transcripts.

## Acceptance gate

- [x] The three branches live in `serviceMatchStage`, lifted verbatim, removed from `runLegacyDecideChain`.
- [x] `isServiceMatchTurn` claims exactly the staff-review / clarification / match-confirmation turns; `effectiveAskedForMatch` + `pendingMatchPatientIds` guard preserved (so a stray "yes" without pending matches does **not** route here).
- [x] `learning_policy_autobook` left untouched (rcp-07).
- [x] Golden + characterization byte-identical; isolated stage tests + `resolveStage` negative test pass.
- [x] `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't change patient-match ranking, the `pendingMatchPatientIds` shape, or staff-review copy.
- ❌ Don't fold the service-catalog **matcher** (Stage A/B) into the stage — it stays in its util; the stage only dispatches the confirmation turn.
- ❌ Don't touch `learning_policy_autobook` or any booking-finalize logic.

## Risks (executor-facing)

- **`effectiveAskedForMatch` ambiguity.** The match branch also claims turns where the bot *implicitly* asked for a match (not just `step === awaiting_match_confirmation`). Replicate the `effectiveAskedForMatch(state, recent) && pendingMatchPatientIds?.length > 0` guard exactly — dropping it makes the stage over- or under-claim "yes/no" replies.
- **Top-of-chain ordering.** The two step-gates are checked before almost everything; ensure `resolveStage` places `service_match` early enough that an `awaiting_staff_service_confirmation` turn never falls through to idle/legacy.
- **`recordingConsent` overlap.** Don't confuse `awaiting_complaint_clarification` with the rcp-07 `recording_consent`/`confirm_details` steps — they're distinct steps; keep them in their respective stages.
