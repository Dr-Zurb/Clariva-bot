# Receptionist re-architecture — program charter — 30 May 2026

> **Program charter — the canonical north star** for the Clariva receptionist bot: shared mental model, frozen decision lock (DL-1..DL-12), target architecture, and the multi-phase migration. **Per-phase batch plans + tasks live in [`p0-compliance/`](./p0-compliance/) … [`p6-identity/`](./p6-identity/)** — see [`README.md`](./README.md). This doc is the decision lock + phase ladder; each phase folder owns execution.
>
> **Source:** the alignment conversation of 2026-05-30 (review of `instagram-dm-webhook-handler.ts` + `ai-service.ts`). This plan is the source of record for "what the receptionist *is* and how it should be built." Phases 0–4 are shipped; Phases 5–6 are fully spec'd.
>
> **Rules of engagement:** [CODE_CHANGE_RULES.md](../../../../process/CODE_CHANGE_RULES.md). **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). One PR per task; every structural task is guarded by the existing golden-routing corpus + characterization tests (no behavior change unless the task says so).
>
> **Related / predecessor docs:**
> - [AI_BOT_BUILDING_PHILOSOPHY.md](../../../../../Reference/product/receptionist-bot/AI_BOT_BUILDING_PHILOSOPHY.md) — LLM-first, context-before-keywords, deterministic facts, minimal regex sprawl. **This charter supersedes nothing in it; it makes it executable.**
> - [BOT_PHILOSOPHY_ELITE_AUDIT_2026.md](../../../../../task-management/BOT_PHILOSOPHY_ELITE_AUDIT_2026.md) — prior self-audit that already named the "ever-growing `if` chains" problem.
> - [RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md](../../../../../Reference/product/receptionist-bot/RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md) — the current (implicit) branch order; Phase 2 turns this into code.
> - [AI_RECEPTIONIST_PLAN.md](../../../../../task-management/AI_RECEPTIONIST_PLAN.md) — the original AI-first vision (2026-03); this plan continues it structurally.

---

## 1. The vision (carries across all phases)

> **An always-on clinical front desk that lives in a doctor's DMs and comments, turns an inbound stranger into either a correctly-booked, paid appointment or a safe, respectful handoff — without ever diagnosing, inventing a fact, or burning the patient's trust.**

**Anchor metaphor:** a world-class clinic **receptionist + triage nurse — never the doctor**. It greets warmly in the patient's own language, figures out *why* they're reaching out, tells them **true** things about the clinic (hours, fees, location), books them in, takes payment — and knows the hard edges of its role: never diagnoses, never guesses about money, and taps a human the moment something is clinically ambiguous or someone may be in danger.

> Design heuristic for every future decision: **"What would an excellent human receptionist do here?"**

### The funnel (this *is* the product, and should *be* the code)

```text
Capture ─▶ Understand ─▶ Triage ─▶ Match ─▶ Collect+Consent ─▶ Convert ─▶ Recover/Retain
 (DM /      (intent +    (reason-  (catalog   (PHI fields,        (slot →    (reminders,
 high-intent language)    first)    service +  data consent +      payment →  status,
 comment →                          staff      recording consent)  confirmed) reschedule)
 DM)                                 review if
                                     ambiguous)
                          └────────────────────── Handoff ──────────────────────┘
                              (emergency · revoke · paused · staff review)
```

---

## 2. Decision lock (frozen for the whole vision)

Negotiated and agreed in the 2026-05-30 alignment conversation. Re-opening any of these belongs in a **new** plan doc, not a drive-by change.

**DL-1 — Identity: clinical receptionist + triage nurse, never the doctor.** The bot conducts the conversation and the logistics. It never performs clinical reasoning, diagnosis, or medical advice.

**DL-2 — The constitution (higher always wins):**
> **Safety → Privacy/Consent → Truthful facts → Helpfulness → Conversion.**
Conversion is **last on purpose**. It is a *byproduct of trust*, never a goal the bot pushes for directly. Any time two goals conflict, the higher-ranked one wins — no exceptions. **This ordering is the tie-breaker for every future "should the bot do X?" question.**

