# rcp-02 · Constitution in code — ordered control/safety gate interceptors

> **Phase 1, step 2** of [receptionist-rearchitecture](../plan-p1-receptionist-foundation-batch.md). Behavior-preserving extraction that turns the implicit "safety first" ordering into an explicit, testable list. Upholds **DL-2 (the constitution)** and creates the seam for the Phase 2 stage router.

| **Size** | M | **Model** | Auto | **Wave** | 1 | **Depends on** | rcp-01 (single sink) | **Blocks** | Phase 2 (stage router) |

---

## Why this task

DL-2 says safety/control outranks everything. Today that ordering **exists but is implicit and scattered**:
- Emergency is detected up-front at the *understand* layer — `classifyIntent` returns `emergency`/conf 1 via `isEmergencyUserMessage`, and `applyEmergencyIntentPostPolicy` runs before the chain (`:1507`).
- Control checks open the decide-chain in a fixed order — `revoke` (`:1641`) → `paused` (`:1657`) → cancel/reschedule step gates → emergency handling → staff-review block — documented only in the file header (`:10`) and `RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md`.

A new contributor can reorder these by accident, and there is no single place that says "these run first, they short-circuit, and here's why." This task lifts the control/safety checks into an explicit ordered `CONTROL_GATES` list whose order **is** DL-2 — with unit tests that pin both the order and the short-circuit semantics. It changes **no behavior**; it makes the existing behavior legible and enforceable, and gives Phase 2 a clean `for (gate of CONTROL_GATES) …` entry point before the stage router.

---

## What to do

### 1. Define the gate interface (new file `backend/src/workers/dm/control-gates.ts`)

A gate is a pure-ish predicate + handler over the turn context. Keep it framework-free (no Express, no Instagram specifics — DL-10 forward-compat):

```ts
export interface DmGateContext {
  state: ConversationState;
  recentMessages: Message[];
  intentResult: IntentDetectionResult;
  doctorSettings: DoctorSettingsRow | null;
  text: string;
  // ...only what the gates actually read (no channel/transport here)
}

export interface DmGateResult {
  branch: DmHandlerBranch;
  reply: string;
  nextState: ConversationState;   // branch mutates, sink (rcp-01) persists once
}

export interface DmControlGate {
  name: DmHandlerBranch;
  /** DL-2 rationale — why this gate sits where it does in the order. */
  rationale: string;
  fires(ctx: DmGateContext): boolean;
  handle(ctx: DmGateContext): Promise<DmGateResult> | DmGateResult;
}
```

### 2. Extract the existing control checks into ordered gates — **no logic changes**

Move the current top-of-chain checks verbatim into gate objects, preserving today's order exactly (DL-2 = the order):

```ts
export const CONTROL_GATES: DmControlGate[] = [
  revokeConsentGate,      // DL-9 patient control — must win over everything
  receptionistPausedGate, // DL-9 doctor control
  emergencyGate,          // DL-2 safety (today handled via intent='emergency' branch)
  // staff-review-block stays a stage concern, NOT a control gate (see anti-goals)
];
```

The handler's entry becomes:

```ts
for (const gate of CONTROL_GATES) {
  if (gate.fires(gateCtx)) {
    const { branch, reply, nextState } = await gate.handle(gateCtx);
    dmRoutingBranch = branch; replyText = reply; state = nextState;
    return persistAndSend();   // short-circuit — DL-2
  }
}
// ...existing decide-chain (unchanged this task; becomes STAGE_ROUTER in Phase 2)
```

> Keep the cancel/reschedule **step gates** in the existing chain for now — they are flow continuations, not safety/control. Only `revoke`, `paused`, and `emergency` move into `CONTROL_GATES` this task. (This is the minimal, safe extraction; Phase 2 generalizes the rest.)

### 3. Unit-test the gate list (new `backend/tests/unit/workers/dm-control-gates.test.ts`)

The order and short-circuit are now a **data structure** — test them directly:

