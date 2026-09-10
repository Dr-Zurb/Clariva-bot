# Execution order — p3 Inbox tab

> Batch: [`../plan-p3-interactions-inbox-tab-batch.md`](../plan-p3-interactions-inbox-tab-batch.md)

---

## Pre-flight (before any code)

- [ ] p2 gate closed (`ibi-05` ✅).
- [ ] Confirm **IBI3-D1…D5** and program locks.
- [ ] Read booking-review list enrichment pattern (`listEnrichedServiceStaffReviewsForDoctor`) as the template.

---

## Wave plan

| Wave | Tasks | Notes |
|------|-------|-------|
| **1 — List API** | `ibi-06` | **Opus** — primitive for everything below. Gate before FE. |
| **2 — Enrich** | `ibi-07` → `ibi-08` | Sequential: comment-only rows then timeline (both need list/detail shapes from 06). |
| **3 — Product UI** | `ibi-09` → `ibi-10` | Tab + merge, then badge/poll. |
| **4 — Gate** | `ibi-11` | Founder smoke required. |

> Wave 2 is **one lane** (`ibi-07` then `ibi-08`), not parallel — both touch the same DTO/detail shape.

---

## Task files

| # | File |
|---|------|
| 06 | [`task-ibi-06-list-detail-interactions-api.md`](./task-ibi-06-list-detail-interactions-api.md) |
| 07 | [`task-ibi-07-comment-only-leads-in-list.md`](./task-ibi-07-comment-only-leads-in-list.md) |
| 08 | [`task-ibi-08-path-timeline-detail.md`](./task-ibi-08-path-timeline-detail.md) |
| 09 | [`task-ibi-09-inbox-ui-merge-booking-review.md`](./task-ibi-09-inbox-ui-merge-booking-review.md) |
| 10 | [`task-ibi-10-badge-and-polling.md`](./task-ibi-10-badge-and-polling.md) |
| 11 | [`task-ibi-11-close-gate-p3.md`](./task-ibi-11-close-gate-p3.md) |

---

**Created:** 2026-07-27.
