# 2026-03-22 — Platform Fee / Monetization

**Date:** 2026-03-22  
**Theme:** Implement platform fee (5% + GST, hybrid for low-fee consultations) for appointment payments

---

## Overview

Add Clariva's platform fee to the payment flow. When a payment is captured, compute platform fee (5% or ₹25 flat for < ₹500), GST (18% on fee), and doctor amount. Store in `payments` for payouts and future invoicing.

### Goals

- Store `platform_fee_minor`, `gst_minor`, `doctor_amount_minor` per payment
- Configurable fee rules via env (percent, flat, threshold)
- No change to patient-facing flow; fee applied at webhook processing

---

## Plan & Task Order

| Order | Task | Dependency | Est. |
|-------|------|-------------|------|
| 1 | [e-task-1: Platform fee migration](./e-task-1-platform-fee-migration.md) | — | 1 h |
| 2 | [e-task-2: Platform fee config](./e-task-2-platform-fee-config.md) | — | 1 h |
| 3 | [e-task-3: Payment service platform fee](./e-task-3-payment-service-platform-fee.md) | e-task-1, 2 | 2–3 h |

**Parallel work:** e-task-1 and e-task-2 can run in parallel.

---

## Dependencies

```
e-task-1 (Migration) ──┐
                       ├──► e-task-3 (Payment service)
e-task-2 (Config) ─────┘
```

---

## Fee Logic (Reference)

| Appointment fee | Platform fee | GST (18%) | Doctor pays Clariva |
|-----------------|--------------|-----------|---------------------|
| < ₹500 | ₹25 | ₹4.50 | ₹29.50 |
| ≥ ₹500 | 5% | 18% of fee | 5.9% of fee |

---

## Reference

- [MONETIZATION_INITIATIVE.md](../../../task-management/MONETIZATION_INITIATIVE.md) — Initiative overview
- [payment-service.ts](../../../../backend/src/services/payment-service.ts)
- [CODE_CHANGE_RULES.md](../../../task-management/CODE_CHANGE_RULES.md)

---

**Last Updated:** 2026-03-22
