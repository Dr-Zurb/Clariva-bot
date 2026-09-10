# Task rec-01: Twilio composition-status webhook

## 17 Aug 2026 — Batch [p1-artifact-registry](../plan-p1-recording-governance-v2-artifact-registry-batch.md) — Wave 2 — **L, ~5h**

---

## Task overview

`voice-transcription-worker.ts:133–135` has carried this TODO since April:

> *once Plan 02 / Plan 05 ship a Composition-finalized webhook that writes to `recording_artifact_index`, prefer reading from that table here.*

This task ships that webhook. A new route on the existing webhooks router receives Twilio's composition-status callback, verifies the sender, and hands the finalised composition to [`rec-02`](./task-rec-02-artifact-registry-writer.md)'s writer. REC-D21 keeps the existing poll as the fallback — this is an accelerator, not a replacement.

**Before any of that, this task answers a question the codebase cannot answer: what creates our Compositions?** See step 0. It gates everything.

**Estimated time:** ~5h (~30 min of which is step 0, before any code)
**Status:** ✅ Implemented 2026-08-18 — webhook shipped; audio-only Composition Hook created and callback mounted.
**Hard deps:** **[`rec-02`](./task-rec-02-artifact-registry-writer.md) must be green and merged.** This task dispatches to its writer and does not re-implement any part of it.
**Source:** REC-D21, REC1-D2, REC1-D3, REC1-D4.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)

---

## Model & execution guidance

**Recommended model:** **Opus.**

This is a new unauthenticated-by-default, internet-facing endpoint that mutates clinical-record state. Webhook signature verification is a security surface, and it is one of the areas [`00-agent-contract.mdc`](../../../../../../../../.cursor/rules/00-agent-contract.mdc) marks as hard-rules adjacent. There is also no Twilio-signature precedent anywhere in this repository to copy — the existing Twilio webhook has none — so the verification approach is a design decision, not a paste.

**New chat?** **Yes.** Pre-load:

- This task + the [batch plan](../plan-p1-recording-governance-v2-artifact-registry-batch.md) (especially the *"Surfaced during planning"* section) + the [charter](../../plan-recording-governance-v2-charter.md) REC-D21 row.
- **[`rec-02`](./task-rec-02-artifact-registry-writer.md) as merged** — its writer entry point and its recorded REC1-D1 `storage_uri` convention. You consume both; you re-derive neither.
- `backend/src/routes/webhooks.ts` — **the whole file (43 lines).** The router doc-comment is L13–29; the existing Twilio mount is **L39–40**.
- `backend/src/controllers/twilio-webhook-controller.ts` — **the whole file (49 lines).** This is the respond-200-then-`setImmediate` pattern (L27–48) and it is also the **counter-example**: it performs no verification whatsoever. Match its async shape; do not match its auth posture (REC1-D3).
- `backend/src/utils/webhook-verification.ts` — the house verification patterns. `verifyInstagramWebhook` and the Facebook Page variant (L183+) show how this repo does HMAC comparison, structured failure logging and `UnauthorizedError`.
- `backend/src/controllers/webhook-controller.ts` — **L740–780** (Razorpay) and **L830–860** (PayPal) for how a verified payment webhook rejects a bad signature and emits a `webhook_signature_failed` audit signal.
- `backend/src/index.ts` — **L248–253**, the raw-body capture. Signature verification needs exact raw bytes; confirm what this middleware gives you for a form-encoded Twilio POST before designing anything.
- `backend/src/config/env.ts` — **L133–143** (existing `TWILIO_*` vars) and **L252** (`WEBHOOK_BASE_URL`, already present — use it, do not add a second base-URL variable).
- `backend/src/services/twilio-compositions.ts` — `fetchCompositionMetadata` L292–334. The webhook payload should be treated as a notification, not as trusted data.
- `backend/src/workers/voice-transcription-worker.ts` — **L133–135** (the TODO you are closing) and **L142–187** (the poll that stays).

**Estimated turns:** 5–7.

---

## Acceptance criteria

### 0. Step 0 — establish how Compositions are created (do this before writing code)

`rg` across this repository for `compositions.create`, `Compositions.create`, `CompositionHook` and `composition hook` returns **no composition-creation call site.** The only Composition surfaces in `backend/src/` are list, fetch and the `/Media` mint. Twilio does not create Compositions spontaneously, so they come from account-level configuration outside this repo — or they do not exist.

- [x] Check the Twilio account for a configured **Composition Hook** (console: Video → Composition Hooks, or `GET /v1/CompositionHooks`).
- [x] **Write the answer into this task file.** One short paragraph. Every downstream reader depends on it, and it is currently unknowable from the code.
- [x] **If a hook exists:** the status callback is mounted **on the hook**, not on a per-composition create call — there is no create call. Record the hook's SID and its current callback configuration before changing anything.
- [x] **If no hook exists:** **STOP AND SURFACE.** Do not add composition-creation code on your own initiative. This finding would mean no Compositions are produced at all, that the transcription worker's rows have been sitting queued indefinitely, and that **voice replay is broken in production too** — not just video. That contradicts the charter's problem statement, which says voice replay works. The charter needs correcting and the phase re-scoping before this task continues.
- [x] Either way, record what the composition-finalised callback URL is set to **before** this task, so the change is reversible.

