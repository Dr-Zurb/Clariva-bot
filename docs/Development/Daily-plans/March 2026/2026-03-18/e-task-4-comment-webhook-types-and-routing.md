# Task 4: Comment Webhook Types and Routing
## 2026-03-18 — Comments Management Initiative

---

## 📋 Task Overview

Add TypeScript types for Instagram comment webhook payloads and extend the webhook controller to detect comment events, extract event ID, apply idempotency, and queue for processing. Comment events use `entry[].changes[]` with `field: "comments"` (different from DM `entry[].messaging[]`).

**Estimated Time:** 3–4 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-18

**Change Type:**
- [ ] **Update existing** — Extend webhook-controller, webhook-event-id, types; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** `webhook-controller.ts` handles Instagram POST; checks `entry[].messaging[]`; `extractInstagramEventId`, `getInstagramPayloadStructure`, `isNonActionableInstagramEvent` in webhook-event-id; `InstagramWebhookPayload` in types/webhook.ts (messaging only)
- ❌ **What's missing:** Comment payload type; detection of `changes` with `field: "comments"`; event ID extraction for comments (comment_id); routing comment payloads to queue
- ⚠️ **Notes:** Same POST /webhooks/instagram receives both DMs and comments; must distinguish and handle both

**Scope Guard:**
- Expected files touched: ≤ 5

---

## ✅ Task Breakdown (Hierarchical)

### 1. Webhook Types

- [x] 1.1 Extend `backend/src/types/webhook.ts` - **Completed: 2026-03-18**
  - [x] 1.1.1 Add `InstagramCommentWebhookPayload` with `entry[].changes[]` and `field: "comments"`
  - [x] 1.1.2 Document payload structure per Meta docs (comment_id, commenter from.id, text, media_id)

### 2. Webhook Event ID and Detection

- [x] 2.1 Extend `backend/src/utils/webhook-event-id.ts` - **Completed: 2026-03-18**
  - [x] 2.1.1 Add `isInstagramCommentPayload(body)` — true when `entry[].changes[]` has `field === "comments"`
  - [x] 2.1.2 Add `extractInstagramCommentEventId(body)` — returns `comment_id` for idempotency
  - [x] 2.1.3 Add `parseInstagramCommentPayload(body)` — returns `{ commentId, commenterIgId, commentText, mediaId, entryId }` or null

### 3. Webhook Controller

- [x] 3.1 Update `handleInstagramWebhook` in `backend/src/controllers/webhook-controller.ts` - **Completed: 2026-03-18**
  - [x] 3.1.1 Early branch: if `isInstagramCommentPayload(req.body)`, use comment flow
  - [x] 3.1.2 Comment flow: extract eventId via `extractInstagramCommentEventId`; skip messaging-specific checks (echo, message_edit, dedup)
  - [x] 3.1.3 Apply same idempotency, mark processing, queue (provider: 'instagram', eventId: comment_id)
  - [x] 3.1.4 Signature verification applies to all Instagram POSTs (same endpoint)
- [x] 3.2 Comment payloads return 200 OK within Meta timeout

### 4. Queue and Worker Entry

- [x] 4.1 Worker distinguishes comment vs messaging jobs - **Completed: 2026-03-18**
  - [x] 4.1.1 Use payload structure: if `entry[].changes[]` present with comments → comment handler; else → existing DM handler
  - [x] 4.1.2 Same queue, same job name; worker branches on payload type (stub for e-task-7)

---

## 📁 Files to Create/Update

```
backend/src/
├── types/
│   └── webhook.ts              (UPDATE - comment payload type)
├── utils/
│   └── webhook-event-id.ts    (UPDATE - comment detection, extraction)
├── controllers/
│   └── webhook-controller.ts  (UPDATE - comment branch)
└── workers/
    └── webhook-worker.ts      (UPDATE - comment job branch, minimal stub)
```

**When updating existing code:**
- [ ] Audit: webhook-controller flow, webhook-event-id exports
- [ ] Map impact: controller, worker, types
- [ ] No removal of existing DM handling

---

## 🧠 Design Constraints

- No PHI in logs; comment text in payload — never log
- Signature verification applies to all Instagram POSTs (same secret)
- Idempotency: same event_id + provider prevents duplicate processing

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (N — no DB yet)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (N)

---

## 🔗 Related Tasks

- [e-task-3-comment-leads-migration](./e-task-3-comment-leads-migration.md)
- [e-task-5-comment-doctor-media-mapping](./e-task-5-comment-doctor-media-mapping.md)
- [e-task-7-comment-worker-and-outreach](./e-task-7-comment-worker-and-outreach.md)

---

**Last Updated:** 2026-03-18  
**Completed:** 2026-03-18  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)
