# Execution order — Phase 2: funnel stage router

> Wave/lane matrix for [receptionist-rearchitecture](../plan-p2-receptionist-stage-router-batch.md). **Phase 0–2 are implemented.** Phase 2 was a **strangler-fig** migration: `rcp-03` landed the seam (`dm/stage-router.ts`), `rcp-04` extracted the first stage; `rcp-05 → rcp-08` peeled the remaining branches out of the legacy decide chain one group per PR until `runLegacyDecideChain` was deleted in rcp-08.

---

## Progress

| Task | Status | Landed artifacts |
|---|---|---|
| rcp-00 PHI redaction i18n | ✅ done | `redactPhiForAI` hardened |
| rcp-01 persist-once sink | ✅ done | single persist sink |
| rcp-02 control gates | ✅ done | `dm/control-gates.ts` (revoke / paused / emergency) |
| rcp-03 stage router scaffold | ✅ done | `dm/stage-router.ts` (`DmTurnContext`, `STAGE_ROUTER`, `resolveStage`) |
| rcp-04 cancel/reschedule/status | ✅ done | `dm/stages/cancel-reschedule-status.ts` + `-predicate.ts` |
| rcp-05 idle fee/triage | ✅ done | `dm/stages/idle-fee-triage.ts` + `-predicate.ts` |
| rcp-06 service-match | ✅ done | `dm/stages/service-match.ts` + `-predicate.ts` |
| rcp-07 collection/consent/convert | ✅ done | `dm/stages/booking-funnel.ts` + `-predicate.ts`; post-stage hooks in `handle-turn.ts` |
| rcp-08 book-entry + retire legacy | ✅ done | `booking-entry.ts`, `ai-open-response.ts`, `handle-turn.ts` (`executeDmTurn`); legacy chain deleted |

Handler is down to **~1,425 lines** (from 4,151). Decide path is `executeDmTurn` (gates → emergency → `resolveStage` → stage handle → autobook/recording hooks). `runLegacyDecideChain` is gone.

**Next phase:** the engine is now I/O-free, so Phase 3 puts Instagram behind a channel adapter and feeds the engine normalized input → [EXECUTION-ORDER-p3-receptionist-channels.md](./EXECUTION-ORDER-p3-receptionist-channels.md).

---

## Wave matrix (Phase 2 — complete)

| Wave | Task | Title | Size | Model | Depends on | Status |
|---|---|---|---|---|---|---|
| 2 | [rcp-05](./task-rcp-05-idle-fee-triage-stage.md) | Extract fee / reason-first / medical / greeting **idle** group | L | Auto + Opus gate | rcp-03 | ✅ |
| 2 | [rcp-06](./task-rcp-06-service-match-stage.md) | Extract service-match / staff-review / clarification group | M | Auto | rcp-03 | ✅ |
| 2 | [rcp-07](./task-rcp-07-collection-consent-convert-stage.md) | Extract collection → consent → confirm → recording → slot group | L | Auto | rcp-03 | ✅ |
| 2 | [rcp-08](./task-rcp-08-book-entry-retire-legacy.md) | Extract book-intent entry + AI default; retire legacy; fold conflict-recovery | M | Auto + Opus gate | rcp-05, rcp-06, rcp-07 | ✅ |

**Recommended order:** rcp-05 → rcp-06 → rcp-07 → rcp-08. The first three are largely independent (each guards against the others via the predicate pattern below); **rcp-08 is last** because it owns the `ai_open_response` fallthrough and deletes the legacy wrapper, so it must run after the others have vacated it.

---

## Stage-extraction playbook (shared recipe — every rcp-05..08 follows this)

The pattern is set by `rcp-04`. Each task:

1. **Stage file** `dm/stages/<group>.ts` exporting `<group>Stage: DmStageHandler` whose `handle(ctx: DmTurnContext)` is the branch bodies **lifted verbatim**, returning `{ branch, reply, nextState }` (never calling `updateConversationState` — the rcp-01 sink persists).
2. **Predicate file** `dm/stages/<group>-predicate.ts` exporting `is<Group>Turn(ctx)`. **This is the correctness core:** because the legacy chain is order-sensitive, the predicate must claim a turn **only if no earlier legacy branch would have**. Reuse the established mechanism from `cancel-reschedule-status-predicate.ts`:
   - call already-extracted predicates (`isCancelRescheduleStatusTurn`, and any earlier rcp-05..07 predicates) to short-circuit "already claimed";
   - replicate the "legacy-claims-before-me" guards inline only for branches not yet extracted (these guards shrink as more stages land).
