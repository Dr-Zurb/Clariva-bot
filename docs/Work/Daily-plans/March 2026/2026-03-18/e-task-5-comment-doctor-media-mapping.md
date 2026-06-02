# Task 5: Comment Doctor–Media Mapping
## 2026-03-18 — Comments Management Initiative

---

## 📋 Task Overview

Create a service to resolve `media_id` from an Instagram comment to `doctor_id`. The comment webhook provides `media_id` (the post) and `entry[].id` (the Instagram account). We must map the media owner or the subscribed account to the doctor who owns that Instagram.

**Estimated Time:** 3–4 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-03-18

**Change Type:**
- [ ] **New feature** — Add service only

**Current State:**
- ✅ **What exists:** `doctor_instagram` table (doctor_id, instagram_page_id, instagram_access_token); `getDoctorIdByPageId(pageId)` resolves page_id → doctor_id; Instagram Graph API usage in instagram-service; axios for HTTP
- ❌ **What's missing:** Resolution of media_id or entry.id (comment context) to doctor_id; Instagram Graph API call to fetch media owner if needed
- ⚠️ **Notes:** Meta comment webhook: `entry[].id` = Instagram account ID for the subscribed object. Match `entry[].id` to `doctor_instagram.instagram_page_id` (or equivalent). If `instagram_page_id` differs from Instagram account ID, may need API lookup: `GET /{media_id}?fields=owner` → owner.id → match to doctor.

---

## ✅ Task Breakdown (Hierarchical)

### 1. Resolution Strategy

- [x] 1.1 Determine mapping - **Completed: 2026-03-18**
  - [x] 1.1.1 `entry[].id` (Instagram account ID) → `doctor_instagram.instagram_page_id` direct lookup
  - [x] 1.1.2 Fallback: `GET /{media_id}?fields=owner` with each doctor's token; owner.id matches → doctor found
- [x] 1.2 Meta docs: entry.id = subscribed account; owner only returned when token owner created media

### 2. Service Implementation

- [x] 2.1 Create `backend/src/services/comment-media-service.ts` - **Completed: 2026-03-18**
  - [x] 2.1.1 `resolveDoctorIdFromComment(entryId, mediaId, correlationId): Promise<string | null>`
  - [x] 2.1.2 Direct lookup via `getDoctorIdByPageId(entryId)`
  - [x] 2.1.3 Fallback: iterate doctor_instagram, GET media?fields=owner per token, match owner.id
  - [x] 2.1.4 Return doctor_id or null
- [x] 2.2 Uses doctor tokens from doctor_instagram for API
- [x] 2.3 No PHI in logs (correlationId, entryId, mediaId only)

### 3. Error Handling

- [x] 3.1 API failures: log, return null (worker will skip)
- [x] 3.2 429: log and return null; 400/403: try next doctor

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── comment-media-service.ts   (NEW) or extend instagram-connect-service
└── types/
    └── (optional) comment types
```

---

## 🧠 Design Constraints

- Service layer: no Express; framework-agnostic
- Use getSupabaseAdminClient for DB lookup
- Use doctor's Instagram access token for API (multi-tenant)
- No PHI in logs

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y — read doctor_instagram)
  - [ ] **RLS verified?** (Y — service role for worker)
- [ ] **Any PHI in logs?** (No)
- [ ] **External API or AI call?** (Y — Instagram Graph API)
  - [ ] **Consent + redaction confirmed?** (Y — no PHI in request)

---

## 🔗 Related Tasks

- [e-task-4-comment-webhook-types-and-routing](./e-task-4-comment-webhook-types-and-routing.md)
- [e-task-7-comment-worker-and-outreach](./e-task-7-comment-worker-and-outreach.md)

---

**Last Updated:** 2026-03-18  
**Completed:** 2026-03-18  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)
