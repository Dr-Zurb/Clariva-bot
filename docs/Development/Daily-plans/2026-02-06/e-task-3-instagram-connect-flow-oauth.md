# Task 3: Instagram connect flow (OAuth / callback)
## 2026-02-06 - Must-have 1: Connect Instagram

---

## 📋 Task Overview

Implement backend OAuth (or Meta Login) flow so an authenticated doctor can link their Instagram Business/Creator account (or Facebook Page): redirect to Meta, receive callback with page selection and code/token, exchange for long-lived token, save `instagram_page_id` and token for the current doctor. Tokens stored securely per COMPLIANCE.md.

**Estimated Time:** 3–4 hours  
**Status:** ✅ **IMPLEMENTED**  
**Completed:** 2026-02-06

**Change Type:**
- [x] **New feature**
- [ ] **Update existing**

**Current State:**
- ✅ **What exists:** Doctor auth via Supabase (JWT); doctor_instagram table (e-task-1) with doctor_id PK, instagram_page_id UNIQUE; instagram-connect-service (e-task-2) with getDoctorIdByPageId only; no OAuth or connect endpoints.
- ❌ **What's missing:** Redirect URL endpoint; callback endpoint; token exchange; save to doctor_instagram (saveDoctorInstagram); optional fetch of page/IG username for display.
- ⚠️ **Notes:** Meta App must be configured (app id, app secret, redirect URI). For MVP, documented “add your page to our app” may suffice; app review later. Table: instagram_page_id UNIQUE so one page links one doctor; same page_id for different doctor yields ConflictError (ERROR_CATALOG).

**Scope Guard:**
- Expected files touched: ≤ 8
- Any expansion requires explicit approval

**Reference Documentation:**
- [RECIPES.md](../../Reference/RECIPES.md) - Add route, controller, service; validation
- [STANDARDS.md](../../Reference/STANDARDS.md) - asyncHandler, Zod, AppError, ConflictError
- [ARCHITECTURE.md](../../Reference/ARCHITECTURE.md) - Controller → service → DB; no Express in services
- [COMPLIANCE.md](../../Reference/COMPLIANCE.md) - Token storage, audit, no token in logs
- [API_DESIGN.md](../../Reference/API_DESIGN.md) - Response format
- [EXTERNAL_SERVICES.md](../../Reference/EXTERNAL_SERVICES.md) - Meta OAuth timeouts, retries, error handling
- [SECURITY.md](../../Reference/SECURITY.md) - State/CSRF, input validation
- [TESTING.md](../../Reference/TESTING.md) - Test patterns; no PHI in tests
- [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md) - Completion checklist
- [ERROR_CATALOG.md](../../Reference/ERROR_CATALOG.md) - ConflictError for page-already-linked

---

## ✅ Task Breakdown (Hierarchical)

### 1. Connect start (redirect)
- [x] 1.1 Add endpoint (e.g. GET `/api/v1/instagram/connect` or `/api/v1/settings/instagram/connect`): requires auth (doctor JWT); build Meta OAuth URL with state (e.g. csrf + user id or session); redirect 302 to Meta
- [x] 1.2 State parameter: include nonce/csrf and optionally doctor id; validate on callback to prevent CSRF
- [x] 1.3 Zod: no body; auth middleware provides req.user

### 2. Callback (token exchange and save)
- [x] 2.1 Add endpoint (e.g. GET `/api/v1/instagram/callback` or `/api/v1/settings/instagram/callback`): query params code, state; verify state (csrf); exchange code for short-lived then long-lived token per Meta docs
- [x] 2.2 Fetch page list if needed; if multiple pages, accept page_id in query or first page; get page access token and page id
- [x] 2.3 Resolve doctor from state (or session) so save is for authenticated doctor only
- [x] 2.4 Upsert doctor_instagram: doctor_id, instagram_page_id, instagram_access_token, optional instagram_username (from Meta API if available); use admin client for insert/update (doctor already authenticated)
- [x] 2.5 Audit log: connection success (resource_type e.g. doctor_instagram; no token in metadata)
- [x] 2.6 Redirect to frontend settings page (e.g. `/dashboard/settings/instagram?connected=1`) or return JSON with success

### 3. Service layer
- [x] 3.1 Add service function(s) for OAuth: validate state (CSRF), exchange code for short-lived then long-lived token via Meta token endpoint, fetch page list and page access token, return pageId, accessToken, and optional username. Implementation per RECIPES.md and ARCHITECTURE.md (no Express in services).
  - [x] 3.1.1 Use timeouts and error handling per EXTERNAL_SERVICES.md for Meta API calls.
- [x] 3.2 Add service function to persist connection: upsert doctor_instagram (doctor_id, instagram_page_id, instagram_access_token, optional instagram_username). On unique violation (instagram_page_id already linked to another doctor), throw ConflictError with clear message per ERROR_CATALOG and STANDARDS.md.
- [x] 3.3 All external calls: no token or code in logs; audit with correlationId only (COMPLIANCE.md).