3. **Register** in `stage-router.ts`: add the `DmStage` literal, a `resolveStage` check **above** `'legacy'` (in chain order), and a `STAGE_ROUTER` entry (dynamic `import()` like the others).
4. **Remove** the moved branch bodies from `runLegacyDecideChain`.
5. **Isolated unit tests** `tests/unit/workers/dm/stages/<group>.test.ts` with small fixtures + at least one `resolveStage` negative test ("a turn for another group still routes elsewhere / legacy").
6. **Gate:** `dm-routing-golden` + `webhook-worker-characterization` **byte-identical** before/after (same reply, `dmRoutingBranch`, persisted `metadata`). Extraction only — no logic/copy/order change.

> **Cross-cutting note:** `fee_ambiguous_visit_type_staff` and `reason_first_triage_ask_more` are *outcomes* produced by shared composers (`composeIdleFeeQuoteDmWithMetaAsync`, reason-first utils) and are reachable from idle, mid-collection, **and** book-intent paths. Do **not** try to make one stage "own" all their occurrences — each stage that calls the composer handles the returned flag locally (same pattern the legacy branches use). The compose logic already lives in utils; stages only host the dispatch + flag-handling.

---

## Stage-family map (current anchors in `instagram-dm-webhook-handler.ts`)

> Line numbers are post-rcp-04 finding-aids; they shift as extraction proceeds. Match on **branch name**, not line.

### Already extracted
- **Control gates (rcp-02):** `revoke_consent`, `receptionist_paused`, `emergency_safety`.
- **Cancel/reschedule/status (rcp-04):** `cancel_flow_numeric`, `cancel_flow_confirm`, `reschedule_flow_numeric`, `check_appointment_status`, `cancel_appointment_intent`, `reschedule_appointment_intent`, `post_booking_ack`.

### rcp-05 — fee / reason-first triage / medical / greeting **idle**
`post_medical_payment_existence_ack` (`:1280`) · `reason_first_triage_fee_narrow` (`:1359`) · `reason_first_triage_ask_more_ambiguous_yes` (`:1385`) · `reason_first_triage_ask_more_payment_bridge` (`:1398`) · `reason_first_triage_confirm` (`:1416/1437/1446`) · `booking_resume_after_emergency` (`:1467`) · `medical_safety` (`:1501`) · `fee_deterministic_mid_collection` (`:1532`) · `reason_first_triage_ask_more` (`:1582`, `:2453`, `:2670`) · `greeting_template` (`:1636`) · `fee_book_misclassified_idle` (`:2468`) · `fee_deterministic_idle` / `fee_follow_up_anaphora_idle` (helper closures) · the recurring `fee_ambiguous_visit_type_staff` deferral (`:1314/1356/1549/1617/2484/2699`, handled locally per call site)

### rcp-06 — service-match / staff-review / clarification
`staff_service_review_pending` (`:1067`) · `complaint_clarification_reply` (`:1074`) · `patient_match_confirmation` (`:1794`) · `learning_policy_autobook` (`:3312`, nested in the convert/finalize path — see rcp-07 note)

### rcp-07 — collection → consent → confirm → recording → slot/convert
`recording_consent_flow` (`:1685`) · `consent_correction_back` (`:1898`) · `consent_flow` (`:1920`) · `booking_collection` (`:2088`) · `confirm_details` (`:2241`) · `confirm_details_complaint_clarify` (`:2398`) · `slot_selection` (`:2571`) · `recording_consent_injected` (`:3437`, persist-time detour)

### rcp-08 — book-intent entry + AI default; retire legacy
`consultation_channel_pick` (`:1190`) · `consultation_channel_pick_reason_first` (`:1222`) · `book_for_someone_else` (`:1726`) · `booking_start_reason_first` (`:2513`) · `booking_start_ai` / `booking_continue_ai` · `book_responded` (`:2649`) · `book_responded_reason_first` (`:2748`) · `ai_open_response` (`:2784`, default). Then **delete the empty legacy wrapper** and **fold `conflict_recovery_ai` (`catch` block) into the shared `handleTurn`**.

---

## Definition of done for Phase 2

- Handler body is `for (gate of CONTROL_GATES) …; understand(); STAGE_ROUTER[resolveStage(ctx)].handle(); persistTurn(); send();` — no inline reply chain, no `runLegacyDecideChain`.
- Every stage handler is independently unit-tested with small fixtures.
- `conflict_recovery_ai` runs through the shared `handleTurn`; no forked pipeline.
- Golden corpus + characterization unchanged across the whole phase; `RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md` regenerated from / pinned to the router arrays.
