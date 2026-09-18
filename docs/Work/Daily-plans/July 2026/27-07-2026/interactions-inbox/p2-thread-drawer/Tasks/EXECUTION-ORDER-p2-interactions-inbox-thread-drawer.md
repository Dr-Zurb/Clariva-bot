# Execution order — p2 thread drawer

> Batch: [`../plan-p2-interactions-inbox-thread-drawer-batch.md`](../plan-p2-interactions-inbox-thread-drawer-batch.md)

---

## Pre-flight (before any code)

- [ ] p1 gate closed (`ibi-02` ✅).
- [ ] Confirm **IBI2-D1…D4** and **IBI-D6** (Opus for PHI API).
- [ ] Read booking-review stack: `service-staff-review-controller`, `ReviewDetailSheet`, `getConversationMessages`.

---

## Wave plan

| Wave | Tasks | Notes |
|------|-------|-------|
| **1 — API** | `ibi-03` | **Opus** — authz + route. Gate before FE. |
| **2 — UI** | `ibi-04` | Sonnet — drawer consumes API. |
| **3 — Gate** | `ibi-05` | Manual smoke in Booking review. |

---

## Task files

| # | File |
|---|------|
| 03 | [`task-ibi-03-doctor-scoped-messages-api.md`](./task-ibi-03-doctor-scoped-messages-api.md) |
| 04 | [`task-ibi-04-booking-review-thread-drawer.md`](./task-ibi-04-booking-review-thread-drawer.md) |
| 05 | [`task-ibi-05-close-gate-p2.md`](./task-ibi-05-close-gate-p2.md) |

---

**Created:** 2026-07-27.
