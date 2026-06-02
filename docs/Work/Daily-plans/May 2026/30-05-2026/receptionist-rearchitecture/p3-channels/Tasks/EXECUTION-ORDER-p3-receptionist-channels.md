# Execution order — Phase 3: channel-agnostic core + adapters

> Wave/lane matrix for **Phase 3** of [receptionist-rearchitecture](../plan-p3-receptionist-channels-batch.md). Phase 2 is done — the decide-engine (`executeDmTurn` + channel-free `DmTurnContext`/`DmTurnResult`) already does **zero I/O**. Phase 3 formalizes the **ports** around it so a second channel (WhatsApp) plugs in without touching the brain. Like Phase 2, this is a **strangler-fig** migration: `rcp-09` lays the seam, `rcp-10/11` pull inbound/outbound behind the Instagram adapter, `rcp-12` makes the worker thin, `rcp-13` proves the boundary with a WhatsApp stub.

---

## Where Phase 2 left us (current state — verified in code)

| Concern | Today | Phase 3 target |
|---|---|---|
| **Decide engine** | `executeDmTurn(DmTurnContext) → DmTurnResult` in `dm/handle-turn.ts` — pure, no I/O ✅ | unchanged; just fed normalized input |
| **Stages / routing** | `resolveStage` + `STAGE_ROUTER` in `dm/stage-router.ts` — channel-free ✅ | unchanged |
| **Inbound parsing** | inline in `instagram-dm-webhook-handler.ts` (~1,425 ln): `getInstagramPageIds`, sender↔page-id disambiguation (`:287–350`), `getDoctorIdByPageIds`, non-text acks | `InstagramChannelAdapter.parseInbound() → InboundMessage` |
| **Outbound send** | `sendInstagramDmWithLocksAndFallback` in `webhook-dm-send.ts` (send + send-lock + reply-throttle + 2018001 fallback + idempotency) | `InstagramChannelAdapter.send(OutboundReply) → SendResult` |
| **Context assembly** | worker builds the engine `DmTurnContext` inline (`:956`); `executeDmTurn` called at `:1001`; send at `:1121`; conflict-recovery turn + send at `:1284`/`:1354` | `runConversationTurn(InboundMessage) → { reply: OutboundReply }` (channel-free) |
| **Dispatch** | `webhook-worker.ts:177–191` → provider guard, then `isInstagramCommentPayload` → comment handler, else DM handler | `resolveChannelAdapter(provider, payload)` registry |
| **Comments** | separate **templated** pipeline (`instagram-comment-webhook-handler.ts` + `comment-lead-service.ts`) — does **not** use the engine | modeled as `surface: 'comment'`; pipeline left intact (see rcp-13) |

> **Naming hazard:** there are **two** `DmTurnContext` types — the rich engine context in `dm/stage-router.ts`, and a narrower derived-signals helper (`feeCatalogMatchText` + `recentMedicalDeflection`) built by `buildDmTurnContext` in `utils/dm-turn-context.ts`. rcp-12 must disambiguate them (rename the util to e.g. `buildDmTurnSignals` / `DmTurnSignals`).

---

## Target port interfaces (sketch — finalized in rcp-09)

```ts
type ChannelId = 'instagram' | 'whatsapp';
type Surface   = 'dm' | 'comment';

interface InboundMessage {
  channel: ChannelId;
  surface: Surface;
  provider: WebhookProvider;            // existing type
  providerEventId: string;              // idempotency key (today's eventId)
  correlationId: string;
  tenant: {                             // resolved by the adapter
    doctorId: string;
    doctorToken: string;
    pageIds: string[];
    doctorPageId: string | null;
  };
  senderId: string;                     // normalized; never a page id
  text: string | null;                  // null = non-text (sticker/image/reaction)
  attachments?: InboundAttachment[];
  webhookEntryId: string | undefined;   // send-time targeting / 2018001 fallback
  raw: unknown;                         // provider payload, for adapter-only use
}

interface OutboundReply { text: string; }

type SendResult =
  | { status: 'sent'; usedRecipientFallback: boolean }
  | { status: 'throttle_skipped'; reason: 'send_lock' | 'reply_throttle' }
  | { status: 'skipped'; reason: string };

interface ChannelAdapter {
  channel: ChannelId;
  matches(provider: WebhookProvider, payload: unknown): boolean;   // registry/dispatch
  surfaceOf(payload: unknown): Surface;
  parseInbound(payload: unknown, ctx: ParseCtx): Promise<InboundMessage | { skip: true; reason: string }>;
  send(reply: OutboundReply, inbound: InboundMessage): Promise<SendResult>;
}
```

`runConversationTurn(inbound, deps)` builds the engine `DmTurnContext` from an `InboundMessage` and calls `executeDmTurn`; conflict-recovery flows through it. The worker becomes: `idempotency → adapter.parseInbound → runConversationTurn → adapter.send`.

---

## Wave matrix

