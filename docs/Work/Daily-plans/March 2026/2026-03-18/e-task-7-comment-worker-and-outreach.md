# Task 7: Comment Worker and Outreach
## 2026-03-18 — Comments Management Initiative

---

## 📋 Task Overview

Implement the webhook worker branch for Instagram comment jobs: parse payload, resolve doctor, classify intent, store lead, and for high-intent comments send proactive DM and public reply. Orchestrates comment-media-service, comment intent classifier, comment_leads storage, Instagram reply API, and sendInstagramMessage.

**Estimated Time:** 6–8 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-18

**Change Type:**
- [ ] **Update existing** — Extend webhook-worker; add comment reply to instagram-service; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** webhook-worker processes Instagram jobs (DM flow); `sendInstagramMessage` in instagram-service; `getDoctorIdByPageId`, `getInstagramAccessTokenForDoctor`; `getDoctorSettings`; notification-service for doctor emails; comment_leads table (e-task-3); comment webhook routing (e-task-4); doctor-media mapping (e-task-5); comment intent classifier (e-task-6)
- ❌ **What's missing:** Worker branch for comment payloads; comment reply API (POST /{comment_id}/replies); lead storage service; DM template selection by intent; doctor notification for comment leads; deduplication (one reply+DM per commenter per media)
- ⚠️ **Notes:** Depends on e-task-3, 4, 5, 6

**Scope Guard:**
- Expected files touched: ≤ 8

---

## ✅ Task Breakdown (Hierarchical)

### 1. Comment Reply API

- [x] 1.1 Add to `backend/src/services/instagram-service.ts` - **Completed: 2026-03-18**
  - [x] 1.1.1 `replyToInstagramComment(commentId, message, accessToken, correlationId)`
  - [x] 1.1.2 POST /{comment_id}/replies per Instagram Graph API
  - [x] 1.1.3 Uses doctor's access token
  - [x] 1.1.4 COMMENT_PUBLIC_REPLY_TEXT = "Check your DM for more information."
- [x] 1.2 Error handling: 403/404 return null; 429 throws TooManyRequestsError

### 2. Lead Storage Service

- [x] 2.1 Create `backend/src/services/comment-lead-service.ts` - **Completed: 2026-03-18**
  - [x] 2.1.1 `createCommentLead(input, correlationId)` — insert or update
  - [x] 2.1.2 comment_id unique for idempotency; update dm_sent/public_reply_sent on outreach
  - [x] 2.1.3 `linkCommentLeadToConversation(commenterIgId, conversationId, correlationId)`
- [x] 2.2 comment_id idempotency suffices

### 3. DM Template and Doctor Details

- [x] 3.1 `buildCommentDMMessage(intent, settings)` in webhook-worker - **Completed: 2026-03-18**
  - [x] 3.1.1 Acknowledgment + doctor details + CTA per intent
  - [x] 3.1.2 practice_name, specialty, address_summary from getDoctorSettings
- [x] 3.2 No prices or promotional language

### 4. Worker Comment Branch

- [x] 4.1 Comment payload detection (existing from e-task-4) - **Completed: 2026-03-18**
- [x] 4.2 Full comment handler flow
  - [x] 4.2.1 Parse via parseInstagramCommentPayload
  - [x] 4.2.2 Resolve doctor via resolveDoctorIdFromComment
  - [x] 4.2.3 No doctor → log, mark processed, return
  - [x] 4.2.4 Classify via classifyCommentIntent
  - [x] 4.2.5 Skip intents → no store, mark processed
  - [x] 4.2.6 Store lead (high + low intent)
  - [x] 4.2.7 High-intent: DM first, then public reply; update lead
  - [x] 4.2.8 sendCommentLeadToDoctor (email)
- [x] 4.3 markWebhookProcessed on success

### 5. Doctor Notification

- [x] 5.1 `sendCommentLeadToDoctor` in notification-service - **Completed: 2026-03-18**
  - [x] 5.1.1 Email with intent + redacted comment preview
  - [x] 5.1.2 Uses redactPhiForAI for preview
- [ ] 5.2 Dashboard API (future task)

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   ├── instagram-service.ts      (UPDATE - replyToInstagramComment)
│   ├── comment-lead-service.ts  (NEW)
│   └── notification-service.ts  (UPDATE - comment lead notification)
├── workers/
│   └── webhook-worker.ts         (UPDATE - comment branch)
└── types/
    └── (optional) comment-lead types
```

---

## 🧠 Design Constraints

- Order: DM first, then public reply (so user has message when they check)
- Public reply: fixed text only; no solicitation
- No PHI in logs
- Use doctor's token for reply and DM (multi-tenant)

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y — comment_leads, audit)
  - [ ] **RLS verified?** (Y)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (Y — Instagram API, AI in classifier)
  - [ ] **Consent + redaction confirmed?** (Y)

---

## 🔗 Related Tasks

- [e-task-3-comment-leads-migration](./e-task-3-comment-leads-migration.md)
- [e-task-4-comment-webhook-types-and-routing](./e-task-4-comment-webhook-types-and-routing.md)
- [e-task-5-comment-doctor-media-mapping](./e-task-5-comment-doctor-media-mapping.md)
- [e-task-6-comment-intent-classifier](./e-task-6-comment-intent-classifier.md)
- [COMMENTS_MANAGEMENT_PLAN.md](./COMMENTS_MANAGEMENT_PLAN.md)

---

**Last Updated:** 2026-03-18  
**Completed:** 2026-03-18  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)