**DL-3 — Two first-class wins (measure both):**
1. **North star:** an *attended* appointment (booked-and-paid is the day-to-day leading indicator).
2. **Equal-class win:** a *safe, clean handoff* — lead captured, doctor notified, patient treated well.
A safe non-conversion is a success, not a failure. This is what stops us optimizing the bot into being pushy.

**DL-4 — Deterministic facts; the LLM only supplies tone.** Money (₹), booking/reschedule URLs, hours, address, cancellation policy, and safety copy come from code/DB (`DoctorContext`, `dm-reply-composer`, `resolveSafetyMessage`). The model never invents or restates a fact it wasn't given. (Already the practice — now frozen as law.)

**DL-5 — Humans own clinical/ambiguous judgment.** The bot may decide on its own: tone, language, which fields to ask for, quoting DB-backed facts, and **auto-booking only on high-confidence service matches**. Anything ambiguous (which visit type/service), emergency-adjacent, or clinically interpretive routes to a **human (staff review)**.

**DL-6 — Privacy by construction.** PHI is redacted before any model call; logs/metadata never contain message text, phone, email, or patient identifiers. `ConversationState` metadata stays enum/boolean/timestamp/opaque-id only (no new PHI keys).

**DL-7 — Consent before action.** Explicit consent before using contact details for scheduling, and before recording a consult.

**DL-8 — Meet the patient's language.** Understand and mirror any language or mix (English, Hindi, Hinglish, transliteration, casual spelling). No rigid keyword rules for language choice.

**DL-9 — The doctor stays in control.** Pause switch (`instagram_receptionist_paused`), custom pause copy, and staff review are always available and always outrank automation.

**DL-10 — Channel-agnostic core + thin per-channel adapters.** The conversation engine (Understand → … → Convert) must not know which channel it's on. Instagram / WhatsApp / comments are **adapters** at the edge that normalize inbound messages and perform sends. (Target — see §4; today the engine is Instagram-coupled.)

**DL-11 — The funnel *is* the state machine.** Code shape mirrors the funnel: explicit stages, **one** persistence sink per turn, constitution encoded as router/interceptor order. No flat field-bag + mega `if`-chain as the system of record. (Target — see §4.)

**DL-12 — Memory: stateless now, returning-patient memory later.** Today the bot is stateless per conversation (per-conversation `metadata`). Recognizing returning patients ("welcome back", prior visits) is a **later phase** (Phase 5), and the identity/patient layer must be designed so it slots in without a rewrite.

---

## 3. Why now — current-state findings (anchored)

The bot *works*, and its instincts (DL-2/DL-4/DL-5/DL-6) are already partly in the code. But the implementation has outgrown its shape, and every new rule is now risky:

| Finding | Evidence | Consequence |
|---|---|---|
| **God function** | `processInstagramDmWebhook` spans `instagram-dm-webhook-handler.ts:1206`→`:4151` (~2,950 lines) | Can't unit-test a branch in isolation; branch order is load-bearing but only documented in prose. |
| **State persisted in 64 places** | 64 × `updateConversationState(...)`; final sink already exists at `:3833`/`:3920` | Most inline writes are **redundant double-writes** (all chain branches fall through to the end sink). Full-blob overwrite (`conversation-service.ts:303`) means one missed `...state` spread silently drops fields. |
| **Flat 50+ field state** | `ConversationState` `types/conversation.ts:155` | No per-flow ownership; no compiler help for "which field is valid in which step." |
| **PHI redaction is US-centric** | `redactPhiForAI` `ai-service.ts:451`; shared by 10 call sites | An India mobile written `98765 43210` / `+91 98765 43210` is **not** redacted before OpenAI. Compliance gap (DL-6). |
| **Instagram-coupled core** | the engine lives *inside* `instagram-dm-webhook-handler.ts` | WhatsApp / future channels can't reuse the brain (violates DL-10 target). |
| **One flagship model for everything** | `config/openai.ts:16` (`gpt-5.2`) used for tiny JSON intent classification *and* reply generation | Latency/cost left on the table; retry boilerplate duplicated across `classifyIntent`/`generateResponse`/`callBookingTurnClassifier`. |

