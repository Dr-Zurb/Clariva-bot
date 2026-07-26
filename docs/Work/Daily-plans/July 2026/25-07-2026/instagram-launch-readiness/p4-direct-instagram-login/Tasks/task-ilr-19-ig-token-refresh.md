# Task ilr-19: IG long-lived token refresh in health sweep

> **Links:** batch [`../plan-p4-direct-instagram-login-batch.md`](../plan-p4-direct-instagram-login-batch.md) · exec [`./EXECUTION-ORDER-p4-direct-instagram-login.md`](./EXECUTION-ORDER-p4-direct-instagram-login.md)

---

## 📋 Task Overview

Instagram Login long-lived tokens last ~60 days and support **refresh** via Graph (`grant_type=ig_refresh_token`). Wire refresh into the existing health path (`forceRefreshInstagramHealth` / `runInstagramTokenHealthJob` from `ilr-04`) so doctors don't hit silent acquisition death after the OAuth swap.

**Program / Phase:** instagram-launch-readiness · p4 · Wave 1  
**Estimated Time:** ~2–3 hours  
**Status:** ⏳ PENDING  
**Depends on:** `ilr-18` (tokens are IG user tokens)  
**Model:** Sonnet

**Current State:**
- ✅ `ilr-04` cron + reconnect email nudge exist
- ❌ Health check is diagnostic / reconnect-oriented — does not call IG refresh endpoint
- ❌ Page-token debug_token path may not apply 1:1 to IG user tokens

**Scope Guard:**
- Extend existing health/refresh helpers; do not invent a second cron.
- Never log tokens.
- On refresh failure → existing reconnect nudge path.

---

## ✅ Task Breakdown

### 1. Refresh API
- [ ] 1.1 Implement `refreshInstagramLongLivedToken(token)` → `GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=…`.
- [ ] 1.2 Persist new token + new `instagram_token_expires_at` on success.

### 2. Health integration
- [ ] 2.1 In health sweep / force-refresh: if token within warn window (default 7 days) or expired-ish, attempt refresh before nudging.
- [ ] 2.2 If refresh fails (revoked / invalid) → mark health error + send reconnect nudge (existing).

### 3. Tests
- [ ] 3.1 Unit tests: refresh success updates row; refresh failure → nudge path; no token in logs assertions where applicable.
- [ ] 3.2 Typecheck + targeted tests green.

---

## 📁 Files

```
UPDATE: backend/src/services/instagram-connect-service.ts
UPDATE: backend/src/workers/instagram-token-health-cron.ts  (if orchestration needs a tweak)
UPDATE: backend/tests/unit/services/instagram-connect-service.test.ts
UPDATE: backend/tests/unit/workers/instagram-token-health-cron.test.ts
```

---

## ✅ Acceptance Criteria

- [ ] Near-expiry IG token is refreshed without requiring doctor reconnect when Meta allows.
- [ ] Failed refresh still produces reconnect nudge.
- [ ] Tests green.

---

**Created:** 2026-07-26.
