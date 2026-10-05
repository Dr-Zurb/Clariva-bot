# Plan p3 — Intake off-channel

> **Product plan:** [`plan-meta-channel-align.md`](../../../../../Product%20plans/plan-meta-channel-align.md)
> **Status:** **Implemented** 2026-09-16. Founder locked tier 1 (FAQ + booking link only).
> **Prefix:** `mca` · Tasks `mca-10`…`mca-15`

Move collection of health information onto an owned Halo Aid page. Chat keeps FAQs, booking-link handoff, and emergency copy.

**Tier (founder, 16 Sep 2026):** chat is FAQ + link only.

Inspected `/book` + checkout: the page is slot + pay only. Checkout **requires** name and phone already on the patient row from chat. `mca-10` is that gap, sliced into four Auto sittings (no migration, no new consent table).

## Task table

| ID | Title | Size | Model | Status |
|---|---|---|---|---|
| [`mca-12`](./Tasks/task-mca-12-generic-outbound-dms.md) | Generic outbound DMs (no name / MRN) | S | current | ✅ 2026-09-16 |
| [`mca-10`](./Tasks/task-mca-10-booking-link-first.md) | Booking link-first (umbrella) | L | current | ✅ 2026-09-16 |
| [`mca-13`](./Tasks/task-mca-13-checkout-create-patient.md) | Sitting 1 — checkout can create the patient | M | current | ✅ 2026-09-16 |
| [`mca-14`](./Tasks/task-mca-14-book-page-intake.md) | Sitting 2 — intake form on `/book` | M | current | ✅ 2026-09-16 |
| [`mca-15`](./Tasks/task-mca-15-dm-link-first.md) | Sitting 3 — DM hands the link first | M | current | ✅ 2026-09-16 |
| [`mca-11`](./Tasks/task-mca-11-phase-3-gate.md) | Sitting 4 — Phase 3 gate | S | after `mca-15` | ✅ 2026-09-16 |

## Sittings (locked 16 Sep 2026)

One sitting = one acceptance gate. Do not start the next sitting until the current one is verified.

1. **Checkout can write the patient** — a tokenized checkout with name, phone, reason, and an explicit consent grant updates the existing conversation patient and can finish without prior chat intake. Returning patients who already have name + phone keep the existing path. No new table.
2. **`/book` collects those fields** — the owned page shows the form, sends them on checkout, and does not proceed without consent.
3. **DM is link-first** — a new booking conversation sends the Halo Aid booking link instead of collecting name / phone / reason / consent in the thread. Emergency copy stays.
4. **Gate** — walk a dummy patient: FAQ in chat, form on the owned page, no intake in-thread.

## Gate (one sentence)

A new booking does not collect reason-for-visit, name, or phone inside the Instagram thread.

## Locks inherited

MCA-DL-4, MCA-DL-5, MCA-DL-7.

**Created:** 2026-09-15. **Sittings written:** 2026-09-16.
