# Task 1: Instagram connect – migrate to Facebook Login (Page-linked)
## 2026-02-18 – Week 3: Page-linked path

---

## 📋 Task Overview

Replace the current Instagram Login OAuth flow with Facebook Login (Page-linked) to obtain Page access tokens instead of Instagram user tokens. The goal is to test whether the Messenger Platform webhook payload includes `sender` and `recipient` for real DMs, which the Instagram Login flow does not provide (see [instagram-dm-reply-troubleshooting.md](./instagram-dm-reply-troubleshooting.md)).

**Estimated Time:** 6–8 hours  
**Status:** ✅ **IMPLEMENTED** (code complete; manual Meta app config required)  
**Completed:** (when completed)

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — Replace Instagram OAuth with Facebook OAuth; follow [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** Instagram Login flow (instagram.com/oauth/authorize, api.instagram.com token exchange, graph.instagram.com); instagram-connect-service, instagram-connect-controller; doctor_instagram table; webhook worker parsing entry[].messaging[] and entry[].changes[]; instagram-service using graph.instagram.com for send.
- ❌ **What's missing:** Facebook OAuth flow; Page token exchange; Messenger Platform webhook format handling (if different).
- ⚠️ **Notes:** Meta app has both "Manage messaging & content on Instagram" and "Engage with customers on Messenger from Meta" use cases. Valid OAuth Redirect URI already set: `https://clariva-bot.onrender.com/api/v1/settings/instagram/callback`. Instagram account must be linked to a Facebook Page.

**Scope Guard:**
- Expected files touched: ≤ 10
- Any expansion requires explicit approval

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md) — Audit, impact, remove obsolete
- [instagram-dm-reply-troubleshooting.md](./instagram-dm-reply-troubleshooting.md) — Option 2: Page-linked path
- [e-task-3: Instagram connect flow](../Week%201/2026-02-06/e-task-3-instagram-connect-flow-oauth.md) — Current implementation
- [RECIPES.md](../../../Reference/RECIPES.md), [ARCHITECTURE.md](../../../Reference/ARCHITECTURE.md), [COMPLIANCE.md](../../../Reference/COMPLIANCE.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Audit and impact
- [x] 1.1 Audit current Instagram connect flow
  - [x] 1.1.1 List all files: instagram-connect-service, instagram-connect-controller, routes, env, types
  - [x] 1.1.2 Document env vars: INSTAGRAM_*, META_*
  - [x] 1.1.3 Trace callers: webhook worker, instagram-service token usage
- [x] 1.2 Map impact: config, services, controllers, webhook worker, tests, docs

### 2. OAuth flow replacement
- [x] 2.1 Replace OAuth URLs in instagram-connect-service
  - [x] 2.1.1 Change authorize URL from instagram.com to facebook.com/dialog/oauth
  - [x] 2.1.2 Change token exchange from api.instagram.com to graph.facebook.com/oauth/access_token
  - [x] 2.1.3 Request scopes: pages_manage_metadata, pages_messaging, instagram_basic, instagram_manage_messages (per Meta docs for Page-linked Instagram)
- [x] 2.2 Implement Page token exchange
  - [x] 2.2.1 Exchange code for user access token
  - [x] 2.2.2 Fetch user's Pages via graph.facebook.com/me/accounts
  - [x] 2.2.3 If multiple Pages, allow selection (query param or first Page with linked Instagram)
  - [x] 2.2.4 Get Page access token and Page ID; store Page token (not Instagram user token)
- [x] 2.3 Resolve Instagram account from Page
  - [x] 2.3.1 Fetch Instagram Business Account linked to Page (graph.facebook.com/{page-id}?fields=instagram_business_account)
  - [x] 2.3.2 Use instagram_business_account.id as instagram_page_id for webhook resolution
  - [x] 2.3.3 Store both Page ID and Instagram account ID if needed for webhook routing

### 3. Token storage and usage
- [x] 3.1 Update doctor_instagram storage
  - [x] 3.1.1 Store Page access token (or keep column name instagram_access_token; document that it is Page token)
  - [x] 3.1.2 Ensure instagram_page_id remains the Instagram account ID for webhook entry.id matching
- [x] 3.2 Update instagram-service for Page token
  - [x] 3.2.1 Use graph.facebook.com for send (Page token); instagram-service may already have fallback
  - [x] 3.2.2 Verify send endpoint and auth format for Page token

### 4. Webhook handling
- [ ] 4.1 Configure Messenger Platform webhooks (Meta app) — **MANUAL**
  - [ ] 4.1.1 Add Page to app; subscribe to messaging events
  - [ ] 4.1.2 Webhook URL may be same or different; verify signature verification
- [ ] 4.2 Update webhook worker if payload format differs
  - [ ] 4.2.1 Parse Messenger Platform payload (entry[].messaging[] with sender/recipient per message_edits docs)
  - [ ] 4.2.2 If format is same, no change; if different, add parsing logic
  - [ ] 4.2.3 Log payloadStructure for first few events to confirm sender presence

### 5. Config and env
- [ ] 5.1 Update env.ts
  - [ ] 5.1.1 Add/rename: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET (or keep META_APP_ID, META_APP_SECRET if same)
  - [ ] 5.1.2 Redirect URI: reuse INSTAGRAM_FRONTEND_REDIRECT_URI or add FACEBOOK_OAUTH_REDIRECT_URI
  - [ ] 5.1.3 Remove obsolete Instagram OAuth env if any
- [ ] 5.2 Update .env.example and deployment docs

### 6. Verification and testing
- [ ] 6.1 Manual test: connect flow
  - [ ] 6.1.1 Redirect to Facebook OAuth; select Page; callback saves token
  - [ ] 6.1.2 Verify doctor_instagram row has correct instagram_page_id and token
- [ ] 6.2 Manual test: webhook
  - [ ] 6.2.1 Send DM to connected Instagram account
  - [ ] 6.2.2 Check logs for payloadStructure; confirm hasSender, hasRecipient
  - [ ] 6.2.3 Verify automated reply is sent
- [ ] 6.3 Run type-check and lint; update tests if applicable

---

## 📁 Files to Create/Update

```
backend/src/
├── services/
│   └── instagram-connect-service.ts   (UPDATE - replace OAuth flow, add Page token exchange)
├── controllers/
│   └── instagram-connect-controller.ts (UPDATE - callback may need Page selection)
├── services/
│   └── instagram-service.ts           (UPDATE if send endpoint differs for Page token)
├── workers/
│   └── webhook-worker.ts              (UPDATE if Messenger payload format differs)
├── config/
│   └── env.ts                         (UPDATE - add/rename env vars)
├── types/
│   └── instagram-connect.ts           (UPDATE - OAuth response types for Facebook)
```

**Existing Code Status:**
- ✅ instagram-connect-service.ts — EXISTS (Instagram Login, token exchange, saveDoctorInstagram)
- ✅ instagram-connect-controller.ts — EXISTS (connect, callback, disconnect)
- ✅ instagram-service.ts — EXISTS (sendInstagramMessage, graph.instagram.com + graph.facebook.com fallback)
- ✅ webhook-worker.ts — EXISTS (parseInstagramMessage, entry[].messaging[], entry[].changes[])

**When updating existing code:**
- [ ] Audit current implementation (files, callers, config/env) — see CODE_CHANGE_RULES.md
- [ ] Map desired change to concrete code changes (what to add, change, remove)
- [ ] Remove obsolete code and config (Instagram OAuth URLs, dead branches)
- [ ] Update tests and docs/env per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Controller uses asyncHandler; service does not import Express (ARCHITECTURE.md).
- State parameter must be used and validated on callback to prevent CSRF (SECURITY.md).
- Only the authenticated doctor may be associated with the linked Page (existing doctor_id from JWT).
- Token stored per COMPLIANCE (no token in logs or audit metadata).
- doctor_instagram.instagram_page_id must remain usable for webhook entry.id resolution (Instagram account ID).

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** (Y – doctor_instagram) → [ ] **RLS verified?** (Y / N)
- [ ] **Any PHI in logs?** (MUST be No)
- [ ] **External API or AI call?** (Y – Meta OAuth, Graph API) → [ ] **Consent + redaction confirmed?** (Y / N)
- [ ] **Retention / deletion impact?** (N)

**Rationale:** Same as e-task-3; write to doctor_instagram scoped to authenticated doctor; no tokens/PHI in logs.

---

## ✅ Acceptance & Verification Criteria

Task is complete **only when**:
- [ ] Connect flow uses Facebook OAuth and Page token
- [ ] doctor_instagram stores correct instagram_page_id and Page access token
- [ ] Webhook receives real DM; payload includes sender (or confirmed still missing)
- [ ] If sender present: automated reply is sent
- [ ] No token/code in logs (COMPLIANCE.md)
- [ ] Type-check and lint pass

---

## 🐛 Issues Encountered & Resolved

- **TS6133 unused correlationId:** Prefixed with `_` in `getFacebookUserId` (internal helper).

---

## 📝 Notes

- **Risk:** Page-linked path may not fix the sender issue; this is an experimental migration. If it does not help, consider reverting or adding Instagram Login back as fallback.
- **Prerequisite:** Instagram account must be linked to a Facebook Page.

**Post-deploy (manual):** In Meta App Dashboard: (1) Add Valid OAuth Redirect URI for Facebook Login if not already set. (2) Add Page to app; subscribe to Messenger > Instagram Messaging webhooks. (3) Re-connect Instagram in app (Settings) to obtain Page token.

---

## 🔗 Related Tasks

- [e-task-3: Instagram connect flow (OAuth)](../Week%201/2026-02-06/e-task-3-instagram-connect-flow-oauth.md) — Current implementation
- [instagram-dm-reply-troubleshooting.md](./instagram-dm-reply-troubleshooting.md) — Option 2: Page-linked path

---

**Last Updated:** 2026-02-18  
**Related:** [TASK_MANAGEMENT_GUIDE.md](../../../task-management/TASK_MANAGEMENT_GUIDE.md)  
**Pattern:** OAuth flow replacement; CODE_CHANGE_RULES for update
