# rcp-01 · One write per turn — collapse the 60 redundant state persists

> **Phase 1, step 1** of [receptionist-rearchitecture](../plan-p1-receptionist-foundation-batch.md). First structural slice; behavior-preserving. Upholds **DL-11 (funnel = state machine, one persistence sink)**.

| **Size** | M | **Model** | Auto + Opus close-gate | **Wave** | 1 | **Depends on** | — | **Blocks** | rcp-02, Phase 2 |

---

## Why this task

`processInstagramDmWebhook` calls `updateConversationState(...)` **64 times** (`instagram-dm-webhook-handler.ts`). Each branch in the decide-chain mutates `state` and persists it inline — **and then** the function falls through to a final persist that already exists:

```3833:3920:backend/src/workers/instagram-dm-webhook-handler.ts
    let stateToPersist = {
      ...stateToPersistRaw,
      lastPromptKind: lastPromptKindResolved,
    };
    // ... booking-link bookkeeping, staff-review id, recording-consent detour ...
    await updateConversationState(conversation.id, stateToPersist, correlationId);
```

`stateToPersistRaw` (`:3800`) is derived from the **same mutated `state`** the branches produced (it keeps `state` as-is for in-flow steps, normalizes terminal steps to `responded` — exactly what the branches already set). **Every branch in the chain falls through to this sink** — the two `return;` at `:2077`/`:2119` are returns from *inner helper closures*, not the handler. Therefore the ~60 inline `updateConversationState(state)` calls inside the chain are **redundant double-writes**: the row is written by the branch, then written again at `:3920` with equivalent content.

Cost of leaving it:
- **2× (often more) DB writes per turn** under the conversation lock.
- The fragile invariant from full-blob overwrite (`conversation-service.ts:303`): 60 hand-maintained `...state` spreads, any one of which can silently drop a field.
- It's the chief reason a single branch can't be reasoned about in isolation — and the blocker for the Phase 2 router.

This task removes the redundancy with **zero behavior change**, pinned by the golden corpus + characterization tests.

---

## What to do

### 1. Catalogue every in-chain `updateConversationState` call

```bash
rg -n "await updateConversationState" backend/src/workers/instagram-dm-webhook-handler.ts
```

Classify each of the 64 sites into:
- **(A) Pre-chain / setup** — e.g. legacy-slot normalize at `:1495`. *Keep* (runs before the decide-chain; needed if its mutation must land even when later logic short-circuits).
- **(B) In-chain branch write** — the ~60 sites inside the `if/else if` chain (`~:1641`→`:3790`). *Candidates for removal* — they fall through to the `:3920` sink.
- **(C) End sink** — `:3920`. *Keep — this becomes the single writer.*
- **(D) Catch / conflict-recovery** — e.g. `:4013`. *Out of scope* (Phase 2 folds recovery into the shared path).

### 2. Prove the sink already captures branch state (characterization first)

Before deleting anything, **snapshot current behavior**:
- Run the full golden/characterization suite and record the persisted `metadata` for representative transcripts (greeting-idle, fee-idle, fee-mid-collection, book-misclassified-fee, emergency, hinglish-medical-idle — fixtures already in `tests/fixtures/dm-transcripts/`).
- If the suite doesn't already assert the final `metadata` blob per turn, **add a characterization assertion** that captures it. This is the safety net for the deletion.

### 3. Remove the redundant (B) writes

For each (B) site: keep the `state = { ...state, ... }` mutation, delete the trailing `await updateConversationState(conversation.id, state, correlationId)`. The branch's intent now flows into `stateToPersistRaw` → the `:3920` sink.

Watch for the handful of branches that mutate `state` **after** their (now-removed) inline write — make sure the final mutation is the one that reaches the sink (it already is, since `stateToPersistRaw` reads the final `state`).

### 4. Make the single-writer intent explicit

Wrap the end sink in a tiny named local so the contract is legible and future branches don't re-add inline writes:

```ts
// single persistence sink for the turn (DL-11). Branches mutate `state`; we persist once here.
const persistTurn = (next: ConversationState) =>
  updateConversationState(conversation.id, next, correlationId);
// ...
await persistTurn(stateToPersist);
```

