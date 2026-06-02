# rcp-19 · Flip on-disk shape, backfill, retire the flat-read fallback (Phase 4 closer)

> **Phase 4, step 6 (closer)** of [receptionist-rearchitecture](../plan-p4-receptionist-state-batch.md) · order in [EXECUTION-ORDER-p4-receptionist-state.md](./EXECUTION-ORDER-p4-receptionist-state.md). The only task that changes **persisted data**: flip the writer to emit the nested shape, converge existing rows, then remove the legacy-flat read fallback and tighten the discriminant to a closed union.

| **Size** | M | **Model** | **Auto** (optional **1 Opus diff-skim** — touches persisted data) | **Wave** | 4 | **Depends on** | rcp-15, rcp-16, rcp-17, rcp-18 | **Blocks** | — (Phase 4 close) | **Status** | ✅ Done |

---

## Why this is its own PR

rcp-14..18 kept on-disk **legacy-flat** so partial deploys and non-DM readers stayed safe. Flipping to nested-on-disk is irreversible-ish and touches every in-flight conversation, so it gets one focused, well-gated PR — and it's the single place the efficiency guide's "new migration" hard-rule applies (review the backfill script carefully).

## What to do

1. **Flip the writer.** `writeConversationState` stops flattening and emits the **nested** shape to `metadata`. (Reader already accepts both.)
2. **Converge existing rows** — pick one, document the choice:
   - **Upgrade-on-write (preferred, zero-migration):** every write now persists nested; rows converge as conversations are touched. Keep the flat-read fallback through a rollout window (e.g. > max conversation idle TTL), then do step 4.
   - **Backfill migration:** a one-time script that reads each `conversations.metadata`, runs it through `readConversationState` → `writeConversationState(nested)`, and writes back. Idempotent; dry-run with a count first. **This is the hard-rule case — review the script (or Opus it).**
3. **Tighten the discriminant.** Replace `step?: ConversationStage | string` with the closed `ConversationStage` union; map the deprecated `confirming_slot` / `selecting_slot` → `awaiting_slot_selection` in the reader. Optionally lift the top level toward a discriminated union / add invariant assertions (e.g. a `cancel` namespace can't coexist with `booking` mid-collection) — only where it doesn't force broad re-narrowing.
4. **Retire the flat-read fallback** in `readConversationState` *after* convergence is confirmed. From here, only the nested shape is read.
5. **Docs:** update `types/conversation.ts` header + any state reference doc to describe the nested shape as canonical.

## Acceptance gate

- [x] Writer emits nested; reader handles nested (and flat until step 4 removes it).
- [x] Convergence path chosen + verified: **upgrade-on-write** + idempotent backfill script (`backend/scripts/backfill-conversation-metadata-nested.ts`, `--dry-run`). Flat-read lift retained for unmigrated rows until post-backfill deploy (step 4 deferred per anti-goal).
- [x] A **migration/load test** runs every legacy fixture (rcp-14..18 corpus) + synthetic real-shaped rows through read→write→read and asserts correctness + stability.
- [x] `ConversationStage` is a closed union; deprecated step values mapped, not dropped; cancel/reschedule steps included; `normalizePersistedStep` folds unknown strings to `responded`.
- [x] Full DM golden + characterization byte-identical; non-DM writer tests (from rcp-16/17/18) green; `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't flip the writer and remove the flat-read fallback in the **same deploy** — converge first, remove fallback after.
- ❌ Don't drop unknown/legacy step values — map them; a dropped value strands an in-flight conversation.
- ❌ Don't over-build the DU: invariant assertions where cheap, not a full re-narrowing of every stage.

## Risks

- **In-flight data corruption (the one real hazard in Phase 4).** A wrong backfill or premature fallback removal breaks live conversations mid-booking. Mitigation: idempotent + dry-run + the load test over real-shaped rows; stage the fallback removal a full rollout window later.
- **Non-DM readers during rollout.** Once on-disk is nested, `abandoned-booking-reminder` / `service-staff-review-service` / `slot-selection` / `booking-controller` must already be on `readConversationState` (rcp-14..18). Re-grep for any straggler raw cast **before** flipping the writer.
- **Closed-union surprise.** Tightening `step` can surface a value used in production that wasn't in `PatientCollectionStep`. Log-scan for distinct `metadata->>step` values (or sample the table) before closing the union; add any missing value to the mapping.

## Implementation notes (2026-05-30)

- **Writer:** `writeConversationState` emits nested namespaces; strips legacy flat keys.
- **Reader:** still lifts legacy-flat keys into namespaces; normalizes `step` via `normalizePersistedStep` (deprecated slot aliases + unknown → `responded`).
- **Backfill:** `npx ts-node backend/scripts/backfill-conversation-metadata-nested.ts --dry-run`
- **Follow-up deploy:** remove flat-read lift after backfill + idle TTL window.
