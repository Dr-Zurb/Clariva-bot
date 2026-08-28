# Task ilr-20: Settings UI copy — drop Facebook Page dead-ends

> **Links:** batch [`../plan-p4-direct-instagram-login-batch.md`](../plan-p4-direct-instagram-login-batch.md) · exec [`./EXECUTION-ORDER-p4-direct-instagram-login.md`](./EXECUTION-ORDER-p4-direct-instagram-login.md)

---

## 📋 Task Overview

Update Instagram Settings card copy/errors so doctors are not told to create a Facebook Page. Happy path = Instagram professional account login only. Note: account must be **Business or Creator** (Professional).

**Program / Phase:** instagram-launch-readiness · p4 · Wave 1  
**Estimated Time:** ~1 hour  
**Status:** ✅ DONE (2026-07-26)  
**Depends on:** `ilr-18` (error codes may change)  
**Model:** Composer

**Current State:**
- `InstagramConnect.tsx` maps `error=no_pages` → "No Facebook Page found…"
- Reconnect copy mentions "Meta token" / Facebook-era checklist paths

**Scope Guard:**
- Copy + error mapping only. No Integrations hub redesign.
- Keep verification soft-block (`mustVerifyFirst`).

---

## ✅ Task Breakdown

- [ ] 1.1 Replace `no_pages` / Page-linked error strings with Instagram Login-relevant copy (or remove unused codes).
- [ ] 1.2 Connected / help text: "Connect your Instagram professional account" (Business or Creator).
- [ ] 1.3 Reconnect copy: disconnect → Connect Instagram (no Business Suite mention).
- [ ] 1.4 Smoke-check Settings → Integrations Instagram card.

---

## 📁 Files

```
UPDATE: frontend/components/settings/InstagramConnect.tsx
UPDATE (optional): frontend docs / setup markdown if it still mandates Facebook Page
```

---

## ✅ Acceptance Criteria

- [ ] No user-facing "create a Facebook Page" instruction on the happy path.
- [ ] Errors match Instagram Login failure modes.

---

**Created:** 2026-07-26.
