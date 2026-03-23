# Payout Initiative — Doctor Payouts

**Purpose:** Enable doctors to receive payouts from verified consultations. Doctors choose when they get paid: per appointment, daily, weekly, or monthly.

**Status:** Planning  
**Created:** 2026-03-24  
**Location:** [docs/Development/Daily-plans/March 2026/2026-03-24/](../Development/Daily-plans/March%202026/2026-03-24/)

---

## Summary

| Item | Detail |
|------|--------|
| **Trigger** | After consultation verified (`verified_at` set) |
| **Doctor choice** | `per_appointment` \| `daily` \| `weekly` \| `monthly` |
| **India** | Razorpay Route (Transfer via Payments API) |
| **International** | Deferred (PayPal Payouts later) |
| **Tasks** | 6 |
| **Est. Total** | ~12–16 hours |

---

## Payout Schedule Options

| Option | Behavior |
|--------|----------|
| **per_appointment** | When consultation verified → immediate single transfer |
| **daily** | Cron runs ~2am; sum yesterday's verified payments → one transfer |
| **weekly** | Cron runs Monday ~2am; sum last week's → one transfer |
| **monthly** | Cron runs 1st ~2am; sum last month's → one transfer |

Period boundaries use doctor's `timezone` from doctor_settings.

---

## Prerequisites (Already Done)

- Consultation Verification v2 (`verified_at`, `doctor_left_at`, `patient_left_at`)
- Platform fee (`doctor_amount_minor` stored per payment)
- Payments table with `gateway`, `gateway_payment_id` for Razorpay

---

## Task List

1. [e-task-1: Payments payout columns](../Development/Daily-plans/March%202026/2026-03-24/e-task-1-payments-payout-columns.md)
2. [e-task-2: Doctor payout settings migration](../Development/Daily-plans/March%202026/2026-03-24/e-task-2-doctor-payout-settings.md)
3. [e-task-3: Razorpay Route adapter](../Development/Daily-plans/March%202026/2026-03-24/e-task-3-razorpay-route-adapter.md)
4. [e-task-4: Payout service + trigger on verified](../Development/Daily-plans/March%202026/2026-03-24/e-task-4-payout-service-trigger.md)
5. [e-task-5: Scheduled batch payout jobs](../Development/Daily-plans/March%202026/2026-03-24/e-task-5-scheduled-batch-payouts.md)
6. [e-task-6: Doctor payout settings API](../Development/Daily-plans/March%202026/2026-03-24/e-task-6-doctor-payout-settings-api.md)

---

## Reference

- [MONETIZATION_INITIATIVE.md](./MONETIZATION_INITIATIVE.md) — Platform fee (doctor_amount_minor)
- [CONSULTATION_VERIFICATION_STRATEGY.md](./CONSULTATION_VERIFICATION_STRATEGY.md) — Payout eligibility rules
- [payment-service.ts](../../backend/src/services/payment-service.ts)
- [Razorpay Route — Transfer via Payments](https://razorpay.com/docs/payments/route/transfer-funds-to-linked-accounts/)

---

**Last Updated:** 2026-03-24