(Optional but recommended: a short code comment / lint note that inline `updateConversationState` inside the chain is disallowed — the Phase 2 router will enforce it structurally.)

### 5. Verify

```bash
cd backend
npx tsc --noEmit
npm test -- dm-routing-golden
npm test -- webhook-worker-characterization
npm test -- ai-service
```

The persisted `metadata` snapshots from step 2 must be **identical** before/after. The only observable change is **fewer DB writes**.

---

## Acceptance gate

- [x] Every in-chain branch persists via the single end sink; the ~60 redundant inline `updateConversationState` calls are removed. *(61 removed; 3 retained: pre-chain A, end sink C, conflict-recovery D.)*
- [x] Pre-chain (A) and catch/recovery (D) writes are intentionally retained and documented as such.
- [x] Characterization snapshots of persisted `metadata` are byte-identical before vs. after for all `tests/fixtures/dm-transcripts/` transcripts. *(Final sink state unchanged; match-confirmation test corrected to assert final `recording_consent` not discarded intermediate write.)*
- [x] DB write count per turn drops to 1 (+ the legacy-normalize pre-write only when it actually mutates) — verify via a spy/mock count in one characterization test.
- [x] Golden corpus, characterization, and `ai-service` suites green; `npx tsc --noEmit` clean. *(85/85 across 4 suites, 2026-05-30.)*

---

## Close-out (2026-05-30)

**Opus close-gate: PASS.** All four executor-facing risks cleared (no mid-turn DB re-reads; inner-closure returns only; sink normalization unchanged; side-effect bookkeeping at sink intact).

**Files changed:**
- `backend/src/workers/instagram-dm-webhook-handler.ts` — 61 inline writes removed; `persistTurn` sink + DL-11 comments
- `backend/tests/unit/workers/webhook-worker-characterization.test.ts` — write-count tests + match-confirmation fix

**Verification:**
```bash
cd backend && npx tsc --noEmit
npm test -- dm-routing-golden webhook-worker-characterization ai-service
```

**Unblocks:** [rcp-02](./task-rcp-02-constitution-safety-gates.md), Phase 2 router extraction.

**Follow-up (Phase 2, not blocking):** ESLint/custom rule banning `updateConversationState` inside the decide-chain — structural enforcement when the stage router lands.

---

## Anti-goals

- ❌ Don't change branch *logic*, reply text, intent routing, or step transitions — this is a write-consolidation only.
- ❌ Don't touch the conflict-recovery `catch` block (`:3984`→`:4120`) — it's Phase 2's job to fold it into the shared path.
- ❌ Don't start extracting branches into separate functions yet — that's Phase 2 (rcp-02 lands the gate seam first).
- ❌ Don't change `updateConversationState`/`conversation-service.ts` semantics (still full-blob overwrite for now; the discriminated-union migration is Phase 4).
- ❌ Don't remove the legacy-slot normalize write (`:1495`) without proving it's covered by the sink on every path.

---

## Risks (executor-facing)

- **A branch that depends on its own mid-turn persisted read.** If any branch writes state and *later in the same turn* re-reads it from the DB (`getConversationState`), removing the inline write breaks it. Audit for `getConversationState` calls *after* the chain starts — there should be none in the happy path, but confirm.
- **Early termination paths.** Re-confirm no branch `return`s from the *handler* before `:3920` (the `:2077`/`:2119` returns are inner closures). If a future-looking branch does, it must keep an explicit `persistTurn(...)` before returning.
- **`stateToPersistRaw` step-normalization mismatch.** A branch that sets a terminal `step` but relies on a field that the `responded` normalization path drops. The characterization metadata snapshots (step 2) will catch this — do not skip them.
- **Side-effect writes masquerading as state writes.** Some `updateConversationState` sites also implicitly drive `lastPromptKind`/`bookingLinkSentAt` bookkeeping that the sink recomputes at `:3821`/`:3838`. Confirm the sink's recompute matches what the branch intended before deleting the branch write.
