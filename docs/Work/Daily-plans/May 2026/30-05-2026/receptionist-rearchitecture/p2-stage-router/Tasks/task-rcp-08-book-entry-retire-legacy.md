# rcp-08 · Extract book-intent entry + AI default; retire the legacy wrapper

> **Phase 2, step 6 (closer)** of [receptionist-rearchitecture](../plan-p2-receptionist-stage-router-batch.md). Follows the **[stage-extraction playbook](./EXECUTION-ORDER-p2-receptionist-stage-router.md#stage-extraction-playbook-shared-recipe--every-rcp-0508-follows-this)**. This is the **last** Phase 2 task: it moves the remaining entry/default branches out, then **deletes `runLegacyDecideChain`** and folds the `conflict_recovery_ai` catch-path into the single pipeline. After this PR the decide-chain is gone. **Must run after rcp-05, rcp-06, rcp-07.**

| **Size** | M | **Model** | Auto + Opus close-gate | **Wave** | 2 | **Depends on** | rcp-05, rcp-06, rcp-07 | **Blocks** | Phase 3 |

---

## Why this group

What's left in `runLegacyDecideChain` after rcp-05..07 is **funnel entry** (the turn that starts a booking from idle) and the **open-ended AI default** that catches everything else. Extracting these empties the wrapper so it can be deleted and the strangler retired.

**Branches in scope:**

| Branch | Anchor | Note |
|---|---|---|
| `consultation_channel_pick` | `:1190` | in-person vs teleconsult selection |
| `consultation_channel_pick_reason_first` | `:1222` | same, reason-first variant |
| `book_for_someone_else` | `:1726` | third-party booking entry |
| `booking_start_reason_first` | `:2513` | start booking, reason-first |
| `booking_start_ai` / `booking_continue_ai` | (confirm in live chain) | AI-driven booking entry |
| `book_responded` | `:2649` | book intent on a `responded` convo |
| `book_responded_reason_first` | `:2748` | same, reason-first |
| `ai_open_response` | `:2784` | **default fallthrough** — no predicate; becomes the router's default |

Plus the teardown: **`runLegacyDecideChain` deletion** and **`conflict_recovery_ai`** (the `catch`-block fallback) folded into the shared `handleTurn`.

## What to do

Follow the playbook, then close out:

- **Stages:** `dm/stages/booking-entry.ts` → `bookingEntryStage` (the book-intent entry branches) and `dm/stages/ai-open-response.ts` → `aiOpenResponseStage` (the default). Keep them separate — entry has a predicate, the default does not.
- **Predicate:** `dm/stages/booking-entry-predicate.ts` → `isBookingEntryTurn(ctx)` from the legacy entry conditions (`isBookIntent && justStartingCollection`, `book_responded` on `responded`, channel-pick conditions). Claim only when all earlier predicates (control gates, `isCancelRescheduleStatusTurn`, `isIdleFeeTriageTurn`, `isServiceMatchTurn`, `isBookingFunnelTurn`) are false. Respect the rcp-07 seam on `booking_collection` — entry vs continuation must not double-claim.
- **Default routing:** change `resolveStage` so its terminal `return` is `'ai_open_response'` (not `'legacy'`). Remove the `'legacy'` `DmStage` literal, its `STAGE_ROUTER` entry, and the dynamic import of `runLegacyDecideChain`.
- **Delete `runLegacyDecideChain`** once empty. The handler body is now: control gates → understand → `STAGE_ROUTER[resolveStage(ctx)].handle(ctx)` → persist sink → send.
- **Fold `conflict_recovery_ai`:** the booking-conflict `catch` path currently runs a forked mini-pipeline. Route it through the same `handleTurn` (or have the conflict produce a `DmTurnResult` the sink persists) so there is **one** path. Preserve the recovery copy + state byte-identical.
- **Regenerate `RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md`** from the router/stage arrays so the inventory is sourced from code, not hand-maintained.
- **Tests / gate:** per playbook, across the full corpus.

## Acceptance gate

- [x] Entry branches in `bookingEntryStage`; `ai_open_response` in `aiOpenResponseStage` as the router default.
- [x] `runLegacyDecideChain` deleted; `'legacy'` stage + dynamic import removed; no references remain (`grep` clean).
- [x] `conflict_recovery_ai` flows through the shared pipeline — no forked path; recovery reply + state byte-identical.
- [x] Handler body is the 4-step shape (gates → understand → route → persist+send); no inline reply chain.
- [x] `RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md` regenerated from code and matches the live `DmHandlerBranch` set.
- [x] Golden + characterization byte-identical across the **entire** corpus (this PR is the one most likely to shift a default-routed turn).
- [x] Isolated stage tests + `resolveStage` default test pass; `npx tsc --noEmit` clean.
- [x] **Phase 2 Definition-of-Done** in the [execution-order doc](./EXECUTION-ORDER-p2-receptionist-stage-router.md#definition-of-done-for-phase-2) fully satisfied.

## Anti-goals

- ❌ Don't change the AI default prompt, channel-pick copy, or `book_for_someone_else` flow.
- ❌ Don't redesign error handling while folding `conflict_recovery_ai` — relocate, don't rewrite.
- ❌ Don't start Phase 3 (channel adapters) here — that's a separate phase; just leave the handler in the clean 4-step shape.

## Risks (executor-facing)

- **Deleting the safety net.** Once `runLegacyDecideChain` is gone there is no fallback for an un-claimed turn except `ai_open_response`. Before deleting, assert via the corpus that **every** transcript routes to a non-default stage *or* intentionally to `ai_open_response` — a silent gap would now surface as an unexpected AI-open reply. This is why the PR carries an Opus close-gate.
- **Default-claim drift.** Because `ai_open_response` is the catch-all, any earlier predicate that *under*-claims will dump turns here. Run the full golden + characterization, not a subset.
- **`conflict_recovery_ai` state shape.** The catch path may construct state differently than the happy path; when routing it through the sink, confirm the persisted `metadata` matches the pre-refactor recovery exactly.
- **Inventory regeneration.** If the inventory was previously hand-maintained, generating it from code may reveal pre-existing drift — reconcile and note it, don't silently "fix" branch names.

## Close-gate outcome (Opus)

**PASS** with one intentional behavior change recorded below; everything else verified byte-identical.

- **Emergency promoted to a true head gate (intentional, DL-2).** `executeDmTurn` evaluates `EMERGENCY_CONTROL_GATES` after the head gates but **before** `resolveStage`. Previously (rcp-02..07) emergency ran *inside* the legacy decide-chain — i.e. after stage dispatch — so the cancel/reschedule **step** gates (`awaiting_cancel_choice/confirmation/reschedule_choice`) and other in-flight flow steps claimed an emergency turn before emergency could fire. As of rcp-08 an emergency message wins over any in-flight flow step, making DL-2 (Safety first) literal. In-collection suppression of non-acute `emergency` intent is unchanged (acute messages always escalate). This was **not** byte-identical and is **not** covered by the legacy golden/characterization corpus (no emergency transcripts), so it is pinned by new tests in `tests/unit/workers/dm/handle-turn.test.ts` and the stale ordering comments in `control-gates.ts` were corrected.
- **`conflict_recovery_ai` verified byte-identical** — routed through `executeDmTurn({ conflictRecovery: true })` → `aiOpenResponseStage`; the final `generateResponse(...)` arguments and the `conflict_recovery_ai` branch label match the pre-rcp-08 catch-block exactly, and state is still not persisted.
- **Pre-existing, unrelated:** `tests/unit/workers/webhook-worker.test.ts` fails to load `@react-pdf/renderer` (ESM) because it doesn't mock `notification-service`; rcp-08 touches none of that chain.
