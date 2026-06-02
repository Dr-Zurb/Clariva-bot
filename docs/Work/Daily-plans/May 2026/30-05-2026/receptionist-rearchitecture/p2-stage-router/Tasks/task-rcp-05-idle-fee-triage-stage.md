# rcp-05 · Extract the fee / reason-first / medical / greeting "idle" stage

> **Phase 2, step 3** of [receptionist-rearchitecture](../plan-p2-receptionist-stage-router-batch.md). Follows the **[stage-extraction playbook](./EXECUTION-ORDER-p2-receptionist-stage-router.md#stage-extraction-playbook-shared-recipe--every-rcp-0508-follows-this)**. The largest and riskiest Phase 2 group — fee guardrails (DL-4) and reason-first/staff-deferral (DL-5) live here. Behavior-preserving.

| **Size** | L | **Model** | Auto + Opus close-gate | **Wave** | 2 | **Depends on** | rcp-03 | **Blocks** | rcp-08 |

---

## Why this group

These branches fire on an **idle / responded** conversation (not mid-collection) and share the fee + reason-first machinery (`composeIdleFeeQuoteDmWithMetaAsync`, `buildFeeCatalogMatchText`, `resolveVisitReasonSnippetForTriage`, `mergeStateForFeeAmbiguousStaffReview`, `reason-first-triage` utils). They are the most tangled set and the highest-value to isolate — getting them behind a tested stage protects the truthful-fees and "no patient fee-tier menu" guardrails.

**Branches in scope** (match by name; anchors drift):

| Branch | Anchor | Note |
|---|---|---|
| `post_medical_payment_existence_ack` | `:1280` | short "consultations are paid" after deflection |
| `reason_first_triage_fee_narrow` | `:1359` | fee after confirm-yes |
| `reason_first_triage_ask_more_ambiguous_yes` | `:1385` | bare "yes" to "anything else?" |
| `reason_first_triage_ask_more_payment_bridge` | `:1398` | pricing asked pre-confirm |
| `reason_first_triage_confirm` | `:1416/1437/1446` | confirm/clarify/replay |
| `booking_resume_after_emergency` | `:1467` | post-emergency stability → resume |
| `medical_safety` | `:1501` | medical_query deflection |
| `fee_deterministic_mid_collection` | `:1532` | fee while collecting |
| `reason_first_triage_ask_more` | `:1582` (also `:2453`, `:2670`) | ask-more copy |
| `greeting_template` | `:1636` | idle greeting |
| `fee_book_misclassified_idle` | `:2468` | book intent that's really a fee Q |
| `fee_deterministic_idle` / `fee_follow_up_anaphora_idle` | helper closures | idle fee quote |
| `fee_ambiguous_visit_type_staff` | `:1314/1356/1549/1617/2484/2699` | **cross-cutting outcome** — handle locally per call site (playbook note) |

> `fee_deterministic_mid_collection` fires while `inCollection` — confirm it routes here and not into the rcp-07 collection stage (it's a fee *answer* injected mid-collection, semantically idle/fee). Mirror the legacy guard exactly.

## What to do

Follow the playbook. Specifics for this group:

- **Stage:** `dm/stages/idle-fee-triage.ts` → `idleFeeTriageStage`. Lift the helper closures `runReasonFirstFullFeeEscape` / `runReasonFirstFeeNarrowFromTriage` into named module functions (they currently mutate outer `state`/`replyText`; convert to return partial results the stage composes into `nextState`).
- **Predicate:** `dm/stages/idle-fee-triage-predicate.ts` → `isIdleFeeTriageTurn(ctx)`. Reuse the order encoded in `cancel-reschedule-status-predicate.ts` (`legacyClaimsBeforeStatusIntents` already enumerates this exact block in order). Claim a turn only when control gates didn't fire, `isCancelRescheduleStatusTurn` is false, and the idle-fee/triage/medical/greeting conditions match — i.e. the same conditions `legacyClaimsBeforeStatusIntents` lists (steps 5–11 there) plus the book-path idle bits (`fee_book_misclassified_idle`).
- **Register / remove / test / gate:** per playbook. Pin with `fee-idle`, `fee-mid-collection`, `book-misclassified-fee`, `hinglish-medical-idle`, `greeting-idle` transcripts.

## Acceptance gate

- [x] All in-scope branches live in `idleFeeTriageStage`, lifted verbatim; helper closures promoted to named functions; removed from `runLegacyDecideChain`.
- [x] `isIdleFeeTriageTurn` claims exactly the legacy idle/fee/triage/medical/greeting turns (incl. `fee_book_misclassified_idle`) and nothing a later stage should own; `fee_deterministic_mid_collection`'s mid-collection routing preserved.
- [x] Each `fee_ambiguous_visit_type_staff` call site handles the composer flag locally (no attempt to centralize it into one branch).
- [x] Golden + characterization byte-identical (reply, branch, metadata) across the five named transcripts + corpus.
- [x] Isolated stage tests pass; `resolveStage` negative test (a collection/book turn does not route here); no channel imports; persistence via sink.
- [x] `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't change fee copy, rupee formatting, `fee_ambiguous` deferral conditions, or the reason-first ask-more/confirm phrasing.
- ❌ Don't merge the duplicate `reason_first_triage_ask_more` / `fee_ambiguous` occurrences into "one true site" — extraction first; de-dup is a separate follow-up.
- ❌ Don't pull mid-collection *collection* logic in — only the fee/medical *answers* that the legacy chain emits from these idle conditions.
- ❌ Don't extract another group in this PR.

## Risks (executor-facing)

- **Highest-risk group.** Fee guardrails are subtle and multi-flagged (`suppressConsultationFeeFacts`, `competingVisitTypeBuckets`, `silentAssignmentStrict`). The `feeComposerOpts` / `bookingFeeComposerOpts` from `DmTurnContext` must be passed through unchanged.
- **Helper-closure capture.** `runReasonFirstFullFeeEscape` / `runReasonFirstFeeNarrowFromTriage` mutate outer state and `dmRoutingBranch`. When promoting to named functions, return their effects explicitly; a missed mutation = wrong branch/state. Diff persisted `metadata` per transcript.
- **`isRecentMedicalDeflectionWindow` / `reasonFirstTriagePhase` timing.** These conditions are TTL- and phase-sensitive; replicate the exact guards (the predicate file already shows them) — off-by-one here silently reroutes pricing turns.
- **Predicate over-claim.** Idle conditions are broad; an over-broad predicate steals collection/book turns whose branches now live only in the (still-legacy or later) stages. The negative `resolveStage` tests + corpus are the rail.
