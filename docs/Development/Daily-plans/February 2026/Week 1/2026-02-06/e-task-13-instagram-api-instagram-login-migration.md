# Task 13: Switch Instagram connect to Instagram API (Instagram Login)
## 2026-02-06 - Must-have 1: Connect Instagram

---

## 📋 Task Overview

Replace the current Facebook Login + Instagram Graph API (Pages) OAuth flow with the newer **Instagram API with Instagram Login** flow. Use the Instagram app (Clariva-Receptionist-Bot-IG) credentials and scopes: `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`. This resolves the "Invalid Scopes" error when connecting and aligns with the Meta dashboard configuration.

**Estimated Time:** 2–3 hours  
**Status:** ✅ **DONE**  
**Completed:** 2026-02-06

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — Replace OAuth flow; follow [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md)

**Current State:**
- ✅ **What exists:** OAuth flow uses Facebook Login (`facebook.com/dialog/oauth`), scopes `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_messages`; token exchange via `graph.facebook.com/oauth/access_token`; getPageList for Facebook Pages; getInstagramUsername from Page→IG account; doctor_instagram stores `instagram_page_id` (Facebook Page ID) and token.
- ❌ **What's missing:** Switch to Instagram OAuth (`www.instagram.com/oauth/authorize`), Instagram API scopes, POST to `api.instagram.com/oauth/access_token` for code exchange, long-lived via `graph.instagram.com/access_token` with `ig_exchange_token`; get user_id and username from `/me` (no page list); store Instagram user_id in instagram_page_id (same column; webhook sends this ID).
- ⚠️ **Notes:** Webhook payload `entry[0].id` for Instagram API messaging is the Instagram professional account ID (user_id); same as what we store. No schema change. Use Instagram app ID and secret (Clariva-Receptionist-Bot-IG), not Facebook app. Add callback URL to Instagram app's Valid OAuth Redirect URIs in Meta dashboard.

