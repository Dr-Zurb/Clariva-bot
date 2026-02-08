# Task 14: Use doctor's Instagram token for sending replies
## 2026-02-06 - Webhook reply token (per-doctor)

---

## 📋 Task Overview

When the webhook worker processes an incoming Instagram DM, it must send the reply using the **connected doctor's** access token (stored in `doctor_instagram.instagram_access_token`), not the global `INSTAGRAM_ACCESS_TOKEN` env var. This enables correct behavior after e-task-13 (per-doctor OAuth connect): each doctor's replies are sent with their own token.

**Estimated Time:** 1–2 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-02-06

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — Change send flow to use per-doctor token; follow [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** `sendInstagramMessage(recipientId, message, correlationId)` in instagram-service.ts uses `env.INSTAGRAM_ACCESS_TOKEN` only. Webhook worker resolves `doctorId` via `getDoctorIdByPageId(pageId)` but does not fetch or pass a token. `doctor_instagram` stores `instagram_access_token` per doctor when they connect (e-task-13).
- ❌ **What's missing:** A way to get the doctor's token from DB; pass that token into the send path; worker must fetch token for resolved doctor and pass it when sending. Env token becomes optional fallback (e.g. when no doctor linked and fallback reply is sent).
- ⚠️ **Notes:** Token must never appear in logs (COMPLIANCE.md). Use service-role client to read from doctor_instagram.

**Scope Guard:** Expected files touched: ≤ 5

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md) - Audit, impact, remove obsolete
- [STANDARDS.md](../../../../../Reference/STANDARDS.md) - Error handling, no token in logs
- [ARCHITECTURE.md](../../../../../Reference/ARCHITECTURE.md) - Service layer; no Express in services
- [COMPLIANCE.md](../../../../../Reference/COMPLIANCE.md) - No token/code in logs; audit

---

## ✅ Task Breakdown (Hierarchical)

### 1. Audit (per CODE_CHANGE_RULES)
- [x] 1.1 Grep for INSTAGRAM_ACCESS_TOKEN, sendInstagramMessage, getDoctorIdByPageId in backend
- [x] 1.2 List callers: webhook-worker (getDoctorIdByPageId, sendInstagramMessage x2 — fallback and main reply)
- [x] 1.3 Impact list: instagram-connect-service.ts (new getter), instagram-service.ts (optional token param), webhook-worker.ts (fetch token, pass to send), .env.example (document INSTAGRAM_ACCESS_TOKEN optional)

### 2. Service: Get doctor's token
- [x] 2.1 Add function in instagram-connect-service to return instagram_access_token for a given doctor_id (query doctor_instagram by doctor_id, select token only)
- [x] 2.2 Return null when no row; never log or expose token (COMPLIANCE)
- [x] 2.3 Use getSupabaseAdminClient (service role) for read

### 3. Service: Send with optional token
- [x] 3.1 Extend send path in instagram-service to accept an optional access token parameter
- [x] 3.2 When token provided, use it for the API call; when not provided, use env.INSTAGRAM_ACCESS_TOKEN (backward compatibility)
- [x] 3.3 Require at least one of: passed token or env token; throw clear error if both missing

### 4. Worker: Use doctor token when sending
- [x] 4.1 After resolving doctorId, fetch that doctor's token (new getter)
- [x] 4.2 When sending main reply, pass doctor's token into sendInstagramMessage
- [x] 4.3 When sending fallback reply (unknown page), call send without token (env fallback) or skip send if no env token
- [x] 4.4 If doctorId exists but token is null, log warning (no token in log), mark webhook failed or skip send

### 5. Config and env
- [x] 5.1 .env.example: Note that INSTAGRAM_ACCESS_TOKEN is optional when all doctors connect via OAuth; used only as fallback (e.g. unknown page reply) if set

### 6. Verification
- [x] 6.1 Type-check and lint
- [x] 6.2 Existing instagram-connect and webhook tests still pass; add or adjust tests if needed for new getter
- [ ] 6.3 No token or secret in logs (manual/log review)

---

## 📁 Files to Create/Update

```
backend/
├── .env.example                                    (UPDATE - note INSTAGRAM_ACCESS_TOKEN optional)
├── src/
│   ├── services/
│   │   ├── instagram-connect-service.ts            (UPDATE - add getter for doctor token)
│   │   └── instagram-service.ts                    (UPDATE - optional token param, use in API)
│   └── workers/
│       └── webhook-worker.ts                       (UPDATE - fetch token, pass to send)
└── tests/unit/...                                  (UPDATE if new getter or send signature tested)
```

**Existing Code Status:**
- ✅ instagram-connect-service.ts - EXISTS (getDoctorIdByPageId, saveDoctorInstagram; no token getter)
- ✅ instagram-service.ts - EXISTS (sendInstagramMessage uses env.INSTAGRAM_ACCESS_TOKEN only)
- ✅ webhook-worker.ts - EXISTS (calls sendInstagramMessage without token)

**When updating existing code:** (per [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md))
- [ ] Audit: instagram-connect-service, instagram-service, webhook-worker, env
- [ ] Map: New getter; send path optional param; worker fetch + pass
- [ ] Remove: Nothing removed; env token remains as fallback
- [ ] Update tests and .env.example per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Service layer must not import Express types (ARCHITECTURE.md)
- No token, code, or app secret in logs or audit metadata (COMPLIANCE.md, STANDARDS.md)
- Use getSupabaseAdminClient for reading doctor_instagram (callback/worker have no user session)
- instagram_service sends via Instagram Graph API; token must be the page/account token for the recipient's conversation

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (N – read-only from doctor_instagram; no schema change)
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API or AI call?** (Y – Instagram API for sending)
  - [x] Consent + redaction confirmed: No token in logs; only metadata (recipient_id, message_length, status)
- [x] **Retention / deletion impact?** (N)

**Rationale:** Token is read from DB and passed in process only; never logged. Sending already existed; only the token source changes.

---

## ✅ Acceptance & Verification Criteria

Task is complete **only when**:

- [x] Webhook worker sends replies using the resolved doctor's token from doctor_instagram when doctorId is known
- [x] When doctor has no token (row missing or token null), worker does not send or marks failed; no token in logs
- [x] Fallback reply for unknown page may still use env.INSTAGRAM_ACCESS_TOKEN when set
- [x] Type-check and lint pass
- [x] .env.example documents INSTAGRAM_ACCESS_TOKEN as optional (per-doctor connect)

---

## 🔗 Related Tasks

- [e-task-13: Instagram API (Instagram Login)](./e-task-13-instagram-api-instagram-login-migration.md) — per-doctor token stored in doctor_instagram
- [e-task-2: Webhook resolution page_id → doctor_id](./e-task-2-webhook-resolution-page-id-to-doctor-id.md) — worker uses getDoctorIdByPageId

---

## 🐛 Issues Encountered & Resolved

_(Record any issues and solutions during implementation.)_

---

## 📝 Notes

- INSTAGRAM_ACCESS_TOKEN in env is legacy for single-tenant or manual token; with OAuth connect it is optional and used only when no per-doctor token is available (e.g. fallback reply to unknown page).

---

**Last Updated:** 2026-02-06  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