```ts
describe('CONTROL_GATES (DL-2 order)', () => {
  it('lists gates in order: revoke → paused → emergency');
  it('revoke fires even when paused is also true (revoke wins)');
  it('paused fires before any conversion/stage logic runs');
  it('emergency fires for an emergency intent regardless of in-flight booking step');
  it('a non-firing turn passes through to the stage chain unchanged');
  it('each gate exposes a non-empty rationale string');
});
```

### 4. Re-pin end-to-end behavior

The golden corpus + characterization suites must stay **byte-identical** (same replies, same persisted `metadata`, same `dmRoutingBranch` per transcript):

```bash
cd backend
npx tsc --noEmit
npm test -- dm-routing-golden
npm test -- webhook-worker-characterization
npm test -- dm-control-gates
```

---

## Acceptance gate

- [x] `revoke`, `paused`, and `emergency` are expressed as `DmControlGate` objects in an ordered `CONTROL_GATES` array; the handler iterates head gates before the decide-chain and emergency gate at its prior position; short-circuits on fire.
- [x] Order matches today's behavior exactly (revoke → paused → cancel/reschedule step gates → emergency); golden corpus + characterization replies/branches/metadata byte-identical.
- [x] Each gate carries a `rationale` tied to a DL-2 clause; gate ordering covered by `dm-control-gates.test.ts` (9 tests).
- [x] Gates are channel-free (no Instagram/transport imports in `control-gates.ts`).
- [x] `npx tsc --noEmit` clean; dm-control-gates + dm-routing-golden + webhook-worker-characterization + ai-service green (93/93, 2026-05-30).

---

## Close-out (2026-05-30)

**Files added/changed:**
- `backend/src/workers/dm/control-gates.ts` — gate interface, `CONTROL_GATES`, `evaluateControlGates`
- `backend/tests/unit/workers/dm-control-gates.test.ts` — order + short-circuit tests
- `backend/src/workers/instagram-dm-webhook-handler.ts` — wired head + emergency gate evaluation

**Evaluation note:** Emergency gate stays after cancel/reschedule step gates (not at chain entry) to preserve pre-refactor branch order exactly.

**Unblocks:** [rcp-03](./task-rcp-03-stage-router-scaffold.md) stage router scaffold.

---

## Anti-goals

- ❌ Don't change the order, the firing conditions, or the reply copy of any gate — extraction only. The order is the *current* order; re-deriving DL-2 priority disputes belongs in a plan doc, not here.
- ❌ Don't pull the cancel/reschedule **step gates**, fee/medical/greeting idle branches, or matcher/collection logic into gates — those are stages (Phase 2), not control gates.
- ❌ Don't move emergency *detection* out of the understand layer — it stays in `classifyIntent`/`applyEmergencyIntentPostPolicy`; the gate only *handles* an already-classified emergency.
- ❌ Don't introduce the full `STAGE_ROUTER` here — this task only lands the `CONTROL_GATES` seam ahead of it.
- ❌ Don't add new telemetry branches — reuse `logInstagramDmRouting` / `DmHandlerBranch`.

---

## Risks (executor-facing)

- **Hidden ordering dependency.** A gate's `fires()` may today rely on a side effect of an earlier check (e.g. `paused` assuming `revoke` already consumed revoke intents). Preserve the exact sequential evaluation; the "revoke wins over paused" test pins the one known interaction.
- **Context surface creep.** `DmGateContext` must expose *only* what the three gates read. If it starts needing channel/token/transport, that's a smell — push those to the (Phase 3) adapter, not the gate.
- **Emergency double-handling.** Emergency is both an intent (understand layer) and now a control gate (decide layer). Confirm the gate handles the *already-emergency* intent and doesn't re-run detection or change the safety copy (`resolveSafetyMessage`).
- **Interaction with rcp-01 sink.** Gates return `nextState` and rely on the single sink to persist. Land **after** rcp-01 so there's exactly one writer; a gate must not add its own `updateConversationState`.
- **Short-circuit vs. message persistence.** Ensure that short-circuiting still records the inbound message + audit + `markWebhookProcessed` exactly as the current control branches do (don't skip the post-send bookkeeping by returning too early).
