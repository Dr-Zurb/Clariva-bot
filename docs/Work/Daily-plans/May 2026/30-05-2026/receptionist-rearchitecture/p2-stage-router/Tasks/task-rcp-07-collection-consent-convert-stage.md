# rcp-07 · Extract the collection → consent → confirm → recording → slot stage

> **Phase 2, step 5** of [receptionist-rearchitecture](../plan-p2-receptionist-stage-router-batch.md). Follows the **[stage-extraction playbook](./EXECUTION-ORDER-p2-receptionist-stage-router.md#stage-extraction-playbook-shared-recipe--every-rcp-0508-follows-this)**. This is the **conversion funnel** itself — the in-progress booking state machine (DL-6 consent, DL-7 confirm). Behavior-preserving. Recommended to run **after rcp-05 + rcp-06** so its predicate can call their predicates instead of re-replicating their guards.

| **Size** | L | **Model** | Auto + Opus close-gate | **Wave** | 2 | **Depends on** | rcp-03 (soft: rcp-05, rcp-06) | **Blocks** | rcp-08 |

---

## Why this group

Once a patient has committed to booking, the conversation walks a strict step machine: `collecting_all → confirm_details → consent → recording_consent → awaiting_slot_selection`. These branches are all **step-gated** (clean predicate) but carry the most state mutation and the consent/recording compliance logic, so they need their own tested home.

**Branches in scope:**

| Branch | Anchor | Gating step / note |
|---|---|---|
| `booking_collection` | `:2088` | `collecting_all` / `lastBotAskedForDetails`, and the book-intent collection continuation |
| `confirm_details` | `:2241` | `confirm_details` / `effectiveAskedForConfirm` |
| `confirm_details_complaint_clarify` | `:2398` | confirm-time complaint clarify |
| `consent_flow` | `:1920` | `consent` / `effectiveAskedForConsent` |
| `consent_correction_back` | `:1898` | back-correction out of consent |
| `recording_consent_flow` | `:1685` | `recording_consent` step |
| `slot_selection` | `:2571` | `awaiting_slot_selection` |
| `recording_consent_injected` | `:3437` | **persist-time detour, not a chain branch** — see below |
| `learning_policy_autobook` | `:3312` | nested in the convert/finalize path (autobook after match) |

## What to do

Follow the playbook. Specifics:

- **Stage:** `dm/stages/booking-funnel.ts` → `bookingFunnelStage`.
- **Predicate:** `dm/stages/booking-funnel-predicate.ts` → `isBookingFunnelTurn(ctx)`. The conditions are the `legacyClaimsBetweenStatusIntentsAndPostBookingAck` checks for `consent` / `collecting_all` / `confirm_details` / `awaiting_slot_selection` (already enumerated in `cancel-reschedule-status-predicate.ts`), plus the `recording_consent` and `consent_correction_back` step checks. Claim only when control gates, `isCancelRescheduleStatusTurn`, **and** (if extracted) `isIdleFeeTriageTurn` / `isServiceMatchTurn` are all false.
- **`recording_consent_injected` is special.** It is not a decide-chain branch — it's a detour the persist path takes when the bot decides to inject a recording-consent ask at end-of-turn (lives near `:3437`, in the rcp-01 persist sink). Model it as an **explicit transition the funnel stage returns** (e.g. `nextState.step = 'recording_consent'` + the injected reply), so the sink no longer needs the inline detour. Keep the emitted reply + state byte-identical; this is the one place you must verify the persist sink and the stage agree.
- **`booking_collection` straddles entry vs continuation.** Keep the branch body **atomic** — lift it whole into this stage. rcp-08 will own the *entry* branches (`booking_start_*`, `book_responded`, `channel_pick`); document where the seam falls so rcp-08 doesn't double-claim.
- **`learning_policy_autobook`** travels with this stage (it fires inside the convert/finalize path). If it proves entangled with the service-catalog matcher, leave the matcher in its util and only move the dispatch.
- **Register / remove / test / gate:** per playbook. Pin with `collecting-all`, `confirm-yes`, `confirm-edit`, `consent-yes/no`, `consent-correction-back`, `recording-consent`, `slot-pick`, `recording-consent-injected`, `autobook-after-match` transcripts.

## Acceptance gate

- [x] All in-scope branches live in `bookingFunnelStage`, lifted verbatim, removed from `runLegacyDecideChain`.
- [x] `recording_consent_injected` is an explicit funnel transition; the persist sink no longer carries the inline detour; emitted reply + persisted `step`/`metadata` byte-identical.
- [x] `isBookingFunnelTurn` claims exactly the in-flight funnel steps; a fresh book-intent *entry* from idle still falls through to legacy/rcp-08.
- [x] `booking_collection` kept atomic; seam with rcp-08 documented (see below).
- [x] Golden + characterization byte-identical across all pinned transcripts + corpus; consent/recording transcripts get extra scrutiny.
- [x] Isolated stage tests + `resolveStage` negative test pass; `npx tsc --noEmit` clean.

### rcp-08 seam (booking_collection entry vs continuation)

| Turn shape | Owner | Predicate guard |
|---|---|---|
| `collecting_all` / `lastBotAskedForDetails && !step` (in-flight collection) | **rcp-07** `booking_funnel` | `legacyClaimsBookingFunnelSteps` |
| `isBookIntent && justStartingCollection` (`booking_start_*`, `booking_start_reason_first`) | **rcp-08** legacy → `booking_entry` | excluded from `legacyClaimsBookingFunnelSteps` |
| `isBookIntent && inCollection` when step is **not** `collecting_all` (`booking_continue_ai`) | **rcp-08** | `isBookIntent && (justStartingCollection \|\| inCollection)` in legacy only |

## Anti-goals

- ❌ Don't alter the step order, consent/recording copy, `effectiveAskedFor*` heuristics, or slot-formatting.
- ❌ Don't move the slot-availability / booking-write services into the stage — they stay in their services; the stage only orchestrates the turn.
- ❌ Don't "improve" the `recording_consent_injected` timing — replicate exactly, just relocate the decision into the stage.
- ❌ Don't claim book-intent entry turns (rcp-08's job).

## Risks (executor-facing)

- **Persist-sink coupling (highest risk).** `recording_consent_injected` lives in the rcp-01 sink, so this is the one extraction that touches both the chain and the sink. A mismatch produces a double-ask or a dropped consent prompt. Add a characterization case that asserts the injected ask fires once, with identical text and `step`.
- **`effectiveAskedForConfirm` "yes" shortcut.** The legacy `collecting_all` guard explicitly excludes a bare "yes/ok/confirmed" when `effectiveAskedForConfirm` is true (so it routes to `confirm_details`, not collection). Preserve that negative-lookahead exactly or confirmations get swallowed as collection input.
- **Consent correction-back.** `consent_correction_back` (`:1898`) is checked *before* `consent_flow` (`:1920`); preserve that intra-stage order inside the handler.
- **Autobook entanglement.** `learning_policy_autobook` may read service-match state set earlier in the turn; ensure `DmTurnContext` carries what it needs (it should, post rcp-03) rather than reaching back into handler locals.
