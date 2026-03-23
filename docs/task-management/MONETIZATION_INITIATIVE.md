# Monetization Initiative — Platform Fee

**Purpose:** Implement Clariva's platform fee model: 5% + GST on consultation revenue (hybrid: < ₹500 → ₹25 flat + GST). Store platform fee, GST, and doctor amount for payouts and invoicing.

**Status:** Planning  
**Created:** 2026-03-22  
**Location:** [docs/Development/Daily-plans/March 2026/2026-03-22/](../Development/Daily-plans/March%202026/2026-03-22/)

---

## Summary

| Item | Detail |
|------|--------|
| **Model** | Transaction fee only (no subscription) |
| **Platform fee** | 5% (exclusive of GST); < ₹500 → ₹25 flat + GST |
| **GST** | 18% on platform fee (doctor pays) |
| **Razorpay** | ~2.38% (deducted by gateway; separate from our fee) |
| **Tasks** | 3 (migration, config, payment service) |
| **Est. Total** | ~4–6 hours |

---

## Fee Logic (Finalized)

| Appointment fee | Clariva platform fee | GST (18% on fee) | Doctor total cost |
|-----------------|----------------------|------------------|-------------------|
| < ₹500 | ₹25 flat | ₹4.50 | ₹29.50 |
| ≥ ₹500 | 5% | 18% of 5% | 5.9% of fee |

**Example (₹1,000 consultation):**
- Platform fee: ₹50
- GST: ₹9
- Doctor pays Clariva: ₹59
- Doctor receives: ₹941 (before Razorpay deduction)

---

## Task List

1. [e-task-1: Platform fee migration](../Development/Daily-plans/March%202026/2026-03-22/e-task-1-platform-fee-migration.md)
2. [e-task-2: Platform fee config](../Development/Daily-plans/March%202026/2026-03-22/e-task-2-platform-fee-config.md)
3. [e-task-3: Payment service platform fee](../Development/Daily-plans/March%202026/2026-03-22/e-task-3-payment-service-platform-fee.md)

---

## Reference

- [README.md](../Development/Daily-plans/March%202026/2026-03-22/README.md) — Daily plan
- [payment-service.ts](../../backend/src/services/payment-service.ts) — Current implementation
- [008_payments.sql](../../backend/migrations/008_payments.sql) — Current payments schema

---

**Last Updated:** 2026-03-22
