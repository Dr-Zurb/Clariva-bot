# rcp-11 · Instagram outbound send behind the adapter

> **Phase 3, step 3** · follows the **[adapter-extraction playbook](./EXECUTION-ORDER-p3-receptionist-channels.md#adapter-extraction-playbook-shared-recipe--every-rcp-1012-follows-this)**. Wrap the already-encapsulated `sendInstagramDmWithLocksAndFallback` as `instagramChannelAdapter.send(OutboundReply, inbound) → SendResult`. The hard part (the send wrapper) already exists — this is mostly an interface fit + call-site swap.

| **Size** | M | **Model** | Auto + **Opus close-gate** | **Wave** | 3 | **Depends on** | rcp-09 | **Blocks** | rcp-12 |

---

## Why Opus-gated

Send carries the **send-lock + reply-throttle + 2018001 recipient fallback** (`webhook-dm-send.ts`). Breaking it produces either a **duplicate reply** (lock bypassed) or a **dropped reply** (throttle/fallback mis-evaluated) — both user-visible and hard to catch in review. Behavior must stay byte-identical.

## What to do

- **`channels/instagram/send.ts`**: `instagramChannelAdapter.send(reply: OutboundReply, inbound: InboundMessage, opts: { context: 'default' | 'conflict_recovery' }) → SendResult`. Internally calls the existing `sendInstagramDmWithLocksAndFallback`, mapping fields from `inbound`:
  - `pageId = inbound.tenant.pageIds[0] ?? <logging page id>` (preserve the exact `pageIds[0] ?? getInstagramPageId(...)` fallback at `:1116`/`:1352`);
  - `senderId, doctorToken, doctorId, correlationId, eventId = providerEventId, provider, webhookEntryId, doctorPageId, pageIds` — all from `inbound`/`tenant`;
  - `replyText = reply.text`; `context` from `opts`.
- **Map `SendInstagramDmWithLocksResult` → `SendResult`** (`sent` / `throttle_skipped`) — identical variants, just the port's type.
- **Swap both call sites** in the worker (`:1121` main, `:1354` conflict recovery) to `adapter.send(reply, inbound, { context })`.
- **Tests** `tests/unit/channels/instagram/send.test.ts`: sent, send-lock skip, reply-throttle skip, NotFound→fallback-id success, fallback-id-is-page-id rejection — mirroring the branches in `sendInstagramDmWithLocksAndFallback`.

## Layering note (call out, don't silently change)

`sendInstagramDmWithLocksAndFallback` also calls `markWebhookProcessed` + `logAuditEvent` on throttle-skip — i.e. it mixes channel send with channel-free idempotency/audit. **Keep it inside the adapter for now** (behavior-preserving). Add a one-line note that hoisting `markWebhookProcessed` to the worker is a candidate cleanup for rcp-12, *not* this task.

## Acceptance gate

- [x] Both send call sites go through `instagramChannelAdapter.send`; `sendInstagramDmWithLocksAndFallback` is called only from the adapter (grep-verified).
- [x] `SendResult` mapping covers every branch of the underlying result; `usedRecipientFallback` preserved.
- [x] Lock key (`pageId, senderId, eventId`) and throttle key (`pageId, senderId`) unchanged; `context: 'conflict_recovery'` still produces the conflict-recovery logs/metrics.
- [x] `webhook-worker-characterization` byte-identical (sent vs skipped outcomes, audit, metrics); adapter unit tests pass; `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't refactor the throttle/lock/fallback internals — relocate the call, not the logic.
- ❌ Don't unify the conflict-recovery path here (that's rcp-12) — just thread `context` through.
- ❌ Don't hoist `markWebhookProcessed` yet (note it; defer to rcp-12).

## Risks

- **`pageId` fallback subtlety.** `pageIds[0] ?? getInstagramPageId(payload)` can differ from `tenant.doctorPageId`; the send wrapper uses `pageId` for lock/throttle keys and `doctorPageId` for the 2018001 mismatch check. Map **both** independently from `inbound` — collapsing them changes lock keys and breaks throttle dedupe.
- **Conflict-recovery context.** The recovery send must still emit `logWebhookConflictRecovery`; verify via the conflict-recovery characterization fixture.
