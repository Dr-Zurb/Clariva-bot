# 2026-03-14 — Unified Slot + Payment Flow & Appointment Status

**Date:** 2026-03-14  
**Theme:** Streamline booking flow; add real appointment status lookup

---

## Overview

Tasks from the [unified-slot-payment-flow-and-appointment-status](./unified-slot-payment-flow-and-appointment-status.md) plan.

**Goal:** Reduce chat round-trips by combining slot selection and payment on one external page. Add real appointment status when user asks.

---

## Task Order

| Order | Task | Dependency |
|-------|------|------------|
| 1 | [e-task-1: Appointment status lookup](./e-task-1-appointment-status-lookup.md) | — |
| 2 | [e-task-2: Select slot and pay API](./e-task-2-select-slot-and-pay-api.md) | — |
| 3 | [e-task-3: Booking page + success page](./e-task-3-booking-page-success-page.md) | e-task-2 |
| 4 | [e-task-4: Worker migration](./e-task-4-worker-migration-unified-flow.md) | e-task-2, e-task-3 |

**e-task-1** can be done in parallel with e-task-2. **e-task-3** depends on e-task-2 (API). **e-task-4** depends on both backend and frontend being ready.

---

## Reference

- [UNIFIED_SLOT_PAYMENT_FLOW.md](../../../../Reference/UNIFIED_SLOT_PAYMENT_FLOW.md) — Canonical flow reference

---

**Last Updated:** 2026-03-14
