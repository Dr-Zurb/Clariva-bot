# rcp-03 · Stage router scaffold — the strangler seam

> **Phase 2, step 1** of [receptionist-rearchitecture](../plan-p2-receptionist-stage-router-batch.md). Lands the dispatch seam with **zero behavior change** by wrapping the entire existing decide-chain as one "legacy" stage handler. Every later Phase 2 task moves a stage group out of the legacy wrapper into its own handler. Upholds **DL-11**.

| **Size** | M | **Model** | Auto | **Wave** | 2 | **Depends on** | rcp-02 (control gates) | **Blocks** | rcp-04 … rcp-08 |

---

## Why this task

After rcp-02, the handler is:

```text
for (gate of CONTROL_GATES) { if (gate.fires) return gate.handle() }   // explicit
<~2,000-line if/else-if decide-chain>                                  // still implicit
persistTurn(); send();
```

We can't move 50 branches at once safely. The **strangler-fig** approach: introduce a `STAGE_ROUTER` dispatch *around* the chain, with a single `legacyChainHandler` that **is** today's chain verbatim. Dispatch picks `legacyChainHandler` for every turn → **identical behavior**. Subsequent tasks (rcp-04…08) peel stage groups out of the legacy wrapper into real handlers; when the wrapper is empty, rcp-08 deletes it. This gives us a safe, reviewable, one-PR-per-stage migration instead of a big-bang rewrite.

---

## What to do

### 1. Define the stage-handler contract (new `backend/src/workers/dm/stage-router.ts`)

Reuse `DmGateContext` / `DmGateResult` shapes from rcp-02 (rename to the shared `DmTurnContext` / `DmTurnResult` if cleaner). A stage handler mirrors a control gate but is selected by `resolveStage(ctx)` rather than iterated:

```ts
export interface DmStageHandler {
  stage: DmStage;                                   // 'legacy' for now; real stages added later
  handle(ctx: DmTurnContext): Promise<DmTurnResult>; // { branch, reply, nextState }
}

export type DmStage =
  | 'legacy'        // rcp-03: wraps the current chain; shrinks as stages are extracted
  // added incrementally by rcp-04..08:
  // | 'cancel_reschedule_status' | 'idle' | 'match' | 'collect' | 'consent' | 'convert' | 'book_entry'
  ;

/** Pick the handler for this turn. rcp-03: always 'legacy'. Later tasks add real predicates ABOVE it. */
export function resolveStage(_ctx: DmTurnContext): DmStage {
  return 'legacy';
}
```

### 2. Wrap the existing chain as `legacyChainHandler` — verbatim

Lift the current decide-chain (everything between the control gates and the persist sink) into one function with no edits:

```ts
const legacyChainHandler: DmStageHandler = {
  stage: 'legacy',
  async handle(ctx) {
    // EXACTLY the current if/else-if body, returning { branch, reply, nextState }
    // instead of mutating closure vars + falling through.
  },
};

export const STAGE_ROUTER: Record<DmStage, DmStageHandler> = {
  legacy: legacyChainHandler,
};
```

> Mechanical tip: today the chain mutates `dmRoutingBranch` / `replyText` / `state` and falls through to the rcp-01 sink. Wrap it so it `return`s `{ branch, reply, nextState }` at the end; the call site assigns those and calls `persistTurn` exactly as before.

### 3. Wire dispatch into the handler

```ts
for (const gate of CONTROL_GATES) { /* rcp-02 */ }
understand(ctx);                       // classify (unchanged)
const stage = resolveStage(ctx);
const { branch, reply, nextState } = await STAGE_ROUTER[stage].handle(ctx);
dmRoutingBranch = branch; replyText = reply; state = nextState;
// ...rcp-01 persist sink + send (unchanged)
```

### 4. Tests (new `backend/tests/unit/workers/dm-stage-router.test.ts`)

```ts
describe('STAGE_ROUTER scaffold (rcp-03)', () => {
  it('resolveStage returns "legacy" for every fixture turn (no real stages yet)');
  it('STAGE_ROUTER.legacy.handle reproduces the chain branch for each dm-transcript fixture');
  it('dispatch + persist path leaves persisted metadata identical to pre-rcp-03 snapshot');
});
```

### 5. Verify

```bash
cd backend
npx tsc --noEmit
npm test -- dm-routing-golden
npm test -- webhook-worker-characterization
npm test -- dm-stage-router
```

Golden corpus + characterization MUST be byte-identical (same reply, branch, metadata).

---

## Acceptance gate

- [x] `STAGE_ROUTER` + `resolveStage` + `DmStageHandler` exist; dispatch runs after `CONTROL_GATES` and before the rcp-01 persist sink.
- [x] `resolveStage` returns `'legacy'` for all turns; `legacyChainHandler` is the current chain **verbatim** (via `runLegacyDecideChain`), returning `{ branch, reply, nextState }`.
- [x] Golden corpus + characterization byte-identical; per-fixture `dmRoutingBranch` unchanged (41 + 16 + 25 tests green).
- [x] `runLegacyDecideChain` issues **no** `updateConversationState` (rcp-01 single sink owns persistence).
- [x] `npx tsc --noEmit` clean; dm-stage-router + dm-routing-golden + webhook-worker-characterization + ai-service green (98 total with dm-control-gates).

---

## Close-out (2026-05-30)

**Files added/changed:**
- `backend/src/workers/dm/stage-router.ts` — `DmTurnContext`, `resolveStage`, `STAGE_ROUTER`
- `backend/src/workers/instagram-dm-webhook-handler.ts` — `runLegacyDecideChain` (verbatim chain lift), stage dispatch wiring
- `backend/tests/unit/workers/dm-stage-router.test.ts` — scaffold tests

**Unblocks:** [rcp-04](./task-rcp-04-cancel-reschedule-status-stage.md) (first real stage extraction).

---

## Anti-goals

- ❌ Don't extract any real stage in this task — `legacy` is the only handler. Real stages start in rcp-04.
- ❌ Don't reorder, rename, or merge branches; don't "tidy" the chain while moving it. Verbatim lift only.
- ❌ Don't move the control gates back inline; they stay the rcp-02 list ahead of dispatch.
- ❌ Don't touch the conflict-recovery `catch` block (rcp-08 unifies it).
- ❌ Don't add channel/transport imports to `stage-router.ts` (DL-10 — keep the core engine channel-free).

---

## Risks (executor-facing)

- **Closure capture during the lift.** The chain reads dozens of locals (`doctorContext`, `feeComposerOpts`, `recentMessages`, `signalsFeePricing`, `runGenerateResponse`, …). When lifting into `legacyChainHandler`, pass these via `DmTurnContext` rather than re-deriving — re-deriving risks subtle drift. Inventory the captured vars first.
- **Return vs. fall-through equivalence.** The chain currently relies on fall-through to the sink; converting to a single `return { … }` per branch must preserve the exact `state`/`branch`/`reply` that fall-through produced. The per-fixture characterization assertion is the gate.
- **The two inner helper closures** (`runReasonFirstFullFeeEscape`, `runReasonFirstFeeNarrowFromTriage`, ~`:2060`) mutate outer `state`/`replyText`. Preserve that they assign before the wrapper returns; rcp-05 lifts them properly later.
- **`greetingFastPath` / timing locals** used by `logInstagramDmRouting` / pipeline timing must still be populated; thread them through `DmTurnResult` or the context, don't drop them.
