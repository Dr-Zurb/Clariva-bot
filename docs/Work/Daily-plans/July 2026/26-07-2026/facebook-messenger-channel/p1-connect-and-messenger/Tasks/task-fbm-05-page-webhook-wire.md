# Task fbm-05: Wire `page` webhooks → adapter → conversation turn

> **Links:** batch [`../plan-p1-facebook-connect-messenger-batch.md`](../plan-p1-facebook-connect-messenger-batch.md) · exec [`./EXECUTION-ORDER-p1-facebook-connect-messenger.md`](./EXECUTION-ORDER-p1-facebook-connect-messenger.md)

---

## 📋 Task Overview

Accept Meta Page messaging webhooks, verify signature with **Facebook** app secret, enqueue, process via facebook adapter + existing DM pipeline.

**Program / Phase:** facebook-messenger-channel · p1 · Wave 3  
**Estimated Time:** ~2–4 hours  
**Status:** ⏳ PENDING  
**Change Type:** Update existing  
**Model:** Sonnet  
**Depends on:** `fbm-04`; OQ-1 route decision

---

## ✅ Task Breakdown

### 1. Ingress
- [ ] 1.1 Implement OQ-1: extend Instagram webhook handler for `object === 'page'` **or** add `/webhooks/facebook` with shared verify helper.
- [ ] 1.2 Signature: use `FACEBOOK_APP_SECRET` for page payloads (do not use IG secret incorrectly).
- [ ] 1.3 Idempotency via existing event-id helpers (`facebook` provider branch already partially present).

### 2. Worker
- [ ] 2.1 Route message jobs to facebook adapter → conversation turn (platform `facebook`).
- [ ] 2.2 Metrics/log lines distinct enough to debug (no PHI).
- [ ] 2.3 Tests: page payload queues; echo returns 200 without queue.

---

## 📁 Files

```
UPDATE: backend/src/controllers/webhook-controller.ts
UPDATE: backend/src/utils/webhook-event-id.ts (if needed)
UPDATE: backend/src/workers/instagram-dm-webhook-handler.ts OR CREATE facebook-dm handler that shares engine
UPDATE: backend/src/routes/webhooks.ts (if new path)
UPDATE: backend/tests/unit/controllers/webhook-controller.test.ts
DO NOT TOUCH: Razorpay/Twilio webhooks
```

---

## ✅ Acceptance Criteria

- [ ] Real/tester Messenger DM → `webhook_job_worker_success` + delivery success.
- [ ] Wrong-secret signature rejected (or documented bypass parity with IG — prefer reject for new path).

---

**Created:** 2026-07-26.
