# Task fbm-09: Page comment webhook → resolve Page → lead

> **Links:** batch [`../plan-p2-facebook-page-comments-batch.md`](../plan-p2-facebook-page-comments-batch.md) · exec [`./EXECUTION-ORDER-p2-facebook-page-comments.md`](./EXECUTION-ORDER-p2-facebook-page-comments.md)

---

## 📋 Task Overview

Ingest Facebook Page comment webhooks; resolve doctor via `doctor_facebook`; persist lead (extend `comment_leads` or additive schema — Opus if migration).

**Program / Phase:** facebook-messenger-channel · p2 · Wave 1  
**Status:** ✅ DONE (2026-07-26)  
**Model:** Sonnet; **Opus** if new migration  
**Depends on:** `fbm-08`

---

## ✅ Task Breakdown

- [x] 1.1 Confirm Meta Page webhook field names for comments; subscribe in ops + `subscribed_apps` if required. (`feed` + `item=comment`; `subscribed_apps` includes `feed`)
- [x] 1.2 Parse comment payload; skip Page’s own comments / echoes.
- [x] 1.3 Store lead with platform facebook; no comment body in logs. (migration **188**)
- [x] 1.4 Unit tests for resolve + skip paths.

---

## ✅ Acceptance Criteria

- [x] Comment on Page post → lead row for connected doctor. *(code ready; Founder: apply 188 + Meta `feed` + reconnect)*
- [x] Unknown Page id → mark failed / skip without crashing worker.

---

**Created:** 2026-07-26.  
**Closed:** 2026-07-26.
