# Receptionist bot — engineering map & hardening backlog

**Purpose:** Single place for *how* the Instagram DM + comment bot works in code, *what* to improve for market readiness, and *where* redundancy lives. Update this doc when you change flows.

**Day context:** [2026-03-25 README](../README.md) — bot intelligence & conversation UX.

---

## Related docs

- [WEBHOOKS.md](../../../../../Reference/WEBHOOKS.md)
- [EXTERNAL_SERVICES.md](../../../../../Reference/EXTERNAL_SERVICES.md)
- [RECEPTIONIST_BOT_CONVERSATION_RULES.md](../../../../../Reference/RECEPTIONIST_BOT_CONVERSATION_RULES.md)
- [COMPLETE_FEATURE_SET.md](../../../../../Business%20files/COMPLETE_FEATURE_SET.md) §1 (channel & acquisition)

---

## 1. Component map

| Layer | File(s) | Role |
|-------|---------|------|
| HTTP + verify | `backend/src/routes/webhooks.ts`, `webhook-controller.ts` | GET challenge, POST ingest, **raw body** signature, idempotency, queue |
| Queue | `backend/src/config/queue.ts`, `WEBHOOK_JOB_NAME` | BullMQ job: `eventId`, `provider`, `payload`, `correlationId` |
| Worker (orchestration) | `webhook-worker.ts` (router + BullMQ), `instagram-comment-webhook-handler.ts`, `instagram-dm-webhook-handler.ts`, `webhook-dm-send.ts` | Payment router; comment pipeline; **DM state machine**; **DM locks/throttle/fallback** (RBH-05 split) |
| Instagram API | `backend/src/services/instagram-service.ts` | `sendInstagramMessage`, `replyToInstagramComment`, `COMMENT_PUBLIC_REPLY_TEXT`, retries, 2018001-style fallbacks |
| Doctor ↔ IG | `backend/src/services/instagram-connect-service.ts` | Page ID → `doctor_id`, per-doctor token |
| Comment routing | `backend/src/services/comment-media-service.ts` | `entry_id` → doctor; media owner API fallback |
| Leads | `backend/src/services/comment-lead-service.ts` | Idempotent `comment_leads` rows |
| AI | `backend/src/services/ai-service.ts` | `classifyIntent`, `classifyCommentIntent`, `generateResponse`, `generateResponseWithActions`, redaction, caching |
| Conversation | `backend/src/services/conversation-service.ts`, `message-service.ts` | State, messages; worker uses Redis locks |
| Collection / consent | `collection-service.ts`, `consent-service.ts`, `extract-patient-fields.ts` | Booking field capture, consent grant/deny |
| Actions | `backend/src/services/action-executor-service.ts` | Tool execution (e.g. `confirm_cancel`) |
| Webhook helpers | `backend/src/utils/webhook-event-id.ts` | Payload typing, comment vs DM, dedup, echo detection |
| Types | `backend/src/types/webhook.ts`, `types/ai.ts` | Payload shapes, intents |

---

## 2. Request paths (two products in one worker)

### 2.1 Comments (`entry[].changes[]`, field `comments` / `live_comments`)

1. Controller detects comment payload → idempotency → enqueue (no PHI in logs).
2. Worker router → `processInstagramCommentWebhook`: `parseInstagramCommentPayload` → `resolveDoctorIdFromComment`.
3. Skip if commenter is doctor page (bot echo).
4. `classifyCommentIntent` → optional `isPossiblyMedicalComment` second pass for spam/joke/unrelated.
5. `createCommentLead`; if high intent: template **DM** + **public reply** (`COMMENT_PUBLIC_REPLY_TEXT`) + update lead; `sendCommentLeadToDoctor` (email).
6. Mark processed; **no** shared DM conversation state machine.

### 2.2 DMs (`messaging[]` or `changes` messages)

