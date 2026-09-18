# Rx lifecycle — daily batches

> **Product plan:** [`plan-rx-lifecycle.md`](../../../../Product%20plans/plan-rx-lifecycle.md) (RXL-DL-1…16)
> All phases for this program live in this folder. Execute in order.
>
> **Status:** Phase 1 **implemented** 2026-08-31 (`rxl-01..04`). Phase 2 **implemented** 2026-09-10 with residuals (`rxl-05..10`). Phase 3 **implemented** 2026-09-10 with residuals — `p3-revise-window` (`rxl-11`…`18`) is superseded by [`p3-same-day-revise/`](./p3-same-day-revise/) (`rxl-19`…`29`). Neither phase is Shipped.
>
> **Interim (RXL-DL-8):** closed. Same-day issued notes are writable; a previous clinic day is refused server-side. Revisions are a new row.

| Phase | Folder | Status | Batch plan | Execution order |
|---|---|---|---|---|
| 1 — lock integrity | [`p1-lock-integrity/`](./p1-lock-integrity/) | **Implemented** — residuals recorded | [`plan-p1-rx-lifecycle-lock-integrity-batch.md`](./p1-lock-integrity/plan-p1-rx-lifecycle-lock-integrity-batch.md) | [`EXECUTION-ORDER-p1-rx-lifecycle-lock-integrity.md`](./p1-lock-integrity/Tasks/EXECUTION-ORDER-p1-rx-lifecycle-lock-integrity.md) |
| 2 — append notes | [`p2-append-notes/`](./p2-append-notes/) | **Implemented** 2026-09-10 — residuals; not Shipped | [`plan-p2-rx-lifecycle-append-notes-batch.md`](./p2-append-notes/plan-p2-rx-lifecycle-append-notes-batch.md) | [`EXECUTION-ORDER-p2-rx-lifecycle-append-notes.md`](./p2-append-notes/Tasks/EXECUTION-ORDER-p2-rx-lifecycle-append-notes.md) |
| 3 — revise window (old) | [`p3-revise-window/`](./p3-revise-window/) | **Superseded** 2026-09-09 | [`plan-p3-rx-lifecycle-revise-window-batch.md`](./p3-revise-window/plan-p3-rx-lifecycle-revise-window-batch.md) | do not execute |
| 3 — same-day revise | [`p3-same-day-revise/`](./p3-same-day-revise/) | **Implemented** 2026-09-10 — residuals; not Shipped | [`plan-p3-rx-lifecycle-same-day-revise-batch.md`](./p3-same-day-revise/plan-p3-rx-lifecycle-same-day-revise-batch.md) | [`Tasks/EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md`](./p3-same-day-revise/Tasks/EXECUTION-ORDER-p3-rx-lifecycle-same-day-revise.md) |

**Prefix:** `rxl`. Numbering does not restart — `rxl-01..04` Phase 1, `rxl-05..10` Phase 2, `rxl-11..18` superseded, `rxl-19..29` Phase 3.

**Phase order is a dependency, not a preference.** Phase 2's lazy note creation is unimplementable until Phase 1 separates seeding from editing (RXL-DL-5). Phase 3-A did not wait on the Phase 2 gate. Phase 3-B needed the attest stamp and migration `231`. RXL-DL-8 is closed.

**Do not** start queue / next-patient, `visit_payments`, share-link, or letterhead work from this folder.

**Created:** 2026-08-31.
**Last Updated:** 2026-09-10 (Phase 2 + Phase 3 gated with residuals). Both not Shipped. Next program work is `lvc` Phase 3.
