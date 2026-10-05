# Clinic link — daily batches

> **Product plan:** [`plan-clinic-link.md`](../../../../Product%20plans/plan-clinic-link.md)
> All phases for this program live in this folder. Execute in order.

| Phase | Folder | Status | Batch plan | Execution order |
|---|---|---|---|---|
| 1 — public book | [`p1-public-book/`](./p1-public-book/) | **Gate walked** 2026-09-24. Live SMS box open: Twilio is not configured | [`plan-p1-clinic-link-public-book-batch.md`](./p1-public-book/plan-p1-clinic-link-public-book-batch.md) | [`Tasks/EXECUTION-ORDER-p1-clinic-link-public-book.md`](./p1-public-book/Tasks/EXECUTION-ORDER-p1-clinic-link-public-book.md) |
| 2 — patient prep | [`p2-visit-prep/`](./p2-visit-prep/) | **Gate walked** 2026-09-27. Live SMS still skipped because Twilio is not configured | [`plan-p2-clinic-link-visit-prep-batch.md`](./p2-visit-prep/plan-p2-clinic-link-visit-prep-batch.md) | [`Tasks/EXECUTION-ORDER-p2-clinic-link-visit-prep.md`](./p2-visit-prep/Tasks/EXECUTION-ORDER-p2-clinic-link-visit-prep.md) |
| 3 — photos | [`p3-photos/`](./p3-photos/) | **Gate walked** 2026-09-27 | [`plan-p3-clinic-link-photos-batch.md`](./p3-photos/plan-p3-clinic-link-photos-batch.md) | [`Tasks/EXECUTION-ORDER-p3-clinic-link-photos.md`](./p3-photos/Tasks/EXECUTION-ORDER-p3-clinic-link-photos.md) |
| 4 — show up ready | [`p4-show-up/`](./p4-show-up/) | **Gate walked** 2026-09-27. `clk-20`…`clk-24`. Order list stays dark | [`plan-p4-clinic-link-show-up-batch.md`](./p4-show-up/plan-p4-clinic-link-show-up-batch.md) | [`Tasks/EXECUTION-ORDER-p4-clinic-link-show-up.md`](./p4-show-up/Tasks/EXECUTION-ORDER-p4-clinic-link-show-up.md) |

**Prefix:** `clk`. Numbering does not restart.

Phases 2, 3, and 4 have their gates walked. The order list stays dark. Inherit CLK-DL-1…12. Do not add a web chat or `platform = 'web'`.

**Created:** 2026-09-23.
