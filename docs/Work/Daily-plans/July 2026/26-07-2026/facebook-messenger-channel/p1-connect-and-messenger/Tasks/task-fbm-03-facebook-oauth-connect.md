# Task fbm-03: OAuth connect / disconnect / Page subscribed_apps

> **Links:** batch [`../plan-p1-facebook-connect-messenger-batch.md`](../plan-p1-facebook-connect-messenger-batch.md) · exec [`./EXECUTION-ORDER-p1-facebook-connect-messenger.md`](./EXECUTION-ORDER-p1-facebook-connect-messenger.md)

---

## 📋 Task Overview

Facebook Login → exchange → list Pages → save Page token to `doctor_facebook` → `subscribed_apps` for messages. Disconnect clears row + best-effort unsubscribe.

**Program / Phase:** facebook-messenger-channel · p1 · Wave 2  
**Estimated Time:** ~3–5 hours  
**Status:** ✅ DONE (code 2026-07-26) — needs Meta redirect URI + local `.env` + migration 187 applied  
**Change Type:** New feature  
**Model:** Agent  
**Depends on:** `fbm-02` applied; `fbm-01` redirect URI registered

---

## ✅ Task Breakdown

### 1. Config
- [x] 1.1 `FACEBOOK_*` in `config/env.ts` + `.env.example`.
- [x] 1.2 Never read `process.env` outside env module.

### 2. Service + routes
- [x] 2.1 `facebook-connect-service.ts`: state CSRF, OAuth URL, code exchange, long-lived, `me/accounts`, first Page, persist.
- [x] 2.2 After save: `subscribed_apps` (messages + related).
- [x] 2.3 Routes `/api/v1/settings/facebook/*`.
- [x] 2.4 Controllers: `asyncHandler`; verification gate; no tokens in logs.
- [x] 2.5 Frontend bridge `/auth/facebook-return` → Integrations (`fb_connected`).

### 3. Tests
- [x] 3.1 Unit: OAuth URL scopes, state round-trip, code fragment strip.
- [x] 3.2 Typecheck + targeted tests green.
- [ ] 3.3 Manual Connect after Meta + migration (Founder).

---

## 📁 Files

```
CREATE: backend/src/services/facebook-connect-service.ts
CREATE: backend/src/controllers/facebook-connect-controller.ts
CREATE: backend/src/routes/api/v1/settings/facebook.ts
UPDATE: backend/src/routes/api/v1/index.ts (or settings index)
UPDATE: backend/src/config/env.ts
UPDATE: backend/.env.example
CREATE: backend/tests/unit/services/facebook-connect-service.test.ts
DO NOT TOUCH: instagram-connect OAuth path
```

---

## ✅ Acceptance Criteria

- [ ] Connect persists Page id + token; status returns connected + page name (no token).
- [ ] subscribed_apps called on success.
- [ ] Disconnect idempotent.
- [ ] Unverified doctor blocked (403 typed error).

---

**Created:** 2026-07-26.
