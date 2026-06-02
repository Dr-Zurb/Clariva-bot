# rcp-21 · "Welcome back" greeting + structured returning-patient hint

> **Phase 5, step 2** of [receptionist-rearchitecture](../plan-p5-receptionist-returning-memory-batch.md) · follows the **[returning-memory playbook](./EXECUTION-ORDER-p5-receptionist-returning-memory.md#returning-memory-playbook-shared-recipe--every-consumer-task-follows-this)**. The first — and smallest, most visible — consumer of the rcp-20 profile: when a **consented returning patient** says hi, greet them back warmly (and truthfully) instead of cold. Greeting is naturally idempotent, so it's the safest place to prove the behavior change.

| **Size** | M | **Model** | **Auto** | **Wave** | 5 | **Depends on** | rcp-20 | **Blocks** | rcp-24 | **Status** | done |

---

## Why this slice

A world-class receptionist who's seen you before doesn't ask "how can I help you today?" like a stranger — they say "welcome back." This is the highest-trust, lowest-risk returning-patient win: it never books, collects, or mutates funnel state. It just changes the **idle greeting copy**. It also lays the **model-hint plumbing** (`returningPatientSummary`) that rcp-22/23 reuse.

## What to do

Per the playbook — **deterministic facts, model re-tones only (DL-4)**:

- **Composer segment (facts in code).** Add a `welcome_back` segment to the `DmSegment` union in `dm-reply-composer.ts:22`–`:55`. It assembles the greeting from **DB facts at compose-time**: the patient **first name** (read from the `patients` row by the caller — *never* from metadata), plus optional truthful recency phrasing derived from `profile.priorVisits.recencyBucket`. No rupee/URL/fact the model could invent.
- **Structured model hint (PHI-safe).** Add `returningPatientSummary?: string` to `GenerateResponseContext` (`ai-service.ts:1830`–`:1861`, next to `collectedDataSummary`/`idleDialogueHint`). Populate it in `buildAiContextForResponse` (`run-conversation-turn.ts:100`–`:197`) from `ctx.returningProfile` using **opaque keys + enums only**, e.g. `returning patient: prior_visits=2, last_service=[follow_up], recency=[within_3_months]`. Same `[provided]`-style discipline as `collectedDataSummary` (`:171`–`:175`) — the model uses it for tone, not as a fact to restate verbatim.
- **Wire the greeting branch.** In `idle-fee-triage.ts:559`–`:590` (the `greeting_template` branch), when `RETURNING_PATIENT_MEMORY_ENABLED` **and** `ctx.returningProfile?.isReturning` **and** `hasGrantedConsent`: prepend/compose the `welcome_back` segment and pass `returningPatientSummary` into `runGenerateResponse`. Every other greeting (new sender, unconsented, revoked) keeps **today's exact path**.

## Acceptance gate

- [x] Consented returning + `greeting` ⇒ reply opens with the deterministic welcome-back (correct first name, truthful recency); new/unconsented/revoked greeting is **byte-identical to today**.
- [x] New golden fixture `tests/fixtures/dm-transcripts/returning-greeting.json` (branch `greeting_template`, returning profile set) pins the new copy; existing `greeting-idle.json` **byte-identical**.
- [x] `webhook-worker-characterization` new-patient greeting unchanged; `ai-service` test covers `returningPatientSummary` (present + redacted/structured shape).
- [x] `npx tsc --noEmit` clean; flag **off** ⇒ no path differs from today.

## Anti-goals

- ❌ No welcome-back without `consent_status === 'granted'` — unconsented/revoked returnees are greeted as new (rcp-24 pins suppression).
- ❌ Don't put the patient name (or any PHI) into `conversations.metadata`, `GenerateResponseContext`, audit, or logs — name lives only in the **outbound copy** (channel delivery, like `buildConfirmDetailsMessage`) and is read fresh from the `patients` row.
- ❌ Don't let the model state visit facts (count, last service, dates) — those come from the composer; the model only re-tones (DL-4).
- ❌ Don't change routing or `step` — the greeting still resolves to `step: 'responded'`.

## Risks

- **Stale/over-specific recency.** A coarse `recencyBucket` ("a while back") is safer than "last Tuesday." Never assert a specific date in copy; if recency is unknown, fall back to a plain warm welcome-back.
- **Placeholder name.** If the patient row name is `Placeholder` (rcp-20 marks `hasName: false`), there is no real name to greet — fall back to a name-less welcome-back. Use first name only.
- **Model leakage.** The hint is for tone; pin (via the ai-service test) that the prompt carries only the structured summary, never the raw last-visit reason or contact details.