1. Controller: skip non-actionable, **don’t queue `message_edit`**, skip echo, content dedup (except short flow words), queue.
2. Worker router → `processInstagramDmWebhook`: `parseInstagramMessage` → optional `tryResolveSenderFromMessageEdit` (DB mid, Graph API, single-conversation fallback, `decodeMidExperimental`).
3. Resolve doctor + **doctor token** (failure = no reply).
4. Per-conversation **Redis lock** (`tryAcquireConversationLock`).
5. Placeholder patient + find/create conversation; `classifyIntent` → store patient message.
6. Large **`if / else if` state machine**: cancel/reschedule, `medical_query` / `emergency`, `check_appointment_status`, book / collect / confirm / match / consent, slot steps, AI fallback (`generateResponse` / `generateResponseWithActions`). **RBH-09:** If `doctor_settings.instagram_receptionist_paused`, only a single handoff DM is sent (`resolveInstagramReceptionistPauseMessage`); `revoke_consent` still runs. Comments: high-intent DM + public reply skipped when paused; lead row + doctor email unchanged.
7. Persist bot message → `updateConversationState` → **send lock** + **reply throttle** → `sendInstagramMessage` (NotFound fallback via `getSenderFromMostRecentConversation` for 2018001).
8. **Conflict recovery** on duplicate create: regen shorter reply + send + mark processed.
9. `finally`: release conversation lock; success path `markWebhookProcessed` after try/catch.

---

## 3. Conversation `state.step` values (reference)

Includes `collecting_all`, `consent`, `confirm_details`, `awaiting_match_confirmation`, `awaiting_slot_selection` (canonical for slot link / post-picker; **RBH-06**), `awaiting_cancel_choice`, `awaiting_cancel_confirmation`, `awaiting_reschedule_choice`, `awaiting_reschedule_slot`, multi-book flags, `responded`, etc. Legacy `selecting_slot` / `confirming_slot` are normalized away (migration + worker). **Treat step strings as API**—grep before rename.

**RBH-07 — `state.lastPromptKind`:** On each DM turn, persisted state also sets `lastPromptKind` from `step` (`collect_details`, `confirm_details`, `consent`, `match_pick`, `cancel_confirm`, or cleared). Routes that used to infer intent from substrings in the last bot message prefer this field with legacy substring fallback.

---

## 4. Tests today

- `backend/tests/unit/workers/webhook-worker.test.ts` — lifecycle, some job paths, mocks (limited coverage of full DM tree).
- `backend/tests/unit/workers/webhook-worker-characterization.test.ts` — RBH-02 DM/comment branches (mocked).
- `backend/tests/unit/controllers/webhook-controller.test.ts`
- Integration: `test-webhook-event-id`, `test-webhook-idempotency`, `test-webhook-verification`, `test-webhook-controller`

**Gap:** Broader DM-tree coverage optional; **RBH-02** characterization tests cover key branches. Further splits of `instagram-dm-webhook-handler.ts` can add focused tests.

---

## 5. Redundancy & structural issues

| Issue | Where | Recommendation |
|-------|--------|----------------|
| **God module** | `webhook-worker.ts` | ✅ **RBH-05:** Router + `instagram-comment-webhook-handler.ts` + `instagram-dm-webhook-handler.ts`; shared send = `webhook-dm-send.ts` (RBH-04). |
| **Copy-paste** | Cancel vs reschedule upcoming listing | ✅ **RBH-03:** `webhook-appointment-helpers.ts` — `buildRelatedPatientIdsForWebhook`, `getMergedUpcomingAppointmentsForRelatedPatients` (check-status uses same merge). |
| **Duplicate send path** | Happy path vs conflict recovery | ✅ **RBH-04:** `webhook-dm-send.ts` — `sendInstagramDmWithLocksAndFallback` (locks, throttle, 2018001 fallback). |
| **Legacy steps** | `selecting_slot`, `confirming_slot` | ✅ **RBH-06:** Canonical `awaiting_slot_selection`; SQL `032_*`; worker normalize + removed legacy branches. |
| **`decodeMidExperimental`** | `instagram-dm-webhook-handler.ts` → `tryResolveSenderFromMessageEdit` | Heuristic mid decode (last resort). **Do not delete** without sign-off. Canonical write-up: [WEBHOOKS.md § RBH-11](../../../../../Reference/WEBHOOKS.md); operator context: [instagram-dm-reply-troubleshooting.md](../../../February%202026/Week%203/instagram-dm-reply-troubleshooting.md). |
| **Heuristic brittleness** | `lastBotMessageAskedFor*` substring checks | Prefer structured `lastPromptKind` in state when tightening UX. |