**Safety net that makes this feasible:** the golden routing corpus + characterization tests (`tests/unit/workers/dm-routing-golden.test.ts`, `webhook-worker-characterization.test.ts`, `tests/unit/services/ai-service.test.ts`, `intent-routing-policy.test.ts`, fixtures in `tests/fixtures/dm-routing-golden/`). Every structural phase below is **behavior-preserving and pinned by these tests**.

---

## 4. Target architecture

Two decisions drive the whole shape: **channel-agnostic core (DL-10)** and **funnel = state machine (DL-11)**.

```ts
// ── Edge: one adapter per channel. The ONLY code that knows "Instagram"/"WhatsApp". ──
interface ChannelAdapter {
  normalizeInbound(raw: unknown): InboundMessage | null;          // channel-specific → channel-free
  send(conversationKey: string, reply: OutboundReply): Promise<SendResult>;
}

// ── Core engine: never imports instagram-service. Pure-ish; testable per stage. ──
interface InboundMessage {
  channel: ChannelId;                  // 'instagram' | 'whatsapp' | ...
  conversationKey: string;             // (doctorId, channel, senderId)
  senderId: string;
  text: string;
  attachments?: Attachment[];
}

type Stage =                           // the funnel, made explicit (replaces flat field-bag)
  | { kind: 'understand' }             // always runs first
  | { kind: 'triage'; reasonParts: string[] }
  | { kind: 'match' }
  | { kind: 'collect'; data: CollectState }
  | { kind: 'consent'; sub: 'details' | 'recording' }
  | { kind: 'convert'; serviceKey: string }
  | { kind: 'recover' }
  | { kind: 'handoff'; why: 'emergency' | 'staff_review' | 'paused' | 'revoked' };

interface TurnResult { reply: OutboundReply; nextStage: Stage; effects: SideEffect[] }
```

**The constitution becomes the router order — literally:**

```text
handleTurn(inbound, ctx):
  for gate of CONTROL_GATES:        # DL-2 Safety/Consent first, non-negotiable, short-circuit
     # revoke → paused → emergency → staff-review-block
     if gate.fires(ctx) return gate.handle(ctx)
  understand(ctx)                   # classify intent + language
  result = STAGE_ROUTER[ctx.stage].handle(ctx)   # one handler per funnel stage
  persistTurn(ctx, result.nextStage)             # DL-11: ONE write per turn
  adapter.send(ctx.conversationKey, result.reply)
```

The ordered `CONTROL_GATES` + `STAGE_ROUTER` arrays *are* the branch inventory — in code, each entry independently testable. Conflict-recovery (today a forked mini-pipeline at `:4007`) calls the same `handleTurn`, not a copy.

---

## 5. Phase plan

Each phase is its own batch/PR set. **Phases 0–5 (rcp-00→24) are implemented.** **Phase 6 is now fully specified (rcp-25→29).** Phase folders: [`./README.md`](./README.md).

> **Cost policy (2026-05-30):** per the [efficiency guide](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md), execute on **Auto** (Composer for scaffolds), escalate a *single message* to Opus only if a task stalls, and rely on the **test suites as the gate** (golden corpus + characterization + the Phase 4 old-shape fixture corpus). No per-task Opus close-gates. The historical "Opus close-gate" labels on the done rows below are retained for the record; from Phase 4 on, the gate is a test, not a model.

### Phase 0 — Compliance hardening (ship immediately, independent) ✅ done
**Why first:** PHI leak is a live compliance risk (DL-6), and the fix is isolated from the refactor.
- **[rcp-00](./p0-compliance/Tasks/task-rcp-00-phi-redaction-i18n.md)** ✅ — Harden `redactPhiForAI` for Indian phone formats (+91 / 5-5 spacing) and a generic long-digit catch-all; add a redaction test matrix. **Guard:** confirm redaction is applied only to model-bound text, never to text downstream code still parses for digits.

**Deliverable:** no Indian patient phone number reaches OpenAI in plaintext; regression-tested across formats.

