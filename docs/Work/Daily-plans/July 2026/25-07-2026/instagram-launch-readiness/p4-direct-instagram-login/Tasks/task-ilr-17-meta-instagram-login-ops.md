# Task ilr-17: Meta App — Instagram Login product + App Review (ops)

> **Links:** batch [`../plan-p4-direct-instagram-login-batch.md`](../plan-p4-direct-instagram-login-batch.md) · exec [`./EXECUTION-ORDER-p4-direct-instagram-login.md`](./EXECUTION-ORDER-p4-direct-instagram-login.md)

---

## 📋 Task Overview

Configure the Meta App for **Instagram API with Instagram Login** and submit / track **App Review + Advanced Access** for the Instagram business scopes. This is the long pole that blocked e-task-13 last time ("Invalid Scopes" without Advanced Access).

**Program / Phase:** instagram-launch-readiness · p4  
**Estimated Time:** Ops — days–weeks Meta lead time; ~2–4h founder setup  
**Status:** ⏳ PENDING  
**Change Type:** Ops / checklist  
**Model:** Founder (+ Composer for doc notes)  
**Depends on:** Data-deletion URL live (`ilr-02` ✅); privacy policy URL live

---

## ✅ Task Breakdown

### 1. Product + login settings
- [ ] 1.1 In Meta App Dashboard: add / confirm **Instagram** → **API setup with Instagram login** (not Facebook Login for IG).
- [ ] 1.2 Confirm app id/secret for the **Instagram app** (e-task-13 noted `Clariva-Receptionist-Bot-IG` / `1643017033348333` — verify still correct).
- [ ] 1.3 Set **Valid OAuth Redirect URIs** to the backend callback (`…/api/v1/settings/instagram/callback`) for local + prod.
- [ ] 1.4 Register **Deauthorize callback** URL (add if missing).
- [ ] 1.5 Register **Data Deletion Request URL** → existing `/data-deletion-callback` (`ilr-02`).

### 2. Webhooks (Instagram object)
- [ ] 2.1 Confirm webhook callback URL + verify token for the **Instagram** product object.
- [ ] 2.2 Subscribe fields needed for DMs + comments (`messages`, `comments`, etc. as today).

### 3. App Review
- [ ] 3.1 Business Verification status — done or in progress (ties to `ilr-01`).
- [ ] 3.2 Request Advanced Access for:
  - `instagram_business_basic`
  - `instagram_business_manage_messages`
  - `instagram_business_manage_comments`
- [ ] 3.3 Screencast: doctor Connect Instagram → Instagram login → approve → dashboard shows connected → receive a test DM reply.
- [ ] 3.4 Submit review; track dates / rejections in this file.
- [ ] 3.5 After approval: switch app to **Live**; verify a non-role tester can connect.

### 4. Env alignment
- [ ] 4.1 Production + local `.env`: `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` = Instagram app (document in `.env.example` via `ilr-18`).

---

## 📁 Files

```
UPDATE (optional): docs/Reference/business/LAUNCH_READINESS_CHECKLIST.md
UPDATE (this file): status notes
DO NOT TOUCH: product code (that's ilr-18)
```

---

## ✅ Acceptance Criteria

- [ ] Instagram Login product configured; redirect + deletion + deauthorize URLs set.
- [ ] App Review submitted (or already approved) for the three `instagram_business_*` scopes.
- [ ] Status dates recorded here.

---

## Status log

| Date | Note |
|------|------|
| 2026-07-26 | Task created. |

---

**Created:** 2026-07-26.
