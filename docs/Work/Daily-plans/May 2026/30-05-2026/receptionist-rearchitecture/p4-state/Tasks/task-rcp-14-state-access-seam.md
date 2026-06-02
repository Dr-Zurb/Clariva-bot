# rcp-14 · State access seam + compat reader + target types (scaffold)

> **Phase 4, step 1** of [receptionist-rearchitecture](../plan-p4-receptionist-state-batch.md) · order/playbook in [EXECUTION-ORDER-p4-receptionist-state.md](./EXECUTION-ORDER-p4-receptionist-state.md). Seam-first, like rcp-03/rcp-09: route **all** state I/O through one reader/writer and stand up the target types — as an **identity pass-through** so behavior is unchanged. Later tasks change the internal shape behind this seam.

| **Size** | M | **Model** | **Composer / Auto** | **Wave** | 4 | **Depends on** | Phase 3 | **Blocks** | rcp-15..19 |

---

## Why first

Every later task needs a single place to (a) accept legacy-flat rows on read and (b) flatten back to legacy on write. Landing that seam now — over the *current* flat shape, doing nothing — lets rcp-15..18 migrate one cluster at a time without touching the ~18 write sites or the scattered read casts again.

## What to do

- **Reader/writer module** `types/conversation-state-io.ts` (or `services/conversation-state-io.ts`):
  - `readConversationState(metadata: unknown): ConversationState` — today returns `metadata` as-is (typed); the seam where legacy→nested mapping is added later.
  - `writeConversationState(state: ConversationState): Record<string, unknown>` — today returns `{ ...state }`; the seam where nested→legacy-flat serialization is added later.
- **Route all I/O through it:**
  - `conversation-service.ts:282` (`getConversationState`) → return `readConversationState(meta)`.
  - `updateConversationState` (`:303`) → `metadata = { ...writeConversationState(state), updatedAt: now }`.
  - The direct casts in `abandoned-booking-reminder.ts:50` and `service-staff-review-service.ts:337` → `readConversationState(row.metadata)`.
  - Grep for any other `as ConversationState` / `.metadata` hydration and route it too.
- **Target type skeleton** in `types/conversation.ts`: declare the empty sub-state interfaces (`BookingState`, `ServiceMatchState`, `CancelState`, `RescheduleState`, `RecordingConsentState`, `TriageState`, `ClarificationState`, `BookingForOtherState`) and the `ConversationStage` discriminant **as `type` aliases only** — do **not** move any field yet. This gives later tasks a stable import target.
- **Old-shape fixture corpus** `tests/fixtures/conversation-state/legacy/*.json`: capture one real flat `metadata` blob per flow (cancel, reschedule, mid-collection, consent, recording-consent, staff-review-pending, fee-triage-idle, clarification). Add `conversation-state-io.test.ts` asserting `readConversationState(fixture)` round-trips identically today (identity), establishing the regression baseline rcp-15..19 build on.

## Acceptance gate

- [x] `readConversationState`/`writeConversationState` exist and are the **only** path metadata is hydrated/serialized (grep: no remaining raw `metadata as ConversationState`).
- [x] Both are identity today; zero behavior change. `dm-routing-golden` + `webhook-worker-characterization` byte-identical.
- [x] Sub-state type aliases + `ConversationStage` declared but unused; no field moved.
- [x] Old-shape fixture corpus committed; round-trip test green. `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't move any field into a namespace yet (rcp-15..18).
- ❌ Don't change the `step` typing yet (rcp-18).
- ❌ Don't change on-disk format (rcp-19).

## Risks

- **Missed read site.** If a reader bypasses `readConversationState`, it'll see the new nested shape later and break. The grep for `as ConversationState` + `.metadata` in this task is the safeguard — enumerate every site now, including non-DM services and any cron/worker.
- **`updatedAt` placement.** Keep `updatedAt` stamped in `updateConversationState` exactly as today; don't let the serializer drop or double-stamp it.
