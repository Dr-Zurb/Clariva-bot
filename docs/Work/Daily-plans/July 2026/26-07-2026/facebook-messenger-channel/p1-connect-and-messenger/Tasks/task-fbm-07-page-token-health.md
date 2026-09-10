# Task fbm-07: Page token health / reconnect nudge

> **Links:** batch [`../plan-p1-facebook-connect-messenger-batch.md`](../plan-p1-facebook-connect-messenger-batch.md) · exec [`./EXECUTION-ORDER-p1-facebook-connect-messenger.md`](./EXECUTION-ORDER-p1-facebook-connect-messenger.md)

---

## 📋 Task Overview

Dashboard health for Facebook Page tokens (`debug_token` **is** appropriate for Page tokens) + cron/email nudge pattern from `ilr-04` / IG health — without breaking IG `/me` probe.

**Program / Phase:** facebook-messenger-channel · p1 · Wave 4  
**Estimated Time:** ~2 hours  
**Status:** ✅ DONE (dashboard health 2026-07-26) — cron/email deferred  
**Change Type:** Enhancement  
**Model:** Sonnet  
**Depends on:** `fbm-03`

---

## ✅ Task Breakdown

- [x] 1.1 Status API includes `health` summary for Facebook card.
- [x] 1.2 Probe via Facebook Graph `debug_token` with FB app access token.
- [ ] 1.3 Optional: extend token-health cron to also scan `doctor_facebook` (cap per tick). **Deferred** — dashboard probe + cache sufficient for p1; mirror `ilr-04` in a follow-up if needed.
- [ ] 1.4 Reconnect email copy mentions Facebook Page (no PHI). **Deferred** with 1.3.
- [x] 1.5 Tests for ok / invalid / unknown.

---

## ✅ Acceptance Criteria

- [x] IG health path unchanged (still `/me`).
- [x] FB card shows OK when Page token valid after connect.
- [x] Invalid token → reconnectRecommended.

---

**Created:** 2026-07-26.  
**Closed:** 2026-07-26 — status API + Integrations health UI + unit tests.
