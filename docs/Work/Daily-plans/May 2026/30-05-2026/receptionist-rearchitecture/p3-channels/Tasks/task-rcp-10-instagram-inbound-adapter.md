# rcp-10 · Instagram inbound parsing + tenant resolution behind the adapter

> **Phase 3, step 2** · follows the **[adapter-extraction playbook](./EXECUTION-ORDER-p3-receptionist-channels.md#adapter-extraction-playbook-shared-recipe--every-rcp-1012-follows-this)**. Move all Instagram-specific *inbound* logic out of the worker into `instagramChannelAdapter.parseInbound`, producing a normalized `InboundMessage`. **Move, don't rewrite.**

| **Size** | L | **Model** | Auto + **Opus close-gate** | **Wave** | 3 | **Depends on** | rcp-09 | **Blocks** | rcp-12 |

---

## Why Opus-gated

The inbound path contains the **sender ↔ page-id disambiguation** (`instagram-dm-webhook-handler.ts:287–350`) that decides *who the message is from* and *who we reply to*. A mistake here doesn't crash — it silently sends a patient's reply to the **wrong recipient** (a PHI/privacy incident) or makes the bot reply to itself. This is the highest-consequence relocation in Phase 3.

## What moves into `parseInbound`

Lift verbatim from the worker into `channels/instagram/parse-inbound.ts` (called by the adapter):

| Logic | Anchor | Note |
|---|---|---|
| `getInstagramPageIds` / `getInstagramPageId` | `:120, :287, :675` | page-id set + logging id |
| sender extraction + **page-id-as-sender disambiguation** | `:287–350` | the "DB stored page id by mistake" / decoded-candidate / fallback-sender logic — **lift exactly** |
| `getDoctorIdByPageIds` → `doctorId` | `:289, :615, :714` | tenant resolution |
| doctor token + stored page id resolution | (token/`doctorPageId` lookups) | populate `tenant.doctorToken`, `tenant.doctorPageId` |
| `isValidInstagramSenderId` guard | `:312` | |
| "senderId is page id → skip (can't reply to self)" | `:679–691` | → `{ skip, reason: 'sender_is_page' }` |
| "no page ids / no doctor" skips + fallback reply | `:696–733` | preserve the audit + fallback-reply best-effort exactly |
| non-text classification (image/sticker/reaction) | `:609–646` | carry as `text: null` + `attachments`; the **"text only" ack policy stays in the worker/engine** (it's a reply decision, not parsing) — just classify here |

Output: `InboundMessage { channel:'instagram', surface:'dm', provider, providerEventId: eventId, correlationId, tenant:{doctorId, doctorToken, pageIds, doctorPageId}, senderId, text, attachments?, webhookEntryId, raw: payload }` — or `{ skip, reason }`.

## What stays out of the adapter

- **Idempotency** (`markWebhookProcessed`, eventId dedupe) — channel-free, stays in the worker.
- **The non-text "text only" reply** and mid-collection suppression (`:609–646` *decision*) — that's a turn/engine decision; the adapter only reports `text===null` + attachments.
- Conversation lookup / state — engine concern.

## Acceptance gate

- [x] `instagramChannelAdapter.parseInbound` returns the normalized `InboundMessage` (or `{skip}`) and the worker consumes it; all listed logic removed from the worker body.
- [x] Sender/page-id disambiguation is byte-identical — verified by a dedicated unit test matrix in `tests/unit/channels/instagram/parse-inbound.test.ts` (sender=page-id, recipient-as-target, decoded candidate, conversation-API fallback id, invalid sender).
- [x] Every skip path (`sender_is_page`, `no_page_ids`, `no_doctor`) preserves its exact audit event + metadata + fallback-reply behavior.
- [x] `webhook-worker-characterization` byte-identical (replies, branches, audit, skips); `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't "clean up" the disambiguation heuristics — they encode real Instagram quirks (2018001, page-id-stored-as-sender). Relocate exactly; note anything that looks wrong rather than fixing it here.
- ❌ Don't move send logic (rcp-11) or the "text only" reply decision.
- ❌ Don't change idempotency ordering — `markWebhookProcessed` stays where it is relative to parse.

## Risks

- **Skip-vs-reply ordering.** Some skips currently happen *before* doctor resolution, others after; preserve order so the same events get marked processed / audited as today. Diff the audit-event stream per characterization fixture.
- **`raw` leakage.** `InboundMessage.raw` must stay adapter-only (used for send-time targeting). Assert the engine never reads `raw` (grep + a type comment).
- **Attachment shape drift.** Reuse the existing attachment typing; don't invent a new one that loses fields the "text only" ack relies on.