| Wave | Task | Title | Size | Model | Depends on |
|---|---|---|---|---|---|
| 3 | [rcp-09](./task-rcp-09-channel-ports-scaffold.md) | Channel port interfaces + adapter registry (seam) | M | Auto | rcp-08 |
| 3 | [rcp-10](./task-rcp-10-instagram-inbound-adapter.md) | Instagram **inbound** parsing + tenant resolution behind adapter | L | Auto + **Opus gate** (wrong-recipient/PHI surface) | rcp-09 |
| 3 | [rcp-11](./task-rcp-11-instagram-outbound-adapter.md) | Instagram **outbound** send behind adapter | M | Auto + **Opus gate** (dup/dropped-send surface) | rcp-09 |
| 3 | [rcp-12](./task-rcp-12-channel-free-engine-entry.md) | Channel-free `runConversationTurn` + thin worker + name disambiguation | L | Auto + **Opus gate** (touches every turn) | rcp-10, rcp-11 |
| 3 | [rcp-13](./task-rcp-13-whatsapp-adapter-stub.md) | WhatsApp adapter stub (prove the seam) + comment-as-surface map | M | Auto | rcp-12 |

**Order:** rcp-09 → rcp-10 → rcp-11 → rcp-12 → rcp-13. rcp-10/11 both edit the worker; sequence them (don't parallelize) to avoid merge churn.

---

## Adapter-extraction playbook (shared recipe — every rcp-10..12 follows this)

1. **Move, don't rewrite.** Lift the existing Instagram functions verbatim into adapter methods; keep every log line, audit event, lock key, throttle key, and fallback branch byte-identical. This phase is pure relocation behind an interface.
2. **Adapter owns provider specifics only.** Page-id resolution, sender↔page disambiguation, 2018001 recipient fallback, `sendInstagramMessage`, comment-vs-dm payload shape → adapter. Idempotency (`markWebhookProcessed`), correlation ids, and conversation state → stay channel-free (worker/engine).
3. **Engine stays pure.** `executeDmTurn` and the stages never import `instagram-service` or the adapter. `InboundMessage`/`OutboundReply` carry everything the engine needs.
4. **Gate:** `webhook-worker-characterization` + `dm-routing-golden` **byte-identical** before/after (same reply, branch, persisted metadata, audit events, throttle/skip outcomes). Add an adapter-level unit test per method.
5. **Type-check:** `npx tsc --noEmit` clean; no `instagram` import survives outside `channels/instagram/**` and the worker entry.

---

## Definition of done for Phase 3

- `webhook-worker.ts` dispatches via `resolveChannelAdapter(provider, payload)`; no inline `isInstagramCommentPayload`/provider branching beyond the registry.
- `instagram-dm-webhook-handler.ts` is thin glue (idempotency → parse → run → send), or is replaced by a generic worker + `channels/instagram/` adapter module.
- Engine + stages have **zero** Instagram imports (grep-verified).
- A `WhatsAppChannelAdapter` stub compiles against the same `ChannelAdapter` interface and is wired into the registry behind a flag (no live send).
- Comments are tagged `surface: 'comment'`; the templated pipeline is unchanged; the "comment → engine conversation" path is documented as a Phase 3 follow-on (not built here).
- Golden + characterization unchanged across the whole phase.

---

## Comment → engine conversation (future — not built in Phase 3)

Today, high-intent Instagram comments use a **templated** pipeline (`processInstagramCommentWebhook` + `comment-lead-service`) tagged at dispatch as `surface: 'comment'` via `instagramChannelAdapter.surfaceOf`. The first DM reply is built by `buildCommentDMMessage`, not `runConversationTurn`.

**Future seam:** route the first comment-triggered DM through `runConversationTurn` with `surface: 'comment'` → `dm` hand-off so the engine owns the thread from the first reply onward.

**Open questions (record, don't solve here):**

- Public reply vs DM duality — Meta requires a public comment ack for some flows; which messages stay templated vs engine-composed?
- Lead creation timing — `comment-lead-service` creates/links leads before DM send; when does that move relative to `parseInbound`?
- Idempotency — comment `comment_id` vs DM `mid` as `providerEventId` when the hand-off spans two surfaces.

---

## WhatsApp completion checklist (rcp-13 stub → live)

The `whatsappChannelAdapter` stub compiles against `ChannelAdapter` with `WHATSAPP_ENABLED` (default off). To go live:

| Item | Status in stub | Notes |
|---|---|---|
| **Env flag** | `WHATSAPP_ENABLED=true` in dev only | Never enable in prod until worker route exists |
| **Tenant lookup** | `resolveDoctorByWhatsappPhoneId` throws | Map `metadata.phone_number_id` → doctor + token (new table or extend connect service) |
| **Inbound parse** | Text messages mapped | Add non-text (`image`, `audio`, `button`) → `attachments[]`; status webhooks → skip |
| **Outbound send** | `sendWhatsappOutbound` throws | WhatsApp Cloud API `POST /{phone-number-id}/messages`; no 2018001 fallback |
| **Idempotency key** | `messages[0].id` (wamid) | Already extracted; wire to `markWebhookProcessed` |
| **Lock/throttle keys** | Not implemented | Use `(phone_number_id, wa_id, eventId)` — **do not reuse Instagram pageId keys** |
| **Worker route** | DM still goes to `processInstagramDmWebhook` | Add channel-agnostic glue: `parseInbound → runConversationTurn → adapter.send` for `channel !== 'instagram'` |
| **InboundMessage.tenant** | Reuses `pageIds` / `doctorPageId` slots | Consider `phoneNumberId` field on tenant (Instagram `pageIds` naming is leaky — generalize in small rcp-09 follow-up if needed) |
| **Creds** | None stored | `WHATSAPP_ACCESS_TOKEN`, webhook verify token, per-doctor phone_number_id linkage |
