# rcp-04 · Extract the cancel / reschedule / status stage group

> **Phase 2, step 2** of [receptionist-rearchitecture](../plan-p2-receptionist-stage-router-batch.md). First *real* stage extraction behind the rcp-03 router. Chosen first because it's the most self-contained group (appointment-mutation, minimal entanglement with the fee/triage/collection machinery). Behavior-preserving. Upholds **DL-11**.

| **Size** | M | **Model** | Auto | **Wave** | 2 | **Depends on** | rcp-03 (router scaffold) | **Blocks** | rcp-08 (legacy retire) |

---

## Why this task

The cancel/reschedule/status branches are a clean, cohesive sub-flow: they read existing appointments (`getMergedUpcomingAppointmentsForRelatedPatients`, `webhook-appointment-helpers`), drive numeric pick lists, and confirm via `generateResponseWithActions` tool calls (`confirm_cancel`, `pick_appointment`). They barely touch the fee/triage/collection state. Extracting them first proves the rcp-03 seam on a low-risk group and gives a template for rcp-05…07.

**Branches in scope** (move out of `legacyChainHandler` into the new handler):

| Branch | Pre-refactor anchor | Trigger |
|---|---|---|
| `cancel_flow_numeric` | `:1673` | step `awaiting_cancel_choice`, user sends "1"/"2" |
| `cancel_flow_confirm` | `:1705` | step `awaiting_cancel_confirmation`, yes/no (tool call) |
| `reschedule_flow_numeric` | `:1772` | step `awaiting_reschedule_choice` |
| `check_appointment_status` | `:2497` | intent `check_appointment_status` |
| `cancel_appointment_intent` | `:2556` | intent `cancel_appointment` |
| `reschedule_appointment_intent` | `:2605` | intent `reschedule_appointment` |
| `post_booking_ack` | `:3385` | post-redirect "payment done / thanks" ack |

> Confirm this exact set against the live `dmRoutingBranch` assignments before moving (line numbers drift after rcp-01/02/03 — match on branch name, not line).

---

## What to do

### 1. Create the stage handler — `backend/src/workers/dm/stages/cancel-reschedule-status.ts`

```ts
export const cancelRescheduleStatusStage: DmStageHandler = {
  stage: 'cancel_reschedule_status',
  async handle(ctx): Promise<DmTurnResult> {
    // the 7 branches above, lifted VERBATIM, returning { branch, reply, nextState }
  },
};
```

Move the branch bodies **verbatim** (same helper calls, same copy, same state transitions). Keep `generateResponseWithActions` tool wiring (`confirm_cancel` / `pick_appointment`) and `parseToolCallToAction` / `executeAction` exactly as-is.

### 2. Add the stage to the router + a precise predicate

In `stage-router.ts`, register the handler and add a predicate **above** `'legacy'` in `resolveStage` that fires for *exactly* this group's triggers — nothing else falls through accidentally:

```ts
export type DmStage = 'cancel_reschedule_status' | 'legacy' /* | ... */;

export function resolveStage(ctx: DmTurnContext): DmStage {
  if (isCancelRescheduleStatusTurn(ctx)) return 'cancel_reschedule_status';
  return 'legacy';
}
```

`isCancelRescheduleStatusTurn` must encode the same guard conditions the chain used (step `awaiting_cancel_*` / `awaiting_reschedule_*`, or intent ∈ {cancel_appointment, reschedule_appointment, check_appointment_status}, plus the post-booking-ack condition). Mirror the original `if` predicates precisely — order vs. the legacy chain matters (these branches currently sit *before* the idle/booking branches, so the predicate must claim the same turns the chain claimed first).

### 3. Remove the moved branches from `legacyChainHandler`

Delete the 7 branch bodies from the legacy wrapper. The router now sends those turns to the new handler; everything else still hits `'legacy'`.

### 4. Unit-test the stage in isolation — `backend/tests/unit/workers/dm/stages/cancel-reschedule-status.test.ts`

This is the payoff — test the group with **small fixtures**, no full-webhook simulation:

```ts
describe('cancelRescheduleStatusStage', () => {
  it('awaiting_cancel_choice + "2" → picks 2nd appt, transitions to awaiting_cancel_confirmation');
  it('awaiting_cancel_confirmation + "yes" → confirm_cancel tool → cancels, branch cancel_flow_confirm');
  it('intent cancel_appointment with one upcoming → lists / confirms');
  it('intent reschedule_appointment → reschedule link/choice');
  it('check_appointment_status → merged upcoming summary');
  it('post-redirect "payment done" → post_booking_ack');
  it('resolveStage routes ONLY these triggers here; a fee/booking turn still returns "legacy"');
});
```

### 5. Verify

```bash
cd backend
npx tsc --noEmit
npm test -- dm-routing-golden
npm test -- webhook-worker-characterization
npm test -- cancel-reschedule-status
```

Golden + characterization byte-identical; the only change is *where* these branches live.

---

## Acceptance gate

- [x] The 7 branches live in `cancelRescheduleStatusStage`, lifted verbatim, returning `{ branch, reply, nextState }`; removed from `legacyChainHandler`.
- [x] `resolveStage` routes exactly this group's triggers to the new stage and **nothing else** (proven by a "fee/booking turn still legacy" test).
- [x] Per-fixture `dmRoutingBranch`, reply text, and persisted `metadata` are byte-identical to pre-rcp-04.
- [x] New isolated stage tests pass using small fixtures (no full webhook payload needed).
- [x] Stage file has no channel/transport imports (DL-10); persistence still via rcp-01 sink.
- [x] `npx tsc --noEmit` clean; golden + characterization + new suite green.

**Status:** SHIPPED 2026-05-30

---

## Anti-goals

- ❌ Don't change cancel/reschedule copy, the numeric-pick parsing, tool definitions, or appointment-helper queries.
- ❌ Don't "improve" the predicates' logic — replicate the legacy `if` guards exactly, including their position-in-order semantics.
- ❌ Don't pull `post_booking_ack` apart from this group even though it's booking-adjacent — it's status-family by trigger and self-contained; keep the move minimal.
- ❌ Don't extract any other stage group in this PR (one group per PR — that's the strangler discipline).
- ❌ Don't add new telemetry/branch names — reuse existing `DmHandlerBranch` values.

---

## Risks (executor-facing)

- **Predicate ordering vs. the legacy chain.** These branches currently win over later idle/booking branches for the same turn. The new predicate must claim *precisely* those turns — too broad steals booking/fee turns; too narrow leaks them to `'legacy'` where the moved branch no longer exists (→ wrong reply). The "still legacy" negative tests + golden corpus guard this.
- **Shared state fields.** Cancel/reschedule use `pendingCancelAppointmentIds` / `cancelAppointmentId` / `pendingRescheduleAppointmentIds` / `rescheduleAppointmentId`. Ensure the lifted handler reads/writes the same `ConversationState` keys (no renames pre-Phase-4).
- **Tool-call path.** `cancel_flow_confirm` goes through `generateResponseWithActions` → `parseToolCallToAction` → `executeAction`. Keep the full path inside the stage; a partial lift that leaves `executeAction` in the wrapper will desync.
- **`post_booking_ack` overlap with status.** It can resemble `check_appointment_status`; preserve the original disambiguation (it keys off `lastBookingPatientId` / recent redirect state). Pin with the relevant transcript.