**Verdict:** Little to safely delete without tests; redundancy is **structural**, not orphan functions.

---

## 6. Security & reliability

1. **Signature verification** — `POST /webhooks/instagram`: HMAC is always *attempted* first; **documented** outcomes when verification fails are in **[WEBHOOK_SECURITY.md](../../../../../Reference/WEBHOOK_SECURITY.md)** (branch matrix, threat model, staging checklist, re-audit triggers — **RBH-08**). Code: `webhook-controller.ts` (`handleInstagramWebhook`). Payment webhooks: strict verification (no Instagram-style bypass).
2. **Raw body** — Middleware order in `index.ts` is critical.
3. **PHI** — Never log full webhook body or message text in production logs.
4. **Idempotency** — Comment vs DM event IDs differ; short-word dedup exception for conversational “yes”/“no”.
5. **Rate limits** — `webhookLimiter` on webhook routes (`middleware/rate-limiters.ts`).

---

## 7. Suggested improvement order

**Task files (tracked):** [docs/task-management/tasks/receptionist-bot-hardening/README.md](../../../../../task-management/tasks/receptionist-bot-hardening/README.md) — RBH-01 … RBH-11.

1. Observability: queue depth, worker failures, send/comment DM success rates. → **RBH-01**
2. Tests: golden-path DM, comment high-intent (mocked IG). → **RBH-02**
3. Refactor: shared helpers → split modules (no behavior change). → **RBH-03**, **RBH-04**, **RBH-05**
4. Legacy steps migration → **RBH-06**; structured prompts → **RBH-07**; signature threat model → **RBH-08**
5. Product: pause bot / human handoff → **RBH-09** ✅; dashboard IG health → **RBH-10** ✅; message_edit docs (**RBH-11**)
6. AI: Align comment vs DM prompts; unified redaction/caching policy (ties to [e-task-1](../e-task-1-ai-context-enhancement.md), [e-task-2](../e-task-2-ai-prompt-improvements.md)).

---

## Changelog

| Date | Notes |
|------|--------|
| 2026-03-28 | Initial engineering map; living copy under Receptionist Bot improvements folder. |
| 2026-03-28 | Linked improvement order to task-management RBH-01…RBH-11. |
| 2026-03-28 | RBH-03: shared `webhook-appointment-helpers` for merged upcoming appointments. |
| 2026-03-28 | RBH-04: shared `webhook-dm-send` for DM locks, throttle, 2018001 fallback (main + conflict recovery). |
| 2026-03-28 | RBH-05: split worker — `instagram-comment-webhook-handler`, `instagram-dm-webhook-handler`; thin `webhook-worker` router. |
| 2026-03-28 | RBH-06: legacy slot steps → `awaiting_slot_selection` (migration 032, `normalizeLegacySlotConversationSteps`). |
| 2026-03-28 | RBH-08: [WEBHOOK_SECURITY.md](../../../../../Reference/WEBHOOK_SECURITY.md) — Instagram signature-failure branches & threat model; §6 updated. |
| 2026-03-28 | RBH-09: `instagram_receptionist_paused` + optional pause message (migration 033); DM + comment worker gating; dashboard **Bot Messages**; audit on toggle. |
| 2026-03-28 | RBH-10: Instagram dashboard health — `debug_token` + 5m cache (migration 034); GET `/settings/instagram/status` includes `health`; last DM success from `webhook-dm-send`. |
| 2026-03-28 | **RBH-11:** [WEBHOOKS.md](../../../../../Reference/WEBHOOKS.md) — `message_edit` ingest vs worker fallbacks (`tryResolveSenderFromMessageEdit`, `decodeMidExperimental`); §5 links + troubleshooting code paths updated. |