### Phase 1 — Persistence sink + constitution-ordered gates (first structural slice) ✅ done
**Why second:** lowest-risk structural move; directly encodes DL-2/DL-11; fully pinned by characterization tests; de-risks the Phase 2 router extraction.
- **[rcp-01](./p1-foundation/Tasks/task-rcp-01-persist-once-state-sink.md)** ✅ — Collapse the ~60 redundant inline `updateConversationState` writes to the single end-of-turn sink. Branches mutate `state`; persistence happens once.
- **[rcp-02](./p1-foundation/Tasks/task-rcp-02-constitution-safety-gates.md)** ✅ — Extract the pre-stage control/safety checks (revoke, paused, emergency) into an explicit, ordered `CONTROL_GATES` list (`dm/control-gates.ts`) with DL-2 as the documented contract. Behavior-preserving.

**Deliverable:** one DB write per turn; safety/control ordering is explicit and unit-tested as a list; the seam for Phase 2's stage router is in place.

### Phase 2 — Funnel stage router extraction *(decomposed — see execution order)*
Turn the in-function `if/else if` chain into an ordered `STAGE_ROUTER` of small per-stage handlers, each with a uniform signature and its own unit tests, via a **strangler-fig** migration (one stage group per PR). Full decomposition, the live branch→stage map, and the shared **stage-extraction playbook**: [EXECUTION-ORDER-p2-receptionist-stage-router.md](./p2-stage-router/Tasks/EXECUTION-ORDER-p2-receptionist-stage-router.md).
- **[rcp-03](./p2-stage-router/Tasks/task-rcp-03-stage-router-scaffold.md)** ✅ — router scaffold (`dm/stage-router.ts`) + `runLegacyDecideChain` strangler seam (zero behavior change).
- **[rcp-04](./p2-stage-router/Tasks/task-rcp-04-cancel-reschedule-status-stage.md)** ✅ — cancel / reschedule / status group (first real stage); established the order-preserving predicate pattern.
- **[rcp-05](./p2-stage-router/Tasks/task-rcp-05-idle-fee-triage-stage.md)** ✅ — fee / reason-first / medical / greeting **idle** group (largest, fee/triage guardrails).
- **[rcp-06](./p2-stage-router/Tasks/task-rcp-06-service-match-stage.md)** ✅ — service-match / staff-review / clarification (step-gated, cleanest).
- **[rcp-07](./p2-stage-router/Tasks/task-rcp-07-collection-consent-convert-stage.md)** ✅ — collection → consent → confirm → recording → slot funnel (incl. the persist-time `recording_consent_injected` detour).
- **[rcp-08](./p2-stage-router/Tasks/task-rcp-08-book-entry-retire-legacy.md)** ✅ — book-intent entry + AI default; **retired `runLegacyDecideChain`** + folded `conflict_recovery_ai` into `executeDmTurn`. Phase 2 closer.

`RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md` becomes generated-from / pinned-to the router arrays. **No behavior change across the phase** — golden corpus + characterization are the gate.

### Phase 3 — Channel-agnostic core + adapters ✅ done
The Phase 2 engine (`executeDmTurn` + channel-free `DmTurnContext`/`DmTurnResult`) already did **zero I/O** — so Phase 3 formalized the **ports** around it and pulled Instagram specifics behind an adapter. Decomposition + adapter-extraction playbook: [EXECUTION-ORDER-p3-receptionist-channels.md](./p3-channels/Tasks/EXECUTION-ORDER-p3-receptionist-channels.md).
- **[rcp-09](./p3-channels/Tasks/task-rcp-09-channel-ports-scaffold.md)** ✅ — `InboundMessage`/`OutboundReply`/`ChannelAdapter` + registry (`workers/channels/`).
- **[rcp-10](./p3-channels/Tasks/task-rcp-10-instagram-inbound-adapter.md)** ✅ — Instagram **inbound** parsing + sender↔page-id disambiguation behind `parseInbound`.
- **[rcp-11](./p3-channels/Tasks/task-rcp-11-instagram-outbound-adapter.md)** ✅ — Instagram **outbound** send behind `adapter.send`.
- **[rcp-12](./p3-channels/Tasks/task-rcp-12-channel-free-engine-entry.md)** ✅ — channel-free `runConversationTurn` (`dm/run-conversation-turn.ts`); thin worker; folded conflict-recovery.
- **[rcp-13](./p3-channels/Tasks/task-rcp-13-whatsapp-adapter-stub.md)** ✅ — WhatsApp adapter stub (`workers/channels/whatsapp/`) + comment surface tag.

