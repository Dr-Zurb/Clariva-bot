# rcp-12 · Channel-free `runConversationTurn` + thin worker

> **Phase 3, step 4 (capstone)** · follows the **[adapter-extraction playbook](./EXECUTION-ORDER-p3-receptionist-channels.md#adapter-extraction-playbook-shared-recipe--every-rcp-1012-follows-this)**. With inbound (rcp-10) and outbound (rcp-11) behind the adapter, collapse the worker into thin glue and put the turn pipeline in a channel-free entry that takes an `InboundMessage`. This is the task that makes "the engine takes normalized input" literally true.

| **Size** | L | **Model** | Auto + **Opus close-gate** | **Wave** | 3 | **Depends on** | rcp-10, rcp-11 | **Blocks** | rcp-13 |

---

## Why Opus-gated

This touches **every DM turn**: it relocates the `DmTurnContext` build (`:956`), the understand step, the rcp-01 persist sink, and folds the conflict-recovery turn (`:1284–1330`) into one path. A regression here affects all conversations, not one branch.

## What to do

- **New module** `dm/run-conversation-turn.ts` (channel-free; imports the engine, never `instagram-service`):

```ts
export async function runConversationTurn(
  inbound: InboundMessage,
  deps: ConversationTurnDeps,           // db/services injected; no channel I/O
): Promise<{ reply: OutboundReply; result: DmTurnResult } | { skip: true; reason: string }>
```

  It owns, lifted verbatim from the worker: conversation/state load → **understand** (intent classify + language) → build the engine `DmTurnContext` (the `:956` block, incl. the `runGenerateResponse*` / `buildAiContextForResponse` closures and `feeComposerOpts`) → `executeDmTurn(ctx)` → **persist once** (rcp-01 sink) → return `{ reply: { text: result.reply }, result }`.

- **Conflict recovery folds in:** call `runConversationTurn(inbound, { ..., conflictRecovery: true })`, which passes `{ conflictRecovery: true }` to `executeDmTurn`. Delete the duplicated conflict context-build at `:1284`. One pipeline, two entry flags.

- **Thin worker** — `instagram-dm-webhook-handler.ts` (or a new generic `conversation-webhook-worker.ts`) becomes:

```ts
markWebhookProcessed guard / idempotency
const inbound = await adapter.parseInbound(payload, ctx);
if ('skip' in inbound) return; // adapter already audited
const out = await runConversationTurn(inbound, deps);
if ('skip' in out) return;
await adapter.send(out.reply, inbound, { context: 'default' });
```

- **Disambiguate the duplicate names** (exec-order naming hazard): rename `utils/dm-turn-context.ts`'s `buildDmTurnContext` / its `DmTurnContext` to `buildDmTurnSignals` / `DmTurnSignals` (it only carries `feeCatalogMatchText` + `recentMedicalDeflection`). The engine context type stays `DmTurnContext` in `dm/stage-router.ts`.
- **Optional cleanup (deferred from rcp-11):** hoist `markWebhookProcessed` out of `sendInstagramDmWithLocksAndFallback` into the worker if it falls out cleanly; if it risks changing skip-path semantics, leave it and note why.

## Acceptance gate

- [x] `runConversationTurn` is channel-free (grep: no `instagram-service`/adapter import); engine + stages still pure.
- [x] Worker body is the 4-line glue shape; the `:1284` conflict context-build is deleted; conflict recovery runs through `runConversationTurn`.
- [x] The two `DmTurnContext`/`buildDmTurnContext` names are disambiguated; no remaining ambiguous import.
- [x] Persist-once still fires exactly once per turn (incl. recovery); `dm-routing-golden` + `webhook-worker-characterization` byte-identical across the full corpus.
- [x] `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't change intent classification, context assembly, or the persist sink — relocate them.
- ❌ Don't alter the conflict-recovery reply/branch (`conflict_recovery_ai`) — only its host pipeline.
- ❌ Don't introduce a DI framework; plain function params for `deps`.

## Risks

- **Closure capture in the context build.** `runGenerateResponse*` and `buildAiContextForResponse` close over worker locals (doctor token, correlationId, conversation). When moved into `runConversationTurn`, they must close over the same values sourced from `inbound`/`deps` — a dropped capture silently degrades AI replies. Pin with the AI-open and booking golden fixtures.
- **Persist/idempotency ordering.** The sink and `markWebhookProcessed` have a specific order relative to send; preserve it. The conflict path marks processed inside send (rcp-11) — ensure folding recovery doesn't double-mark.
- **Skip propagation.** Adapter skips (rcp-10) and turn skips must not double-audit; the worker should trust that whoever returns `{skip}` already logged.