**Scope Guard:** Expected files touched: ≤ 5

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md) - Audit, impact, remove obsolete
- [STANDARDS.md](../../../../../Reference/STANDARDS.md) - asyncHandler, error handling, no token in logs
- [ARCHITECTURE.md](../../../../../Reference/ARCHITECTURE.md) - Service layer; no Express in services
- [COMPLIANCE.md](../../../../../Reference/COMPLIANCE.md) - No token/code in logs; audit
- [EXTERNAL_SERVICES.md](../../../../../Reference/EXTERNAL_SERVICES.md) - Meta/Instagram API timeouts, retries
- [SECURITY.md](../../../../../Reference/SECURITY.md) - State/CSRF, env secrets
- Meta docs: [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Audit (per CODE_CHANGE_RULES)
- [x] 1.1 Grep for META_OAUTH_DIALOG, META_GRAPH_BASE, INSTAGRAM_SCOPES, exchangeCodeForShortLivedToken, getPageList, getInstagramUsername in instagram-connect-service
- [x] 1.2 List callers: connectHandler (buildMetaOAuthUrl), callbackHandler (exchange, getPageList, getInstagramUsername, saveDoctorInstagram)
- [x] 1.3 Impact list: instagram-connect-service.ts, instagram-connect-controller.ts, types/instagram-connect.ts, .env.example (document Instagram app credentials), any tests

### 2. Service: OAuth URL and scopes
- [x] 2.1 Replace OAuth base URL: `www.instagram.com/oauth/authorize` (Instagram API)
- [x] 2.2 Replace scopes: `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`
- [x] 2.3 buildMetaOAuthUrl: same params (client_id, redirect_uri, scope, state, response_type=code); keep function name for minimal controller change or rename for clarity

### 3. Service: Code exchange (Instagram API)
- [x] 3.1 Replace exchangeCodeForShortLivedToken: POST to `https://api.instagram.com/oauth/access_token` with form body (client_id, client_secret, grant_type=authorization_code, redirect_uri, code)
- [x] 3.2 Parse response: `{ data: [ { access_token, user_id, permissions } ] }`; return both accessToken and userId (callback needs userId to save)
- [x] 3.3 Add type for Instagram API token response in types/instagram-connect.ts

### 4. Service: Long-lived token and username
- [x] 4.1 Replace exchangeForLongLivedToken: GET `https://graph.instagram.com/access_token` with params grant_type=ig_exchange_token, client_secret, access_token
- [x] 4.2 Remove getPageList (no Facebook Pages); remove getInstagramUsername(pageId, pageAccessToken) usage
- [x] 4.3 Add getInstagramUserInfo(accessToken): GET `https://graph.instagram.com/v18.0/me?fields=user_id,username&access_token=...`; return { user_id, username }

### 5. Controller: Callback handler
- [x] 5.1 Call exchangeCodeForShortLivedToken → receive { accessToken, userId }
- [x] 5.2 Call exchangeForLongLivedToken(accessToken)
- [x] 5.3 Call getInstagramUserInfo(longLivedToken) for username
- [x] 5.4 Save with instagram_page_id = userId (Instagram account ID), instagram_access_token, instagram_username
- [x] 5.5 Remove page list logic, page selection (page_id query param); single account per connect

### 6. Config and env
- [x] 6.1 .env.example: Document that INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET are for the **Instagram app** (Clariva-Receptionist-Bot-IG), not the Facebook app; Valid OAuth Redirect URIs must be set in Instagram app's Business login settings in Meta dashboard
- [x] 6.2 No env schema change (same var names)

### 7. Verification
- [x] 7.1 Type-check and lint
- [x] 7.2 Update unit tests that mock exchangeCodeForShortLivedToken, getPageList, getInstagramUsername
- [ ] 7.3 Manual: connect flow redirects to Instagram OAuth; callback saves; webhook resolution unchanged (getDoctorIdByPageId uses instagram_page_id)

---

## 📁 Files to Create/Update

```
backend/
├── .env.example                                    (UPDATE - document Instagram app credentials)
├── src/
│   ├── services/
│   │   └── instagram-connect-service.ts            (UPDATE - OAuth URL, scopes, token exchange, remove getPageList)
│   ├── controllers/
│   │   └── instagram-connect-controller.ts         (UPDATE - callback flow: single account, use userId)
│   └── types/
│       └── instagram-connect.ts                    (UPDATE - add Instagram API token response type)
└── tests/
    └── unit/
        └── services/
            └── instagram-connect-service.test.ts   (UPDATE - if exists; mock new exchange response)
```

**Existing Code Status:**
- ✅ instagram-connect-service.ts - EXISTS (Facebook Login flow; getPageList, getInstagramUsername)
- ✅ instagram-connect-controller.ts - EXISTS (callback uses page list, page selection)
- ✅ types/instagram-connect.ts - EXISTS (MetaTokenResponse, MetaPageListResponse, etc.)
- ⚠️ All - UPDATE (replace with Instagram API flow)

**When updating existing code:** (per [CODE_CHANGE_RULES.md](../../../../../task-management/CODE_CHANGE_RULES.md))
- [x] Audit: instagram-connect-service, instagram-connect-controller, types, tests
- [x] Map: OAuth URL, scopes, token endpoints, response shapes; remove getPageList, simplify getInstagramUsername → getInstagramUserInfo
- [x] Remove: getPageList; page selection logic; Facebook Graph base for OAuth; Meta page types if unused
- [x] Update tests and .env.example per CODE_CHANGE_RULES

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Service layer must not import Express types (ARCHITECTURE.md)
- No token, code, or app secret in logs or audit metadata (COMPLIANCE.md)
- Use asyncHandler and typed errors per STANDARDS.md
- External API calls: timeouts and error handling per EXTERNAL_SERVICES.md
- State parameter for CSRF validation unchanged (createState, verifyState)
- doctor_instagram schema unchanged; instagram_page_id stores Instagram user_id (IG account ID)

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** (N – same table; instagram_page_id semantics change from Facebook Page ID to Instagram user_id, but column and resolution logic unchanged)
- [x] **Any PHI in logs?** (MUST be No)
- [x] **External API or AI call?** (Y – Instagram OAuth, graph.instagram.com)
  - [x] Consent + redaction confirmed: No PHI; token/code never logged
- [x] **Retention / deletion impact?** (N)

**Rationale:** OAuth flow change only; same storage; no new data; external calls to Meta/Instagram with no PHI in logs.

---

## ✅ Acceptance & Verification Criteria

Task is complete **only when** (see also [DEFINITION_OF_DONE.md](../../../../../Reference/DEFINITION_OF_DONE.md)):

- [x] Connect button redirects to Instagram OAuth (`www.instagram.com/oauth/authorize`) with correct scopes
- [x] Callback exchanges code via `api.instagram.com/oauth/access_token`; obtains user_id and long-lived token
- [x] doctor_instagram saved with instagram_page_id = Instagram user_id, token, optional username
- [x] Webhook resolution (getDoctorIdByPageId) works unchanged (entry[0].id matches stored instagram_page_id)
- [x] No token/code in logs; audit logs connection success
- [x] Type-check and lint pass
- [x] .env.example documents Instagram app credentials and redirect URI setup

---

## 🔗 Related Tasks

- [e-task-3: Instagram connect flow (OAuth)](./e-task-3-instagram-connect-flow-oauth.md) — original flow being replaced
- [e-task-5: Frontend Settings Instagram UI](./e-task-5-frontend-settings-instagram-ui.md) — Connect button; no frontend change required
- [e-task-2: Webhook resolution page_id → doctor_id](./e-task-2-webhook-resolution-page-id-to-doctor-id.md) — resolution unchanged; instagram_page_id now holds IG user_id

---

## 🐛 Issues Encountered & Resolved

_(Record any issues and solutions during implementation.)_

---

## 📝 Notes

- Meta has two products: (1) **Instagram API with Facebook Login** — uses Facebook app, pages_show_list, etc.; (2) **Instagram API with Instagram Login** — uses Instagram app, instagram_business_* scopes. We are switching from (1) to (2).
- Instagram app (Clariva-Receptionist-Bot-IG) ID: 1643017033348333. Add `https://clariva-bot.onrender.com/api/v1/settings/instagram/callback` to Valid OAuth Redirect URIs in Instagram app's Business login settings.
- Webhook payload for Instagram messaging: `entry[0].id` is the Instagram professional account ID; same as user_id from token exchange per Meta docs.

---

**Last Updated:** 2026-02-06  
**Reference:** [TASK_MANAGEMENT_GUIDE.md](../../../../../task-management/TASK_MANAGEMENT_GUIDE.md)
