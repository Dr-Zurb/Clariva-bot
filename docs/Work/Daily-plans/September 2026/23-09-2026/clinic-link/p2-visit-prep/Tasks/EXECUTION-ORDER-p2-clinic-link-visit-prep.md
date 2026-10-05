# Execution order — p2 visit prep

> Sibling document of [`plan-p2-clinic-link-visit-prep-batch.md`](../plan-p2-clinic-link-visit-prep-batch.md). The plan covers what and why. This doc covers who-runs-what-when.
>
> **Do not start this order until `clk-08` is green.** Phase 1 owns the page, the booking SMS, and the slug migrations.

**Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) was archived 2026-09-23. The user decides model switches. The picks below are shorthand only. One careful task in the batch: `clk-11`.

```
Wave 1 (Column and token — ~5h wall, 2 parallel lanes — fully independent):
  Lane α  ──── clk-09 (S)                          [migration]
  Lane β  ──── clk-10 (M)                          [token helper]

Wave 2 (Patient write — ~6h, single lane):
  Lane α  ──── clk-11 (L)

Wave 3 (Public read — ~4h, single lane):
  Lane α  ──── clk-12 (M)

Wave 4 (Screen and SMS — ~4h, single lane):
  Lane α  ──── clk-13 (M)

Wave 5 (Gate — ~3h):
  Lane α  ──── clk-14 (M)
```

**Wall-clock:** ~22h (Wave 1 runs the column and the token together).
**Agent-time:** ~24h.

**Bottleneck:** Wave 2. The patient write is the unauthenticated PHI insert. The read and the screen wait on it.

### Wave 1 — Column and token

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0α | clk-09 | S | `234_patient_history_submissions.sql`, `233_visit_documents.sql`, latest migration after `242` | Comment updates only on `actor_id`. No new RLS. No upload route. |
| 0β | clk-10 | M | `booking-token.ts`, HL-DL-4 and HL-DL-5 in `plan-history-link.md` | New helper. Do not extend `booking-token.ts`. |

Lane test: the migration does not import the token helper. The token helper does not read `appointments.previsit_context`.

### Wave 2 — Patient write

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | clk-11 | L | `upsertHistorySubmission`, `acceptHistorySubmissionItem`, `COMPLIANCE.md` | Do not call the desk upsert. Insert the sidecar only when the appointment has no row. |

### Wave 3 — Public read

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | clk-12 | M | clk-11 route, `CONTRACTS.md` | Empty form. A desk row hides the three lists. Wrong kind fails closed. |

### Wave 4 — Screen and SMS

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | clk-13 | M | `/d/:slug` from clk-05, the SMS from clk-06 | Skip is as visible as continue. One SMS, now with the prep URL. |

### Wave 5 — Gate

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | clk-14 | M | Phase 2 gate in the batch plan | Dummy data only. No new behavior. |

## Per-task picks

| Task | Size | Why this one is heavier |
|---|---|---|
| clk-09 | S | Additive nullable column and two comments. |
| clk-10 | M | A new token kind. Wrong kind must fail. |
| clk-11 | L | Unauthenticated write of health answers. Must not touch the chart. |
| clk-12 | M | Read path. Must not return chart PHI. |
| clk-13 | M | Page plus one line on an existing SMS. |
| clk-14 | M | Gate. The health-data review already happened on clk-11. |

## Acceptance gates

### Wave 1

- [ ] `appointments` can store the four chips. A missing value stays null.
- [ ] A `history-form` token verifies. A booking token and a join token do not.

### Wave 2

- [ ] Patient POST inserts one sidecar row and does not write chart tables.
- [ ] A second patient POST is 409. A desk row is not overwritten. Chips still save.

### Wave 3

- [ ] Public GET is an empty form, or read-only after the patient already sent it.
- [ ] Expired, cancelled, and wrong-kind tokens do not render the lists.

### Wave 4

- [ ] After booking, skip and continue are both on screen.
- [ ] The booking SMS is still one message and now includes the prep URL. No reason.

### Wave 5

- [ ] The batch acceptance gate is checked on dummy data, with the commands recorded.