**Step 0 answer (2026-08-18, live Twilio account via `GET /v1/CompositionHooks` + `GET /v1/Compositions`):** Initially **(b).** Hook count = **0**. Composition count on a 10-row list = **0**. Raw Video Recordings exist (`RT…`, audio, latest sampled `2026-05-27`). No composition-finalised callback existed. Charter problem §1 ("Voice replay works today by accident") was **false** at that moment.

**Founder decision (same day):** create an account-level **Composition Hook**, do **not** add `compositions.create` in code. Hook created 2026-08-18T01:41:42Z:

| | |
|---|---|
| SID | `HKbe336c348bce4c81907f6a3c55844a82` |
| Friendly name | `haloaid-consult-audio` |
| Enabled | `true` |
| Format | `mp4` |
| Audio sources | `*` |
| Video layout | none (audio-only; video hook is rec-03) |
| `statusCallback` **before** | *(none — hook did not exist)* |
| `statusCallback` **after** | `{WEBHOOK_BASE_URL}/webhooks/twilio/composition-status` (currently the Tailscale `WEBHOOK_BASE_URL` host) |
| Method | `POST` |

This is console/account configuration, not a create-call site in the repo. **Reversal:** disable or delete the hook (`DELETE /v1/CompositionHooks/HKbe336c348bce4c81907f6a3c55844a82`, or `enabled=false`). Historical rooms still have no Compositions; only rooms that end after this hook will produce `CJ…` SIDs.

### 1. The route

- [x] A new composition-status route is added to the existing webhooks router (`routes/webhooks.ts`), alongside the room-status route rather than in a new router.
- [x] The route doc-comment block at `webhooks.ts:13–29` is updated to list it, matching the existing entries' style.
- [x] Rate limiting matches the sibling webhook routes (`webhookLimiter`).
- [x] The controller **orchestrates only** — verify, validate, dispatch to the service, respond. **No database access in the controller.** No business logic.
- [x] `asyncHandler` wraps the controller. **No try/catch in the controller** — the global error middleware owns that mapping.
- [x] External input is validated with **Zod** in the controller before any service is called. Twilio sends `application/x-www-form-urlencoded`; the schema must reflect what actually arrives, not what we hope arrives.
- [x] Errors are typed `AppError` subclasses. Never a raw `Error`.
- [x] `process.env` is never read directly — everything through `config/env.ts`.

### 2. Sender verification (REC1-D3)

- [x] **The endpoint verifies that the request came from Twilio before doing any work.** This is the reason the task is Opus. The existing room-status endpoint's zero-verification posture is **not** the precedent to follow.
- [x] Verification uses exact raw request bytes. Confirm the raw-body middleware (`index.ts:248–253`) delivers them for a form-encoded POST on this route; if it does not, that is a finding to surface, not to work around with a reconstructed body.
- [x] A failed verification is **rejected** — it does not fall through to processing. Payment webhooks in this repo throw `UnauthorizedError` and emit a `webhook_signature_failed` audit signal; follow that precedent, not the Instagram bypass branches (those exist for documented non-actionable payload types and have no analogue here).
- [x] Missing or misconfigured verification credentials **fail closed** and log loudly. An endpoint that cannot verify must not accept.
- [x] A signature-failure log line records enough to debug — correlation ID, timestamp, which check failed — and **no payload contents.**
- [x] Verification is exercised by tests: a valid request is accepted, a tampered one is rejected, a missing signature is rejected.

**Raw-body finding:** `express.json`'s `verify` does **not** run for Twilio's `application/x-www-form-urlencoded`. `express.urlencoded` had no `verify`. Added `verify` on the urlencoded parser so `req.rawBody` is the exact posted bytes. Verification parses those bytes with `querystring` and calls `twilio.validateRequest` (Twilio signs URL + fields, not a raw-body HMAC). `req.body` after `sanitizeInput` is never the verification source.

### 3. Handling and idempotency

- [x] The handler responds to Twilio quickly and processes asynchronously, matching the existing `setImmediate` shape at `twilio-webhook-controller.ts:33–46`. A slow handler causes Twilio retries, which multiplies the work.
- [x] Only composition-**completed** events register an artifact. Other statuses are acknowledged and ignored, and the ignore is logged at debug/info with the status.
- [x] **A failed composition is not registered as an artifact.** It may be logged; it must not become a row that promises playable media.
- [x] The webhook payload is treated as **untrusted**. Status and size come from `fetchCompositionMetadata` (`twilio-compositions.ts:292`), not from whatever the request body claims.
- [x] The session is resolved from the composition's room SID. Twilio composition SIDs start with `CJ`; room SIDs start with `RM` — a payload that has these confused is rejected as invalid input, not guessed at.
- [x] **The same composition SID delivered twice writes exactly one row.** Twilio retries on any non-2xx and can duplicate on its own. This rides rec-02's REC1-D2 idempotency — do not build a second mechanism.
- [x] A composition for a session that cannot be resolved is logged and dropped cleanly. It must not throw an unhandled rejection or wedge the endpoint.
- [x] Registration failures are logged at error severity and do **not** produce a non-2xx to Twilio after the response has already been sent.

