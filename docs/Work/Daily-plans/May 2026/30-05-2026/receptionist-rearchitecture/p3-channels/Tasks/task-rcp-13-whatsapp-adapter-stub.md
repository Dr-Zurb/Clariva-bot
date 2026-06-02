# rcp-13 · WhatsApp adapter stub (prove the seam) + comment-as-surface map

> **Phase 3, step 5 (proof)** of [receptionist-rearchitecture](../plan-p3-receptionist-channels-batch.md) · order in [EXECUTION-ORDER-p3-receptionist-channels.md](./EXECUTION-ORDER-p3-receptionist-channels.md). The boundary is only "done" when a second channel can attach to it. This task adds a WhatsApp adapter **skeleton** that compiles against the same `ChannelAdapter` interface and routes through the same engine — without live sending — and formally tags the comment pipeline as `surface: 'comment'`.

| **Size** | M | **Model** | Auto | **Wave** | 3 | **Depends on** | rcp-12 | **Blocks** | — (Phase 3 close) |

---

## Why this exists

Phase 3's business case is "**unblock WhatsApp without re-implementing the brain**." A stub that satisfies the interface end-to-end is the cheapest possible proof that the abstraction holds — and it leaves a precise checklist for whoever wires real WhatsApp creds later. It also surfaces any leaky Instagram assumption that slipped through rcp-09..12.

## What to do

### A. WhatsApp adapter skeleton
- **`channels/whatsapp/index.ts`** → `whatsappChannelAdapter: ChannelAdapter`:
  - `channel: 'whatsapp'`, `matches = provider === 'whatsapp'`, `surfaceOf = () => 'dm'`;
  - `parseInbound(payload)` → map the WhatsApp Cloud API message shape to `InboundMessage` (sender = `wa_id`, text = `messages[0].text.body`, `providerEventId` = message id, tenant resolved from phone-number-id). Where a real lookup is needed (tenant/doctor by phone-number-id), call a clearly-marked `TODO: resolveDoctorByWhatsappPhoneId` that throws `NotImplemented`;
  - `send(reply, inbound)` → `TODO: WhatsApp Cloud send` that throws `NotImplemented` (no live HTTP).
- **Register behind a flag:** `if (env.WHATSAPP_ENABLED) registerChannelAdapter(whatsappChannelAdapter)`. Default off, so production dispatch is unchanged.
- **Remove the dead provider guard** path only if safe: `webhook-worker.ts:177` currently early-returns for non-instagram providers. Keep that as the fallback when no adapter matches (registry returns null) — i.e. behavior identical when the flag is off.
- **Compile-proof test** `tests/unit/channels/whatsapp/parse-inbound.test.ts`: a sample WhatsApp text webhook parses into a well-formed `InboundMessage` (text/sender/eventId correct); `send` throws `NotImplemented`. This proves the type contract without network.

### B. Comment-as-surface map (no rewrite)
- Tag the existing comment pipeline as `surface: 'comment'` at the dispatch point so the registry/worker model is uniform: `resolveChannelAdapter(...).surfaceOf(payload) === 'comment'` → `processInstagramCommentWebhook` (unchanged internals).
- **Document** (a short section in the exec-order doc or a follow-on task stub) the future "comment → engine conversation" path: today a high-intent comment sends a *templated* DM (`buildCommentDMMessage`); the future is to let that first reply enter `runConversationTurn` as `surface:'comment' → dm` hand-off. **Do not build this now** — just record the seam and the open questions (public-reply vs DM duality, lead creation timing).

## Acceptance gate

- [x] `whatsappChannelAdapter` implements `ChannelAdapter`, registered only when `WHATSAPP_ENABLED`; `parseInbound` maps a real WhatsApp text payload; `send`/tenant-lookup throw `NotImplemented` with clear messages.
- [x] With the flag **off**, `webhook-worker-characterization` is byte-identical (production behavior unchanged).
- [x] Comment dispatch goes through `surfaceOf`; the comment pipeline internals are untouched and its tests still pass.
- [x] A documented checklist exists for completing real WhatsApp (creds, tenant-by-phone-id, Cloud send, idempotency key, throttle keys).
- [x] `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't implement live WhatsApp send or store WhatsApp creds — stub only.
- ❌ Don't rewrite or "engine-ify" the comment pipeline — only tag the surface.
- ❌ Don't enable the flag in any non-dev environment.
- ❌ Don't add channels beyond WhatsApp speculatively.

## Risks

- **Leaky abstraction discovery.** If `parseInbound`/`send` can't be satisfied for WhatsApp without Instagram-shaped fields (e.g. `pageIds`, `doctorPageId`, 2018001 `webhookEntryId`), that's a real finding — generalize `InboundMessage.tenant`/targeting (small follow-up to rcp-09 types) rather than smuggling Instagram concepts into the WhatsApp stub. Record it; it's the whole point of the proof.
- **Throttle/lock keys.** WhatsApp will need its own lock/throttle keying (phone-number-id, not pageId); note this in the checklist so the real impl doesn't reuse Instagram keys.