**Engine + stages keep zero Instagram imports.**

### Phase 4 — Structured `ConversationState` *(decomposed — see execution order)*
Replace the flat ~45-field interface with **per-flow namespaced sub-states** (`booking`, `bookingForOther`, `serviceMatch`, `cancel`, `reschedule`, `recordingConsent`, `triage`, `clarification`) + a typed `stage` discriminant, migrated **behind a compatibility reader** that keeps on-disk legacy-flat until the final convergence step. **Decision: incremental namespacing, not a big-bang discriminated union** (cost/risk; shared fields span flows). Full rationale, migration-safety mechanism, and the **state-migration playbook**: [EXECUTION-ORDER-p4-receptionist-state.md](./p4-state/Tasks/EXECUTION-ORDER-p4-receptionist-state.md).
- **[rcp-14](./p4-state/Tasks/task-rcp-14-state-access-seam.md)** — state-access seam (`readConversationState`/`writeConversationState`) + target types + old-shape fixture corpus (identity pass-through). *Fully specified.*
- **[rcp-15](./p4-state/Tasks/task-rcp-15-namespace-cancel-reschedule.md)** — namespace `cancel` + `reschedule` (smallest; proves the pattern). *Fully specified.*
- **[rcp-16](./p4-state/Tasks/task-rcp-16-namespace-service-match.md)** — namespace `serviceMatch` (ARM-03); retarget the existing pure helpers. *Fully specified.*
- **[rcp-17](./p4-state/Tasks/task-rcp-17-namespace-consent-triage-clarification.md)** — namespace `recordingConsent` + `triage` + `clarification` (PHI grouping). *Fully specified.*
- **[rcp-18](./p4-state/Tasks/task-rcp-18-namespace-booking-lifecycle.md)** — namespace `booking` + `bookingForOther` + typed `stage` discriminant. *Fully specified.*
- **[rcp-19](./p4-state/Tasks/task-rcp-19-converge-discriminated-union.md)** — flip on-disk shape + backfill; retire flat-read fallback; close the union. *Fully specified (Phase 4 closer; the one task touching persisted data).*

**The gate is the old-shape fixture corpus + golden + characterization** — not a model review. Only rcp-19 touches persisted data.

### Phase 5 — Returning-patient memory *(decomposed — see execution order)*
Recognize returning patients within PHI rules (DL-12) — a warm, truthful **"welcome back"** and **skip re-collecting** what's already on file — built as a **read-layer on the existing identity/patient layer** (no new memory store): consent on the `patients` row + doctor-scoped attended visits in `appointments`. **Phase 5 is the first behavior-changing phase**, so it ships behind a flag (`RETURNING_PATIENT_MEMORY_ENABLED`, default off) with a two-sided gate — non-returning/flag-off stays byte-identical; new golden fixtures pin the returning path; cross-tenant isolation + consent-revocation tests are mandatory. Full rationale, the PHI/privacy safety mechanism, and the **returning-memory playbook**: [EXECUTION-ORDER-p5-receptionist-returning-memory.md](./p5-returning-memory/Tasks/EXECUTION-ORDER-p5-receptionist-returning-memory.md).
- **[rcp-20](./p5-returning-memory/Tasks/task-rcp-20-returning-patient-profile-seam.md)** — returning-patient profile read seam (`dm/returning-patient.ts` + PHI-safe `ReturningPatientProfile` on `DmTurnContext`); doctor-scoped, consent-aware, **dormant** (zero behavior change). *Fully specified.*
- **[rcp-21](./p5-returning-memory/Tasks/task-rcp-21-welcome-back-greeting.md)** — "welcome back" greeting (deterministic composer segment + structured `returningPatientSummary` hint); first consumer. *Fully specified.*
- **[rcp-22](./p5-returning-memory/Tasks/task-rcp-22-skip-recollection-known-patient.md)** — skip demographic re-collection for a known, consented returning patient (generalize the `hasPatientReady` short-circuit to first-book turns); still collects the visit reason. *Fully specified.*
- **[rcp-23](./p5-returning-memory/Tasks/task-rcp-23-returning-aware-triage-prefill.md)** — returning-aware triage: offer a **follow-up** for the last service and pre-seed the match on confirm (richer reuse; deferrable slice). *Fully specified.*
- **[rcp-24](./p5-returning-memory/Tasks/task-rcp-24-returning-memory-privacy-closer.md)** — privacy/identity-scoping hardening (cross-tenant isolation + consent-revocation suppression), audit, and the flag flip (Phase 5 closer). *Fully specified.*

