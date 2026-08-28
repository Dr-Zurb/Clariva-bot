# Task ilr-01: Meta App Review + business verification (ops)

> **Links:** batch [`../plan-p1-instagram-launch-critical-batch.md`](../plan-p1-instagram-launch-critical-batch.md) · exec [`./EXECUTION-ORDER-p1-instagram-launch-critical.md`](./EXECUTION-ORDER-p1-instagram-launch-critical.md)

---

## 📋 Task Overview

Start (or complete) Meta **Business Verification** and **App Review / Advanced Access** for Instagram messaging + comments permissions so real doctors (not just app role holders) can connect and the bot can message real patients.

**Program / Phase:** instagram-launch-readiness · p1  
**Estimated Time:** Ops — days–weeks of Meta lead time; ~2–4h founder setup  
**Status:** ⏳ IN PROGRESS (founder ops) — checklist item added to `LAUNCH_READINESS_CHECKLIST.md` (2026-07-25). Submit/track Meta review here.  
**Change Type:** Ops / checklist (minimal code unless privacy/deletion URLs need wiring)  
**Model:** Founder (+ Composer for doc updates)

**Current State:**
- ✅ OAuth scopes requested in `instagram-connect-service.ts` (`instagram_manage_messages`, `instagram_manage_comments`, etc.)
- ✅ Webhook verify + data-deletion **route** exist
- ❌ Advanced Access / App Review status unknown — confirm in Meta Dashboard
- ⚠️ Data-deletion is ack-only until `ilr-02` — App Review may require a working callback

**Scope Guard:**
- Ops checklist + status notes in this file / launch checklist.
- **DO NOT** change product scopes without updating connect service intentionally.
- Coordinate with `ilr-02` if Meta rejects for incomplete deletion.

---

## ✅ Task Breakdown

### 1. Inventory
- [ ] 1.1 Confirm Meta App mode (Dev vs Live) and which permissions already have Advanced Access.
- [ ] 1.2 Confirm Business Verification status for the Meta Business Manager.

### 2. Prerequisites Meta asks for
- [ ] 2.1 Public privacy policy URL live and linked in App Dashboard.
- [ ] 2.2 Data-deletion callback URL registered; note dependency on `ilr-02` for real deletion.
- [ ] 2.3 Screencasts / use-case text for each permission (messaging + comments).

### 3. Submit + track
- [ ] 3.1 Submit App Review for required permissions.
- [ ] 3.2 Track status here (dates, rejections, resubmits).
- [ ] 3.3 Optionally add a checkbox to `LAUNCH_READINESS_CHECKLIST.md` for App Review / Advanced Access.

---

## 📁 Files to Create/Update

```
UPDATE (optional): docs/Reference/business/LAUNCH_READINESS_CHECKLIST.md
UPDATE (this task file): status notes as review progresses
DO NOT TOUCH: backend product code unless Meta requires a URL/path change
```

---

## ✅ Acceptance Criteria

- [ ] App Review submitted (or already approved) for production messaging/comments.
- [ ] Business Verification done or in progress with a tracked owner.
- [ ] Blockers (e.g. deletion stub) linked to `ilr-02`.

---

**Created:** 2026-07-25.
