# Task ilr-09: Webhook signature — remove or gate DM/comment bypass

> **Links:** batch [`../plan-p2-instagram-bot-reliability-batch.md`](../plan-p2-instagram-bot-reliability-batch.md) · exec [`./EXECUTION-ORDER-p2-instagram-bot-reliability.md`](./EXECUTION-ORDER-p2-instagram-bot-reliability.md)

---

## 🛑 Opus — webhook security

Internet-facing webhook currently processes `message` / `comment` payloads when HMAC fails. Run on **Opus**.

---

## 📋 Task Overview

Close or strictly gate the failed-signature bypass in `webhook-controller.ts` ~246–261. Prefer finding why Meta signatures fail (raw body, secret) and **reject** invalid sigs in production (ILR2-D4 / OQ-2).

**Status:** ⏳ PENDING · **Model: Opus** · ~2–3h  
**Change Type:** Update existing

**Current State:**
- ✅ HMAC verify exists (`webhook-verification.ts`)
- ⚠️ Bypass for comment + message on failed sig (logged, then fall through)
- ✅ Razorpay/PayPal: no bypass
- ✅ Docs: `WEBHOOK_SECURITY.md`

**Scope Guard:**
- Do not weaken payment webhooks.
- Add tests for failed-sig message/comment rejection (or flagged bypass).
- Update `WEBHOOK_SECURITY.md` if behavior changes.

---

## ✅ Task Breakdown

- [ ] 1.1 Reproduce / document why signatures fail in practice (rawBody, app secret).
- [ ] 1.2 Implement prod reject (or env-gated bypass default-off).
- [ ] 1.3 Unit tests for failed-sig `message` and `comment:*` shapes.
- [ ] 1.4 Update WEBHOOK_SECURITY.md threat notes.
- [ ] 2.1 Verify green + manual smoke that real Meta webhooks still work in staging.

---

## 📁 Files

```
UPDATE: backend/src/controllers/webhook-controller.ts
UPDATE: backend/tests/unit/controllers/webhook-controller.test.ts
UPDATE: docs/Reference/engineering/compliance/WEBHOOK_SECURITY.md
UPDATE: backend/src/config/env.ts (optional flag)
```

---

## ✅ Acceptance Criteria

- [ ] Production path does not process unverified DM/comment payloads (unless explicit documented emergency flag).
- [ ] Tests cover the former bypass shapes; docs match code.

---

**Created:** 2026-07-25.
