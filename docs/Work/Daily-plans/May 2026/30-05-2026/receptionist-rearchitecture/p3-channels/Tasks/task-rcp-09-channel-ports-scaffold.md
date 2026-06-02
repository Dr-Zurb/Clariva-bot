# rcp-09 · Channel port interfaces + adapter registry (seam)

> **Phase 3, step 1** of [receptionist-rearchitecture](../plan-p3-receptionist-channels-batch.md) · order/playbook in [EXECUTION-ORDER-p3-receptionist-channels.md](./EXECUTION-ORDER-p3-receptionist-channels.md). Seam-first, like rcp-03: define the ports and a registry, wire them as a **pass-through** so nothing changes behavior yet. The later tasks fill the adapter in.

| **Size** | M | **Model** | Auto | **Wave** | 3 | **Depends on** | rcp-08 | **Blocks** | rcp-10, rcp-11, rcp-12, rcp-13 |

---

## Why first

Phase 3 only works if there is a single, typed boundary every channel implements. Landing the interfaces + registry first (with Instagram delegating to today's functions) lets rcp-10..12 move logic behind the boundary one slice at a time, each behind a green characterization suite.

## What to do

- **Types module** `channels/types.ts` (or `workers/channels/types.ts` to match the existing layout — pick one and note it): `ChannelId`, `Surface`, `InboundMessage`, `InboundAttachment`, `OutboundReply`, `SendResult`, `ChannelAdapter`, `ParseCtx`. Use the [sketch in the execution-order doc](./EXECUTION-ORDER-p3-receptionist-channels.md#target-port-interfaces-sketch--finalized-in-rcp-09) as the starting contract; reuse existing types (`WebhookProvider`, attachment shapes) rather than re-declaring.
- **Registry** `channels/registry.ts`: `registerChannelAdapter(adapter)` + `resolveChannelAdapter(provider, payload): ChannelAdapter | null`. Resolution = first adapter whose `matches(provider, payload)` is true.
- **Instagram adapter shell** `channels/instagram/index.ts` → `instagramChannelAdapter: ChannelAdapter`:
  - `matches` = `provider === 'instagram'`;
  - `surfaceOf` = `isInstagramCommentPayload(payload) ? 'comment' : 'dm'`;
  - `parseInbound` / `send` **throw `NotImplemented` for now** (or delegate trivially) — they are filled by rcp-10/11. Do **not** move logic in this task.
- **Wire the registry into `webhook-worker.ts` as a no-op pass-through**: resolve the adapter, then call `surfaceOf` to choose `processInstagramCommentWebhook` vs `processInstagramDmWebhook` exactly as today (`:177–191`). Behavior identical; the registry is just threaded through.
- **Tests** `tests/unit/channels/registry.test.ts`: resolution picks Instagram for an instagram payload, returns null for an unimplemented provider, and `surfaceOf` splits comment vs dm correctly.

## Acceptance gate

- [x] Port types + registry + Instagram adapter shell exist; `instagramChannelAdapter` registered at startup.
- [x] `webhook-worker.ts` routes through `resolveChannelAdapter(...).surfaceOf(...)`; the comment/dm dispatch is byte-identical to today.
- [x] No inbound/outbound logic moved yet (`parseInbound`/`send` are stubs).
- [x] `webhook-worker-characterization` green and unchanged; registry unit tests pass; `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't move page-id/sender/doctor resolution or send logic — that's rcp-10/11.
- ❌ Don't touch the engine, stages, or `DmTurnContext`.
- ❌ Don't add WhatsApp yet (rcp-13).
- ❌ Don't "design for the future" beyond the two channels + two surfaces actually in play — keep the interface minimal; extend when rcp-13 reveals a real need.

## Risks

- **Interface churn.** If `InboundMessage` misses a field the worker needs at send time (e.g. `webhookEntryId`, `doctorPageId`), rcp-10/11 stall. Mitigate: derive the field list directly from what `sendInstagramDmWithLocksAndFallback` and the DM context-build currently read (enumerated in the exec-order current-state table) before finalizing the type.
- **Module placement.** Match the existing `workers/dm/**` convention; if adapters live under `workers/channels/**`, keep engine imports pointing at `workers/dm/**` so no circular dep forms.