### 4. Security and compliance
- [x] 4.1 Token stored per COMPLIANCE (encryption at rest via Supabase; no token in logs or audit metadata).
- [x] 4.2 No token, code, or app secret in log messages or audit metadata values (STANDARDS.md, COMPLIANCE.md).
- [x] 4.3 Validate required env (e.g. META_APP_ID, META_APP_SECRET, INSTAGRAM_REDIRECT_URI) at startup; do not expose app secret in responses or logs (SECURITY.md).

### 5. Verification
- [ ] 5.1 Manual or integration test: connect flow redirects to Meta; callback exchanges code, saves to doctor_instagram, redirects or returns success. Optional unit tests for service (state validation, conflict handling) per TESTING.md.
- [x] 5.2 Type-check and lint; verify against DEFINITION_OF_DONE where applicable.

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── instagram-connect-service.ts   (NEW or UPDATE - OAuth exchange, save)
├── controllers/
│   └── instagram-connect-controller.ts (NEW - connect, callback)
├── routes/
│   └── api/v1/
│       └── instagram-connect.ts       (NEW) or settings/instagram.ts
├── config/
│   └── env.ts                         (UPDATE - add META_APP_ID, META_APP_SECRET, INSTAGRAM_REDIRECT_URI; validate at startup; document in .env.example)
└── types/
    └── instagram-connect.ts           (optional - OAuth response types)
```

**Existing Code Status:**
- ✅ Auth middleware - EXISTS (req.user)
- ✅ doctor_instagram table - EXISTS (e-task-1)
- ✅ instagram-connect-service.ts - EXISTS (e-task-2; getDoctorIdByPageId only); add OAuth exchange + saveDoctorInstagram
- ❌ Connect/callback routes and controller - MISSING

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Controller uses asyncHandler and successResponse/redirect; service does not import Express (ARCHITECTURE.md).
- State parameter must be used and validated on callback to prevent CSRF (SECURITY.md).
- Only the authenticated doctor (req.user.id from JWT) may be associated with the linked page.
- doctor_instagram has instagram_page_id UNIQUE: one page links one doctor. Upsert by doctor_id; if page_id is already taken by another doctor, return ConflictError (ERROR_CATALOG, STANDARDS.md).

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (Y – doctor_instagram) → [x] **RLS verified?** (Y – write via service with doctor_id from JWT)
- [x] **Any PHI in logs?** (MUST be No; no token/code in logs)
- [x] **External API or AI call?** (Y – Meta OAuth) → [x] **Consent + redaction confirmed?** (N/A – no PHI sent to Meta in connect flow)
- [x] **Retention / deletion impact?** (N)

**Rationale:** Write to doctor_instagram scoped to authenticated doctor; no tokens/PHI in logs; Meta OAuth does not receive PHI; no new retention impact.

---

## ✅ Acceptance & Verification Criteria

Task is complete **only when** (see also [DEFINITION_OF_DONE.md](../../Reference/DEFINITION_OF_DONE.md)):

- [x] Doctor can hit connect endpoint and be redirected to Meta; after authorizing, callback runs and saves page_id + token for that doctor.
- [x] Token and code never appear in logs or audit metadata (COMPLIANCE.md).
- [x] State validation prevents CSRF; only authenticated doctor (req.user.id) is used for save (SECURITY.md).
- [x] Page already linked to another doctor returns 409 Conflict with clear message (CONTRACTS.md, ERROR_CATALOG).
- [x] Type-check and lint pass; .env.example updated if new env vars added.

---

## 🐛 Issues Encountered & Resolved

_(Record any issues and solutions during implementation.)_

---

## 📝 Notes

- **Routes:** GET `/api/v1/settings/instagram/connect` (auth required), GET `/api/v1/settings/instagram/callback` (no auth).
- **Env:** `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI` (required for connect); `INSTAGRAM_FRONTEND_REDIRECT_URI` (optional; if set, callback redirects here with `?connected=1` or `?connected=0&error=...`).
- **State:** HMAC-SHA256 signed payload (nonce + doctor_id) to prevent CSRF; verified on callback.
- **Page selection:** Callback uses first page from `/me/accounts` unless `page_id` query param is provided.

---

## 🔗 Related Tasks

- [e-task-1: Doctor Instagram storage](./e-task-1-doctor-instagram-storage-migration.md)
- [e-task-2: Webhook resolution page_id → doctor_id](./e-task-2-webhook-resolution-page-id-to-doctor-id.md) — worker uses doctor_instagram populated by this flow
- [e-task-5: Frontend Settings Instagram UI](./e-task-5-frontend-settings-instagram-ui.md)

---

**Last Updated:** 2026-02-06  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../task-management/TASK_MANAGEMENT_GUIDE.md)
