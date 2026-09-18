# Task fbm-06: Integrations UI — Connect Facebook card

> **Links:** batch [`../plan-p1-facebook-connect-messenger-batch.md`](../plan-p1-facebook-connect-messenger-batch.md) · exec [`./EXECUTION-ORDER-p1-facebook-connect-messenger.md`](./EXECUTION-ORDER-p1-facebook-connect-messenger.md)

---

## 📋 Task Overview

Add a Facebook card on Settings → Integrations: status, Connect, Disconnect, verification soft-block, success/error query params (mirror InstagramConnect).

**Program / Phase:** facebook-messenger-channel · p1 · Wave 4  
**Estimated Time:** ~2–3 hours  
**Status:** ⏳ PENDING  
**Change Type:** New UI  
**Model:** Composer / Sonnet  
**Depends on:** `fbm-03` API live

---

## ✅ Task Breakdown

- [ ] 1.1 `FacebookConnect.tsx` (or shared ChannelConnect pattern) — no tokens in client logs.
- [ ] 1.2 API helpers in `frontend/lib/api.ts`.
- [ ] 1.3 Mount on integrations page alongside Instagram.
- [ ] 1.4 Copy: requires Facebook Page; separate from Instagram Login.
- [ ] 1.5 OAuth return lands on Integrations (bridge if needed).
- [ ] 1.6 ver-05: Connect disabled until doctor verified.

---

## 📁 Files

```
CREATE: frontend/components/settings/FacebookConnect.tsx
UPDATE: frontend/app/dashboard/settings/integrations/page.tsx
UPDATE: frontend/lib/api.ts
CREATE?: frontend/app/auth/facebook-return/page.tsx
DO NOT TOUCH: InstagramConnect OAuth semantics
```

---

## ✅ Acceptance Criteria

- [ ] Connected Page name visible; Disconnect works.
- [ ] Unverified doctor sees verify-first, not Meta OAuth.
- [ ] Matches existing settings visual language (no new design system).

---

**Created:** 2026-07-26.
