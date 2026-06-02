# rcp-23 · Returning-aware triage — follow-up service pre-fill

> **Phase 5, step 4** of [receptionist-rearchitecture](../plan-p5-receptionist-returning-memory-batch.md) · follows the **[returning-memory playbook](./EXECUTION-ORDER-p5-receptionist-returning-memory.md#returning-memory-playbook-shared-recipe--every-consumer-task-follows-this)**. The **richer** "prior visit context" reuse: when a returning patient comes back, offer the obvious shortcut — "Is this a follow-up for **<last service>**?" — and pre-seed the service match on a yes. This is the optional/deferrable slice; cut or split it last if Phase 5 needs trimming.

| **Size** | M–L | **Model** | **Auto** | **Wave** | 5 | **Depends on** | rcp-20 | **Blocks** | rcp-24 | **Status** | done |

---

## Why this slice

rcp-22 skips re-typing *who you are*; this skips re-deriving *what you're here for* when it's plausibly the same thing. The data already exists: `appointments.catalog_service_key`, `appointments.opd_event_type = 'return_after_completed'` (migration `031`), and `episode_id` (migration `036`). A follow-up is the single most common returning-visit shape, and short-circuiting the service-match derivation (with a **confirm**, never an auto-assume) is squarely the "prior visit context" the Phase 5 charter calls for.

## What to do

Per the playbook — **confirm before finalize; opaque keys only**:

- **Offer the follow-up.** In the service-match stage (`dm/stages/service-match*`), when `RETURNING_PATIENT_MEMORY_ENABLED` + `ctx.returningProfile?.isReturning` + `hasGrantedConsent` + a usable `profile.priorVisits.lastServiceKey`, and the patient hasn't already specified a service: ask "Is this a **follow-up** for **<last service label>**?" The label is resolved from the **catalog** (deterministic) by the opaque `lastServiceKey` — not from metadata or free text.
- **Pre-seed on yes.** On an affirmative, finalize the service via the existing centralized helper `applyFinalCatalogServiceSelection` (`conversation.ts:434`) using the recalled key — i.e. drive `state.serviceMatch` through the **same** path a fresh match uses, so confidence/staff-review semantics are unchanged. On no/ambiguous, fall straight through to today's normal matcher (zero change).
- **Tone hint only.** Optionally extend `returningPatientSummary` (from rcp-21) so the model can acknowledge the follow-up in tone — never to state clinical facts.

## Acceptance gate

- [x] Returning + consented + recalled `lastServiceKey` + book/triage turn ⇒ a **follow-up confirm** offer; accept ⇒ `state.serviceMatch` finalized via `applyFinalCatalogServiceSelection` on the recalled key; decline/ambiguous ⇒ **today's matcher path, byte-identical**.
- [x] New golden fixtures: `returning-followup-accept.json` and `returning-followup-decline.json`. Existing service-match golden (incl. `staff_service_review_pending`) **byte-identical** for non-returning.
- [x] Staff-review gate, matcher confidence bands, and reason-code semantics unchanged (rcp-16 invariants hold). `npx tsc --noEmit` clean.

## Anti-goals

- ❌ Don't **auto-book** on the assumption — always confirm the follow-up before finalizing; the patient may have a new, unrelated concern.
- ❌ Don't reuse a service from a **cancelled/no-show** visit, or one no longer in the catalog — fall back to normal matching.
- ❌ Don't change the proposal-vs-final distinction or the staff-review SLA (DL-3/DL-5; rcp-16 anti-goals carry over).
- ❌ No PHI: the recall is an **opaque service key** + catalog-resolved label, never the prior chief complaint.

## Risks

- **Wrong assumption erodes trust.** A confidently-wrong "follow-up for X?" is worse than asking. The confirm gate is mandatory; phrase it as a question, accept "no" gracefully into the normal flow.
- **Catalog drift.** A `catalog_service_key` recalled from an old appointment may have been renamed/removed. Resolve against the **current** catalog; if it doesn't resolve, skip the offer and match normally.
- **Reason-first interaction.** If the thread is clinical-led, reason-first triage still runs first (rcp-22 risk applies) — the follow-up offer comes *after* the reason is understood, not instead of it.
- **Scope creep.** This is the most speculative slice. If it threatens the phase timeline, ship rcp-20/21/22/24 and defer this to a follow-on — the welcome-back + demographic skip already deliver the headline wins.