**The gate is the new returning fixtures + the mandatory cross-tenant isolation & consent-revocation tests + golden/characterization byte-identical for the non-returning path** — not a model review. Only rcp-24 flips the flag (turns the behavior on).

### Phase 6 — Per-doctor identity & consent (Instagram-first) *(decomposed — see execution order)*
Fix the structural loose end Phase 5 could only work around: today **one Instagram account maps to one global `patients` row across all clinics** (`patients (platform, platform_external_id)` is unique with no `doctor_id`), so consent is shared and rcp-24 had to firewall *history* at read-time. Phase 6 makes **identity itself per-doctor** — each clinic gets its own patient + consent record for the same follower. **Decision: per-doctor `patients` rows resolved conversation-first, not a junction table** — `conversations` is already per-doctor and consent is read only via `conversation.patient_id`, so per-doctor rows make consent per-doctor with zero consumer churn. Full rationale, migration-safety mechanism, and the **identity-migration playbook**: [EXECUTION-ORDER-p6-receptionist-identity.md](./p6-identity/Tasks/EXECUTION-ORDER-p6-receptionist-identity.md).
- **[rcp-25](./p6-identity/Tasks/task-rcp-25-perdoctor-identity-seam.md)** — per-doctor identity resolution seam (`resolvePatientForChannelSender`, conversation-first) + schema (`patients.doctor_id` + partial unique); behavior-preserving compat. *Fully specified.*
- **[rcp-26](./p6-identity/Tasks/task-rcp-26-perdoctor-placeholder-new-contacts.md)** — per-doctor placeholder creation so **new** contacts are isolated (existing shared rows wait for the backfill). *Fully specified.*
- **[rcp-27](./p6-identity/Tasks/task-rcp-27-doctor-scoped-identity-readers.md)** — doctor-scope the global PSID readers (notification recipient resolution + patient search) before duplicates exist. *Fully specified.*
- **[rcp-28](./p6-identity/Tasks/task-rcp-28-perdoctor-consent-lifecycle.md)** — per-doctor consent lifecycle: revocation + account-deletion scrub + merge scoping (fixes the global-revocation bug). *Fully specified.*
- **[rcp-29](./p6-identity/Tasks/task-rcp-29-identity-backfill-converge.md)** — split shared rows into per-doctor rows + backfill, drop the global unique index, retire the compat fallback (closer; the one task rewriting persisted data). *Fully specified.*

**The gate is cross-doctor isolation + mandatory non-DM coverage (notifications/merge/deletion) + the backfill load test + golden/characterization byte-identical** — not a model review. Only rcp-29 rewrites persisted data.

### Phase 7+ — Instagram depth, then cross-channel *(future)*
Ordered **Instagram-first, WhatsApp-last** (per direction set 2026-05-31): **Phase 7 (Instagram depth)** — route the first high-intent **comment → engine** DM through `runConversationTurn` (today a templated pipeline; see the Phase 3 execution-order doc), plus **proactive reactivation** nudges ("it's been a while — book a follow-up?") within consent + the IG 24-hour window, building on Phase 5 memory. **Phase 8 (cross-channel)** — take the WhatsApp stub (rcp-13) live and unify returning-patient recognition across channels, now clean because Phase 6 gives WhatsApp a correct `(doctor, channel, sender)` identity to plug into. Stays outlined until Phase 6 lands.

