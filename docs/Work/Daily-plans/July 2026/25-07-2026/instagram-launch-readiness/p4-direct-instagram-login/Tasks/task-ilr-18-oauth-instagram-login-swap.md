# Task ilr-18: OAuth swap — Instagram Login connect (code)

> **Links:** batch [`../plan-p4-direct-instagram-login-batch.md`](../plan-p4-direct-instagram-login-batch.md) · exec [`./EXECUTION-ORDER-p4-direct-instagram-login.md`](./EXECUTION-ORDER-p4-direct-instagram-login.md)  
> **Prior art:** [`e-task-13`](../../../../February%202026/Week%201/2026-02-06/e-task-13-instagram-api-instagram-login-migration.md) (recipe; code was reverted)

---

## 📋 Task Overview

Replace Facebook Page OAuth in `instagram-connect-service` / controller with **Instagram API with Instagram Login**: authorize on Instagram, exchange code on `api.instagram.com`, long-lived on `graph.instagram.com`, save IG professional account id + username. No Page list.

**Program / Phase:** instagram-launch-readiness · p4 · Wave 1  
**Estimated Time:** ~2–4 hours  
**Status:** ⏳ PENDING  
**Change Type:** Update existing  
**Depends on:** ILR4-D1…D3 confirmed; OQ-1 = no production FB-linked doctors  
**Model:** Prefer Sonnet if clean swap; **Opus** if OQ-1 forces dual-path

**Current State:**
- ❌ Code is Facebook Login again (`FACEBOOK_OAUTH_AUTHORIZE`, `FACEBOOK_SCOPES`, `getPageTokenAndInstagramAccount`)
- ✅ Types already include Instagram token /me shapes (`types/instagram-connect.ts`)
- ✅ Send path already falls back to `graph.instagram.com` for IG user tokens
- ✅ Webhook resolves by `instagram_page_id` — will store IG user_id (e-task-13)

**Scope Guard:**
- Clean swap only (ILR4-D1). No migration (ILR4-D2).
- **DO NOT** build Integrations hub or Facebook channel.
- No token/code/secret in logs.
- Keep `createState` / `verifyState` CSRF unchanged.
- Keep verification gate (`isDoctorVerified`) on connect/callback.

---

## ✅ Task Breakdown

### 1. Service — OAuth URL + scopes
- [ ] 1.1 Authorize URL → `https://www.instagram.com/oauth/authorize` (or Meta's current Business Login for Instagram URL — verify docs at implement time).
- [ ] 1.2 Scopes → `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`.
- [ ] 1.3 Remove / stop using `FACEBOOK_SCOPES` and Page-list helpers for the connect path.

### 2. Service — token exchange
- [ ] 2.1 Short-lived: `POST https://api.instagram.com/oauth/access_token` (form body: client_id, client_secret, grant_type=authorization_code, redirect_uri, code).
- [ ] 2.2 Parse `{ access_token, user_id }` (handle array-or-object response shapes Meta has used).
- [ ] 2.3 Long-lived: `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=…&access_token=…`.
- [ ] 2.4 `getInstagramUserInfo(token)`: `GET graph.instagram.com/me?fields=user_id,username` (or current field names).

### 3. Controller — callback
- [ ] 3.1 exchange → long-lived → user info → `saveDoctorInstagram` with `instagram_page_id = user_id`, token, username.
- [ ] 3.2 Keep `facebook_user_id` when available (data-deletion mapping); if Instagram Login does not yield a Facebook user id, document behavior for `ilr-02` (deletion may `no_match` until reconnect/mapping revisited).
- [ ] 3.3 Remove Page-selection / `no_pages` redirect path from happy path.

### 4. Config + tests
- [ ] 4.1 `.env.example`: document Instagram app credentials + Valid OAuth Redirect URIs.
- [ ] 4.2 Unit tests for OAuth URL scopes, exchange parsing, save payload.
- [ ] 4.3 `npm run type-check` + targeted tests green.

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/services/instagram-connect-service.ts
UPDATE: backend/src/controllers/instagram-connect-controller.ts
UPDATE: backend/src/types/instagram-connect.ts   (if response shapes need tweaks)
UPDATE: backend/.env.example
UPDATE: backend/tests/unit/services/instagram-connect-service.test.ts
UPDATE: backend/tests/unit/controllers/instagram-connect-*.test.ts (as needed)
DO NOT TOUCH: channel adapters; WhatsApp stubs; doctor_instagram schema
```

---

## ✅ Acceptance Criteria

- [ ] Connect redirects to Instagram Login with business scopes.
- [ ] Callback saves IG user_id in `instagram_page_id` + long-lived token + username.
- [ ] No Facebook Page list in connect path.
- [ ] Manual Dev-mode connect works for an app-role IG professional account.
- [ ] Tests + typecheck green.

---

**Created:** 2026-07-26.
