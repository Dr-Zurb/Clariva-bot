# 2026-03-24 — Payout Initiative

**Date:** 2026-03-24  
**Theme:** Doctor payouts with configurable schedule (per appointment, daily, weekly, monthly)

---

## Overview

Enable doctors to receive payouts from verified consultations. Doctors choose when they get paid: immediately after each appointment, or batched by day/week/month. Uses Razorpay Route for India.

### Goals

- Track payout status per payment (`payout_status`, `payout_id`, `paid_at`)
- Store doctor payout preference and bank/linked-account details
- Integrate Razorpay Route — Create Transfer from Payment
- Trigger per-appointment payout when `tryMarkVerified` succeeds
- Scheduled jobs for daily/weekly/monthly batched payouts
- Doctor settings API for payout schedule and account details

---

## Plan & Task Order

| Order | Task | Dependency | Est. |
|-------|------|-------------|------|
| 1 | [e-task-1: Payments payout columns](./e-task-1-payments-payout-columns.md) | — | 0.5 h |
| 2 | [e-task-2: Doctor payout settings migration](./e-task-2-doctor-payout-settings.md) | — | 1 h |
| 3 | [e-task-3: Razorpay Route adapter](./e-task-3-razorpay-route-adapter.md) | — | 2–3 h |
| 4 | [e-task-4: Payout service + trigger on verified](./e-task-4-payout-service-trigger.md) | e-task-1, 2, 3 | 2–3 h |
| 5 | [e-task-5: Scheduled batch payout jobs](./e-task-5-scheduled-batch-payouts.md) | e-task-4 | 2 h |
| 6 | [e-task-6: Doctor payout settings API](./e-task-6-doctor-payout-settings-api.md) | e-task-2 | 1–2 h |

**Parallel work:** e-task-1, e-task-2, e-task-3 can start in parallel.

---

## Dependencies

```
e-task-1 (Payments columns) ──┐
e-task-2 (Doctor settings)  ├──► e-task-4 (Payout service + trigger)
e-task-3 (Razorpay Route)   ─┘         │
                                       └──► e-task-5 (Scheduled batch)
e-task-2 (Doctor settings)  ────────────► e-task-6 (Settings API)
```

---

## Reference

- [PAYOUT_INITIATIVE.md](../../../task-management/PAYOUT_INITIATIVE.md)
- [MONETIZATION_INITIATIVE.md](../../../task-management/MONETIZATION_INITIATIVE.md)
- [CONSULTATION_VERIFICATION_STRATEGY.md](../../../task-management/CONSULTATION_VERIFICATION_STRATEGY.md)
- [consultation-verification-service.ts](../../../../backend/src/services/consultation-verification-service.ts)

---

**Last Updated:** 2026-03-24