### Companion quick wins (low-risk; schedule alongside any phase)
- Two-tier model config (`OPENAI_CLASSIFIER_MODEL` vs `OPENAI_RESPONSE_MODEL`) — cheaper/faster classification (DL-4 unaffected).
- Shared `callOpenAIWithRetry()` helper — de-dupe the retry/audit boilerplate in `ai-service.ts`.
- Gate/remove the per-request `payloadStructure` debug log (`:1216`).

---

## 6. Execution order & model strategy

| Wave | Task | Size | Model | Depends on | Blocks | Status |
|---|---|---|---|---|---|---|
| 0 | rcp-00 — PHI redaction i18n | S | Auto + **Opus close-gate** (compliance/silent-leak surface) | — | — | ✅ |
| 1 | rcp-01 — persist-once sink | M | Auto + **Opus close-gate** (state-corruption surface) | — (independent of rcp-00) | rcp-02, Phase 2 | ✅ |
| 1 | rcp-02 — constitution gates | M | Auto | rcp-01 | Phase 2 | ✅ |
| 2 | rcp-03 — router scaffold | M | Auto | rcp-02 | rcp-04..08 | ✅ |
| 2 | rcp-04 — cancel/reschedule/status | M | Auto | rcp-03 | rcp-08 | ✅ |
| 2 | rcp-05 — idle fee/triage | L | Auto + **Opus close-gate** (fee guardrails) | rcp-03 | rcp-08 | ✅ |
| 2 | rcp-06 — service-match | M | Auto | rcp-03 | rcp-08 | ✅ |
| 2 | rcp-07 — collection/consent/convert | L | Auto + **Opus close-gate** (consent + persist-sink coupling) | rcp-03 | rcp-08 | ✅ |
| 2 | rcp-08 — book-entry + retire legacy | M | Auto + **Opus close-gate** (removes the fallback) | rcp-05/06/07 | Phase 3 | ✅ |
| 3 | rcp-09 — channel ports + registry (seam) | M | Auto | rcp-08 | rcp-10..13 | ✅ |
| 3 | rcp-10 — IG inbound behind adapter | L | Auto | rcp-09 | rcp-12 | ✅ |
| 3 | rcp-11 — IG outbound behind adapter | M | Auto | rcp-09 | rcp-12 | ✅ |
| 3 | rcp-12 — channel-free `runConversationTurn` + thin worker | L | Auto | rcp-10, rcp-11 | rcp-13 | ✅ |
| 3 | rcp-13 — WhatsApp adapter stub + comment surface | M | Auto | rcp-12 | — | ✅ |
| 4 | rcp-14 — state-access seam + compat reader + fixtures | M | **Composer/Auto** | Phase 3 | rcp-15..19 | ✅ |
| 4 | rcp-15 — namespace cancel + reschedule | S | **Auto** | rcp-14 | rcp-19 | ✅ |
| 4 | rcp-16 — namespace serviceMatch (ARM-03) | L | **Auto** | rcp-14 | rcp-19 | ✅ |
| 4 | rcp-17 — namespace recordingConsent + triage + clarification | M | **Auto** | rcp-14 | rcp-19 | ✅ |
| 4 | rcp-18 — namespace booking + bookingForOther + typed stage | L | **Auto** | rcp-14 | rcp-19 | ✅ |
| 4 | rcp-19 — flip on-disk + backfill; retire flat fallback (closer) | M | **Auto** (optional 1 Opus diff-skim — persisted data) | rcp-15..18 | — | ✅ |
| 5 | rcp-20 — returning-patient profile seam (dormant) | M | **Composer/Auto** | Phase 4 | rcp-21..24 | spec'd |
| 5 | rcp-21 — "welcome back" greeting + structured hint | M | **Auto** | rcp-20 | rcp-24 | spec'd |
| 5 | rcp-22 — skip re-collection (known + consented) | L | **Auto** | rcp-20 | rcp-24 | spec'd |
| 5 | rcp-23 — returning-aware triage / follow-up pre-fill (deferrable) | M–L | **Auto** | rcp-20 | rcp-24 | spec'd |
| 5 | rcp-24 — privacy/isolation hardening + audit + flag flip (closer) | M | **Auto** (optional 1 Opus diff-skim — cross-tenant) | rcp-21..23 | — | spec'd |
| 6 | rcp-25 — per-doctor identity resolution seam (compat) | M | **Composer/Auto** | Phase 5 | rcp-26..29 | spec'd |
| 6 | rcp-26 — per-doctor placeholder (isolate new contacts) | M | **Auto** | rcp-25 | rcp-29 | spec'd |
| 6 | rcp-27 — doctor-scope global PSID readers (notif + search) | M | **Auto** | rcp-25 | rcp-29 | spec'd |
| 6 | rcp-28 — per-doctor consent lifecycle (revoke/delete/merge) | M | **Auto** | rcp-26 | rcp-29 | spec'd |
| 6 | rcp-29 — split shared rows + backfill; drop global index (closer) | M–L | **Auto** (optional 1 Opus diff-skim — persisted PHI) | rcp-25..28 | — | spec'd |