### 4. The callback URL is actually mounted

- [x] The composition-finalised callback URL is configured against whatever step 0 determined the creation mechanism to be, derived from `WEBHOOK_BASE_URL` (`env.ts:252`).
- [x] The mounting is **documented in this task file**, including how to reverse it. If it is console configuration rather than code, say so explicitly and record what was set — otherwise the next reader has the same unanswerable question this task started with.
- [ ] An end-to-end confirmation: a real composition finalising produces a `recording_artifact_index` row without anyone running the poll. **Needs a live consult after this hook** — unit tests cover the path; founder smoke is still open.

### 5. The poll stays (REC1-D4)

- [x] `voice-transcription-worker.ts:142–187` is **unchanged.** REC-D21 keeps it as the fallback.
- [x] The TODO at L133–135 may have its comment updated to point at the now-shipped webhook. **The polling behaviour itself does not change in this task.**
- [x] Webhook and poll resolving the same composition concurrently still yields one row (rec-02's UNIQUE constraint absorbs it) — covered by a test.

### 6. Observability

- [x] Every log line carries a correlation ID, following `req.correlationId` as the existing controller does at L29.
- [x] **No PHI in any log line.** Composition SIDs, room SIDs, session IDs, event types and correlation IDs are fine. Patient names, phone numbers and DOBs are not. **Never log the raw request body** — Twilio payloads are not PHI-audited by us and must not be dumped wholesale.
- [x] Enough structured signal exists to answer "did the webhook fire for this consult, and did it write a row" from logs alone.

### Out of scope

- **Adding signature verification to the existing `POST /webhooks/twilio/room-status`.** It genuinely lacks it and that is a real gap — capture it to `docs/Work/capture/inbox.md` and move on. Fixing it here doubles the blast radius of an already-Opus task.
- Re-implementing any part of rec-02's writer.
- Removing or altering the poll (REC1-D4).
- Video-consult parity — that is [`rec-03`](./task-rec-03-video-consult-artifact-parity.md).
- Changing replay resolution — that is [`rec-04`](./task-rec-04-replay-resolves-from-index.md).
- Backfilling historical sessions — that is [`rec-05`](./task-rec-05-artifact-index-backfill.md).
- Recording rules, room create/end, consent, pause, escalation.

---

## Scope Guard

- **Expected files touched: 4–6.** The webhooks router, a controller, a thin handler service, tests, and — only if step 0 requires it — one env entry plus its `.env.example` line.
- **DO NOT** modify the existing `handleTwilioRoomStatusWebhook` or `consultation-verification-service.ts`.
- **DO NOT** modify `voice-transcription-worker.ts` beyond the L133–135 comment.
- **DO NOT** modify rec-02's writer. If it needs a change to serve this task, **stop and surface** — a Wave 1 contract that does not survive first contact with Wave 2 is worth a conversation, not a quiet patch.
- **DO NOT** write a migration. **STOP and surface** if you think you need one.
- **DO NOT** create Compositions in code without an explicit decision from step 0.
- **DO NOT** touch `recording-access-service.ts`, `recording-track-service.ts`, `recording-pause-service.ts`, or `recording-escalation-service.ts`.

---

## Global safety gate

- **Data touched?** Yes — indirectly, via rec-02's writer into `recording_artifact_index`. **RLS unchanged** (service-role only, 056 L117).
- **Any PHI in logs?** **No.** SIDs and correlation IDs only; raw payloads never logged.
- **External API call?** Yes — inbound Twilio webhook plus outbound composition metadata reads. **Verification confirmed** per criterion 2. No AI calls.
- **Retention / deletion impact?** Yes, indirectly — rows written here become archival-worker candidates. `ARCHIVAL_HARD_DELETE_ENABLED` stays `false` (REC1-D7).

---

## Done when

- Step 0's answer is written into this file; a verified Twilio composition-completed callback creates exactly one `recording_artifact_index` row via rec-02's writer; a tampered or unsigned request is rejected and audited; duplicate deliveries and webhook/poll races both collapse to one row; the callback URL is mounted and its reversal documented; the poll is unchanged; no PHI and no raw payload in logs; no migration; backend typecheck + lint + tests green.

---

## Related

- Batch plan: [`plan-p1-recording-governance-v2-artifact-registry-batch.md`](../plan-p1-recording-governance-v2-artifact-registry-batch.md)
- Charter: [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)
- Execution order: [`EXECUTION-ORDER-p1-recording-governance-v2-artifact-registry.md`](./EXECUTION-ORDER-p1-recording-governance-v2-artifact-registry.md)
- Depends on: [`rec-02`](./task-rec-02-artifact-registry-writer.md)
- Consumed by: [`rec-03`](./task-rec-03-video-consult-artifact-parity.md), [`rec-04`](./task-rec-04-replay-resolves-from-index.md)

---

**Last Updated:** 2026-08-18. Implemented. Hook `HKbe336c348bce4c81907f6a3c55844a82` mounted. Live e2e smoke still open.