Per [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md): **default Auto, Composer for scaffolds, tests as the gate.** No per-task Opus close-gates (see cost policy at §5). Escalate a *single message* to Opus only if a task stalls; the optional Opus diff-skims left are rcp-19 (persisted data), rcp-24 (cross-tenant/privacy surface), and rcp-29 (rewrites persisted PHI). Recommended order: Phase 4 rcp-14 first, then rcp-15→18 (any order), rcp-19 last. Phase 5 rcp-20 first (the seam), then rcp-21/22/23 (any order; rcp-21 recommended first, rcp-23 deferrable), rcp-24 last (flips the flag). Phase 6 rcp-25 first (seam + schema), then rcp-26/27 (any order; both precede the backfill), rcp-28 after rcp-26, rcp-29 last (the data split).

**Full wave matrices + playbooks:** Phase 2 → [EXECUTION-ORDER-p2-receptionist-stage-router.md](./p2-stage-router/Tasks/EXECUTION-ORDER-p2-receptionist-stage-router.md); Phase 3 → [EXECUTION-ORDER-p3-receptionist-channels.md](./p3-channels/Tasks/EXECUTION-ORDER-p3-receptionist-channels.md); Phase 4 → [EXECUTION-ORDER-p4-receptionist-state.md](./p4-state/Tasks/EXECUTION-ORDER-p4-receptionist-state.md); Phase 5 → [EXECUTION-ORDER-p5-receptionist-returning-memory.md](./p5-returning-memory/Tasks/EXECUTION-ORDER-p5-receptionist-returning-memory.md); Phase 6 → [EXECUTION-ORDER-p6-receptionist-identity.md](./p6-identity/Tasks/EXECUTION-ORDER-p6-receptionist-identity.md).

---

## 7. References

- Alignment conversation: 2026-05-30 (this plan is its record).
- North star: [AI_BOT_BUILDING_PHILOSOPHY.md](../../../../../Reference/product/receptionist-bot/AI_BOT_BUILDING_PHILOSOPHY.md)
- Prior audit: [BOT_PHILOSOPHY_ELITE_AUDIT_2026.md](../../../../../task-management/BOT_PHILOSOPHY_ELITE_AUDIT_2026.md)
- Branch inventory (Phase 2 input): [RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md](../../../../../Reference/product/receptionist-bot/RECEPTIONIST_BOT_DM_BRANCH_INVENTORY.md)
- Conversation rules: [RECEPTIONIST_BOT_CONVERSATION_RULES.md](../../../../../Reference/product/receptionist-bot/RECEPTIONIST_BOT_CONVERSATION_RULES.md)
- Original AI-first plan: [AI_RECEPTIONIST_PLAN.md](../../../../../task-management/AI_RECEPTIONIST_PLAN.md)
- Code rules: [CODE_CHANGE_RULES.md](../../../../process/CODE_CHANGE_RULES.md)
